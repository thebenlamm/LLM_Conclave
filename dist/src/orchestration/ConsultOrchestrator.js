"use strict";
/**
 * ConsultOrchestrator - Fast multi-model consultation system
 *
 * Implements a streamlined consultation flow:
 * 1. Round 1: All agents respond in parallel
 * 2. Round 2: Agents respond to each other (if maxRounds > 1)
 * 3. Synthesis: Judge creates consensus with confidence scoring
 * 4. Cost tracking: Track token usage and costs
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ProviderFactory_1 = __importDefault(require("../providers/ProviderFactory"));
class ConsultOrchestrator {
    constructor(options = {}) {
        this.maxRounds = options.maxRounds || 2;
        this.verbose = options.verbose || false;
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
        const consultationId = this.generateId('consult');
        console.log(`\n${'='.repeat(80)}`);
        console.log(`CONSULTATION: ${question}`);
        console.log(`${'='.repeat(80)}\n`);
        // Round 1: All agents respond in parallel
        console.log(`\n--- Round 1: Parallel Agent Execution ---\n`);
        const round1Responses = await this.executeRound1(question, context);
        // Round 2: Agents respond to each other (if maxRounds > 1)
        let round2Responses = [];
        if (this.maxRounds > 1) {
            console.log(`\n--- Round 2: Agent Cross-Discussion ---\n`);
            round2Responses = await this.executeRound2(question, round1Responses);
        }
        // Synthesize consensus
        console.log(`\n--- Synthesis: Generating Consensus ---\n`);
        const synthesis = await this.synthesizeConsensus(question, [...round1Responses, ...round2Responses]);
        // Calculate metrics
        const duration_ms = Date.now() - startTime;
        const cost = this.calculateCost([...round1Responses, ...round2Responses,
            { agentName: 'Judge', model: 'gpt-4o', content: '', tokens: synthesis.tokens, duration_ms: 0 }]);
        console.log(`\n✅ Consultation complete in ${(duration_ms / 1000).toFixed(1)}s`);
        console.log(`💰 Total cost: $${cost.usd.toFixed(4)} | 🎯 Confidence: ${(synthesis.confidence * 100).toFixed(0)}%\n`);
        return {
            consultation_id: consultationId,
            timestamp: new Date().toISOString(),
            question,
            context,
            agents: this.agents.map(a => ({ name: a.name, model: a.model })),
            rounds: this.maxRounds,
            responses: {
                round1: round1Responses,
                round2: round2Responses
            },
            consensus: synthesis.consensus,
            confidence: synthesis.confidence,
            recommendation: synthesis.recommendation,
            reasoning: synthesis.reasoning,
            concerns: synthesis.concerns,
            dissent: synthesis.dissent,
            perspectives: synthesis.perspectives,
            cost,
            duration_ms
        };
    }
    /**
     * Execute Round 1: All agents respond in parallel
     */
    async executeRound1(question, context) {
        // Execute all agents in parallel for speed
        const promises = this.agents.map(agent => this.executeAgent(agent, question, context, []));
        const responses = await Promise.all(promises);
        if (this.verbose) {
            console.log('\n=== Round 1 Responses ===');
            responses.forEach(r => {
                console.log(`\n${r.agentName}:\n${r.content}`);
            });
        }
        return responses;
    }
    /**
     * Execute Round 2: Agents respond to each other
     */
    async executeRound2(question, round1Responses) {
        // Each agent sees all Round 1 responses and can comment
        const othersResponses = round1Responses
            .filter(r => !r.error)
            .map(r => `${r.agentName}: ${r.content}`)
            .join('\n\n---\n\n');
        const round2Prompt = `
Given the question: "${question}"

Here are the other agents' initial perspectives:

${othersResponses}

Now provide your second opinion:
1. Do you agree or disagree with the other agents?
2. What concerns or risks might they have missed?
3. What would you add to the discussion?

Be concise (2-3 paragraphs). Focus on what's different or additive to your first response.
`;
        const promises = this.agents.map(agent => this.executeAgent(agent, round2Prompt, '', round1Responses));
        const responses = await Promise.all(promises);
        if (this.verbose) {
            console.log('\n=== Round 2 Responses ===');
            responses.forEach(r => {
                console.log(`\n${r.agentName}:\n${r.content}`);
            });
        }
        return responses;
    }
    /**
     * Execute a single agent
     */
    async executeAgent(agent, prompt, context, previousResponses) {
        const startTime = Date.now();
        try {
            const messages = [
                {
                    role: 'user',
                    content: context ? `${context}\n\n---\n\n${prompt}` : prompt
                }
            ];
            console.log(`⚡ ${agent.name} (${agent.model}) thinking...`);
            const response = await agent.provider.chat(messages, agent.systemPrompt);
            const duration = Date.now() - startTime;
            console.log(`✓ ${agent.name} responded in ${(duration / 1000).toFixed(1)}s`);
            return {
                agentName: agent.name,
                model: agent.model,
                content: response.text || '',
                tokens: response.usage ? {
                    input: response.usage.input_tokens || 0,
                    output: response.usage.output_tokens || 0,
                    total: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0)
                } : { input: 0, output: 0, total: 0 },
                duration_ms: duration
            };
        }
        catch (error) {
            // Graceful degradation: Return error response but don't fail entire consultation
            const duration = Date.now() - startTime;
            console.warn(`⚠️  Agent ${agent.name} failed: ${error.message}`);
            return {
                agentName: agent.name,
                model: agent.model,
                content: `[Agent unavailable: ${error.message}]`,
                tokens: { input: 0, output: 0, total: 0 },
                duration_ms: duration,
                error: error.message
            };
        }
    }
    /**
     * Synthesize consensus from all agent responses
     */
    async synthesizeConsensus(question, allResponses) {
        // Use GPT-4o as judge for fast synthesis
        const judgeProvider = ProviderFactory_1.default.createProvider('gpt-4o');
        const responseSummary = allResponses
            .filter(r => !r.error)
            .map(r => `${r.agentName} (${r.model}):\n${r.content}`)
            .join('\n\n---\n\n');
        const synthesisPrompt = `
You are synthesizing a multi-agent consultation on the following question:

"${question}"

Here are the agents' responses:

${responseSummary}

Your task is to synthesize their perspectives into a clear, actionable recommendation.

Provide your synthesis in the following JSON format:
{
  "consensus": "One sentence summary of the agreed-upon recommendation",
  "confidence": 0.0-1.0 (based on agreement level),
  "recommendation": "2-3 paragraph detailed explanation",
  "reasoning": {
    "security_expert": "Key points from security expert",
    "architect": "Key points from architect",
    "pragmatist": "Key points from pragmatist"
  },
  "concerns": ["concern 1", "concern 2"],
  "dissent": ["Any dissenting opinions or alternative approaches"],
  "perspectives": [
    {"agent": "Security Expert", "model": "claude-sonnet-4-5", "opinion": "brief summary"},
    {"agent": "Architect", "model": "gpt-4o", "opinion": "brief summary"},
    {"agent": "Pragmatist", "model": "gemini-2.5-pro", "opinion": "brief summary"}
  ]
}

IMPORTANT: Return ONLY the JSON object, no additional text.
`;
        const messages = [{ role: 'user', content: synthesisPrompt }];
        const response = await judgeProvider.chat(messages, 'You are a synthesis expert.');
        // Parse JSON response
        const responseText = response.text || '{}';
        // Extract JSON from markdown code blocks if present
        let jsonText = responseText;
        const jsonMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (jsonMatch) {
            jsonText = jsonMatch[1];
        }
        const synthesis = JSON.parse(jsonText);
        // Add token usage
        synthesis.tokens = response.usage ? {
            input: response.usage.input_tokens || 0,
            output: response.usage.output_tokens || 0,
            total: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0)
        } : { input: 0, output: 0, total: 0 };
        return synthesis;
    }
    /**
     * Calculate total cost from all responses
     */
    calculateCost(responses) {
        // Token costs per model (approximate, as of Dec 2025)
        const costs = {
            'claude-sonnet-4-5': { input: 0.003 / 1000, output: 0.015 / 1000 },
            'gpt-4o': { input: 0.0025 / 1000, output: 0.01 / 1000 },
            'gemini-2.5-pro': { input: 0.00125 / 1000, output: 0.005 / 1000 }
        };
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let totalCostUsd = 0;
        for (const response of responses) {
            const modelCost = costs[response.model] || { input: 0.003 / 1000, output: 0.015 / 1000 };
            totalInputTokens += response.tokens.input;
            totalOutputTokens += response.tokens.output;
            totalCostUsd += (response.tokens.input * modelCost.input) +
                (response.tokens.output * modelCost.output);
        }
        return {
            tokens: {
                input: totalInputTokens,
                output: totalOutputTokens,
                total: totalInputTokens + totalOutputTokens
            },
            usd: totalCostUsd
        };
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
     * Get Security Expert system prompt
     */
    getSecurityExpertPrompt() {
        return `You are a Security Expert specializing in threat modeling and vulnerability analysis.

Your role in consultations:
- Identify security risks and vulnerabilities
- Evaluate authentication, authorization, and data protection approaches
- Consider attack vectors and mitigation strategies
- Assess compliance and privacy implications

Be concise (2-3 paragraphs). Focus on actionable security recommendations.
If you disagree with other agents, explain why from a security perspective.`;
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

Be concise (2-3 paragraphs). Focus on long-term architectural implications.
If you disagree with other agents, explain your architectural reasoning.`;
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

Be concise (2-3 paragraphs). Focus on what's practical and achievable.
If you disagree with other agents, explain your pragmatic concerns.`;
    }
}
exports.default = ConsultOrchestrator;
