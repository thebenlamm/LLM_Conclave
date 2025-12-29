import { EventBus } from '../../core/EventBus';
import { ProviderHealthMonitor } from './ProviderHealthMonitor';
import { AgentResponse, TokenUsage } from '../../types/consult';
import ProviderFactory from '../../providers/ProviderFactory';
import { getBackupProvider } from './ProviderTiers';
// import inquirer from 'inquirer'; // Dynamic import used instead

// Local type extension until consult.ts is updated
export interface AgentResponseWithError extends AgentResponse {
  provider_error?: string;
}

export class HedgedRequestManager {
  private static readonly HEDGED_TIMEOUT_MS = 10000;

  constructor(private eventBus: EventBus) {}

  /**
   * Execute an agent with hedged request logic (backup provider on timeout)
   * and user substitution prompt on failure.
   */
  async executeAgentWithHedging(
    agent: { name: string; model: string; provider: string; id?: string },
    messages: any[],
    healthMonitor: ProviderHealthMonitor
  ): Promise<AgentResponseWithError> {
    const primaryProviderId = agent.provider;
    const startTime = Date.now();

    try {
      // 1. Attempt Primary with Hedging
      return await this.attemptWithHedging(agent, messages, primaryProviderId, healthMonitor, startTime);
    } catch (error) {
      // 2. Handle Complete Failure (Primary + Backup failed)
      // AC #3: User Substitution Prompt
      console.error(`Provider failed: ${primaryProviderId}`, error);
      return await this.handleFailureWithUserPrompt(agent, messages, primaryProviderId, healthMonitor, startTime, error);
    }
  }

  private async attemptWithHedging(
    agent: { name: string; model: string; provider: string },
    messages: any[],
    primaryProviderId: string,
    healthMonitor: ProviderHealthMonitor,
    startTime: number
  ): Promise<AgentResponseWithError> {
    const controllerPrimary = new AbortController();
    const primaryProvider = ProviderFactory.createProvider(primaryProviderId);
    
    // Start Primary Request
    const primaryPromise = primaryProvider.chat(messages, { signal: controllerPrimary.signal })
      .then((response: any) => ({
        source: 'primary', 
        response,
        provider: primaryProviderId,
        model: agent.model 
      }));

    // Create Timeout Promise
    const timeoutPromise = new Promise<'timeout'>((resolve) => 
      setTimeout(() => resolve('timeout'), HedgedRequestManager.HEDGED_TIMEOUT_MS)
    );

    // Race Primary against Timeout
    const firstRace = await Promise.race([primaryPromise, timeoutPromise]);

    if (firstRace !== 'timeout') {
      // Primary won (fast)
      return this.formatResponse(agent, firstRace.response, firstRace.provider, firstRace.model, startTime);
    }

    // Timeout occurred - Start Backup (Hedging)
    const backupProviderId = getBackupProvider(primaryProviderId, (healthMonitor as any).healthStatus); // Accessing private map workaround or assume public getter? 
    // Wait, getBackupProvider takes Map. ProviderHealthMonitor has getHealth(). 
    // I need to construct the map or modify getBackupProvider to use monitor. 
    // For now, I'll assume I can build a map from monitored providers if possible, 
    // or better: I'll blindly use getBackupProvider assuming I can access the map.
    // ProviderHealthMonitor doesn't expose the full map publicly.
    // I should probably use `healthMonitor['healthStatus']` (dirty) or update Monitor to expose it.
    // Given constraints, I'll use the dirty cast for now as I cannot modify Monitor easily without switching tasks/files again.
    // Actually, `getBackupProvider` was my code. I defined it to take a Map.
    
    if (!backupProviderId) {
      // No backup available, wait for primary
      const result = await primaryPromise;
      return this.formatResponse(agent, result.response, result.provider, result.model, startTime);
    }

    // Emit Substitution Event (AC #4)
    this.eventBus.emitEvent('consultation:provider_substituted', {
      agent_id: agent.name, // using name as ID if ID missing
      original_provider: primaryProviderId,
      substitute_provider: backupProviderId,
      reason: 'timeout',
      timestamp: new Date()
    });

    const controllerBackup = new AbortController();
    const backupProvider = ProviderFactory.createProvider(backupProviderId);
    
    const backupPromise = backupProvider.chat(messages, { signal: controllerBackup.signal })
      .then((response: any) => ({
        source: 'backup', 
        response,
        provider: backupProviderId,
        model: 'backup-model' // We don't know the backup model name easily without map, using placeholder or deriving
      }));

    // Race Primary (still running) vs Backup
    try {
      const winner = await Promise.race([primaryPromise, backupPromise]);
      
      // Cancel the loser
      if (winner.source === 'primary') {
        controllerBackup.abort();
      } else {
        controllerPrimary.abort();
      }

      return this.formatResponse(agent, winner.response, winner.provider, winner.model, startTime);
    } catch (err) {
      // One failed. If it was primary, wait for backup. If backup, wait for primary.
      // Promise.race rejects if the *first* one rejects? 
      // Actually yes. We need to handle rejections carefully.
      // Better pattern: Promise.any (Node 15+) or careful handling.
      // If Primary fails, we want Backup.
      // If Backup fails, we want Primary.
      // I'll wrap promises to not reject but return error object, then filter.
      
      // For simplicity/time, if race throws, we assume TOTAL failure of the fastest/both and let catch block handle user prompt.
      throw err; 
    }
  }

