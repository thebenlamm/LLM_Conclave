/**
 * ConsultOrchestrator - Fast multi-model consultation system
 *
 * Implements a streamlined consultation flow:
 * 1. Round 1: All agents respond in parallel (Independent)
 * 2. Round 2: Synthesis (Consensus Building)
 * 3. Round 3: Cross-Examination
 * 4. Round 4: Verdict
 */

import ProviderFactory from '../providers/ProviderFactory';
import { EventBus } from '../core/EventBus';
import { ConsultStateMachine } from './ConsultStateMachine';
import { ArtifactExtractor } from '../consult/artifacts/ArtifactExtractor';
import { ArtifactFilter } from '../consult/artifacts/ArtifactFilter';
import { FilterConfig } from '../consult/artifacts/FilterConfig';
import { CostEstimator, CostEstimate } from '../consult/cost/CostEstimator';
import { CostGate } from '../consult/cost/CostGate';
import { ConfigCascade } from '../cli/ConfigCascade';
import { ConsultationFileLogger } from '../consult/logging/ConsultationFileLogger';
import { ProviderHealthMonitor } from '../consult/health/ProviderHealthMonitor';
import { PROVIDER_TIER_MAP } from '../consult/health/ProviderTiers';
import { HedgedRequestManager } from '../consult/health/HedgedRequestManager';
import { InteractivePulse } from '../consult/health/InteractivePulse';
import { PartialResultManager } from '../consult/persistence/PartialResultManager';
import { ModeStrategy, ArtifactCollection, AgentInfo } from '../consult/strategies/ModeStrategy';
import { ConvergeStrategy } from '../consult/strategies/ConvergeStrategy';
import { DebateValueAnalyzer } from '../consult/analysis/DebateValueAnalyzer';
import { BrownfieldAnalysis, BrownfieldDetector } from '../consult/context/BrownfieldDetector';
import { ContextAugmenter } from '../consult/context/ContextAugmenter';
import * as path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import {
  Agent,
  Message,
  ConsultOrchestratorOptions
} from '../types';
import { EarlyTerminationManager } from '../consult/termination/EarlyTerminationManager';
import { CostTracker } from '../core/CostTracker';
import {
  ConsultationResult,
  PartialConsultationResult,
  CostSummary,
  TokenUsage,
  ConsultState,
  IndependentArtifact,
  SynthesisArtifact,
  CrossExamArtifact,
  VerdictArtifact,
  AgentResponse,
  PromptVersions,
  TokenEfficiencyStats,
  Dissent,
  DebateValueAnalysis,
  ProjectContextMetadata,
  ContextMetadata,
  LoadedContext,
  ScrubReport
} from '../types/consult';

type Round1ExecutionResult = {
  artifact: IndependentArtifact | null;
  response: AgentResponse;
};

export default class ConsultOrchestrator {
  private agents!: Agent[];
  private maxRounds: number;
  private verbose: boolean;
  private stateMachine!: ConsultStateMachine;
  private eventBus!: EventBus;
  private consultationId!: string;
  private costEstimator!: CostEstimator;
  private artifactFilter!: ArtifactFilter;
  private filterConfig!: FilterConfig;
  private costGate!: CostGate;
  private fileLogger!: ConsultationFileLogger;
  private healthMonitor!: ProviderHealthMonitor;
  private hedgedRequestManager!: HedgedRequestManager;
  private interactivePulse!: InteractivePulse;
  private partialResultManager!: PartialResultManager;
  private estimatedCostUsd: number = 0;
  private actualCostUsd: number = 0;
  private totalTokensUsed: number = 0;
  private tokenSavings: { round3: number; round4: number } = { round3: 0, round4: 0 };
  private substitutions: any[] = []; // Track provider substitutions for AC #4

  // Pulse tracking (Story 2.4, AC #3)
  private pulseTriggered: boolean = false;
  private pulseTimestamp: string | undefined;
  private userCancelledViaPulse: boolean = false;

  // Mode strategy (Epic 4, Story 1)
  private strategy: ModeStrategy;
  private confidenceThreshold: number;
  private earlyTerminationManager!: EarlyTerminationManager;
  private debateValueAnalyzer!: DebateValueAnalyzer;
  private brownfieldAnalysis: BrownfieldAnalysis | null;
  private projectPath?: string;
  private greenfieldOverride: boolean;
  private contextAugmenter!: ContextAugmenter;
  private projectContextMetadata?: ProjectContextMetadata;
  private loadedContext?: LoadedContext;
  private scrubbingReport?: ScrubReport;
  private interactive: boolean;

  constructor(options: ConsultOrchestratorOptions = {}) {
    // Core configuration
    this.maxRounds = options.maxRounds || 4;
    this.verbose = options.verbose || false;
    this.interactive = options.interactive ?? true;
    this.strategy = options.strategy || new ConvergeStrategy();
    this.confidenceThreshold = options.confidenceThreshold ?? 0.90;
    this.scrubbingReport = options.scrubbingReport;
    this.brownfieldAnalysis = options.brownfieldAnalysis ?? null;
    this.projectPath = options.projectPath;
    this.greenfieldOverride = options.greenfield ?? false;
    this.loadedContext = options.loadedContext;

    // Initialize component groups
    this.initializeCoreComponents();
    this.initializeCostAndFilterComponents();
    this.initializeHealthComponents();

    // Initialize early termination with interactive prompt callback
    this.earlyTerminationManager = this.createEarlyTerminationManager();

    // Generate consultation ID and state machine
    this.consultationId = this.generateId('consult');
    this.stateMachine = new ConsultStateMachine(this.consultationId);

    // Initialize agents
    this.agents = this.initializeAgents();

    // Setup runtime event handlers and cleanup (skipped in test environment)
    this.setupRuntimeHandlers();
  }

  /**
   * Initialize core orchestration components
   */
  private initializeCoreComponents(): void {
    this.eventBus = EventBus.getInstance();
    this.fileLogger = new ConsultationFileLogger();
    this.hedgedRequestManager = new HedgedRequestManager(this.eventBus);
    this.interactivePulse = new InteractivePulse();
    this.partialResultManager = new PartialResultManager();
    this.contextAugmenter = new ContextAugmenter();
    this.debateValueAnalyzer = new DebateValueAnalyzer(CostTracker.getInstance());
  }

  /**
   * Initialize cost estimation and artifact filtering components
   */
  private initializeCostAndFilterComponents(): void {
    this.costEstimator = new CostEstimator();
    this.artifactFilter = new ArtifactFilter();
    this.filterConfig = new FilterConfig();
    this.costGate = new CostGate();
  }

  /**
   * Initialize health monitoring components
   */
  private initializeHealthComponents(): void {
    this.healthMonitor = new ProviderHealthMonitor();

    // Register all configured providers
    Object.keys(PROVIDER_TIER_MAP).forEach(model => {
      this.healthMonitor.registerProvider(model);
    });
  }

