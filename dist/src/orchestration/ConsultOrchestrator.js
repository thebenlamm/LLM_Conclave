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
const CostEstimator_1 = require("../consult/cost/CostEstimator");
const CostGate_1 = require("../consult/cost/CostGate");
const ConfigCascade_1 = require("../cli/ConfigCascade");
const ConsultationFileLogger_1 = require("../consult/logging/ConsultationFileLogger");
const chalk_1 = __importDefault(require("chalk"));
const consult_1 = require("../types/consult");
class ConsultOrchestrator {
    constructor(options = {}) {
        this.estimatedCostUsd = 0;
        this.actualCostUsd = 0;
        this.maxRounds = options.maxRounds || 4; // Default to 4 rounds per Epic 1
        this.verbose = options.verbose || false;
        this.eventBus = EventBus_1.EventBus.getInstance();
        this.costEstimator = new CostEstimator_1.CostEstimator();
        this.costGate = new CostGate_1.CostGate();
        this.fileLogger = new ConsultationFileLogger_1.ConsultationFileLogger();
        // Generate ID first so state machine can use it
        this.consultationId = this.generateId('consult');
        this.stateMachine = new ConsultStateMachine_1.ConsultStateMachine(this.consultationId);
        // Initialize 3 fixed agents with diverse models
        this.agents = this.initializeAgents();
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
     * Execute a consultation
     * @param question - The question to consult on
     * @param context - Optional context (files, project info, etc.)
     * @returns Consultation result with consensus, confidence, and costs
     */
    async consult(question, context = '') {
        const startTime = Date.now();
        // Start consultation lifecycle
        this.stateMachine.transition(consult_1.ConsultState.Estimating);
        // Emit started event
        this.eventBus.emitEvent('consultation:started', {
            consultation_id: this.consultationId,
            question,
            agents: this.agents.map(a => ({ name: a.name, model: a.model, provider: 'unknown' })), // Provider logic handled in factory
            mode: 'converge' // Default for now
        });
        if (this.verbose) {
            console.log(`\n${'='.repeat(80)}`);
            console.log(`CONSULTATION: ${question}`);
            console.log(`${'='.repeat(80)}\n`);
        }
        // --- State: Estimating ---
        const estimate = this.costEstimator.estimateCost(question, this.agents, this.maxRounds);
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
        const successfulArtifacts = round1Results.map(result => result.artifact).filter(a => !!a);
        const agentResponses = round1Results.map(result => result.response);
        if (successfulArtifacts.length === 0) {
            this.stateMachine.transition(consult_1.ConsultState.Aborted, 'All agents failed in Round 1');
            throw new Error('All agents failed. Unable to provide consultation.');
        }
        this.eventBus.emitEvent('round:completed', {
            consultation_id: this.consultationId,
            round_number: 1,
            artifact_type: 'independent'
        });
        // --- State: Synthesis (Round 2) ---
        this.stateMachine.transition(consult_1.ConsultState.Synthesis);
        if (this.verbose)
            console.log(`\n--- Round 2: Synthesis ---\n`);
        const synthesisArtifact = await this.executeRound2Synthesis(question, successfulArtifacts);
        this.checkCostThreshold(); // Check after Round 2
        // --- State: CrossExam (Round 3) ---
        this.stateMachine.transition(consult_1.ConsultState.CrossExam);
        if (this.verbose)
            console.log(`\n--- Round 3: Cross-Examination ---\n`);
        let crossExamArtifact = null;
        if (synthesisArtifact) {
            crossExamArtifact = await this.executeRound3CrossExam(successfulArtifacts, synthesisArtifact);
            this.checkCostThreshold(); // Check after Round 3
        }
        else {
            console.warn("Skipping Round 3 due to missing Synthesis artifact");
        }
        // --- State: Verdict (Round 4) ---
        this.stateMachine.transition(consult_1.ConsultState.Verdict);
        if (this.verbose)
            console.log(`\n--- Round 4: Verdict ---\n`);
        let verdictArtifact = null;
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
        const durationMs = Date.now() - startTime;
        // Use Verdict for final results
        const consensusText = verdictArtifact ? verdictArtifact.recommendation : (synthesisArtifact?.consensusPoints[0]?.point || "No consensus");
        const confidence = verdictArtifact ? verdictArtifact.confidence : 0;
        const recommendation = verdictArtifact ? verdictArtifact.recommendation : "Consultation incomplete";
        const dissent = verdictArtifact ? verdictArtifact.dissent : [];
        // Determine if cost was exceeded
        const costExceeded = this.actualCostUsd > (this.estimatedCostUsd * 1.5);
        const result = {
            consultationId: this.consultationId,
            timestamp: new Date().toISOString(),
            question,
            context,
            mode: 'converge',
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
            promptVersions: {
                mode: 'converge',
                independentPromptVersion: '1.0',
                synthesisPromptVersion: '1.0',
                crossExamPromptVersion: '1.0',
                verdictPromptVersion: '1.0'
            },
            // Cost tracking fields (Epic 2, Story 1)
            estimatedCost: this.estimatedCostUsd,
            actualCost: this.actualCostUsd,
            costExceeded
        };
        this.eventBus.emitEvent('consultation:completed', {
            consultation_id: this.consultationId,
            result
        });
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
        const judgeAgent = {
            name: 'Judge (Verdict)',
            model: 'gpt-4o',
            provider: ProviderFactory_1.default.createProvider('gpt-4o'),
            systemPrompt: this.getVerdictPrompt(question, round1Artifacts, synthesisArtifact, crossExamArtifact)
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
        // 1. Parallel execution of all agents
        const promises = this.agents.map(async (agent) => {
            // Find this agent's Round 1 artifact
            const r1Artifact = round1Artifacts.find(a => a.agentId === agent.name);
            if (!r1Artifact) {
                // If agent failed in R1, they can't cross-exam
                return null;
            }
            const systemPrompt = this.getCrossExamPrompt(agent.name, r1Artifact, synthesisArtifact);
            this.eventBus.emitEvent('agent:thinking', {
                consultation_id: this.consultationId,
                agent_name: agent.name,
                round: 3
            });
            try {
                const start = Date.now();
                const response = await agent.provider.chat([
                    { role: 'user', content: 'Proceed with Cross-Examination.' }
                ], systemPrompt);
                const duration = Date.now() - start;
                this.eventBus.emitEvent('agent:completed', {
                    consultation_id: this.consultationId,
                    agent_name: agent.name,
                    duration_ms: duration,
                    tokens: response.usage
                });
                const agentResponse = {
                    agentId: agent.name,
                    agentName: agent.name,
                    model: agent.model,
                    provider: 'unknown',
                    content: response.text || '',
                    tokens: response.usage || { input: 0, output: 0, total: 0 },
                    durationMs: duration,
                    timestamp: new Date().toISOString()
                };
                return agentResponse;
            }
            catch (error) {
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
            const response = await agent.provider.chat(messages, agent.systemPrompt);
            const duration = Date.now() - startTime;
            if (this.verbose)
                console.log(`✓ ${agent.name} responded in ${(duration / 1000).toFixed(1)}s`);
            const usage = response.usage || {};
            const inputTokens = usage.input_tokens || 0;
            const outputTokens = usage.output_tokens || 0;
            // Extract Artifact
            const artifact = ArtifactExtractor_1.ArtifactExtractor.extractIndependentArtifact(response.text || '', agent.name // Using name as ID for now, ideally strictly ID
            );
            this.eventBus.emitEvent('agent:completed', {
                consultation_id: this.consultationId,
                agent_name: agent.name,
                duration_ms: duration,
                tokens: response.usage
            });
            const agentResponse = {
                agentId: agent.name,
                agentName: agent.name,
                model: agent.model,
                provider: 'unknown',
                content: response.text || '',
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
     * Track actual cost from agent response
     * (Epic 2, Story 1: In-flight cost monitoring)
     */
    trackActualCost(usage, model) {
        // Get pricing for model
        const pricing = this.getPricingForModel(model);
        const inputCost = (usage.input / 1000) * pricing.input;
        const outputCost = (usage.output / 1000) * pricing.output;
        this.actualCostUsd += inputCost + outputCost;
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
     * Get pricing for a model
     * (Reuses pricing from CostEstimator)
     */
    getPricingForModel(model) {
        const PRICING = {
            'claude-sonnet-4-5': { input: 0.003, output: 0.015 },
            'gpt-4o': { input: 0.0025, output: 0.01 },
            'gemini-2.5-pro': { input: 0.00125, output: 0.005 },
            'default': { input: 0.003, output: 0.015 }
        };
        // Normalize model name
        if (model.includes('claude'))
            return PRICING['claude-sonnet-4-5'];
        if (model.includes('gpt-4o'))
            return PRICING['gpt-4o'];
        if (model.includes('gemini'))
            return PRICING['gemini-2.5-pro'];
        return PRICING['default'];
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
