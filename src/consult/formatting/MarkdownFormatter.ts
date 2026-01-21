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
        const confidenceStr = p.confidence !== undefined ? ` - ${Math.round(p.confidence * 100)}% confident` : '';
        lines.push(`### ${p.agent} (${p.model})${confidenceStr}`);
        lines.push('');
        lines.push(`**Position:** ${p.opinion}`);
        lines.push('');

        // Show key points if available
        if (p.keyPoints && p.keyPoints.length > 0) {
          lines.push('**Key Points:**');
          p.keyPoints.forEach(point => {
            lines.push(`- ${point}`);
          });
          lines.push('');
        }

        // Show full rationale if available
        if (p.rationale) {
          lines.push('**Reasoning:**');
          lines.push(p.rationale);
          lines.push('');
        }
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
    let statsLine = `**Cost:** $${costUsd} | **Duration:** ${durationSec}s | **Tokens:** ${totalTokens}`;

    if (result.token_efficiency_stats && result.token_efficiency_stats.tokens_saved_via_filtering > 0) {
      const saved = result.token_efficiency_stats.tokens_saved_via_filtering.toLocaleString();
      const pct = result.token_efficiency_stats.efficiency_percentage.toFixed(1);
      statsLine += ` | **Savings:** ${saved} tokens (${pct}%)`;
    }

    lines.push(statsLine);

    return lines.join('\n');
  }
}
