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

    // Degraded results banner (judge fallback occurred)
    if (result.status === 'completed_degraded') {
      lines.push('> **Degraded Results** — Judge model was unavailable; synthesis used a fallback model.');
      lines.push('');
    }

    // Partial results banner
    if (result.status === 'partial') {
      lines.push(`> **Partial Results** — Consultation interrupted after ${result.completedRounds} of ${result.rounds} rounds.`);
      if (result.abortReason) {
        // Show full abort reason including remediation guidance
        for (const line of result.abortReason.split('\n')) {
          lines.push(`> ${line}`);
        }
      }
      lines.push('');
    }

    lines.push(`**Question:** ${result.question}`);
    lines.push(`**Confidence:** ${Math.round(result.confidence * 100)}%`);
    lines.push('');

    // Use "Independent Opinions" when no synthesis occurred (single round)
    const hasConsensus = result.recommendation && result.recommendation !== 'Consultation incomplete';
    lines.push(hasConsensus ? '## Consensus' : '## Independent Opinions');
    lines.push(hasConsensus ? result.recommendation! : (result.consensus || 'No synthesis performed — see individual perspectives below.'));
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

    // Include the full raw agent response that is most actionable and unique.
    // Rewards concrete, specific content over generic advice that echoes the consensus.
    if (result.agentResponses && result.agentResponses.length > 0) {
      const validResponses = result.agentResponses.filter(r => r.content && !r.error);
      if (validResponses.length > 0) {
        const allContents = validResponses.map(r => r.content.toLowerCase());
        let bestResponse = validResponses[0];
        let bestScore = 0;

        for (let i = 0; i < validResponses.length; i++) {
          const content = validResponses[i].content;
          const lower = content.toLowerCase();

          // Actionability signals: concrete, specific content
          const numberedLists = (content.match(/^\s*\d+\.\s/gm) || []).length;
          const bulletPoints = (content.match(/^\s*[-*]\s/gm) || []).length;
          const codeBlocks = Math.floor((content.match(/```/g) || []).length / 2);
          // Match technology names: known suffixes (.js, .ts, .py, DB, SQL, API, SDK, CLI, MQ)
          // and all-caps acronyms (4+ chars), but NOT generic capitalized English words
          const techSuffixes = (content.match(/\b\w+(?:\.js|\.ts|\.py|DB|SQL|API|SDK|CLI|MQ)\b/gi) || []).length;
          const acronyms = (content.match(/\b[A-Z]{3,}\b/g) || []).length; // AWS, JWT, REST, HTTPS
          const namedTech = techSuffixes + acronyms;
          const quantified = (content.match(/\$[\d,.]+|\d+\s*(?:ms|MB|GB|hours?|days?|weeks?|minutes?|%)/gi) || []).length;
          const actionability = numberedLists * 3 + bulletPoints * 2 + codeBlocks * 5 + namedTech * 2 + quantified * 2;

          // Uniqueness: penalize overlap with OTHER agents (not the recommendation)
          const words = new Set(lower.split(/\s+/).filter(w => w.length >= 5));
          let overlapWithOthers = 0;
          for (let j = 0; j < allContents.length; j++) {
            if (i === j) continue;
            const otherWords = new Set(allContents[j].split(/\s+/).filter(w => w.length >= 5));
            overlapWithOthers += [...words].filter(w => otherWords.has(w)).length;
          }
          const uniqueness = Math.max(0, words.size - overlapWithOthers);

          const score = actionability * 100 + uniqueness;
          if (score > bestScore) {
            bestScore = score;
            bestResponse = validResponses[i];
          }
        }
        lines.push('## Best Agent Output');
        lines.push(`*From ${bestResponse.agentName} (${bestResponse.model})*`);
        lines.push('');
        lines.push(bestResponse.content);
        lines.push('');
      }
    }

    // Only show Concerns and Dissenting Views when cross-exam or verdict occurred
    if (result.completedRounds >= 3) {
      lines.push('## Concerns Raised');
      if (result.concerns && result.concerns.length > 0) {
        result.concerns.forEach(c => {
          lines.push(`- ${c}`);
        });
      } else {
        lines.push('- None identified.');
      }
      lines.push('');
    }

    if (result.completedRounds >= 2 && result.dissent && result.dissent.length > 0) {
      lines.push('## Dissenting Views');
      result.dissent.forEach(d => {
        lines.push(`- **${d.agent}** (${d.severity}): ${d.concern}`);
      });
      lines.push('');
    }

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
