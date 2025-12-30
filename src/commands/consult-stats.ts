import { Command } from 'commander';
import chalk from 'chalk';
import { StatsQuery } from '../consult/analytics/StatsQuery';
import { AnalyticsIndexer } from '../consult/analytics/AnalyticsIndexer';
import * as path from 'path';
import * as os from 'os';

/**
 * consult-stats command - Display consultation usage analytics
 */
export function createConsultStatsCommand(): Command {
  const cmd = new Command('consult-stats');

  cmd
    .description('Display consultation usage, performance, and cost analytics')
    .option('--week', 'Show stats for the last 7 days')
    .option('--month', 'Show stats for the last 30 days')
    .option('--all-time', 'Show all-time stats (default)')
    .option('--json', 'Output raw JSON metrics')
    .option('--rebuild-index', 'Rebuild the analytics index from JSONL logs')
    .action(async (options: any) => {
      const logDir = path.join(os.homedir(), '.llm-conclave', 'consult-logs');
      const dbPath = path.join(os.homedir(), '.llm-conclave', 'consult-analytics.db');

      if (options.rebuildIndex) {
        console.log(chalk.cyan('Rebuilding analytics index...'));
        const indexer = new AnalyticsIndexer(dbPath);
        indexer.rebuildIndex(logDir);
        indexer.close();
        return;
      }

      let timeRange: 'week' | 'month' | 'all-time' = 'all-time';
      if (options.week) timeRange = 'week';
      else if (options.month) timeRange = 'month';

      const query = new StatsQuery(dbPath);
      const metrics = query.computeMetrics(timeRange);
      query.close();

      if (options.json) {
        console.log(JSON.stringify(metrics, null, 2));
        return;
      }

      displayDashboard(metrics, timeRange);
    });

  return cmd;
}

