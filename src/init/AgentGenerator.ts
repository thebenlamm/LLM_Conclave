/**
 * AgentGenerator - Uses LLM to generate agent recommendations
 */

import ProviderFactory from '../providers/ProviderFactory';

/**
 * AgentGenerator - Uses LLM to generate agent recommendations
 */
export default class AgentGenerator {
  provider: any;
  model: string;

  constructor(model: string) {
    this.provider = ProviderFactory.createProvider(model);
    this.model = model;
  }

  /**
   * Generate agent recommendations based on project description
   * @param {string} projectDescription - User's description of their project
   * @param {string|null} scanContext - Optional project scan results
   * @param {string} operationalMode - Intended operational mode: 'consensus', 'iterative', or 'flexible'
   * @returns {Promise<Object>} { agents: Array, reasoning: string }
   */
  async generateAgents(projectDescription: string, scanContext: string | null = null, operationalMode: string = 'consensus'): Promise<{ agents: any[]; reasoning: string }> {
    const prompt = this._buildPrompt(projectDescription, scanContext, operationalMode);

    try {
      const messages = [{ role: 'user', content: prompt }];
      const systemPrompt = 'You are an expert at designing multi-agent AI collaboration systems. You generate precise, well-structured JSON configurations for specialized AI agents.';

      const response = await this.provider.chat(messages, systemPrompt);

      // Extract JSON from response (handle markdown code blocks)
      const responseText = response.text || '';
      const jsonMatch = responseText.match(/```json\n?([\s\S]*?)\n?```/) || responseText.match(/```\n?([\s\S]*?)\n?```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : responseText;

      const parsed = JSON.parse(jsonStr);

      // Validate structure
      if (!parsed.agents || !Array.isArray(parsed.agents)) {
        throw new Error('Invalid response: missing agents array');
      }

      // Validate and sanitize each agent
      const validatedAgents = parsed.agents.map((agent: any) => this.validateAgent(agent));

      // Extract judge behavior recommendation if provided
      const judgeBehavior = parsed.recommended_judge_behavior || 'brief';
      const reasoningWithJudge = parsed.reasoning
        ? `${parsed.reasoning}${judgeBehavior === 'detailed' ? ' (Recommend detailed judge summaries)' : ''}`
        : 'No reasoning provided';

      return {
        agents: validatedAgents,
        reasoning: reasoningWithJudge
      };

    } catch (error: any) {
      console.error('Error generating agents:', error.message);
      throw new Error(`Failed to generate agents: ${error.message}`);
    }
  }

  /**
   * Build the prompt for agent generation
   */
  _buildPrompt(projectDescription: string, scanContext: string | null, operationalMode: string = 'consensus'): string {
    const modeGuidance = this._getModeGuidance(operationalMode);

    return `You are an expert at designing multi-agent AI collaboration systems. You create CONCISE, FORMAT-FOCUSED agent configurations that produce clean, structured outputs.

PROJECT DESCRIPTION:
${projectDescription}

${scanContext ? `PROJECT ANALYSIS:\n${scanContext}\n` : ''}

OPERATIONAL MODE: ${operationalMode.toUpperCase()}
${modeGuidance}

CRITICAL DESIGN PRINCIPLES:
1. **Fewer agents is better** - Use 1-2 agents for simple tasks, 3-4 only for complex multi-domain decisions
2. **Output format enforcement** - Every agent prompt MUST specify exact output format
3. **Explicit prohibitions** - Tell agents what NOT to do ("No explanations", "No analysis")
4. **Task-appropriate detail** - Simple transformation tasks need simple prompts

TASK TYPE GUIDELINES:

**Simple Transformation Tasks** (OCR, formatting, translation, data extraction):
- Use 1 agent (maybe 2 if validation needed)
- Prompt structure: "You are a [role]. [Task]. Output format: '[FORMAT]'. No [prohibitions]."
- Example: "You are a Hebrew OCR corrector. Fix OCR errors and output corrected text. Format: 'CORRECTED: [text]'. No analysis, no explanations, just the corrected text."

**Complex Decision Tasks** (strategy, design, analysis with trade-offs):
- Use 2-4 agents with distinct domains
- Still enforce output formats but allow reasoning
- Example: "You are a Security Architect. Evaluate security implications. Format your response: 'RISKS: [list]' then 'RECOMMENDATIONS: [list]'. Be concise."

MODEL SELECTION:
- claude-sonnet-4-5: Creative, nuanced reasoning (brand, strategy, writing, Hebrew/language)
- gpt-4.1 or gpt-4o: Analytical, structured thinking (operations, technical, data, validation)
- gpt-4.1-mini or gpt-4o-mini: Fast/lightweight analyses
- gemini-2.5-pro: Vision + reasoning blend (creative ideation with up-to-date Gemini models)
- grok-3: Market/growth focused (marketing, sales, competitive analysis)

PROMPT STRUCTURE (REQUIRED):
1. **Role** (1 sentence): "You are a [role]"
2. **Task** (1 sentence): What they should do
3. **Output Format** (explicit): "Format: '[PATTERN]'" or "Output: [structure]"
4. **Prohibitions** (if needed): "No [unwanted behaviors]"

BAD EXAMPLE (verbose, no format):
"You are an OCR_Correction_Engineer advisor specializing in identifying and correcting optical character recognition errors, particularly in Hebrew texts. Your expertise includes analyzing systematic OCR error patterns, character confusion matrices for Hebrew fonts..."

GOOD EXAMPLE (concise, format-enforced):
"You are a Hebrew OCR corrector. Fix OCR errors in the text. Output format: 'Line X: [corrected text]'. No explanations, no confidence scores - just corrected text."

JUDGE CONFIGURATION:
The judge prompt is handled separately, but keep in mind:
- For transformation tasks: Judge should extract clean output (e.g., "Line X: [result]")
- For decision tasks: Judge summarizes consensus
- Default judge prompt is already concise and works well for most cases

Return ONLY valid JSON in this EXACT format:
{
  "agents": [
    {
      "name": "Agent_Name",
      "type": "decision_maker" | "validator",
      "role": "One sentence describing their expertise",
      "domains": ["domain1", "domain2"],
      "model": "claude-sonnet-4-5" | "gpt-4.1" | "gpt-4.1-mini" | "gpt-4o" | "gpt-4o-mini" | "gemini-2.5-pro" | "grok-3",
      "prompt": "CONCISE prompt following the structure above (role + task + format + prohibitions)"
    }
  ],
  "reasoning": "1-2 sentences explaining agent count and approach",
  "recommended_judge_behavior": "brief|detailed (brief for transformation tasks, detailed for decision tasks)"
}

Analyze the project and generate appropriate agents NOW:`;
  }

  /**
   * Get mode-specific guidance for agent generation
   */
  _getModeGuidance(mode: string): string {
    switch (mode) {
      case 'iterative':
        return `The user will use ITERATIVE mode (chunk-by-chunk processing).

OUTPUT FORMAT REQUIREMENTS:
- Agents process ONE chunk at a time (e.g., one line, one paragraph)
- Output must be per-chunk: "CORRECTED: [result]" or "Line X: [result]"
- Judge will extract and write: "Line X: [final result]" to shared output
- NO full-document processing - focus on individual chunks

EXAMPLE (Iterative OCR):
Agent: "You are a Hebrew OCR corrector. Fix OCR errors in the line. Output format: 'CORRECTED: [corrected text]'. No explanations."
Judge: "Extract corrected text. Output format: 'Line X: [text]'. Nothing else."`;

      case 'consensus':
        return `The user will use CONSENSUS mode (entire task at once).

OUTPUT FORMAT REQUIREMENTS:
- Agents see and process the ENTIRE task/document
- Output can be full results: "CORRECTED_TEXT: [full corrected document]"
- OR structured sections: "Line 1: [...] Line 2: [...]"
- Judge synthesizes final consensus summary

EXAMPLE (Consensus OCR):
Agent: "You are a Hebrew OCR corrector. Fix all OCR errors. Output format: 'CORRECTED_TEXT: [full corrected text]'. No explanations."
Judge: Default judge prompt works well for consensus.`;

      case 'flexible':
        return `The user hasn't decided on a mode yet.

OUTPUT FORMAT REQUIREMENTS:
- Create agents that work in BOTH modes
- Use per-item output: "CORRECTED: [result]" or "Item X: [result]"
- This format works for both chunk-by-chunk AND full-document processing
- Judge can aggregate results either way

EXAMPLE (Flexible OCR):
Agent: "You are a Hebrew OCR corrector. Fix OCR errors. Output each corrected line as: 'Line X: [text]'. No explanations."
This works for both iterative (one line at a time) and consensus (all lines at once).`;

      default:
        return '';
    }
  }

  /**
   * Validate and sanitize an agent configuration
   */
  validateAgent(agent: any): any {
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
  sanitizeAgentName(name: string): string {
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
  async generateSingleAgent(agentDescription: string, existingAgents: any[] = []): Promise<any> {
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
      const responseText = response.text || '';
      const jsonMatch = responseText.match(/```json\n?([\s\S]*?)\n?```/) || responseText.match(/```\n?([\s\S]*?)\n?```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : responseText;

      const agent = JSON.parse(jsonStr);
      return this.validateAgent(agent);

    } catch (error: any) {
      throw new Error(`Failed to generate agent: ${error.message}`);
    }
  }
}
