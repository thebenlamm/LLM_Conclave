import { EventBus } from '../../core/EventBus';
import { ProviderHealthMonitor } from './ProviderHealthMonitor';
import { AgentResponse, TokenUsage } from '../../types/consult';
import ProviderFactory from '../../providers/ProviderFactory';
import { getBackupProvider, PROVIDER_TIER_MAP } from './ProviderTiers';
// import inquirer from 'inquirer'; // Dynamic import used instead

export class HedgedRequestManager {
  /**
   * Hedged timeout threshold from AC #1: Primary provider timeout before backup launches
   * After 10 seconds, backup provider is triggered to race against primary
   */
  private static readonly HEDGED_TIMEOUT_MS = 10000;

  constructor(private eventBus: EventBus) {}

  /**
   * Execute an agent with hedged request logic (backup provider on timeout)
   * and user substitution prompt on failure.
   */
  async executeAgentWithHedging(
    agent: { name: string; model: string; provider: string; id?: string },
    messages: any[],
    healthMonitor: ProviderHealthMonitor,
    systemPrompt?: string
  ): Promise<AgentResponse> {
    const primaryProviderId = agent.provider;
    const startTime = Date.now();

    try {
      // 1. Attempt Primary with Hedging
      return await this.attemptWithHedging(agent, messages, primaryProviderId, healthMonitor, startTime, systemPrompt);
    } catch (error: any) {
      // 2. Handle Complete Failure (Primary + Backup failed)
      // AC #3: User Substitution Prompt
      // Enhanced error logging for debugging provider issues
      console.error(`[HedgedRequestManager] Provider failed:`, {
        provider: primaryProviderId,
        agent: agent.name,
        model: agent.model,
        errorMessage: error?.message,
        errorStatus: error?.status || error?.statusCode,
        messageCount: messages.length,
        elapsedMs: Date.now() - startTime,
      });
      return await this.handleFailureWithUserPrompt(agent, messages, primaryProviderId, healthMonitor, startTime, error, systemPrompt);
    }
  }

