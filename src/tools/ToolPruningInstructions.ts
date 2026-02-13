/**
 * ToolPruningInstructions - Instruction-based tool restrictions per mode/phase
 *
 * Instead of removing tool schemas (which would invalidate KV cache for the entire prefix),
 * we append natural language instructions telling the agent which tools to use.
 * All tool schemas remain in every request (cache-safe).
 *
 * Scope: orchestrated and iterative modes only.
 * - Consult mode uses no tools at all — nothing to prune.
 * - Consensus/discuss mode is not covered in this phase.
 */

type OrchestratedPhase = 'primary' | 'critique' | 'revision' | 'validation';
type IterativePhase = 'agent' | 'judge';

/**
 * Get a tool restriction instruction to append to the user message.
 * Returns empty string for phases where all tools are allowed.
 */
export function getToolRestrictionInstruction(mode: 'orchestrated', phase: OrchestratedPhase): string;
export function getToolRestrictionInstruction(mode: 'iterative', phase: IterativePhase): string;
export function getToolRestrictionInstruction(mode: string, phase: string): string;
export function getToolRestrictionInstruction(
  mode: string,
  phase: string
): string {
  if (mode === 'orchestrated') {
    if (phase === 'validation') {
      return '\n\nIMPORTANT: You may only use read_file, list_files, and expand_artifact. Do not modify files.';
    }
    // primary, critique, revision — no restrictions
    return '';
  }

  if (mode === 'iterative') {
    if (phase === 'agent') {
      return '\n\nIMPORTANT: You may use read_file and list_files to verify facts. Do not use write_file, edit_file, or run_command — the judge handles output.';
    }
    // judge — no restrictions
    return '';
  }

  return '';
}