function displayDashboard(metrics: any, timeRange: string): void {
  if (metrics.totalConsultations === 0) {
    console.log(chalk.yellow('\n📭 No consultations found.\n'));
    console.log('Run your first consultation:');
    console.log(chalk.cyan('  llm-conclave consult "Your question here"\n'));
    return;
  }

  const title = `LLM Conclave Consult Stats (${timeRange})`;
  const width = 50;
  
  console.log(chalk.cyan('┌' + '─'.repeat(width - 2) + '┐'));
  console.log(chalk.cyan('│  ') + chalk.bold(title.padEnd(width - 6)) + chalk.cyan('  │'));
  console.log(chalk.cyan('├' + '─'.repeat(width - 2) + '┤'));

  // Usage Metrics
  console.log(chalk.cyan('│  ') + chalk.bold('Usage Metrics'.padEnd(width - 6)) + chalk.cyan('  │'));
  console.log(chalk.cyan('│  ') + `• Total Consultations: ${metrics.totalConsultations}`.padEnd(width - 6) + chalk.cyan('  │'));
  const activePercent = Math.round((metrics.activeDays / Math.max(1, metrics.dateRange.totalDays)) * 100);
  console.log(chalk.cyan('│  ') + `• Active Days: ${metrics.activeDays}/${metrics.dateRange.totalDays} (${activePercent}%)`.padEnd(width - 6) + chalk.cyan('  │'));
  console.log(chalk.cyan('│  ') + `• Avg per Day: ${metrics.avgPerDay}`.padEnd(width - 6) + chalk.cyan('  │'));
  const completedPercent = Math.round((metrics.byState.completed / metrics.totalConsultations) * 100);
  console.log(chalk.cyan('│  ') + `• Completed: ${metrics.byState.completed} (${completedPercent}%)`.padEnd(width - 6) + chalk.cyan('  │'));
  console.log(chalk.cyan('│  ') + `• Aborted: ${metrics.byState.aborted}`.padEnd(width - 6) + chalk.cyan('  │'));
  console.log(chalk.cyan('├' + '─'.repeat(width - 2) + '┤'));

  // Performance Metrics
  console.log(chalk.cyan('│  ') + chalk.bold('Performance Metrics'.padEnd(width - 6)) + chalk.cyan('  │'));
  console.log(chalk.cyan('│  ') + `• Median Response Time: ${(metrics.performance.p50 / 1000).toFixed(1)}s (p50)`.padEnd(width - 6) + chalk.cyan('  │'));
  console.log(chalk.cyan('│  ') + `• p95 Response Time: ${(metrics.performance.p95 / 1000).toFixed(1)}s`.padEnd(width - 6) + chalk.cyan('  │'));
  console.log(chalk.cyan('│  ') + `• p99 Response Time: ${(metrics.performance.p99 / 1000).toFixed(1)}s`.padEnd(width - 6) + chalk.cyan('  │'));
  console.log(chalk.cyan('│  ') + `• Fastest: ${(metrics.performance.fastest.durationMs / 1000).toFixed(1)}s`.padEnd(width - 6) + chalk.cyan('  │'));
  console.log(chalk.cyan('│  ') + `• Slowest: ${(metrics.performance.slowest.durationMs / 1000).toFixed(1)}s`.padEnd(width - 6) + chalk.cyan('  │'));
  console.log(chalk.cyan('├' + '─'.repeat(width - 2) + '┤'));

  // Cost Metrics
  console.log(chalk.cyan('│  ') + chalk.bold('Cost Metrics'.padEnd(width - 6)) + chalk.cyan('  │'));
  console.log(chalk.cyan('│  ') + `• Total Cost: $${metrics.cost.total.toFixed(2)}`.padEnd(width - 6) + chalk.cyan('  │'));
  console.log(chalk.cyan('│  ') + `• Avg per Consultation: $${metrics.cost.avgPerConsultation.toFixed(3)}`.padEnd(width - 6) + chalk.cyan('  │'));
  console.log(chalk.cyan('│  ') + `• Total Tokens: ${metrics.cost.totalTokens.toLocaleString()}`.padEnd(width - 6) + chalk.cyan('  │'));
  console.log(chalk.cyan('│  ') + '• By Provider:'.padEnd(width - 6) + chalk.cyan('  │'));
  
  for (const [provider, data] of Object.entries(metrics.cost.byProvider)) {
    const provData = data as any;
    const share = Math.round((provData.cost / metrics.cost.total) * 100);
    console.log(chalk.cyan('│  ') + `    - ${provider}: $${provData.cost.toFixed(2)} (${share}%)`.padEnd(width - 6) + chalk.cyan('  │'));
  }
  console.log(chalk.cyan('├' + '─'.repeat(width - 2) + '┤'));

  // Quality Metrics
  console.log(chalk.cyan('│  ') + chalk.bold('Quality Metrics'.padEnd(width - 6)) + chalk.cyan('  │'));
  console.log(chalk.cyan('│  ') + `• Avg Confidence: ${metrics.quality.avgConfidence}%`.padEnd(width - 6) + chalk.cyan('  │'));
  console.log(chalk.cyan('│  ') + `• High Confidence (≥85%): ${metrics.quality.highConfidence}`.padEnd(width - 6) + chalk.cyan('  │'));
  console.log(chalk.cyan('│  ') + `• Low Confidence (<70%): ${metrics.quality.lowConfidence}`.padEnd(width - 6) + chalk.cyan('  │'));
  console.log(chalk.cyan('└' + '─'.repeat(width - 2) + '┘'));

  // Success Criteria Validation
  console.log('\n' + chalk.bold('📊 Progress toward Success Criteria:'));
  
  if (metrics.totalConsultations >= 150) {
    console.log(chalk.green('• Usage: 150+ consultations ✅'));
  } else {
    console.log(`• Usage: ${metrics.totalConsultations}/150 consultations (${Math.round((metrics.totalConsultations/150)*100)}%)`);
  }

  if (metrics.performance.p50 < 15000) {
    console.log(chalk.green('• Speed: median < 15s ✅'));
  } else {
    console.log(chalk.yellow(`• Speed: ${(metrics.performance.p50/1000).toFixed(1)}s median (target: <15s)`));
  }

  if (metrics.cost.total < 20) {
    console.log(chalk.green('• Cost: < $20 total ✅'));
  } else {
    console.log(chalk.red(`• Cost: $${metrics.cost.total.toFixed(2)}/$20.00 budget`));
  }
  console.log('');
}