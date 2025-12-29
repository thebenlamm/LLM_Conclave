import { ConsultationResult, IOutputFormatter } from '../../types/consult';

/**
 * Formats consultation results as Markdown for human consumption.
 */
export class MarkdownFormatter implements IOutputFormatter {
  /**
   * Format the consultation result as Markdown
   */
  public format(result: ConsultationResult): string {
    const lines: string[] = [];

    lines.push('# Consultation Summary');
    lines.push('');
    lines.push(`**Question:** ${result.question}`);
    lines.push(`**Confidence:** ${Math.round(result.confidence * 100)}%`);
    lines.push('');

    lines.push('## Consensus');
    lines.push(result.recommendation || result.consensus || 'No clear consensus reached.');
    lines.push('');

    lines.push('## Agent Perspectives');
    if (result.perspectives && result.perspectives.length > 0) {
      result.perspectives.forEach(p => {
        lines.push(`### ${p.agent} (${p.model})`);
        lines.push(p.opinion);
        lines.push('');
      });
    } else {
      lines.push('No detailed agent perspectives available.');
      lines.push('');
    }

    lines.push('## Concerns Raised');
    if (result.concerns && result.concerns.length > 0) {
      result.concerns.forEach(c => {
        lines.push(`- ${c}`);
      });
    } else {
      lines.push('- None identified.');
    }
    lines.push('');

    lines.push('## Dissenting Views');
    if (result.dissent && result.dissent.length > 0) {
      result.dissent.forEach(d => {
        lines.push(`- **${d.agent}** (${d.severity}): ${d.concern}`);
      });
    } else {
      lines.push('- None identified.');
    }
    lines.push('');

    lines.push('---');
    const costUsd = result.cost.usd.toFixed(4);
    const durationSec = (result.durationMs / 1000).toFixed(1);
    const totalTokens = result.cost.tokens.total.toLocaleString();
    lines.push(`**Cost:** $${costUsd} | **Duration:** ${durationSec}s | **Tokens:** ${totalTokens}`);

    return lines.join('\n');
  }
}
