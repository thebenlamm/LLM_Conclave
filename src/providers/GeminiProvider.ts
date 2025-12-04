import { GoogleGenAI } from '@google/genai';
import LLMProvider from './LLMProvider';
import { Message, ProviderResponse, ChatOptions, ToolDefinition } from '../types';

/**
 * Google Gemini provider implementation using new @google/genai package
 * Supports models like gemini-1.5-pro, gemini-1.5-flash, gemini-2.0-flash, gemini-2.5-pro, gemini-3-pro
 */
export default class GeminiProvider extends LLMProvider {
  client: GoogleGenAI;

  constructor(modelName: string, apiKey?: string) {
    super(modelName);
    const key = apiKey || process.env.GEMINI_API_KEY;

    if (!key) {
      throw new Error('GEMINI_API_KEY is required. Get one at https://aistudio.google.com/app/apikey');
    }

    this.client = new GoogleGenAI({ apiKey: key });
  }

  protected async performChat(messages: Message[], systemPrompt: string | null = null, options: ChatOptions = {}): Promise<ProviderResponse> {
    try {
      const { tools = null, stream = false, onToken } = options;

      // Convert our tool definitions to Gemini's function declaration format
      const functionDeclarations = tools ? this.convertToolsToGeminiFormat(tools) : undefined;

      // Convert messages to Gemini Content format
      const contents = this.convertMessagesToGeminiFormat(messages);

      // Build config object
      const config: any = {};

      if (systemPrompt) {
        config.systemInstruction = systemPrompt;
      }

      if (functionDeclarations && functionDeclarations.length > 0) {
        config.tools = [{ functionDeclarations }];
      }

      const generateConfig = {
        model: this.modelName,
        contents,
        ...config,
      };

      // Handle streaming mode (no tools support in streaming)
      if (stream && (!config.tools || config.tools.length === 0)) {
        const streamResp = await this.client.models.generateContentStream(generateConfig as any);
        let fullText = '';

        for await (const chunk of streamResp as any) {
          const textPart = (chunk as any).text();
          if (textPart) {
            fullText += textPart;
            if (onToken) onToken(textPart);
          }
        }

        // Note: Token usage not available in streaming mode
        return { text: fullText || null };
      }

      // Non-streaming mode with improved token usage tracking
      const result = await this.client.models.generateContent(generateConfig);

      let usage = { input_tokens: 0, output_tokens: 0 };
      // @ts-ignore
      if (result.usageMetadata) {
        usage = {
          // @ts-ignore
          input_tokens: result.usageMetadata.promptTokenCount || 0,
          // @ts-ignore
          output_tokens: result.usageMetadata.candidatesTokenCount || 0,
        };
      } else {
        // Fallback to manual counting, but run in parallel
        if (result.candidates && result.candidates.length > 0) {
          const [inputTokenResponse, outputTokenResponse] = await Promise.all([
            this.client.models.countTokens({ ...generateConfig, contents }),
            this.client.models.countTokens({ ...generateConfig, contents: result.candidates[0].content })
          ]);
          usage = {
            input_tokens: inputTokenResponse.totalTokens ?? 0,
            output_tokens: outputTokenResponse.totalTokens ?? 0,
          };
        }
      }

      // Ensure we have a valid response
      if (!result.candidates || result.candidates.length === 0) {
        throw new Error('No candidates in Gemini response');
      }

      // Store the candidate to help TypeScript understand it's not null
      const candidate = result.candidates[0];
      if (!candidate.content || !candidate.content.parts) {
        throw new Error('Invalid candidate structure in Gemini response');
      }

      // Check for function calls
      if (candidate.content.parts.some((p: any) => p.functionCall)) {
        return {
          tool_calls: candidate.content.parts
            .filter((p: any) => p.functionCall)
            .map((p: any) => ({
              id: p.functionCall.name + '_' + Date.now(), // Gemini doesn't provide IDs
              name: p.functionCall.name,
              input: p.functionCall.args || {}
            })),
          text: candidate.content.parts.find((p: any) => p.text)?.text || null,
          usage
        };
      }

      const text = candidate.content.parts.map((p: any) => p.text).join('');

      // Return regular text response
      return { text: text || null, usage };
    } catch (error: any) {
      throw new Error(`Gemini API error: ${error.message}`);
    }
  }