  private async attemptWithHedging(
    agent: { name: string; model: string; provider: string },
    messages: any[],
    primaryProviderId: string,
    healthMonitor: ProviderHealthMonitor,
    startTime: number,
    systemPrompt?: string
  ): Promise<AgentResponse> {
    const controllerPrimary = new AbortController();
    const primaryProvider = ProviderFactory.createProvider(primaryProviderId);

    // Start Primary Request - pass systemPrompt as second arg, options as third
    const primaryPromise = primaryProvider.chat(messages, systemPrompt || null, { signal: controllerPrimary.signal })
      .then((response: any) => ({
        source: 'primary',
        response,
        provider: primaryProviderId,
        model: agent.model
      }));

    // Create Timeout Promise
    let timeoutId: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<'timeout'>((resolve) => {
      timeoutId = setTimeout(() => resolve('timeout'), HedgedRequestManager.HEDGED_TIMEOUT_MS);
    });

    // Race Primary against Timeout
    let firstRace: any;
    try {
      firstRace = await Promise.race([primaryPromise, timeoutPromise]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }

    if (firstRace !== 'timeout') {
      // Primary won (fast)
      return this.formatResponse(agent, firstRace.response, firstRace.provider, firstRace.model, startTime);
    }

    // Timeout occurred - Start Backup (Hedging)
    const backupProviderId = getBackupProvider(primaryProviderId, healthMonitor.getAllHealthStatus());

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

    // Derive backup model name from provider ID (for most providers, ID is the model name)
    const backupModelName = backupProviderId;

    // Pass systemPrompt as second arg, options as third
    const backupPromise = backupProvider.chat(messages, systemPrompt || null, { signal: controllerBackup.signal })
      .then((response: any) => ({
        source: 'backup',
        response,
        provider: backupProviderId,
        model: backupModelName
      }));

    // Race Primary (still running) vs Backup
    // Use Promise.allSettled to handle rejections gracefully
    let raceResult: any;
    try {
      raceResult = await Promise.race([
        primaryPromise.then((result: any) => ({ ...result, rejected: false })).catch((err: any) => ({ source: 'primary', rejected: true, error: err })),
        backupPromise.then((result: any) => ({ ...result, rejected: false })).catch((err: any) => ({ source: 'backup', rejected: true, error: err }))
      ]);
    } catch (err) {
      controllerPrimary.abort();
      controllerBackup.abort();
      throw err;
    }

    // If the winner was rejected, try to wait for the other
    if (raceResult.rejected) {
      console.warn(`[HedgedRequestManager] ${raceResult.source} failed, waiting for other provider...`, {
        failedSource: raceResult.source,
        errorMessage: raceResult.error?.message,
        errorStatus: raceResult.error?.status || raceResult.error?.statusCode,
      });
      try {
        // Wait for the other promise to complete
        if (raceResult.source === 'primary') {
          const backupResult = await backupPromise;
          controllerPrimary.abort();
          return this.formatResponse(agent, backupResult.response, backupResult.provider, backupResult.model, startTime);
        } else {
          const primaryResult = await primaryPromise;
          controllerBackup.abort();
          return this.formatResponse(agent, primaryResult.response, primaryResult.provider, primaryResult.model, startTime);
        }
      } catch (err) {
        controllerPrimary.abort();
        controllerBackup.abort();
        // Both failed - throw to trigger user substitution prompt
        throw err;
      }
    }

    // Winner succeeded - cancel the loser
    if (raceResult.source === 'primary') {
      controllerBackup.abort();
    } else {
      controllerPrimary.abort();
    }

    return this.formatResponse(agent, raceResult.response, raceResult.provider, raceResult.model, startTime);
  }

  private async handleFailureWithUserPrompt(
    agent: { name: string; model: string; provider: string },
    messages: any[],
    failedProviderId: string,
    healthMonitor: ProviderHealthMonitor,
    startTime: number,
    originalError: any,
    systemPrompt?: string
  ): Promise<AgentResponse> {
    // Find a substitute suggestion
    const substituteId = getBackupProvider(failedProviderId, healthMonitor.getAllHealthStatus());

    if (!substituteId) {
        // No substitute available, fail gracefully
        return this.formatErrorResponse(agent, failedProviderId, startTime, originalError.message);
    }

    // AC #3: Prompt User (unless in MCP mode)
    // "⚠️ Gemini is unavailable (timeout). Switch to xAI (Grok) for this agent? [Y/n/Fail]"
    console.log(`
⚠️  ${failedProviderId} is unavailable: ${originalError.message}`);

    let choice = 'Y'; // Default to auto-substitute

    // Auto-substitute in MCP mode (no stdin available for prompts)
    if (process.env.LLM_CONCLAVE_MCP === '1') {
      console.error(`[MCP] Auto-switching to ${substituteId} for agent ${agent.name}`);
    } else {
      const { default: inquirer } = await import('inquirer');

      const result = await inquirer.prompt([{
        type: 'list',
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
      choice = result.choice;
    }

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
            // Pass systemPrompt as second arg
            const response = await provider.chat(messages, systemPrompt || null);
            // Derive substitute model name from provider ID
            const substituteModelName = substituteId;
            return this.formatResponse(agent, response, substituteId, substituteModelName, startTime);
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
  ): AgentResponse {
    return {
      agentId: agent.id || agent.name,
      agentName: agent.name,
      model: model,
      provider: providerId,
      content: providerResponse.text,
      tokens: this.normalizeUsage(providerResponse.usage),
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };
  }

  private formatErrorResponse(
    agent: { name: string; id?: string, model: string, provider: string },
    providerId: string,
    startTime: number,
    errorMessage: string
  ): AgentResponse {
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

  private normalizeUsage(
    usage: any
  ): { input: number; output: number; total: number } {
    if (!usage) return { input: 0, output: 0, total: 0 };
    if ('input' in usage && typeof usage.input === 'number') {
      return { input: usage.input, output: usage.output || 0, total: usage.total || (usage.input + (usage.output || 0)) };
    }
    const input = usage.input_tokens ?? 0;
    const output = usage.output_tokens ?? 0;
    return { input, output, total: usage.total_tokens ?? (input + output) };
  }
}
