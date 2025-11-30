"use strict";
/**
 * AgentGenerator - Uses LLM to generate agent recommendations
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ProviderFactory_1 = __importDefault(require("../providers/ProviderFactory"));
/**
 * AgentGenerator - Uses LLM to generate agent recommendations
 */
class AgentGenerator {
    constructor(provider, model) {
        this.provider = ProviderFactory_1.default.createProvider(model);
        this.model = model;
    }
    /**
     * Generate agent recommendations based on project description
     * @param {string} projectDescription - User's description of their project
     * @param {string|null} scanContext - Optional project scan results
     * @returns {Promise<Object>} { agents: Array, reasoning: string }
     */
    async generateAgents(projectDescription, scanContext = null) {
        const prompt = this._buildPrompt(projectDescription, scanContext);
        try {
            const messages = [{ role: 'user', content: prompt }];
            const systemPrompt = 'You are an expert at designing multi-agent AI collaboration systems. You generate precise, well-structured JSON configurations for specialized AI agents.';
            const response = await this.provider.chat(messages, systemPrompt);
            // Extract JSON from response (handle markdown code blocks)
            const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/) || response.match(/```\n?([\s\S]*?)\n?```/);
            const jsonStr = jsonMatch ? jsonMatch[1] : response;
            const parsed = JSON.parse(jsonStr);
            // Validate structure
            if (!parsed.agents || !Array.isArray(parsed.agents)) {
                throw new Error('Invalid response: missing agents array');
            }
            // Validate and sanitize each agent
            const validatedAgents = parsed.agents.map((agent) => this.validateAgent(agent));
            return {
                agents: validatedAgents,
                reasoning: parsed.reasoning || 'No reasoning provided'
            };
        }
        catch (error) {
            console.error('Error generating agents:', error.message);
            throw new Error(`Failed to generate agents: ${error.message}`);
        }
    }
    /**
     * Build the prompt for agent generation
     */
    _buildPrompt(projectDescription, scanContext) {
        return `You are an expert at designing multi-agent AI collaboration systems.

PROJECT DESCRIPTION:
${projectDescription}

${scanContext ? `PROJECT ANALYSIS:\n${scanContext}\n` : ''}

Generate 3-4 specialized AI agents for this project as JSON.

Requirements:
1. Agent names: PascalCase with underscores (e.g., Brand_Strategist, Tech_Architect)
2. Each agent should have a distinct, non-overlapping domain
3. Mix of strategic/decision-making and validation agents if applicable
4. Specific, actionable expertise areas
5. Choose appropriate models:
   - claude-sonnet-4-5: Creative, nuanced reasoning (brand, strategy, writing)
   - gpt-4o: Analytical, structured thinking (operations, technical, data)
   - grok-3: Market/growth focused (marketing, sales, competitive analysis)

6. Prompts should be detailed and specific, following this structure:
   "You are a {name} advisor specializing in {domains}. Your expertise includes {specific areas}. When analyzing tasks, focus on {key concerns}. Provide insights on {what you evaluate}. Be {tone/style}."

Return ONLY valid JSON in this EXACT format (no markdown, no extra text):
{
  "agents": [
    {
      "name": "Agent_Name",
      "type": "decision_maker" | "validator",
      "role": "One sentence describing their expertise",
      "domains": ["domain1", "domain2", "domain3"],
      "model": "claude-sonnet-4-5" | "gpt-4o" | "grok-3",
      "prompt": "Detailed system prompt as described above"
    }
  ],
  "reasoning": "2-3 sentences explaining why these specific agents were chosen for this project"
}

Generate thoughtful, project-specific agents now:`;
    }
    /**
     * Validate and sanitize an agent configuration
     */
    validateAgent(agent) {
        // Validate required fields
        if (!agent.name || typeof agent.name !== 'string') {
            throw new Error('Agent missing required field: name');
        }
        if (!agent.model || typeof agent.model !== 'string') {
            throw new Error(`Agent "${agent.name}" missing required field: model`);
        }
        if (!agent.prompt || typeof agent.prompt !== 'string') {
            throw new Error(`Agent "${agent.name}" missing required field: prompt`);
        }
        // Sanitize name
        const sanitizedName = this.sanitizeAgentName(agent.name);
        // Validate model
        const validModels = ['claude-sonnet-4-5', 'gpt-4o', 'grok-3'];
        if (!validModels.includes(agent.model)) {
            console.warn(`Warning: Agent "${sanitizedName}" has unusual model: ${agent.model}`);
        }
        // Set defaults for optional fields
        return {
            name: sanitizedName,
            model: agent.model,
            prompt: agent.prompt.trim(),
            type: agent.type || 'decision_maker',
            role: agent.role || '',
            domains: Array.isArray(agent.domains) ? agent.domains : []
        };
    }
    /**
     * Sanitize agent name to valid format
     */
    sanitizeAgentName(name) {
        // Remove invalid characters, convert to PascalCase with underscores
        let sanitized = name
            .trim()
            .replace(/[^a-zA-Z0-9_\s]/g, '') // Remove special chars except underscore
            .replace(/\s+/g, '_') // Replace spaces with underscores
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join('_');
        // Ensure it starts with uppercase letter
        if (sanitized && !/^[A-Z]/.test(sanitized)) {
            sanitized = sanitized.charAt(0).toUpperCase() + sanitized.slice(1);
        }
        // Validate final format
        if (!/^[A-Z][a-zA-Z0-9_]*$/.test(sanitized)) {
            throw new Error(`Invalid agent name after sanitization: ${name} -> ${sanitized}`);
        }
        return sanitized;
    }
    /**
     * Generate a single additional agent based on description
     */
    async generateSingleAgent(agentDescription, existingAgents = []) {
        const existingNames = existingAgents.map(a => a.name).join(', ');
        const prompt = `Generate ONE new AI agent configuration as JSON.

REQUIREMENT:
${agentDescription}

EXISTING AGENTS:
${existingNames || 'None'}

Requirements:
1. Name: PascalCase with underscores
2. Ensure it doesn't overlap with existing agents
3. Choose appropriate model (claude-sonnet-4-5, gpt-4o, or grok-3)
4. Detailed, specific prompt

Return ONLY valid JSON:
{
  "name": "Agent_Name",
  "type": "decision_maker" | "validator",
  "role": "One sentence description",
  "domains": ["domain1", "domain2"],
  "model": "claude-sonnet-4-5" | "gpt-4o" | "grok-3",
  "prompt": "Detailed system prompt"
}`;
        try {
            const messages = [{ role: 'user', content: prompt }];
            const systemPrompt = 'You are an expert at designing AI agents. Generate precise JSON configurations.';
            const response = await this.provider.chat(messages, systemPrompt);
            // Extract JSON
            const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/) || response.match(/```\n?([\s\S]*?)\n?```/);
            const jsonStr = jsonMatch ? jsonMatch[1] : response;
            const agent = JSON.parse(jsonStr);
            return this.validateAgent(agent);
        }
        catch (error) {
            throw new Error(`Failed to generate agent: ${error.message}`);
        }
    }
}
exports.default = AgentGenerator;