  /**
   * Convert our tool definitions to Gemini's function declaration format
   */
  convertToolsToGeminiFormat(tools: ToolDefinition[] | any[]): any[] {
    const toolArray = Array.isArray(tools) ? tools : [];

    return toolArray.map((tool: any) => {
      // If it's OpenAI format (has type: 'function')
      if (tool.type === 'function') {
        return {
          name: tool.function.name,
          description: tool.function.description,
          parametersJsonSchema: tool.function.parameters
        };
      }

      // If it's Anthropic format (our standard format)
      return {
        name: tool.name,
        description: tool.description,
        parametersJsonSchema: tool.input_schema
      };
    });
  }

  /**
   * Convert our message format to Gemini's Content format
   * New API expects Content[] with role (user/model) and parts
   * Gemini requires: all function responses must be grouped together after function calls
   */
  convertMessagesToGeminiFormat(messages: Message[]): any[] {
    const contents: any[] = [];
    let pendingFunctionResponses: any[] = [];
    let lastToolCallsMap: Map<string, string> = new Map(); // Map tool_use_id to function name

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      if (msg.role === 'tool_result') {
        // Collect tool results to be grouped together
        const toolResult = msg as any;
        const functionName = lastToolCallsMap.get(toolResult.tool_use_id) || 'unknown';

        // Parse tool content if it's JSON, otherwise pass as-is
        let responseContent;
        try {
          // Try to parse as JSON to respect the tool's schema
          responseContent = JSON.parse(toolResult.content);
        } catch {
          // If not JSON, wrap in generic result field for compatibility
          responseContent = { result: toolResult.content };
        }

        pendingFunctionResponses.push({
          functionResponse: {
            name: functionName,
            response: responseContent
          }
        });
      } else {
        // If we have pending function responses, add them before this message
        if (pendingFunctionResponses.length > 0) {
          contents.push({
            role: 'function',
            parts: pendingFunctionResponses
          });
          pendingFunctionResponses = [];
        }

        if (msg.role === 'assistant') {
          const assistantMsg = msg as any;
          if (assistantMsg.tool_calls) {
            // Store tool call IDs and names for later function response matching
            lastToolCallsMap.clear();
            for (const tc of assistantMsg.tool_calls) {
              lastToolCallsMap.set(tc.id, tc.name);
            }

            // Build parts array: include both text (if present) and function calls
            const parts: any[] = [];

            // Add text content if present (preserves reasoning/explanation)
            if (msg.content && msg.content.trim()) {
              parts.push({ text: msg.content });
            }

            // Add function calls
            parts.push(...assistantMsg.tool_calls.map((tc: any) => ({
              functionCall: {
                name: tc.name,
                args: tc.input
              }
            })));

            contents.push({
              role: 'model',
              parts: parts
            });
          } else {
            contents.push({
              role: 'model',
              parts: [{ text: msg.content }]
            });
          }
        } else if (msg.role === 'user') {
          contents.push({
            role: 'user',
            parts: [{ text: msg.content }]
          });
        } else if (msg.role === 'system') {
          // Gemini doesn't support system role in conversation history
          // Convert to user message with clear prefix to preserve context
          contents.push({
            role: 'user',
            parts: [{ text: `[System instruction]: ${msg.content}` }]
          });
        }
      }
    }

    // Add any remaining function responses
    if (pendingFunctionResponses.length > 0) {
      contents.push({
        role: 'function',
        parts: pendingFunctionResponses
      });
    }

    return contents;
  }

  getProviderName(): string {
    return 'Gemini';
  }
}
