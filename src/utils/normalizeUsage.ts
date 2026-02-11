/**
 * Normalize token usage from various provider formats into a consistent shape.
 *
 * Handles:
 *  - { input, output, total }           (our canonical format)
 *  - { input_tokens, output_tokens }    (Anthropic)
 *  - { prompt_tokens, completion_tokens } (OpenAI)
 */
export function normalizeUsage(
  usage: any
): { input: number; output: number; total: number } {
  if (!usage) return { input: 0, output: 0, total: 0 };

  // Already in canonical format
  if ('input' in usage && typeof usage.input === 'number') {
    return {
      input: usage.input,
      output: usage.output || 0,
      total: usage.total || (usage.input + (usage.output || 0))
    };
  }

  // Anthropic format
  if ('input_tokens' in usage) {
    const input = usage.input_tokens ?? 0;
    const output = usage.output_tokens ?? 0;
    return { input, output, total: usage.total_tokens ?? (input + output) };
  }

  // OpenAI format
  if ('prompt_tokens' in usage) {
    const input = usage.prompt_tokens ?? 0;
    const output = usage.completion_tokens ?? 0;
    return { input, output, total: usage.total_tokens ?? (input + output) };
  }

  return { input: 0, output: 0, total: 0 };
}
