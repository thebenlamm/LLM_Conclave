"use strict";
/**
 * ConsultOrchestrator - Fast multi-model consultation system
 *
 * Implements a streamlined consultation flow:
 * 1. Round 1: All agents respond in parallel (Independent)
 * 2. Round 2: Synthesis (Consensus Building)
 * 3. Round 3: Cross-Examination
 * 4. Round 4: Verdict
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ProviderFactory_1 = __importDefault(require("../providers/ProviderFactory"));
const EventBus_1 = require("../core/EventBus");
const ConsultStateMachine_1 = require("./ConsultStateMachine");
const ArtifactExtractor_1 = require("../consult/artifacts/ArtifactExtractor");
const ArtifactFilter_1 = require("../consult/artifacts/ArtifactFilter");
const FilterConfig_1 = require("../consult/artifacts/FilterConfig");
const CostEstimator_1 = require("../consult/cost/CostEstimator");
const CostGate_1 = require("../consult/cost/CostGate");
const ConfigCascade_1 = require("../cli/ConfigCascade");
const ConsultationFileLogger_1 = require("../consult/logging/ConsultationFileLogger");
const ProviderHealthMonitor_1 = require("../consult/health/ProviderHealthMonitor");
const ProviderTiers_1 = require("../consult/health/ProviderTiers");
const HedgedRequestManager_1 = require("../consult/health/HedgedRequestManager");
const InteractivePulse_1 = require("../consult/health/InteractivePulse");
const PartialResultManager_1 = require("../consult/persistence/PartialResultManager");
const ConvergeStrategy_1 = require("../consult/strategies/ConvergeStrategy");
const chalk_1 = __importDefault(require("chalk"));
const consult_1 = require("../types/consult");
class ConsultOrchestrator {
    constructor(options = {}) {
        this.estimatedCostUsd = 0;
        this.actualCostUsd = 0;
        this.totalTokensUsed = 0;
        this.tokenSavings = { round3: 0, round4: 0 };
        this.substitutions = []; // Track provider substitutions for AC #4
        // Pulse tracking (Story 2.4, AC #3)
        this.pulseTriggered = false;
        this.userCancelledViaPulse = false;
        this.maxRounds = options.maxRounds || 4; // Default to 4 rounds per Epic 1
        this.verbose = options.verbose || false;
        // Use provided strategy or default to ConvergeStrategy (matches MVP behavior)
        this.strategy = options.strategy || new ConvergeStrategy_1.ConvergeStrategy();
        this.eventBus = EventBus_1.EventBus.getInstance();
        this.costEstimator = new CostEstimator_1.CostEstimator();
        this.artifactFilter = new ArtifactFilter_1.ArtifactFilter();
        this.filterConfig = new FilterConfig_1.FilterConfig();
        this.costGate = new CostGate_1.CostGate();
        this.fileLogger = new ConsultationFileLogger_1.ConsultationFileLogger();
        this.hedgedRequestManager = new HedgedRequestManager_1.HedgedRequestManager(this.eventBus);
        this.interactivePulse = new InteractivePulse_1.InteractivePulse();
        this.partialResultManager = new PartialResultManager_1.PartialResultManager();
        // Generate ID first so state machine can use it
        this.consultationId = this.generateId('consult');
        this.stateMachine = new ConsultStateMachine_1.ConsultStateMachine(this.consultationId);
        // Initialize 3 fixed agents with diverse models
        this.agents = this.initializeAgents();
        // Initialize Health Monitor (Story 2.2)
        this.healthMonitor = new ProviderHealthMonitor_1.ProviderHealthMonitor();
        // Register ALL configured providers (Fix 2)
        Object.keys(ProviderTiers_1.PROVIDER_TIER_MAP).forEach(model => {
            this.healthMonitor.registerProvider(model);
        });
        this.healthMonitor.startMonitoring();
        // Subscribe to provider substitution events (Story 2.3 AC #4)
        this.eventBus.on('consultation:provider_substituted', (data) => {
            this.substitutions.push(data);
        });
        // Setup graceful cleanup on process termination (Story 2.4, Code Review Fix)
        // Ensures pulse timers are cleaned up when process is killed (Ctrl+C, SIGTERM, etc.)
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
    initializeAgents() {
        return [
            {
                name: 'Security Expert',
                model: 'claude-sonnet-4-5',
                provider: ProviderFactory_1.default.createProvider('claude-sonnet-4-5'),
                systemPrompt: this.getSecurityExpertPrompt()
            },
            {
                name: 'Architect',
                model: 'gpt-4o',
                provider: ProviderFactory_1.default.createProvider('gpt-4o'),
                systemPrompt: this.getArchitectPrompt()
            },
            {
                name: 'Pragmatist',
                model: 'gemini-2.5-pro',
                provider: ProviderFactory_1.default.createProvider('gemini-2.5-pro'),
                systemPrompt: this.getPragmatistPrompt()
            }
        ];
    }
    /**
     * Create recursive pulse callback for an agent
     */
    createPulseCallback(agentName) {
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
                this.eventBus.emitEvent('consultation:pulse_cancel', {
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
     * @returns Consultation result with consensus, confidence, and costs
     */
    async consult(question, context = '') {
        const startTime = Date.now();
        let estimate = null;
        let agentResponses = [];
        let successfulArtifacts = [];
        let synthesisArtifact = null;
        let crossExamArtifact = null;
        let verdictArtifact = null;
        // Pulse tracking (Story 2.4, AC #3)
        let pulseTriggered = false;
        let pulseTimestamp;
        let userCancelledAfterPulse = false;
        try {
            // Start consultation lifecycle
            this.stateMachine.transition(consult_1.ConsultState.Estimating);
            // Emit started event
            this.eventBus.emitEvent('consultation:started', {
                consultation_id: this.consultationId,
                question,
                agents: this.agents.map(a => ({ name: a.name, model: a.model, provider: 'unknown' })), // Provider logic handled in factory
                mode: this.strategy.name // Use strategy mode (Epic 4, Story 1)
            });
            // Display verbose mode message (AC #5)
            if (this.verbose) {
                console.log(chalk_1.default.cyan('🔍 Verbose mode: using full debate artifacts (higher token cost)'));
                console.log(`\n${'='.repeat(80)}`);
                console.log(`CONSULTATION: ${question}`);
                console.log(`${'='.repeat(80)}\n`);
            }
            // Health Check Warning (Story 2.2)
            // Fix 3: Only warn if we have actually checked at least once
            if (this.healthMonitor.hasCompletedFirstCheck() && !this.healthMonitor.hasHealthyProviders()) {
                console.log(chalk_1.default.yellow('\n⚠️  All providers degraded. Consultation may be slower than usual.'));
            }
            // --- State: Estimating ---
            estimate = this.costEstimator.estimateCost(question, this.agents, this.maxRounds);
            this.estimatedCostUsd = estimate.estimatedCostUsd; // Store for later comparison
            this.eventBus.emitEvent('consultation:cost_estimated', {
                consultation_id: this.consultationId,
                estimated_cost: estimate.estimatedCostUsd,
                input_tokens: estimate.inputTokens,
                expected_output_tokens: estimate.outputTokens
            });
            // --- State: AwaitingConsent ---
            this.stateMachine.transition(consult_1.ConsultState.AwaitingConsent);
            // Get configuration for cost threshold
            const config = ConfigCascade_1.ConfigCascade.resolve({}, process.env);
            // Check if user consent is needed
            if (this.costGate.shouldPromptUser(estimate, config)) {
                // Cost exceeds threshold - prompt user
                const consent = await this.costGate.getUserConsent(estimate, this.agents.length, this.maxRounds);
                if (consent === 'denied') {
                    this.stateMachine.transition(consult_1.ConsultState.Aborted, 'User cancelled');
                    console.log(chalk_1.default.yellow('\n⚠️  Consultation cancelled by user'));
                    throw new Error('Consultation cancelled by user');
                }
                // Consent given (either 'approved' or 'always' which also approves current consultation)
                this.eventBus.emitEvent('consultation:user_consent', {
                    consultation_id: this.consultationId,
                    approved: true,
                    auto_approved: false
                });
            }
            else {
                // Cost under threshold - auto-approve
                this.costGate.displayAutoApproved(estimate.estimatedCostUsd);
                this.eventBus.emitEvent('consultation:user_consent', {
                    consultation_id: this.consultationId,
                    approved: true,
                    auto_approved: true
                });
            }
            // --- State: Independent (Round 1) ---
            this.stateMachine.transition(consult_1.ConsultState.Independent);
            if (this.verbose)
                console.log(`\n--- Round 1: Independent Analysis ---\n`);
            const round1Results = await this.executeRound1Independent(question, context);
            // Track costs from Round 1
            for (const result of round1Results) {
                if (result.response.tokens) {
                    this.trackActualCost(result.response.tokens, result.response.model);
                }
            }
            this.checkCostThreshold(); // Check after Round 1
            // Track failed agents
            successfulArtifacts = round1Results.map(result => result.artifact).filter(a => !!a);
            agentResponses = round1Results.map(result => result.response);
            if (successfulArtifacts.length === 0) {
                this.stateMachine.transition(consult_1.ConsultState.Aborted, 'All agents failed in Round 1');
                throw new Error('All agents failed. Unable to provide consultation.');
            }
            this.eventBus.emitEvent('round:completed', {
                consultation_id: this.consultationId,
                round_number: 1,
                artifact_type: 'independent'
            });
            // Save Checkpoint (Story 2.5)
            await this.saveCheckpoint(question, context, successfulArtifacts, null, null, null, agentResponses);
            // --- State: Synthesis (Round 2) ---
            this.stateMachine.transition(consult_1.ConsultState.Synthesis);
            if (this.verbose)
                console.log(`\n--- Round 2: Synthesis ---\n`);
            synthesisArtifact = await this.executeRound2Synthesis(question, successfulArtifacts);
            this.checkCostThreshold(); // Check after Round 2
            // Save Checkpoint (Story 2.5)
            await this.saveCheckpoint(question, context, successfulArtifacts, synthesisArtifact, null, null, agentResponses);
            // --- State: CrossExam (Round 3) ---
            this.stateMachine.transition(consult_1.ConsultState.CrossExam);
            if (this.verbose)
                console.log(`\n--- Round 3: Cross-Examination ---\n`);
            if (synthesisArtifact) {
                crossExamArtifact = await this.executeRound3CrossExam(successfulArtifacts, synthesisArtifact);
                this.checkCostThreshold(); // Check after Round 3
                // Save Checkpoint (Story 2.5)
                await this.saveCheckpoint(question, context, successfulArtifacts, synthesisArtifact, crossExamArtifact, null, agentResponses);
            }
            else {
                console.warn("Skipping Round 3 due to missing Synthesis artifact");
            }
            // --- State: Verdict (Round 4) ---
            this.stateMachine.transition(consult_1.ConsultState.Verdict);
            if (this.verbose)
                console.log(`\n--- Round 4: Verdict ---\n`);
            // We can proceed to Verdict even if CrossExam failed (using R1/R2)
            // But we need at least Synthesis
            if (synthesisArtifact) {
                verdictArtifact = await this.executeRound4Verdict(question, successfulArtifacts, synthesisArtifact, crossExamArtifact);
                this.checkCostThreshold(); // Check after Round 4
            }
            else {
                throw new Error("Cannot generate Verdict without Synthesis artifact");
            }
            this.stateMachine.transition(consult_1.ConsultState.Complete);
        }
        catch (error) {
            if (error?.message === 'User cancelled via interactive pulse') {
                // Get max elapsed time from running agents for message
                const runningAgents = this.interactivePulse.getRunningAgents();
                const maxElapsed = runningAgents.length > 0
                    ? Math.max(...runningAgents.map(a => a.elapsedSeconds))
                    : 0;
                console.log(chalk_1.default.yellow(`\n⚠️  Consultation cancelled by user after ${maxElapsed}s`));
                this.stateMachine.transition(consult_1.ConsultState.Aborted, `User cancelled after ${maxElapsed}s`);
                // Track cancellation (Story 2.4, AC #3)
                this.userCancelledViaPulse = true;
                // Cleanup all pulse timers
                this.interactivePulse.cleanup();
                await this.savePartialResults('user_pulse_cancel', question, context, estimate, successfulArtifacts, synthesisArtifact, crossExamArtifact, verdictArtifact, agentResponses);
                // Re-throw to ensure caller knows it failed
                throw error;
            }
            if (error?.message?.includes('Cost threshold exceeded')) {
                await this.savePartialResults('cost_exceeded_estimate', question, context, estimate, successfulArtifacts, synthesisArtifact, crossExamArtifact, verdictArtifact, agentResponses);
                throw error;
            }
            // Generic error handling (Story 2.5 requirement: partial save on error/exception)
            if (this.stateMachine.getCurrentState() !== consult_1.ConsultState.Complete && this.stateMachine.getCurrentState() !== consult_1.ConsultState.Aborted) {
                this.stateMachine.transition(consult_1.ConsultState.Aborted, error.message);
                await this.savePartialResults('error', question, context, estimate, successfulArtifacts, synthesisArtifact, crossExamArtifact, verdictArtifact, agentResponses, error.message);
            }
            throw error;
        }
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
        const efficiencyStats = {
            tokens_used: this.totalTokensUsed,
            tokens_saved_via_filtering: totalSaved,
            efficiency_percentage: this.costEstimator.calculateEfficiencyPercentage(totalSaved, this.totalTokensUsed + totalSaved),
            filtering_method: 'structured_artifact_array_truncation',
            filtered_rounds: this.verbose ? [] : [3, 4]
        };
        const result = {
            consultationId: this.consultationId,
            timestamp: new Date().toISOString(),
            question,
            context,
            mode: this.strategy.name, // Use strategy mode (Epic 4, Story 1)
            agents: this.agents.map(a => ({ name: a.name, model: a.model, provider: 'unknown' })),
            agentResponses,
            state: consult_1.ConsultState.Complete,
            rounds: this.maxRounds,
            completedRounds: verdictArtifact ? 4 : (crossExamArtifact ? 3 : 2),
            responses: {
                round1: successfulArtifacts,
                round2: synthesisArtifact || undefined,
                round3: crossExamArtifact || undefined,
                round4: verdictArtifact || undefined
            },
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
            // Token efficiency (Epic 2, Story 6)
            token_efficiency_stats: efficiencyStats,
            // Provider substitutions (Epic 2, Story 2.3 AC #4)
            substitutions: this.substitutions,
            // Pulse tracking (Epic 2, Story 2.4, AC #3)
            pulseTriggered: this.pulseTriggered,
            userCancelledAfterPulse: this.userCancelledViaPulse,
            pulseTimestamp: this.pulseTimestamp
        };
        this.eventBus.emitEvent('consultation:completed', {
            consultation_id: this.consultationId,
            result
        });
        // Display token efficiency stats to user (Story 2.6, Fix #3)
        if (!this.verbose && efficiencyStats.tokens_saved_via_filtering > 0) {
            console.log(chalk_1.default.green(`\n💰 Token Efficiency: Saved ${efficiencyStats.tokens_saved_via_filtering} tokens (${efficiencyStats.efficiency_percentage.toFixed(1)}%) via artifact filtering`));
        }
        // Log consultation to files (Story 1.8)
        // This is async but we don't await to avoid blocking result delivery
        this.fileLogger.logConsultation(result).catch(err => {
            console.error('Failed to log consultation:', err.message);
        });
        return result;
    }
    /**
     * Execute Round 1: Independent Analysis
     * - Parallel execution
     * - Structured artifact extraction
     */
    async executeRound1Independent(question, context) {
        const promises = this.agents.map(agent => this.executeAgentIndependent(agent, question, context));
        const results = await Promise.all(promises);
        return results;
    }
    /**
     * Execute Round 2: Synthesis
     * - Uses GPT-4o as Judge to synthesize independent perspectives
     */
    async executeRound2Synthesis(question, artifacts) {
        const startTime = Date.now();
        const judgeAgent = {
            name: 'Judge (Synthesis)',
            model: 'gpt-4o',
            provider: ProviderFactory_1.default.createProvider('gpt-4o'),
            systemPrompt: this.getSynthesisPrompt(artifacts)
        };
        this.eventBus.emitEvent('agent:thinking', {
            consultation_id: this.consultationId,
            agent_name: judgeAgent.name,
            round: 2
        });
        if (this.verbose)
            console.log(`⚡ Judge (GPT-4o) synthesizing consensus...`);
        try {
            const messages = [
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
            if (this.verbose)
                console.log(`✓ Synthesis complete in ${(duration / 1000).toFixed(1)}s`);
            const artifact = ArtifactExtractor_1.ArtifactExtractor.extractSynthesisArtifact(response.text || '');
            this.eventBus.emitEvent('consultation:round_artifact', {
                consultation_id: this.consultationId,
                round_number: 2,
                artifact_type: 'synthesis',
                artifact
            });
            this.eventBus.emitEvent('round:completed', {
                consultation_id: this.consultationId,
                round_number: 2,
                artifact_type: 'synthesis'
            });
            return artifact;
        }
        catch (error) {
            if (this.verbose)
                console.warn(`⚠️ Synthesis failed: ${error.message}`);
            // In a real scenario, we might want to fail the consultation or degrade gracefully
            this.stateMachine.transition(consult_1.ConsultState.Aborted, `Synthesis failed: ${error.message}`);
            throw error;
        }
    }
    /**
     * Execute Round 4: Verdict
     * - Judge synthesizes all rounds into final recommendation
     */
    async executeRound4Verdict(question, round1Artifacts, synthesisArtifact, crossExamArtifact) {
        const startTime = Date.now();
        if (this.verbose)
            console.log(`⚡ Judge (GPT-4o) generating Final Verdict...`);
        // Apply filtering to R2 & R3 artifacts if not verbose (Round 4 Filter)
        let filteredSynthesis = synthesisArtifact;
        let filteredCrossExam = crossExamArtifact;
        if (!this.verbose) {
            const limits = this.filterConfig.getRound4Limits();
            // Filter Round 2
            filteredSynthesis = this.artifactFilter.filterSynthesisArtifact(synthesisArtifact, { consensusPoints: limits.consensus_points, tensions: limits.tensions });
            // Filter Round 3 (if exists)
            if (crossExamArtifact) {
                filteredCrossExam = this.artifactFilter.filterCrossExamArtifact(crossExamArtifact, { challenges: limits.challenges, rebuttals: limits.rebuttals });
                // Track savings
                const r2Savings = this.costEstimator.estimateTokenSavings([synthesisArtifact], [filteredSynthesis]);
                const r3Savings = this.costEstimator.estimateTokenSavings([crossExamArtifact], [filteredCrossExam]);
                this.tokenSavings.round4 = r2Savings + r3Savings;
            }
            else {
                // Just R2 savings
                this.tokenSavings.round4 = this.costEstimator.estimateTokenSavings([synthesisArtifact], [filteredSynthesis]);
            }
        }
        const judgeAgent = {
            name: 'Judge (Verdict)',
            model: 'gpt-4o',
            provider: ProviderFactory_1.default.createProvider('gpt-4o'),
            systemPrompt: this.getVerdictPrompt(question, round1Artifacts, filteredSynthesis, filteredCrossExam)
        };
        this.eventBus.emitEvent('agent:thinking', {
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
            const artifact = ArtifactExtractor_1.ArtifactExtractor.extractVerdictArtifact(response.text || '');
            this.eventBus.emitEvent('consultation:round_artifact', {
                consultation_id: this.consultationId,
                round_number: 4,
                artifact_type: 'verdict',
                artifact
            });
            this.eventBus.emitEvent('round:completed', {
                consultation_id: this.consultationId,
                round_number: 4,
                artifact_type: 'verdict'
            });
            if (this.verbose)
                console.log(`✓ Verdict complete: ${Math.round(artifact.confidence * 100)}% confidence`);
            return artifact;
        }
        catch (error) {
            if (this.verbose)
                console.warn(`⚠️ Verdict generation failed: ${error.message}`);
            throw error;
        }
    }
    /**
     * Execute Round 3: Cross-Examination
     * - Agents critique consensus and each other
     * - Judge synthesizes challenges and rebuttals
     */
    async executeRound3CrossExam(round1Artifacts, synthesisArtifact) {
        const startTime = Date.now();
        if (this.verbose)
            console.log(`⚡ Agents starting Cross-Examination...`);
        // Apply filtering to R2 artifact if not verbose (Round 3 Filter)
        let filteredSynthesis = synthesisArtifact;
        if (!this.verbose) {
            const limits = this.filterConfig.getRound3Limits();
            filteredSynthesis = this.artifactFilter.filterSynthesisArtifact(synthesisArtifact, { consensusPoints: limits.consensus_points, tensions: limits.tensions });
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
            const systemPrompt = this.getCrossExamPrompt(agent.name, r1Artifact, filteredSynthesis);
            this.eventBus.emitEvent('agent:thinking', {
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
                const messages = [
                    { role: 'user', content: 'Proceed with Cross-Examination.' }
                ];
                // Inject system prompt into messages since HedgedRequestManager doesn't take options
                const fullMessages = [
                    { role: 'system', content: systemPrompt },
                    ...messages
                ];
                // --- Pulse Logic Wrapper ---
                const executionPromise = (async () => {
                    let cancelPulse;
                    const cancellationPromise = new Promise((_, reject) => {
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
                            }
                            else {
                                startRecursivePulse();
                            }
                        });
                    };
                    startRecursivePulse();
                    try {
                        const response = await Promise.race([
                            this.hedgedRequestManager.executeAgentWithHedging(agentConfig, fullMessages, this.healthMonitor),
                            cancellationPromise
                        ]);
                        return response;
                    }
                    finally {
                        this.interactivePulse.cancelTimer(agent.name);
                    }
                })();
                const response = await executionPromise;
                const duration = response.durationMs || (Date.now() - start);
                this.eventBus.emitEvent('agent:completed', {
                    consultation_id: this.consultationId,
                    agent_name: agent.name,
                    duration_ms: duration,
                    tokens: response.tokens
                });
                const agentResponse = {
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
            }
            catch (error) {
                if (error.message === 'User cancelled via interactive pulse') {
                    throw error; // Re-throw to abort
                }
                console.warn(`⚠️ Agent ${agent.name} failed in Round 3: ${error.message}`);
                return null;
            }
        });
        const agentResponses = (await Promise.all(promises)).filter(r => r !== null);
        // Track costs from agent responses
        for (const agentResponse of agentResponses) {
            if (agentResponse.tokens) {
                this.trackActualCost(agentResponse.tokens, agentResponse.model);
            }
        }
        if (agentResponses.length === 0) {
            throw new Error("All agents failed in Round 3 Cross-Exam");
        }
        if (this.verbose)
            console.log(`⚡ Judge (GPT-4o) synthesizing Cross-Examination...`);
        // 2. Judge Synthesis
        const judgeAgent = {
            name: 'Judge (Cross-Exam)',
            model: 'gpt-4o',
            provider: ProviderFactory_1.default.createProvider('gpt-4o'),
            systemPrompt: this.getCrossExamSynthesisPrompt(agentResponses, synthesisArtifact)
        };
        this.eventBus.emitEvent('agent:thinking', {
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
            const artifact = ArtifactExtractor_1.ArtifactExtractor.extractCrossExamArtifact(response.text || '');
            this.eventBus.emitEvent('consultation:round_artifact', {
                consultation_id: this.consultationId,
                round_number: 3,
                artifact_type: 'cross_exam',
                artifact
            });
            this.eventBus.emitEvent('round:completed', {
                consultation_id: this.consultationId,
                round_number: 3,
                artifact_type: 'cross_exam'
            });
            if (this.verbose)
                console.log(`✓ Cross-Exam complete`);
            return artifact;
        }
        catch (error) {
            if (this.verbose)
                console.warn(`⚠️ Cross-Exam Synthesis failed: ${error.message}`);
            throw error;
        }
    }
    /**
     * Execute a single agent for Independent Round
     */
    async executeAgentIndependent(agent, question, context) {
        const startTime = Date.now();
        let pulseTriggered = false;
        try {
            this.eventBus.emitEvent('agent:thinking', {
                consultation_id: this.consultationId,
                agent_name: agent.name,
                round: 1
            });
            if (this.verbose)
                console.log(`⚡ ${agent.name} (${agent.model}) thinking...`);
            const messages = [
                {
                    role: 'user',
                    content: context ? `Context:\n${context}\n\nQuestion: ${question}` : `Question: ${question}`
                }
            ];
            // Use HedgedRequestManager for reliability (Story 2.3)
            const agentConfig = {
                name: agent.name,
                model: agent.model,
                provider: agent.model // Map model to provider ID
            };
            // Inject system prompt into messages since HedgedRequestManager doesn't take options
            const fullMessages = [
                { role: 'system', content: agent.systemPrompt },
                ...messages
            ];
            // --- Pulse Logic Wrapper ---
            // We wrap the hedged request in a race with the pulse timer
            // We need a way to reject the main promise if user cancels in the callback
            const executionPromise = (async () => {
                // Wrap startTimer in a promise structure so we can reject from callback?
                // Actually, we can just use Promise.race between the execution and a "cancel signal" promise?
                // Let's create a controlled promise for the pulse cancellation
                let cancelPulse;
                const cancellationPromise = new Promise((_, reject) => {
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
                        }
                        else {
                            // Restart timer
                            startRecursivePulse();
                        }
                    });
                };
                // Start the initial timer
                startRecursivePulse();
                try {
                    // Race the actual execution against the cancellation promise
                    const response = await Promise.race([
                        this.hedgedRequestManager.executeAgentWithHedging(agentConfig, fullMessages, this.healthMonitor),
                        cancellationPromise
                    ]);
                    return response;
                }
                finally {
                    // Cleanup timer on completion or error
                    this.interactivePulse.cancelTimer(agent.name);
                }
            })();
            const response = await executionPromise;
            const duration = response.durationMs || (Date.now() - startTime);
            if (this.verbose)
                console.log(`✓ ${agent.name} responded in ${(duration / 1000).toFixed(1)}s`);
            const usage = response.tokens || { input: 0, output: 0, total: 0 };
            const inputTokens = usage.input || 0;
            const outputTokens = usage.output || 0;
            // Extract Artifact
            const artifact = ArtifactExtractor_1.ArtifactExtractor.extractIndependentArtifact(response.content || '', agent.name // Using name as ID for now, ideally strictly ID
            );
            // 'agent:completed' is emitted here, but HedgedManager emits 'substitution'.
            // We still emit 'agent:completed' for consistency in Orchestrator logic.
            this.eventBus.emitEvent('agent:completed', {
                consultation_id: this.consultationId,
                agent_name: agent.name,
                duration_ms: duration,
                tokens: usage
            });
            // Map response to AgentResponse type
            const agentResponse = {
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
        }
        catch (error) {
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
            const agentResponse = {
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
    generateId(prefix) {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 9);
        return `${prefix}-${timestamp}-${random}`;
    }
    /**
     * Helper to construct result object for checkpoints and partial saves
     */
    constructResultObject(status, question, context, successfulArtifacts, synthesisArtifact, crossExamArtifact, verdictArtifact, agentResponses, abortReason, cancellationReason) {
        const completedRounds = verdictArtifact ? 4 : (crossExamArtifact ? 3 : (synthesisArtifact ? 2 : (successfulArtifacts.length > 0 ? 1 : 0)));
        const completedRoundNames = [];
        if (successfulArtifacts.length > 0)
            completedRoundNames.push('Round1');
        if (synthesisArtifact)
            completedRoundNames.push('Round2');
        if (crossExamArtifact)
            completedRoundNames.push('Round3');
        if (verdictArtifact)
            completedRoundNames.push('Round4');
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
     * Save checkpoint
     */
    async saveCheckpoint(question, context, successfulArtifacts, synthesisArtifact, crossExamArtifact, verdictArtifact, agentResponses) {
        try {
            const result = this.constructResultObject('partial', question, context, successfulArtifacts, synthesisArtifact, crossExamArtifact, verdictArtifact, agentResponses);
            await this.partialResultManager.saveCheckpoint(result);
        }
        catch (error) {
            console.warn(`Failed to save checkpoint: ${error.message}`);
        }
    }
    /**
     * Save partial results when consultation is cancelled/aborted
     * (Story 2.5 dependency)
     */
    async savePartialResults(reason, question, context, estimate, successfulArtifacts = [], synthesisArtifact = null, crossExamArtifact = null, verdictArtifact = null, agentResponses = [], errorDetail) {
        const partialResult = this.constructResultObject('partial', question, context, successfulArtifacts, synthesisArtifact, crossExamArtifact, verdictArtifact, agentResponses, errorDetail || reason, reason);
        // Add specific tracking fields
        partialResult.pulseTriggered = reason === 'user_pulse_cancel';
        partialResult.userCancelledAfterPulse = reason === 'user_pulse_cancel';
        partialResult.pulseTimestamp = new Date().toISOString();
        if (estimate) {
            partialResult.estimatedCost = estimate.estimatedCostUsd;
        }
        await this.partialResultManager.savePartialResults(partialResult, reason);
    }
    /**
     * Track actual cost from agent response
     * (Epic 2, Story 1: In-flight cost monitoring)
     */
    normalizeUsage(usage) {
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
    trackActualCost(usage, model) {
        const normalized = this.normalizeUsage(usage);
        const pricing = CostEstimator_1.CostEstimator.getPrice(model);
        const inputCost = (normalized.input / 1000) * pricing.input;
        const outputCost = (normalized.output / 1000) * pricing.output;
        this.actualCostUsd += inputCost + outputCost;
        this.totalTokensUsed += normalized.total;
    }
    /**
     * Check if actual cost has exceeded estimate by >50%
     * (Epic 2, Story 1: In-flight cost monitoring)
     */
    checkCostThreshold() {
        if (this.estimatedCostUsd === 0)
            return; // No estimate, skip check
        const threshold = this.estimatedCostUsd * 1.5; // 50% over estimate
        if (this.actualCostUsd > threshold) {
            const percentOver = ((this.actualCostUsd - this.estimatedCostUsd) / this.estimatedCostUsd) * 100;
            console.log(chalk_1.default.red(`\n⚠️  Cost exceeded estimate by ${percentOver.toFixed(1)}%. Aborting consultation.`));
            console.log(chalk_1.default.gray(`   Estimated: $${this.estimatedCostUsd.toFixed(4)}`));
            console.log(chalk_1.default.gray(`   Actual: $${this.actualCostUsd.toFixed(4)}`));
            this.stateMachine.transition(consult_1.ConsultState.Aborted, 'Cost exceeded estimate by >50%');
            throw new Error('Cost threshold exceeded - consultation aborted');
        }
    }
    /**
     * Common JSON instruction for all agents
     */
    getJsonInstruction() {
        return `
IMPORTANT: You must provide your response in valid JSON format ONLY. 
Do not include any introductory or concluding text. 
Use the following schema:

{
  "position": "One sentence summary of your position",
  "key_points": ["Point 1", "Point 2", "Point 3"],
  "rationale": "Detailed explanation of your reasoning (2-3 paragraphs)",
  "confidence": 0.0-1.0 (number indicating your certainty),
  "prose_excerpt": "A short, quote-worthy summary of your stance"
}
`;
    }
    /**
     * Synthesis Prompt for Judge
     */
    getSynthesisPrompt(artifacts) {
        const perspectives = artifacts.map(a => `
### Agent: ${a.agentId}
**Position:** ${a.position}
**Key Points:**
${a.keyPoints.map(kp => `- ${kp}`).join('\n')}
**Rationale:** ${a.rationale}
**Confidence:** ${a.confidence}
`).join('\n---\n');
        return `You are the Consensus Judge in a rigorous multi-model consultation.

Your goal is to synthesize the perspectives of 3 experts into a coherent analysis of consensus and disagreement.
You are NOT providing the final answer yet. You are mapping the debate terrain.

### Expert Perspectives:
${perspectives}

### Instructions:
1. Identify **Consensus Points**: What do the experts agree on? (Explicit or implicit agreement)
2. Identify **Tensions**: Where do they disagree? (Conflicting recommendations, trade-offs, or emphasis)
3. Rank the **Priority Order** of topics that need resolution.

IMPORTANT: You must provide your response in valid JSON format ONLY.
Do not include any introductory or concluding text.
Use the following schema:

{
  "consensus_points": [
    {
      "point": "Statement of agreement",
      "supporting_agents": ["Agent Name 1", "Agent Name 2"],
      "confidence": 0.0-1.0 (how strong is this consensus?)
    }
  ],
  "tensions": [
    {
      "topic": "Topic of disagreement (e.g., Auth Method)",
      "viewpoints": [
        { "agent": "Agent Name 1", "viewpoint": "Summary of their view" },
        { "agent": "Agent Name 2", "viewpoint": "Summary of their view" }
      ]
    }
  ],
  "priority_order": ["Topic 1", "Topic 2", "Topic 3"]
}`;
    }
    /**
     * Cross-Examination Prompt for Agents
     */
    getCrossExamPrompt(agentName, round1Artifact, synthesisArtifact) {
        return `You are participating in a multi-model consultation.
You are the ${agentName}.

### Your Previous Position (Round 1):
${round1Artifact.position}
${round1Artifact.rationale}

### Current Consensus (Round 2):
${synthesisArtifact.consensusPoints.map(cp => `- ${cp.point} (Confidence: ${cp.confidence})`).join('\n')}

### Identified Tensions:
${synthesisArtifact.tensions.map(t => `- ${t.topic}: ${t.viewpoints.map(v => v.viewpoint).join(' vs ')}`).join('\n')}

### Instructions:
1. **Review** the consensus and tensions.
2. **Challenge** any consensus points that ignore your critical risks or insights.
3. **Defend** your position if it was marked as a tension.
4. **Refine** your stance based on others' valid points.

IMPORTANT: You must provide your response in valid JSON format ONLY.
Do not include any introductory or concluding text.
Use the following schema:

{
  "critique": "Your critique of the current consensus",
  "challenges": [
    {
      "target_agent": "Agent Name (or 'Consensus')",
      "challenge_point": "Specific argument you are challenging",
      "evidence": "Why they are wrong (based on your expertise)"
    }
  ],
  "defense": "Defense of your position against identified tensions (if applicable)",
  "revised_position": "Your updated position after considering others' views"
}
`;
    }
    /**
     * Cross-Examination Synthesis Prompt for Judge
     */
    getCrossExamSynthesisPrompt(agentResponses, synthesisArtifact) {
        // Format agent responses for the judge
        // Note: We attempt to parse JSON content, but fallback to raw text if parsing fails
        const responsesText = agentResponses.map(r => {
            let content = r.content;
            try {
                const json = JSON.parse(r.content);
                content = `
**Critique:** ${json.critique}
**Challenges:** ${JSON.stringify(json.challenges)}
**Defense:** ${json.defense}
**Revised Position:** ${json.revised_position}
`;
            }
            catch (e) {
                // Fallback for malformed JSON
            }
            return `### Agent: ${r.agentName}\n${content}`;
        }).join('\n---\n');
        return `You are the Debate Judge.
Review the challenges and defenses from the Cross-Examination round.

### Previous Consensus:
${JSON.stringify(synthesisArtifact.consensusPoints)}

### Agent Cross-Examination Responses:
${responsesText}

### Instructions:
1. Extract **Challenges**: Who successfully challenged whom?
2. Extract **Rebuttals**: Who defended their position well?
3. Identify **Unresolved Tensions**: What disagreements remain significant?

IMPORTANT: You must provide your response in valid JSON format ONLY.
Do not include any introductory or concluding text.
Use the following schema:

{
  "challenges": [
    {
      "challenger": "Agent Name",
      "target_agent": "Agent Name",
      "challenge": "The core challenge point",
      "evidence": ["Evidence 1", "Evidence 2"]
    }
  ],
  "rebuttals": [
    {
      "agent": "Agent Name",
      "rebuttal": "The defense provided"
    }
  ],
  "unresolved": ["Tension 1", "Tension 2"]
}
`;
    }
    /**
     * Verdict Prompt for Judge
     */
    getVerdictPrompt(question, round1Artifacts, synthesisArtifact, crossExamArtifact) {
        const r1Summary = round1Artifacts.map(a => `- ${a.agentId}: ${a.position} (Confidence: ${a.confidence})`).join('\n');
        const r2Summary = synthesisArtifact.consensusPoints.map(cp => `- ${cp.point}`).join('\n');
        let r3Summary = "No Cross-Examination conducted.";
        if (crossExamArtifact) {
            r3Summary = `
**Challenges:**
${crossExamArtifact.challenges.map(c => `- ${c.challenger} -> ${c.targetAgent}: ${c.challenge}`).join('\n')}

**Rebuttals:**
${crossExamArtifact.rebuttals.map(r => `- ${r.agent} defended: ${r.rebuttal}`).join('\n')}

**Unresolved Issues:**
${crossExamArtifact.unresolved.map(u => `- ${u}`).join('\n')}
`;
        }
        return `You are the Final Judge in a high-stakes multi-model consultation.
Your goal is to issue a final Verdict on the user's question.

### User Question:
${question}

### The Debate Record:
**Round 1 (Positions):**
${r1Summary}

**Round 2 (Consensus):**
${r2Summary}

**Round 3 (Cross-Examination):**
${r3Summary}

### Instructions:
1. **Weigh the Evidence:** Prioritize consensus points that survived cross-examination. Discard points that were successfully challenged without rebuttal.
2. **Form a Recommendation:** Provide a single, clear, actionable answer.
3. **Assess Confidence:**
   - High (>0.9): Strong consensus, no unresolved issues.
   - Medium (0.7-0.9): General agreement but some minor dissent.
   - Low (<0.7): Major unresolved tensions or significant dissent.
4. **Document Dissent:** Explicitly list who disagrees and why.

IMPORTANT: You must provide your response in valid JSON format ONLY.
Do not include any introductory or concluding text.
Use the following schema:

{
  "recommendation": "The final authoritative answer",
  "confidence": 0.0-1.0,
  "evidence": ["Key point 1", "Key point 2 (survived challenge)"],
  "dissent": [
    {
      "agent": "Agent Name",
      "concern": "Why they disagree",
      "severity": "high/medium/low"
    }
  ]
}
`;
    }
    /**
     * Get Security Expert system prompt
     */
    getSecurityExpertPrompt() {
        return `You are a Security Expert specializing in threat modeling and vulnerability analysis.

Your role in consultations:
- Identify security risks and vulnerabilities
- Evaluate authentication, authorization, and data protection approaches
- Consider attack vectors and mitigation strategies
- Assess compliance and privacy implications

${this.getJsonInstruction()}`;
    }
    /**
     * Get Architect system prompt
     */
    getArchitectPrompt() {
        return `You are a Software Architect specializing in system design and scalability.

Your role in consultations:
- Evaluate architectural patterns and trade-offs
- Consider scalability, maintainability, and extensibility
- Assess technical debt implications
- Recommend best practices and design patterns

${this.getJsonInstruction()}`;
    }
    /**
     * Get Pragmatist system prompt
     */
    getPragmatistPrompt() {
        return `You are a Pragmatic Engineer focused on shipping and practical implementation.

Your role in consultations:
- Assess implementation complexity and time-to-ship
- Consider team capabilities and existing codebase constraints
- Balance ideal solutions with practical realities
- Identify simpler alternatives that deliver 80% of value with 20% effort

${this.getJsonInstruction()}`;
    }
}
exports.default = ConsultOrchestrator;
