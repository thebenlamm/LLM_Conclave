import chalk from 'chalk';
import { DebateValueAnalysis } from '../../types/consult';

export class DebateValueFormatter {
  public formatValueSummary(analysis: DebateValueAnalysis): string {
    const lines: string[] = [];

    lines.push(chalk.cyan('🎯 Debate Value Analysis:'));
    const changeRatePercent = Math.round(analysis.changeRate * 100);
    lines.push(`• ${analysis.agentsChangedPosition}/${analysis.totalAgents} agents changed positions during debate (${changeRatePercent}%)`);

    analysis.agentAnalyses.forEach(agent => {
      const confidenceDeltaPercent = Math.round(agent.confidenceDelta * 100);
      const confidenceLabel = `${confidenceDeltaPercent >= 0 ? '+' : ''}${confidenceDeltaPercent}%`;
      const changeLabel = agent.positionChanged
        ? `${agent.changeMagnitude} shift`
        : 'maintained position';
      const influencerNote = agent.influencedBy.length > 0
        ? ` influenced by ${agent.influencedBy.join(', ')}`
        : '';
      lines.push(`• ${agent.agentName}: ${changeLabel} (confidence ${confidenceLabel})${influencerNote}`);
    });

    if (analysis.keyInsights.length > 0) {
      lines.push('');
      lines.push(chalk.bold('Key Insights:'));
      analysis.keyInsights.forEach(insight => {
        lines.push(`- ${insight}`);
      });
    }

    return lines.join('\n');
  }
}