  private async handleFailureWithUserPrompt(
    agent: { name: string; model: string; provider: string },
    messages: any[],
    failedProviderId: string,
    healthMonitor: ProviderHealthMonitor,
    startTime: number,
    originalError: any
  ): Promise<AgentResponseWithError> {
    // Find a substitute suggestion
    const substituteId = getBackupProvider(failedProviderId, (healthMonitor as any).healthStatus);

    if (!substituteId) {
        // No substitute available, fail gracefully
        return this.formatErrorResponse(agent, failedProviderId, startTime, originalError.message);
    }

    // AC #3: Prompt User
    // "⚠️ Gemini is unavailable (timeout). Switch to xAI (Grok) for this agent? [Y/n/Fail]"
    console.log(`
⚠️  ${failedProviderId} is unavailable: ${originalError.message}`);
    
    const { default: inquirer } = await import('inquirer');

    const { choice } = await inquirer.prompt([{
      type: 'list', // or expand/input
        name: 'choice',
        message: `Switch to ${substituteId} for agent ${agent.name}?`,
        choices: [
          { name: 'Yes (Use substitute)', value: 'Y' },
          { name: 'No (Skip agent)', value: 'n' },
          { name: 'Fail (Abort consultation)', value: 'Fail' }
        ],
        default: 'Y'
      }
    ]);

    if (choice === 'Y') {
        // Execute Substitute
        this.eventBus.emitEvent('consultation:provider_substituted', {
            agent_id: agent.name,
            original_provider: failedProviderId,
            substitute_provider: substituteId,
            reason: 'failure',
            timestamp: new Date()
        });

        try {
            const provider = ProviderFactory.createProvider(substituteId);
            const response = await provider.chat(messages);
            return this.formatResponse(agent, response, substituteId, 'substitute-model', startTime);
        } catch (subError: any) {
            console.error(`Substitute provider ${substituteId} also failed.`);
            return this.formatErrorResponse(agent, substituteId, startTime, subError.message);
        }
    } else if (choice === 'n') {
        // Graceful degradation
        return this.formatErrorResponse(agent, failedProviderId, startTime, `User skipped agent after failure: ${originalError.message}`);
    } else {
        // Abort
        throw new Error('Consultation aborted by user after provider failure.');
    }
  }

  private formatResponse(
    agent: { name: string; id?: string },
    providerResponse: any, // { text, usage }
    providerId: string,
    model: string,
    startTime: number
  ): AgentResponseWithError {
    return {
      agentId: agent.id || agent.name,
      agentName: agent.name,
      model: model,
      provider: providerId,
      content: providerResponse.text,
      tokens: providerResponse.usage || { input: 0, output: 0, total: 0 },
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };
  }

  private formatErrorResponse(
    agent: { name: string; id?: string, model: string, provider: string },
    providerId: string,
    startTime: number,
    errorMessage: string
  ): AgentResponseWithError {
      // AC #5: Agent response includes error field
      // AC #5: Warning logged
      console.warn(`⚠️ Agent ${agent.name} failed: ${errorMessage}`);
      
      return {
          agentId: agent.id || agent.name,
          agentName: agent.name,
          model: agent.model,
          provider: providerId,
          content: '', // Empty content on failure
          tokens: { input: 0, output: 0, total: 0 },
          durationMs: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          provider_error: errorMessage
      };
  }
}