  /**
   * Create early termination manager with interactive prompt callback
   */
  private createEarlyTerminationManager(): EarlyTerminationManager {
    return new EarlyTerminationManager(async (message) => {
      // Skip interactive prompt in test environment
      if (process.env.NODE_ENV === 'test') {
        return false;
      }
      // Auto-accept in MCP mode (no stdin available)
      if (process.env.LLM_CONCLAVE_MCP === '1') {
        console.error('[MCP] Auto-accepting early termination');
        return true;
      }
      // Auto-accept if non-interactive
      if (!this.interactive) {
        console.log(chalk.yellow('[Non-Interactive] Auto-accepting early termination'));
        return true;
      }

      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: message,
        default: true
      }]);
      return confirm;
    });
  }

  /**
   * Setup runtime event handlers and cleanup hooks
   * Skipped in test environment to avoid side effects
   */
  private setupRuntimeHandlers(): void {
    const isTestEnv = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
    if (isTestEnv) {
      return;
    }

    // Start health monitoring
    this.healthMonitor.startMonitoring();

    // Subscribe to provider substitution events (Story 2.3 AC #4)
    this.eventBus.on('consultation:provider_substituted', (data: any) => {
      this.substitutions.push(data);
    });

    // Setup graceful cleanup on process termination
    const cleanupHandler = () => {
      this.interactivePulse.cleanup();
      this.healthMonitor.stopMonitoring();
    };
    process.once('SIGINT', cleanupHandler);
    process.once('SIGTERM', cleanupHandler);
  }

  /**
   * Initialize the 3 consultation agents
   */
  private initializeAgents(): Agent[] {
    return [
      {
        name: 'Security Expert',
        model: 'claude-sonnet-4-5',
        provider: ProviderFactory.createProvider('claude-sonnet-4-5'),
        systemPrompt: this.getSecurityExpertPrompt()
      },
      {
        name: 'Architect',
        model: 'gpt-4o',
        provider: ProviderFactory.createProvider('gpt-4o'),
        systemPrompt: this.getArchitectPrompt()
      },
      {
        name: 'Pragmatist',
        model: 'gemini-2.5-pro',
        provider: ProviderFactory.createProvider('gemini-2.5-pro'),
        systemPrompt: this.getPragmatistPrompt()
      }
    ];
  }

  /**
   * Create recursive pulse callback for an agent
   */
  private createPulseCallback(agentName: string) {
    return async () => {
      // Get all agents running > 60s
      const runningAgents = this.interactivePulse.getRunningAgents();
      
      // If we are the only one or one of many, prompt user
      // Note: Since this callback is async and multiple agents might trigger around same time,
      // Inquirer might get messy if parallel prompts occur.
      // However, Node.js single thread means we process one callback at a time.
      // But await inquirer... means event loop continues.
      // Ideally InteractivePulse should handle locking/debouncing prompts if multiple trigger at once.
      // For now, assuming simple case.
      
      const shouldContinue = await this.interactivePulse.promptUserToContinue(runningAgents);

      if (!shouldContinue) {
        // User cancelled
        // We need to signal cancellation. 
        // Throwing error here is inside setTimeout callback - won't be caught by executeAgent main flow directly
        // unless we reject a promise or emit an event.
        // We should emit a cancellation event that the Orchestrator listens to, OR 
        // handle this more robustly.
        
        // Actually, the executeAgent logic needs to "hear" this.
        // The Story suggested:
        // reject(new Error('User cancelled via pulse'));
        // inside the Promise wrapper.
        
        // But here I'm defining the callback separately.
        // I'll implementation the Promise wrapper logic directly in executeAgent* methods
        // instead of a separate method if that's easier for closure access to 'reject'.
        // Or I can emit an event.
        
        this.eventBus.emitEvent('consultation:pulse_cancel' as any, {
            consultation_id: this.consultationId,
            agent_name: agentName,
            reason: 'User cancelled via interactive pulse'
        });
        
        // We also need to stop the current execution context if possible, 
        // but since we can't easily cancel the HTTP request promise from here without an AbortController,
        // we'll rely on the event or the wrapper to handle flow control.
        
        // Actually, let's keep it simple:
        // The wrapper in executeAgent will pass a reject function to this callback? 
        // Or better: The wrapper handles the timer creation and callback definition to close over 'reject'.
        return; 
      }

      // Continue - restart timer recursively
      this.interactivePulse.startTimer(agentName, this.createPulseCallback(agentName));
    };
  }

  /**
   * Execute a consultation
   * @param question - The question to consult on
   * @param context - Optional context (files, project info, etc.)
   * @param options - Optional execution overrides
   * @returns Consultation result with consensus, confidence, and costs
   */
  async consult(
    question: string, 
    context: string = '', 
    options: { scrubbingReport?: ScrubReport; allowCostOverruns?: boolean } = {}
  ): Promise<ConsultationResult> {
    const startTime = Date.now();
    let estimate: CostEstimate | null = null;
    let agentResponses: AgentResponse[] = [];
    let successfulArtifacts: IndependentArtifact[] = [];
    let synthesisArtifact: SynthesisArtifact | null = null;
    let crossExamArtifact: CrossExamArtifact | null = null;
    let verdictArtifact: VerdictArtifact | null = null;
    let debateValueAnalysis: DebateValueAnalysis | undefined;

    // Pulse tracking (Story 2.4, AC #3)
    let pulseTriggered = false;
    let pulseTimestamp: string | undefined;
    let userCancelledAfterPulse = false;

    // Early termination tracking (Epic 4, Story 2, AC #4)
    let earlyTerminationDeclined = false;

    // Store scrubbing report if provided in options
    if (options.scrubbingReport) {
      this.scrubbingReport = options.scrubbingReport;
    }

    try {
      // Start consultation lifecycle
      this.stateMachine.transition(ConsultState.Estimating);
      
      // Emit started event
      this.eventBus.emitEvent('consultation:started' as any, {
        consultation_id: this.consultationId,
        question,
        agents: (this.agents || []).map(a => ({ name: a.name, model: a.model, provider: 'unknown' })), // Provider logic handled in factory
        mode: this.strategy.name // Use strategy mode (Epic 4, Story 1)
      });

      // Display verbose mode message (AC #5)
      if (this.verbose) {
        console.log(chalk.cyan('🔍 Verbose mode: using full debate artifacts (higher token cost)'));
        console.log(`\n${'='.repeat(80)}`);
        console.log(`CONSULTATION: ${question}`);
        console.log(`${'='.repeat(80)}\n`);
      }

      // Health Check Warning (Story 2.2)
      // Fix 3: Only warn if we have actually checked at least once
      if (this.healthMonitor.hasCompletedFirstCheck() && !this.healthMonitor.hasHealthyProviders()) {
        console.log(chalk.yellow('\n⚠️  All providers degraded. Consultation may be slower than usual.'));
      }

      // --- State: Estimating ---
      estimate = this.costEstimator.estimateCost(question, this.agents, this.maxRounds);
      this.estimatedCostUsd = estimate.estimatedCostUsd; // Store for later comparison

      this.eventBus.emitEvent('consultation:cost_estimated' as any, {
        consultation_id: this.consultationId,
        estimated_cost: estimate.estimatedCostUsd,
        input_tokens: estimate.inputTokens,
        expected_output_tokens: estimate.outputTokens
      });

      // --- State: AwaitingConsent ---
      this.stateMachine.transition(ConsultState.AwaitingConsent);

      // Get configuration for cost threshold
      const config = ConfigCascade.resolve({}, process.env);

      // Check if user consent is needed
      if (options.allowCostOverruns) {
        // Forced approval via --yes
        console.log(chalk.green(`💰 Estimated cost: $${estimate.estimatedCostUsd.toFixed(4)} (approved via --yes)`));
        this.eventBus.emitEvent('consultation:user_consent' as any, {
          consultation_id: this.consultationId,
          approved: true,
          auto_approved: true
        });
      } else if (this.costGate.shouldPromptUser(estimate, config)) {
        // Cost exceeds threshold - prompt user
        const consent = await this.costGate.getUserConsent(
          estimate,
          (this.agents || []).length,
          this.maxRounds,
          !this.interactive // Pass nonInteractive flag
        );

        if (consent === 'denied') {
          this.stateMachine.transition(ConsultState.Aborted, 'User cancelled');
          console.log(chalk.yellow('\n⚠️  Consultation cancelled by user'));
          throw new Error('Consultation cancelled by user');
        }

        // Consent given (either 'approved' or 'always' which also approves current consultation)
        this.eventBus.emitEvent('consultation:user_consent' as any, {
          consultation_id: this.consultationId,
          approved: true,
          auto_approved: false
        });
      } else {
        // Cost under threshold - auto-approve
        this.costGate.displayAutoApproved(estimate.estimatedCostUsd);
        this.eventBus.emitEvent('consultation:user_consent' as any, {
          consultation_id: this.consultationId,
          approved: true,
          auto_approved: true
        });
      }

      // --- State: Independent (Round 1) ---
      this.stateMachine.transition(ConsultState.Independent);
      if (this.verbose) console.log(`\n--- Round 1: Independent Analysis ---\n`);

      if (this.projectPath && !this.greenfieldOverride && !this.brownfieldAnalysis) {
        this.brownfieldAnalysis = await new BrownfieldDetector(this.projectPath).detectBrownfield();
      }
      if (this.brownfieldAnalysis && !this.projectContextMetadata) {
        this.projectContextMetadata = this.buildProjectContextMetadata(this.brownfieldAnalysis);
      }

      const round1Results = await this.executeRound1Independent(question, context);

      // Track costs from Round 1
      for (const result of round1Results) {
        if (result.response.tokens) {
          this.trackActualCost(result.response.tokens, result.response.model);
        }
      }
      this.checkCostThreshold(); // Check after Round 1

      // Track failed agents
      successfulArtifacts = (round1Results.map(result => result.artifact).filter(a => !!a) as IndependentArtifact[]);
      agentResponses = round1Results.map(result => result.response);
      if (successfulArtifacts.length === 0) {
        this.stateMachine.transition(ConsultState.Aborted, 'All agents failed in Round 1');
        throw new Error('All agents failed. Unable to provide consultation.');
      }

      this.eventBus.emitEvent('round:completed' as any, {
        consultation_id: this.consultationId,
        round_number: 1,
        artifact_type: 'independent'
      });

      // Save Checkpoint (Story 2.5)
      await this.saveCheckpoint(question, context, successfulArtifacts, null, null, null, agentResponses);

      // --- State: Synthesis (Round 2) ---
      this.stateMachine.transition(ConsultState.Synthesis);
      if (this.verbose) console.log(`\n--- Round 2: Synthesis ---\n`);

      synthesisArtifact = await this.executeRound2Synthesis(question, successfulArtifacts);
      this.checkCostThreshold(); // Check after Round 2

      // Save Checkpoint (Story 2.5)
      await this.saveCheckpoint(question, context, successfulArtifacts, synthesisArtifact, null, null, agentResponses);

      // --- Early Termination Check (Epic 4, Story 2) ---
      if (synthesisArtifact && this.earlyTerminationManager.shouldCheckEarlyTermination(this.strategy.name, 2)) {
          const synthesisConfidence = this.earlyTerminationManager.calculateSynthesisConfidence(synthesisArtifact);

          if (this.earlyTerminationManager.meetsEarlyTerminationCriteria(synthesisConfidence, this.confidenceThreshold)) {
              // Prompt user
              const userAccepts = await this.earlyTerminationManager.promptUserForEarlyTermination(synthesisConfidence);

              if (userAccepts) {
                  // Early termination accepted
                  if (this.verbose) console.log(chalk.green('✓ Early termination accepted by user. Skipping Rounds 3 & 4.'));

                  // Synthesize verdict from synthesis
                  verdictArtifact = this.synthesizeVerdictFromSynthesis(synthesisArtifact);

                  // Calculate savings
                  const estimatedSavings = this.costEstimator.calculateEarlyTerminationSavings(this.agents, 2); // Skipping R3 & R4

                  // Transition directly to Complete
                  this.stateMachine.transition(ConsultState.Complete);

                  // Return result immediately
                  return this.createFinalResult({
                      question,
                      context,
                      startTime,
                      estimate,
                      agentResponses,
                      successfulArtifacts,
                      synthesisArtifact,
                      verdictArtifact,
                      debateValueAnalysis: undefined,
                      earlyTermination: true,
                      earlyTerminationReason: 'high_confidence_after_synthesis',
                      estimatedCostSaved: estimatedSavings
                  });
              } else {
                  // User declined early termination (AC #4)
                  earlyTerminationDeclined = true;
                  if (this.verbose) console.log(chalk.yellow('User declined early termination. Continuing to Round 3.'));
              }
          }
      } else if (synthesisArtifact && this.strategy.name === 'explore') {
          // Display explore mode message (AC #6)
          console.log(chalk.cyan('🔍 Explore mode: all rounds will execute'));
      }

      // --- State: CrossExam (Round 3) ---
      this.stateMachine.transition(ConsultState.CrossExam);
      if (this.verbose) console.log(`\n--- Round 3: Cross-Examination ---\n`);

      if (synthesisArtifact) {
        crossExamArtifact = await this.executeRound3CrossExam(successfulArtifacts, synthesisArtifact);
        this.checkCostThreshold(); // Check after Round 3
        
        // Save Checkpoint (Story 2.5)
        await this.saveCheckpoint(question, context, successfulArtifacts, synthesisArtifact, crossExamArtifact, null, agentResponses);
      } else {
        console.warn("Skipping Round 3 due to missing Synthesis artifact");
      }

      // --- State: Verdict (Round 4) ---
      this.stateMachine.transition(ConsultState.Verdict);
      if (this.verbose) console.log(`\n--- Round 4: Verdict ---\n`);

      // We can proceed to Verdict even if CrossExam failed (using R1/R2)
      // But we need at least Synthesis
      if (synthesisArtifact) {
          verdictArtifact = await this.executeRound4Verdict(question, successfulArtifacts, synthesisArtifact, crossExamArtifact);
          this.checkCostThreshold(); // Check after Round 4
      } else {
           throw new Error("Cannot generate Verdict without Synthesis artifact");
      }

      if (this.maxRounds >= 4 && verdictArtifact && successfulArtifacts.length > 0) {
        debateValueAnalysis = await this.debateValueAnalyzer.analyze(
          successfulArtifacts,
          crossExamArtifact,
          verdictArtifact
        );
        this.actualCostUsd += debateValueAnalysis.semanticComparisonCost;
      }

      this.stateMachine.transition(ConsultState.Complete);
    } catch (error: any) {
      if (error?.message === 'User cancelled via interactive pulse') {
          // Get max elapsed time from running agents for message
          const runningAgents = this.interactivePulse.getRunningAgents();
          const maxElapsed = runningAgents.length > 0
            ? Math.max(...runningAgents.map(a => a.elapsedSeconds))
            : 0;

          console.log(chalk.yellow(`\n⚠️  Consultation cancelled by user after ${maxElapsed}s`));
          this.stateMachine.transition(ConsultState.Aborted, `User cancelled after ${maxElapsed}s`);

          // Track cancellation (Story 2.4, AC #3)
          this.userCancelledViaPulse = true;

          // Cleanup all pulse timers
          this.interactivePulse.cleanup();

          await this.savePartialResults(
            'user_pulse_cancel',
            question,
            context,
            estimate,
            successfulArtifacts,
            synthesisArtifact,
            crossExamArtifact,
            verdictArtifact,
            agentResponses
          );
          
          // Re-throw to ensure caller knows it failed
          throw error;
      }

      if (error?.message?.includes('Cost threshold exceeded')) {
          await this.savePartialResults(
            'cost_exceeded_estimate',
            question,
            context,
            estimate,
            successfulArtifacts,
            synthesisArtifact,
            crossExamArtifact,
            verdictArtifact,
            agentResponses
          );
          throw error;
      }

      // Generic error handling (Story 2.5 requirement: partial save on error/exception)
      if (this.stateMachine.getCurrentState() !== ConsultState.Complete && this.stateMachine.getCurrentState() !== ConsultState.Aborted) {
          this.stateMachine.transition(ConsultState.Aborted, error.message);
          await this.savePartialResults(
            'error',
            question,
            context,
            estimate,
            successfulArtifacts,
            synthesisArtifact,
            crossExamArtifact,
            verdictArtifact,
            agentResponses,
            error.message
          );
      }

      throw error;
    }

    return this.createFinalResult({
        question,
        context,
        startTime,
        estimate: estimate!,
        agentResponses,
        successfulArtifacts,
        synthesisArtifact,
        crossExamArtifact,
        verdictArtifact,
        debateValueAnalysis,
        // AC #4: Log earlyTermination: false when user declined
        earlyTermination: earlyTerminationDeclined ? false : undefined
    });
  }

  /**
   * Execute Round 1: Independent Analysis
   * - Parallel execution
   * - Structured artifact extraction
   */
  private async executeRound1Independent(
    question: string,
    context: string
  ): Promise<Round1ExecutionResult[]> {
    const basePrompt = this.strategy.getIndependentPrompt(question, context);
    const independentPrompt = this.brownfieldAnalysis
      ? this.contextAugmenter.augmentPrompt(basePrompt, this.brownfieldAnalysis)
      : basePrompt;

    const promises = this.agents.map(agent =>
      this.executeAgentIndependent(agent, independentPrompt)
    );

    const results = await Promise.allSettled(promises);

    for (const result of results) {
      if (result.status === 'rejected' && result.reason?.message === 'User cancelled via interactive pulse') {
        throw result.reason;
      }
    }

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }

      const agent = this.agents[index];
      console.warn(`⚠️  Agent ${agent.name} failed in Round 1: ${result.reason?.message || 'unknown error'}`);

      return {
        artifact: null,
        response: {
          agentId: agent.name,
          agentName: agent.name,
          model: agent.model,
          provider: 'unknown',
          content: '',
          tokens: { input: 0, output: 0, total: 0 },
          durationMs: 0,
          timestamp: new Date().toISOString(),
          error: result.reason?.message || 'unknown error'
        }
      } as Round1ExecutionResult;
    });
  }

  /**
   * Execute Round 2: Synthesis
   * - Uses GPT-4o as Judge to synthesize independent perspectives
   */
  private async executeRound2Synthesis(
    question: string,
    artifacts: IndependentArtifact[]
  ): Promise<SynthesisArtifact | null> {
    const startTime = Date.now();
    const judgeAgent = {
      name: 'Judge (Synthesis)',
      model: 'gpt-4o',
      provider: ProviderFactory.createProvider('gpt-4o'),
      systemPrompt: this.strategy.getSynthesisPrompt(artifacts)
    };

    this.eventBus.emitEvent('agent:thinking' as any, {
      consultation_id: this.consultationId,
      agent_name: judgeAgent.name,
      round: 2
    });

    if (this.verbose) console.log(`⚡ Judge (GPT-4o) synthesizing consensus...`);

    try {
      const messages: Message[] = [
        {
          role: 'user',
          content: `Question: ${question}\n\nAnalyze the expert perspectives and synthesize consensus.`
        }
      ];

      const response = await judgeAgent.provider.chat(messages, judgeAgent.systemPrompt);
      const duration = Date.now() - startTime;

      // Track cost from synthesis
      if (response.usage) {
        this.trackActualCost(response.usage, judgeAgent.model);
      }

      if (this.verbose) console.log(`✓ Synthesis complete in ${(duration / 1000).toFixed(1)}s`);

      const artifact = ArtifactExtractor.extractSynthesisArtifact(response.text || '');

      this.eventBus.emitEvent('consultation:round_artifact' as any, {
        consultation_id: this.consultationId,
        round_number: 2,
        artifact_type: 'synthesis',
        artifact
      });

      this.eventBus.emitEvent('round:completed' as any, {
        consultation_id: this.consultationId,
        round_number: 2,
        artifact_type: 'synthesis'
      });

      return artifact;
    } catch (error: any) {
      if (this.verbose) console.warn(`⚠️ Synthesis failed: ${error.message}`);
      // In a real scenario, we might want to fail the consultation or degrade gracefully
      this.stateMachine.transition(ConsultState.Aborted, `Synthesis failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute Round 4: Verdict
   * - Judge synthesizes all rounds into final recommendation
   */
  private async executeRound4Verdict(
    question: string,
    round1Artifacts: IndependentArtifact[],
    synthesisArtifact: SynthesisArtifact,
    crossExamArtifact: CrossExamArtifact | null
  ): Promise<VerdictArtifact> {
    const startTime = Date.now();
    
    if (this.verbose) console.log(`⚡ Judge (GPT-4o) generating Final Verdict...`);

    // Apply filtering to R2 & R3 artifacts if not verbose (Round 4 Filter)
    let filteredSynthesis = synthesisArtifact;
    let filteredCrossExam = crossExamArtifact;

    if (!this.verbose) {
      const limits = this.filterConfig.getRound4Limits();
      
      // Filter Round 2
      filteredSynthesis = this.artifactFilter.filterSynthesisArtifact(
        synthesisArtifact, 
        { consensusPoints: limits.consensus_points, tensions: limits.tensions }
      );

      // Filter Round 3 (if exists)
      if (crossExamArtifact) {
        filteredCrossExam = this.artifactFilter.filterCrossExamArtifact(
          crossExamArtifact,
          { challenges: limits.challenges, rebuttals: limits.rebuttals }
        );

        // Track savings
        const r2Savings = this.costEstimator.estimateTokenSavings([synthesisArtifact], [filteredSynthesis]);
        const r3Savings = this.costEstimator.estimateTokenSavings([crossExamArtifact], [filteredCrossExam]);
        this.tokenSavings.round4 = r2Savings + r3Savings;
      } else {
        // Just R2 savings
        this.tokenSavings.round4 = this.costEstimator.estimateTokenSavings([synthesisArtifact], [filteredSynthesis]);
      }
    }

    const judgeAgent = {
      name: 'Judge (Verdict)',
      model: 'gpt-4o',
      provider: ProviderFactory.createProvider('gpt-4o'),
      systemPrompt: this.strategy.getVerdictPrompt({
        round1: round1Artifacts,
        round2: filteredSynthesis,
        round3: filteredCrossExam || undefined
      })
    };

    // Augment prompt with brownfield context (AC #4)
    if (this.brownfieldAnalysis) {
      judgeAgent.systemPrompt = this.contextAugmenter.augmentPrompt(judgeAgent.systemPrompt, this.brownfieldAnalysis);
    } else if (this.greenfieldOverride) {
      // Explicit greenfield override - force augment with greenfield context (Review Finding)
      // We construct a synthetic greenfield analysis
      const greenfieldAnalysis: BrownfieldAnalysis = {
        projectType: 'greenfield',
        indicatorsFound: [],
        indicatorCount: 0,
        techStack: {
           framework: null, frameworkVersion: null, architecturePattern: null, stateManagement: null,
           styling: null, testing: [], api: null, database: null, orm: null, cicd: null
        },
        documentation: { files: [], totalFound: 0 },
        biasApplied: false
      };
      judgeAgent.systemPrompt = this.contextAugmenter.augmentPrompt(judgeAgent.systemPrompt, greenfieldAnalysis);
    }

    this.eventBus.emitEvent('agent:thinking' as any, {
      consultation_id: this.consultationId,
      agent_name: judgeAgent.name,
      round: 4
    });

    try {
      const response = await judgeAgent.provider.chat([
        { role: 'user', content: 'Render your final verdict.' }
      ], judgeAgent.systemPrompt);

      // Track cost from verdict
      if (response.usage) {
        this.trackActualCost(response.usage, judgeAgent.model);
      }

      const artifact = ArtifactExtractor.extractVerdictArtifactWithMode(response.text || '', this.strategy.name);

      this.eventBus.emitEvent('consultation:round_artifact' as any, {
        consultation_id: this.consultationId,
        round_number: 4,
        artifact_type: 'verdict',
        artifact
      });

      this.eventBus.emitEvent('round:completed' as any, {
        consultation_id: this.consultationId,
        round_number: 4,
        artifact_type: 'verdict'
      });

      if (this.verbose) console.log(`✓ Verdict complete: ${Math.round(artifact.confidence * 100)}% confidence`);

      return artifact;

    } catch (error: any) {
      if (this.verbose) console.warn(`⚠️ Verdict generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute Round 3: Cross-Examination
   * - Agents critique consensus and each other
   * - Judge synthesizes challenges and rebuttals
   */
  private async executeRound3CrossExam(
    round1Artifacts: IndependentArtifact[],
    synthesisArtifact: SynthesisArtifact
  ): Promise<CrossExamArtifact | null> {
    const startTime = Date.now();
    
    if (this.verbose) console.log(`⚡ Agents starting Cross-Examination...`);

    // Apply filtering to R2 artifact if not verbose (Round 3 Filter)
    let filteredSynthesis = synthesisArtifact;
    if (!this.verbose) {
        const limits = this.filterConfig.getRound3Limits();
        filteredSynthesis = this.artifactFilter.filterSynthesisArtifact(
            synthesisArtifact,
            { consensusPoints: limits.consensus_points, tensions: limits.tensions }
        );
        
        // Track savings
        this.tokenSavings.round3 = this.costEstimator.estimateTokenSavings([synthesisArtifact], [filteredSynthesis]);
    }

    // 1. Parallel execution of all agents
    const promises = this.agents.map(async (agent) => {
      // Find this agent's Round 1 artifact
      const r1Artifact = round1Artifacts.find(a => a.agentId === agent.name); 
      if (!r1Artifact) {
          // If agent failed in R1, they can't cross-exam
          return null;
      }
      
      let systemPrompt = this.strategy.getCrossExamPrompt({ name: agent.name, model: agent.model }, filteredSynthesis);
      
      // Augment prompt with brownfield context (AC #4)
      if (this.brownfieldAnalysis) {
        systemPrompt = this.contextAugmenter.augmentPrompt(systemPrompt, this.brownfieldAnalysis);
      } else if (this.greenfieldOverride) {
        const greenfieldAnalysis: BrownfieldAnalysis = {
            projectType: 'greenfield',
            indicatorsFound: [],
            indicatorCount: 0,
            techStack: {
               framework: null, frameworkVersion: null, architecturePattern: null, stateManagement: null,
               styling: null, testing: [], api: null, database: null, orm: null, cicd: null
            },
            documentation: { files: [], totalFound: 0 },
            biasApplied: false
        };
        systemPrompt = this.contextAugmenter.augmentPrompt(systemPrompt, greenfieldAnalysis);
      }
      
      this.eventBus.emitEvent('agent:thinking' as any, {
        consultation_id: this.consultationId,
        agent_name: agent.name,
        round: 3
      });
      
      try {
        const start = Date.now();
        // Use HedgedRequestManager for reliability (Story 2.3)
        const agentConfig = {
          name: agent.name,
          model: agent.model,
          provider: agent.model // Map model to provider ID
        };

        const messages: Message[] = [
          { role: 'user', content: 'Proceed with Cross-Examination.' }
        ];

        // --- Pulse Logic Wrapper ---
        const executionPromise = (async () => {
          let cancelPulse: (reason?: any) => void;
          const cancellationPromise = new Promise<never>((_, reject) => {
              cancelPulse = reject;
          });

          const startRecursivePulse = () => {
              this.interactivePulse.startTimer(agent.name, async () => {
                  // Track at orchestrator level (Story 2.4, AC #3)
                  this.pulseTriggered = true;
                  if (!this.pulseTimestamp) {
                      this.pulseTimestamp = new Date().toISOString();
                  }
                  const runningAgents = this.interactivePulse.getRunningAgents();
                  const shouldContinue = await this.interactivePulse.promptUserToContinue(runningAgents);

                  if (!shouldContinue) {
                      cancelPulse(new Error('User cancelled via interactive pulse'));
                  } else {
                      startRecursivePulse();
                  }
              });
          };

          startRecursivePulse();

          try {
              // Pass system prompt as 4th parameter to HedgedRequestManager
              const response = await Promise.race([
                  this.hedgedRequestManager.executeAgentWithHedging(
                    agentConfig,
                    messages,
                    this.healthMonitor,
                    systemPrompt
                  ),
                  cancellationPromise
              ]);
              return response;
          } finally {
              this.interactivePulse.cancelTimer(agent.name);
          }
        })();

        const response = await executionPromise;
        
        const duration = response.durationMs || (Date.now() - start);

        this.eventBus.emitEvent('agent:completed' as any, {
          consultation_id: this.consultationId,
          agent_name: agent.name,
          duration_ms: duration,
          tokens: response.tokens
        });

        const agentResponse: AgentResponse = {
          agentId: agent.name,
          agentName: agent.name,
          model: response.model || agent.model,
          provider: response.provider || 'unknown',
          content: response.content || '',
          tokens: response.tokens || { input: 0, output: 0, total: 0 },
          durationMs: duration,
          timestamp: new Date().toISOString()
        };
        return agentResponse;
      } catch (error: any) {
        if (error.message === 'User cancelled via interactive pulse') {
             throw error; // Re-throw to abort
        }

        console.warn(`⚠️ Agent ${agent.name} failed in Round 3: ${(error as any).message}`);
        return null;
      }
    });

    const agentResponses = (await Promise.all(promises)).filter(r => r !== null) as AgentResponse[];

    // Track costs from agent responses
    for (const agentResponse of agentResponses) {
      if (agentResponse.tokens) {
        this.trackActualCost(agentResponse.tokens, agentResponse.model);
      }
    }

    if (agentResponses.length === 0) {
        throw new Error("All agents failed in Round 3 Cross-Exam");
    }

    if (this.verbose) console.log(`⚡ Judge (GPT-4o) synthesizing Cross-Examination...`);

    // 2. Judge Synthesis
    const judgeAgent = {
      name: 'Judge (Cross-Exam)',
      model: 'gpt-4o',
      provider: ProviderFactory.createProvider('gpt-4o'),
      systemPrompt: this.strategy.getCrossExamSynthesisPrompt(agentResponses, synthesisArtifact)
    };

    this.eventBus.emitEvent('agent:thinking' as any, {
        consultation_id: this.consultationId,
        agent_name: judgeAgent.name,
        round: 3
    });

    try {
      const response = await judgeAgent.provider.chat([
          { role: 'user', content: 'Analyze the cross-examination.' }
      ], judgeAgent.systemPrompt);

      // Track cost from judge synthesis
      if (response.usage) {
        this.trackActualCost(response.usage, judgeAgent.model);
      }

      const artifact = ArtifactExtractor.extractCrossExamArtifact(response.text || '');

      this.eventBus.emitEvent('consultation:round_artifact' as any, {
        consultation_id: this.consultationId,
        round_number: 3,
        artifact_type: 'cross_exam',
        artifact
      });

      this.eventBus.emitEvent('round:completed' as any, {
        consultation_id: this.consultationId,
        round_number: 3,
        artifact_type: 'cross_exam'
      });

      if (this.verbose) console.log(`✓ Cross-Exam complete`);

      return artifact;

    } catch (error: any) {
      if (this.verbose) console.warn(`⚠️ Cross-Exam Synthesis failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute a single agent for Independent Round
   */
  private async executeAgentIndependent(
    agent: Agent,
    independentPrompt: string
  ): Promise<Round1ExecutionResult> {
    const startTime = Date.now();
    let pulseTriggered = false;

    try {
      this.eventBus.emitEvent('agent:thinking' as any, {
        consultation_id: this.consultationId,
        agent_name: agent.name,
        round: 1
      });

      if (this.verbose) console.log(`⚡ ${agent.name} (${agent.model}) thinking...`);

      const messages: Message[] = [
        {
          role: 'user',
          content: independentPrompt
        }
      ];

      // Use HedgedRequestManager for reliability (Story 2.3)
      const agentConfig = {
        name: agent.name,
        model: agent.model,
        provider: agent.model // Map model to provider ID
      };

      // --- Pulse Logic Wrapper ---
      // We wrap the hedged request in a race with the pulse timer
      // We need a way to reject the main promise if user cancels in the callback

      const executionPromise = (async () => {
          // Wrap startTimer in a promise structure so we can reject from callback?
          // Actually, we can just use Promise.race between the execution and a "cancel signal" promise?

          // Let's create a controlled promise for the pulse cancellation
          let cancelPulse: (reason?: any) => void;
          const cancellationPromise = new Promise<never>((_, reject) => {
              cancelPulse = reject;
          });

          // Recursive pulse starter
          const startRecursivePulse = () => {
              this.interactivePulse.startTimer(agent.name, async () => {
                  pulseTriggered = true;
                  // Track at orchestrator level (Story 2.4, AC #3)
                  this.pulseTriggered = true;
                  if (!this.pulseTimestamp) {
                      this.pulseTimestamp = new Date().toISOString();
                  }
                  const runningAgents = this.interactivePulse.getRunningAgents();
                  const shouldContinue = await this.interactivePulse.promptUserToContinue(runningAgents);

                  if (!shouldContinue) {
                      cancelPulse(new Error('User cancelled via interactive pulse'));
                  } else {
                      // Restart timer
                      startRecursivePulse();
                  }
              });
          };

          // Start the initial timer
          startRecursivePulse();

          try {
              // Race the actual execution against the cancellation promise
              // Pass system prompt as 4th parameter to HedgedRequestManager
              const response = await Promise.race([
                  this.hedgedRequestManager.executeAgentWithHedging(
                    agentConfig,
                    messages,
                    this.healthMonitor,
                    agent.systemPrompt
                  ),
                  cancellationPromise
              ]);
              
              return response;
          } finally {
              // Cleanup timer on completion or error
              this.interactivePulse.cancelTimer(agent.name);
          }
      })();
      
      const response = await executionPromise;

      const duration = response.durationMs || (Date.now() - startTime);
      if (this.verbose) console.log(`✓ ${agent.name} responded in ${(duration / 1000).toFixed(1)}s`);

      const usage = response.tokens || { input: 0, output: 0, total: 0 };
      const inputTokens = usage.input || 0;
      const outputTokens = usage.output || 0;

      // Extract Artifact
      const artifact = ArtifactExtractor.extractIndependentArtifact(
        response.content || '',
        agent.name // Using name as ID for now, ideally strictly ID
      );

      // 'agent:completed' is emitted here, but HedgedManager emits 'substitution'.
      // We still emit 'agent:completed' for consistency in Orchestrator logic.
      this.eventBus.emitEvent('agent:completed' as any, {
        consultation_id: this.consultationId,
        agent_name: agent.name,
        duration_ms: duration,
        tokens: usage
      });

      // Map response to AgentResponse type
      const agentResponse: AgentResponse = {
        agentId: agent.name,
        agentName: agent.name,
        model: response.model || agent.model, // Use actual model (backup might be different)
        provider: response.provider || 'unknown',
        content: response.content || '',
        tokens: {
          input: inputTokens,
          output: outputTokens,
          total: inputTokens + outputTokens
        },
        durationMs: duration,
        timestamp: new Date().toISOString()
      };

      return { artifact, response: agentResponse };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.warn(`⚠️  Agent ${agent.name} failed: ${error.message}`);
      
      // If user cancelled, we should probably propagate that differently or mark it
      if (error.message === 'User cancelled via interactive pulse') {
          // Re-throw to be caught by main loop to abort consultation? 
          // Or just return null/failed result?
          // Story says: "Current round is cancelled... State transitions to Aborted... Message: 'Consultation cancelled...'"
          // So we should re-throw so the main consult() loop catches it and aborts.
          throw error;
      }

      // Story: Failed agent response includes error field (handled in logging/warning)
      // We return null here and filter later, but ideally we should preserve the error state in the result
      const agentResponse: AgentResponse = {
        agentId: agent.name,
        agentName: agent.name,
        model: agent.model,
        provider: 'unknown',
        content: '',
        tokens: {
          input: 0,
          output: 0,
          total: 0
        },
        durationMs: duration,
        timestamp: new Date().toISOString(),
        error: error.message
      };

      return { artifact: null, response: agentResponse };
    }
  }

  /**
   * Generate a unique consultation ID
   */
  private generateId(prefix: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 9);
    return `${prefix}-${timestamp}-${random}`;
  }

  /**
   * Helper to construct result object for checkpoints and partial saves
   */
  private constructResultObject(
      status: 'complete' | 'partial' | 'aborted',
      question: string,
      context: string,
      successfulArtifacts: IndependentArtifact[],
      synthesisArtifact: SynthesisArtifact | null,
      crossExamArtifact: CrossExamArtifact | null,
      verdictArtifact: VerdictArtifact | null,
      agentResponses: AgentResponse[],
      abortReason?: string,
      cancellationReason?: string
  ): ConsultationResult {
      const completedRounds = verdictArtifact ? 4 : (crossExamArtifact ? 3 : (synthesisArtifact ? 2 : (successfulArtifacts.length > 0 ? 1 : 0)));
      const completedRoundNames: string[] = [];
      if (successfulArtifacts.length > 0) completedRoundNames.push('Round1');
      if (synthesisArtifact) completedRoundNames.push('Round2');
      if (crossExamArtifact) completedRoundNames.push('Round3');
      if (verdictArtifact) completedRoundNames.push('Round4');

      const allRounds = ['Round1', 'Round2', 'Round3', 'Round4'];
      const incompleteRoundNames = allRounds.filter(r => !completedRoundNames.includes(r));

      // Calculate actual tokens consumed so far (Story 2.5 Medium finding)
      const actualTokens = agentResponses.reduce((acc, resp) => {
          acc.input += resp.tokens?.input || 0;
          acc.output += resp.tokens?.output || 0;
          acc.total += resp.tokens?.total || 0;
          return acc;
      }, { input: 0, output: 0, total: 0 });

      return {
        consultationId: this.consultationId,
        timestamp: new Date().toISOString(),
        question,
        context,
        mode: this.strategy.name, // Use strategy mode (Epic 4, Story 1)
        projectContext: this.projectContextMetadata,
        contextMetadata: this.buildContextMetadata(),
        scrubbingReport: this.scrubbingReport,
        agents: this.agents.map(a => ({ name: a.name, model: a.model, provider: 'unknown' })),
        agentResponses,
        state: this.stateMachine.getCurrentState(), // Use current state
        status,
        rounds: this.maxRounds,
        completedRounds,
        completedRoundNames,
        incompleteRoundNames,
        responses: {
          round1: successfulArtifacts.length > 0 ? successfulArtifacts : undefined,
          round2: synthesisArtifact || undefined,
          round3: crossExamArtifact || undefined,
          round4: verdictArtifact || undefined
        },
        consensus: synthesisArtifact?.consensusPoints[0]?.point || "Consultation incomplete",
        confidence: verdictArtifact?.confidence || 0,
        recommendation: verdictArtifact?.recommendation || "Consultation incomplete",
        reasoning: {},
        concerns: crossExamArtifact?.unresolved || [],
        dissent: verdictArtifact?.dissent || [],
        perspectives: successfulArtifacts.map(a => ({ agent: a.agentId, model: 'unknown', opinion: a.position })),
        cost: {
          tokens: actualTokens,
          usd: this.actualCostUsd
        },
        durationMs: 0,
        // Use strategy prompt versions (Epic 4, Story 1)
        promptVersions: {
          mode: this.strategy.name,
          independentPromptVersion: this.strategy.promptVersions.independent,
          synthesisPromptVersion: this.strategy.promptVersions.synthesis,
          crossExamPromptVersion: this.strategy.promptVersions.crossExam,
          verdictPromptVersion: this.strategy.promptVersions.verdict
        },
        abortReason,
        cancellationReason
      };
  }

  /**
   * Helper to construct the final result object
   * Centralizes logic for both standard completion and early termination
   */
  private createFinalResult(params: {
      question: string;
      context: string;
      startTime: number;
      estimate: CostEstimate;
      agentResponses: AgentResponse[];
      successfulArtifacts: IndependentArtifact[];
      synthesisArtifact: SynthesisArtifact | null;
      crossExamArtifact?: CrossExamArtifact | null;
      verdictArtifact?: VerdictArtifact | null;
      debateValueAnalysis?: DebateValueAnalysis;
      earlyTermination?: boolean;
      earlyTerminationReason?: string;
      estimatedCostSaved?: number;
  }): ConsultationResult {
      const {
          question, context, startTime, estimate, agentResponses,
          successfulArtifacts, synthesisArtifact, crossExamArtifact, verdictArtifact,
          debateValueAnalysis, earlyTermination, earlyTerminationReason, estimatedCostSaved
      } = params;

      const durationMs = Date.now() - startTime;
    
      // Use Verdict for final results
      const consensusText = verdictArtifact ? verdictArtifact.recommendation : (synthesisArtifact?.consensusPoints[0]?.point || "No consensus");
      const confidence = verdictArtifact ? verdictArtifact.confidence : 0;
      const recommendation = verdictArtifact ? verdictArtifact.recommendation : "Consultation incomplete";
      const dissent = verdictArtifact ? verdictArtifact.dissent : [];

      // Determine if cost was exceeded
      const costExceeded = this.actualCostUsd > (this.estimatedCostUsd * 1.5);

      // Calculate efficiency stats
      const totalSaved = this.tokenSavings.round3 + this.tokenSavings.round4;
      const efficiencyStats: TokenEfficiencyStats = {
          tokens_used: this.totalTokensUsed,
          tokens_saved_via_filtering: totalSaved,
          efficiency_percentage: this.costEstimator.calculateEfficiencyPercentage(totalSaved, this.totalTokensUsed + totalSaved),
          filtering_method: 'structured_artifact_array_truncation',
          filtered_rounds: this.verbose ? [] : [3, 4]
      };

      const result: ConsultationResult = {
        consultationId: this.consultationId,
        timestamp: new Date().toISOString(),
        question,
        context,
        mode: this.strategy.name, // Use strategy mode (Epic 4, Story 1)
        projectContext: this.projectContextMetadata,
        contextMetadata: this.buildContextMetadata(),
        scrubbingReport: this.scrubbingReport,
        agents: this.agents.map(a => ({ name: a.name, model: a.model, provider: 'unknown' })),
        agentResponses,
        state: ConsultState.Complete,
        rounds: this.maxRounds,
        completedRounds: earlyTermination ? 2 : (verdictArtifact ? 4 : (crossExamArtifact ? 3 : 2)),
        responses: {
          round1: successfulArtifacts,
          round2: synthesisArtifact || undefined,
          round3: crossExamArtifact || undefined,
          round4: verdictArtifact || undefined
        },
        debateValueAnalysis,
        consensus: consensusText,
        confidence,
        recommendation,
        reasoning: {},
        concerns: crossExamArtifact?.unresolved || [],
        dissent,
        perspectives: successfulArtifacts.map(a => ({ agent: a.agentId, model: 'unknown', opinion: a.position })),
        cost: { tokens: { input: estimate.inputTokens, output: estimate.outputTokens, total: estimate.totalTokens }, usd: this.actualCostUsd },
        durationMs,
        // Use strategy prompt versions (Epic 4, Story 1)
        promptVersions: {
          mode: this.strategy.name,
          independentPromptVersion: this.strategy.promptVersions.independent,
          synthesisPromptVersion: this.strategy.promptVersions.synthesis,
          crossExamPromptVersion: this.strategy.promptVersions.crossExam,
          verdictPromptVersion: this.strategy.promptVersions.verdict
        },
        // Cost tracking fields (Epic 2, Story 1)
        estimatedCost: this.estimatedCostUsd,
        actualCost: this.actualCostUsd,
        costExceeded,
        estimatedCostSaved,
        // Token efficiency (Epic 2, Story 6)
        token_efficiency_stats: efficiencyStats,
        // Provider substitutions (Epic 2, Story 2.3 AC #4)
        substitutions: this.substitutions,
        // Pulse tracking (Epic 2, Story 2.4, AC #3)
        pulseTriggered: this.pulseTriggered,
        userCancelledAfterPulse: this.userCancelledViaPulse,
        pulseTimestamp: this.pulseTimestamp,
        earlyTermination,
        earlyTerminationReason
      };

      this.eventBus.emitEvent('consultation:completed' as any, {
        consultation_id: this.consultationId,
        result
      });

      // Display token efficiency stats to user (Story 2.6, Fix #3)
      if (!this.verbose && efficiencyStats.tokens_saved_via_filtering > 0) {
        console.log(chalk.green(`\n💰 Token Efficiency: Saved ${efficiencyStats.tokens_saved_via_filtering} tokens (${efficiencyStats.efficiency_percentage.toFixed(1)}%) via artifact filtering`));
      }
      
      if (earlyTermination) {
           console.log(chalk.green(`\n✨ Terminated early with high confidence (${(confidence * 100).toFixed(0)}%)`));
           if (estimatedCostSaved) {
                console.log(chalk.green(`💰 Estimated savings: $${estimatedCostSaved.toFixed(4)}`));
           }
      }

      // Log consultation to files (Story 1.8)
      // This is async but we don't await to avoid blocking result delivery
      this.fileLogger.logConsultation(result).catch(err => {
        console.error('Failed to log consultation:', err.message);
      });

      return result;
  }

  /**
   * Save checkpoint
   */
  private async saveCheckpoint(
      question: string,
      context: string,
      successfulArtifacts: IndependentArtifact[],
      synthesisArtifact: SynthesisArtifact | null,
      crossExamArtifact: CrossExamArtifact | null,
      verdictArtifact: VerdictArtifact | null,
      agentResponses: AgentResponse[]
  ): Promise<void> {
      try {
        const result = this.constructResultObject(
            'partial',
            question,
            context,
            successfulArtifacts,
            synthesisArtifact,
            crossExamArtifact,
            verdictArtifact,
            agentResponses
        );
        await this.partialResultManager.saveCheckpoint(result as PartialConsultationResult);
      } catch (error) {
          console.warn(`Failed to save checkpoint: ${(error as any).message}`);
      }
  }

  /**
   * Save partial results when consultation is cancelled/aborted
   * (Story 2.5 dependency)
   */
  private async savePartialResults(
    reason: 'user_pulse_cancel' | 'timeout' | 'error' | 'cost_exceeded_estimate',
    question: string,
    context: string,
    estimate: CostEstimate | null,
    successfulArtifacts: IndependentArtifact[] = [],
    synthesisArtifact: SynthesisArtifact | null = null,
    crossExamArtifact: CrossExamArtifact | null = null,
    verdictArtifact: VerdictArtifact | null = null,
    agentResponses: AgentResponse[] = [],
    errorDetail?: string
  ): Promise<void> {
      const partialResult = this.constructResultObject(
          'partial',
          question,
          context,
          successfulArtifacts,
          synthesisArtifact,
          crossExamArtifact,
          verdictArtifact,
          agentResponses,
          errorDetail || reason,
          reason
      );

      // Add specific tracking fields
      partialResult.pulseTriggered = reason === 'user_pulse_cancel';
      partialResult.userCancelledAfterPulse = reason === 'user_pulse_cancel';
      partialResult.pulseTimestamp = new Date().toISOString();
      if (estimate) {
          partialResult.estimatedCost = estimate.estimatedCostUsd;
      }

      await this.partialResultManager.savePartialResults(
          partialResult as PartialConsultationResult,
          reason
      );
  }

  /**
   * Track actual cost from agent response
   * (Epic 2, Story 1: In-flight cost monitoring)
   */
  private normalizeUsage(
    usage: TokenUsage | { input_tokens?: number; output_tokens?: number; total_tokens?: number }
  ): TokenUsage {
    if ('input' in usage) {
      return usage;
    }

    const input = usage.input_tokens ?? 0;
    const output = usage.output_tokens ?? 0;
    return {
      input,
      output,
      total: usage.total_tokens ?? (input + output)
    };
  }

  private trackActualCost(
    usage: TokenUsage | { input_tokens?: number; output_tokens?: number; total_tokens?: number },
    model: string
  ): void {
    const normalized = this.normalizeUsage(usage);
    const pricing = CostEstimator.getPrice(model);
    const inputCost = (normalized.input / 1000) * pricing.input;
    const outputCost = (normalized.output / 1000) * pricing.output;
    this.actualCostUsd += inputCost + outputCost;
    this.totalTokensUsed += normalized.total;
  }

  /**
   * Check if actual cost has exceeded estimate by >50%
   * (Epic 2, Story 1: In-flight cost monitoring)
   */
  private checkCostThreshold(): void {
    if (this.estimatedCostUsd === 0) return; // No estimate, skip check

    const threshold = this.estimatedCostUsd * 1.5; // 50% over estimate
    if (this.actualCostUsd > threshold) {
      const percentOver = ((this.actualCostUsd - this.estimatedCostUsd) / this.estimatedCostUsd) * 100;
      console.log(chalk.red(`\n⚠️  Cost exceeded estimate by ${percentOver.toFixed(1)}%. Aborting consultation.`));
      console.log(chalk.gray(`   Estimated: $${this.estimatedCostUsd.toFixed(4)}`));
      console.log(chalk.gray(`   Actual: $${this.actualCostUsd.toFixed(4)}`));

      this.stateMachine.transition(ConsultState.Aborted, 'Cost exceeded estimate by >50%');
      throw new Error('Cost threshold exceeded - consultation aborted');
    }
  }



  /**
   * Helper to synthesize a verdict directly from the Synthesis artifact
   * Used for early termination (Epic 4, Story 2)
   */
  private synthesizeVerdictFromSynthesis(synthesis: SynthesisArtifact): VerdictArtifact {
    // Use highest confidence consensus point as recommendation
    const sortedPoints = [...synthesis.consensusPoints].sort((a, b) => b.confidence - a.confidence);
    const topPoint = sortedPoints[0];

    // Average confidence from consensus points
    const avgConfidence = this.earlyTerminationManager.calculateSynthesisConfidence(synthesis);

    // Map tensions to dissent
    const dissent: Dissent[] = synthesis.tensions.map(t => ({
      agent: t.viewpoints[0]?.agent || 'unknown',
      concern: t.topic,
      severity: 'medium' as const
    }));

    return {
      artifactType: 'verdict',
      schemaVersion: '1.0',
      roundNumber: 4,
      recommendation: topPoint?.point || 'No clear recommendation (synthesized from early termination)',
      confidence: avgConfidence,
      evidence: synthesis.consensusPoints.map(cp => cp.point),
      dissent,
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Get Security Expert system prompt
   */
  private getSecurityExpertPrompt(): string {
    return `You are a Security Expert specializing in threat modeling and vulnerability analysis.

Your role in consultations:
- Identify security risks and vulnerabilities
- Evaluate authentication, authorization, and data protection approaches
- Consider attack vectors and mitigation strategies
- Assess compliance and privacy implications`;
  }

  /**
   * Get Architect system prompt
   */
  private getArchitectPrompt(): string {
    return `You are a Software Architect specializing in system design and scalability.

Your role in consultations:
- Evaluate architectural patterns and trade-offs
- Consider scalability, maintainability, and extensibility
- Assess technical debt implications
- Recommend best practices and design patterns`;
  }

  /**
   * Get Pragmatist system prompt
   */
  private getPragmatistPrompt(): string {
    return `You are a Pragmatic Engineer focused on shipping and practical implementation.

Your role in consultations:
- Assess implementation complexity and time-to-ship
- Consider team capabilities and existing codebase constraints
- Balance ideal solutions with practical realities
- Identify simpler alternatives that deliver 80% of value with 20% effort`;
  }

  private buildProjectContextMetadata(analysis: BrownfieldAnalysis): ProjectContextMetadata {
    const indicatorsFound = analysis.indicatorsFound.map((indicator) => {
      if (indicator.type === 'source_files') {
        return 'source_files';
      }
      if (indicator.type === 'git_repo') {
        return 'git';
      }
      const baseName = path.basename(indicator.path);
      return baseName || indicator.name;
    });

    const documentationUsed = analysis.documentation.files.map((file) => file.name);

    return {
      projectType: analysis.projectType,
      frameworkDetected: analysis.techStack.framework,
      frameworkVersion: analysis.techStack.frameworkVersion,
      architecturePattern: analysis.techStack.architecturePattern,
      techStack: {
        stateManagement: analysis.techStack.stateManagement,
        styling: analysis.techStack.styling,
        testing: analysis.techStack.testing,
        api: analysis.techStack.api,
        database: analysis.techStack.database,
        orm: analysis.techStack.orm,
        cicd: analysis.techStack.cicd
      },
      indicatorsFound,
      documentationUsed,
      biasApplied: analysis.biasApplied
    };
  }

  /**
   * Build ContextMetadata from loadedContext
   * Extracted to avoid duplication (Code Review Fix)
   */
  private buildContextMetadata(): ContextMetadata | undefined {
    if (!this.loadedContext) {
      return undefined;
    }
    const stdinSource = this.loadedContext.sources.find(s => s.type === 'stdin');
    return {
      files: this.loadedContext.sources.filter(s => s.type === 'file').map(s => s.path),
      projectPath: this.loadedContext.sources.find(s => s.type === 'project')?.path || null,
      totalTokensEstimated: this.loadedContext.totalTokens,
      fileCount: this.loadedContext.fileCount,
      projectSummaryIncluded: this.loadedContext.projectIncluded,
      stdinUsed: Boolean(stdinSource),
      stdinTokensEstimated: stdinSource?.tokenEstimate
    };
  }
}
