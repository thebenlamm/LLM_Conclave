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
    .option('--month [YYYY-MM]', 'Show stats for specific month (e.g., 2025-12) or last 30 days if no value')
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

      // Fix Issue #10: Support --month YYYY-MM for specific month filtering
      let timeRange: 'week' | 'month' | 'all-time' | string = 'all-time';
      if (options.week) {
        timeRange = 'week';
      } else if (options.month !== undefined) {
        // If --month has a value and matches YYYY-MM format, use it
        if (typeof options.month === 'string' && /^\d{4}-\d{2}$/.test(options.month)) {
          timeRange = options.month; // Specific month like "2025-12"
        } else {
          timeRange = 'month'; // Rolling 30 days (backward compatible)
        }
      }

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

export function displayDashboard(metrics: any, timeRange: string): void {
  if (metrics.totalConsultations === 0) {
    console.log(chalk.yellow('\n📭 No consultations found.\n'));
    console.log('Run your first consultation:');
    console.log(chalk.cyan('  llm-conclave consult "Your question here"\n'));
    return;
  }

  const title = `LLM Conclave Consult Stats (${timeRange})`;
  // Fix Issue #13: Dynamic dashboard width based on terminal size
  const width = Math.max(60, Math.min(process.stdout.columns || 80, 80));
  
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

  // Fix Issue #12: Calculate shares to sum to exactly 100%
  const providerEntries = Object.entries(metrics.cost.byProvider);
  const shares = providerEntries.map(([_, data]) => {
    const provData = data as any;
    return (provData.cost / metrics.cost.total) * 100;
  });

  // Round shares and adjust largest to ensure sum = 100%
  const roundedShares = shares.map(s => Math.round(s));
  const diff = 100 - roundedShares.reduce((sum, s) => sum + s, 0);
  if (diff !== 0) {
    const maxIndex = shares.indexOf(Math.max(...shares));
    roundedShares[maxIndex] += diff;
  }

  providerEntries.forEach(([provider, data], index) => {
    const provData = data as any;
    const share = roundedShares[index];
    console.log(chalk.cyan('│  ') + `    - ${provider}: $${provData.cost.toFixed(2)} (${share}%)`.padEnd(width - 6) + chalk.cyan('  │'));
  });
  console.log(chalk.cyan('├' + '─'.repeat(width - 2) + '┤'));

  // Quality Metrics
  console.log(chalk.cyan('│  ') + chalk.bold('Quality Metrics'.padEnd(width - 6)) + chalk.cyan('  │'));
  console.log(chalk.cyan('│  ') + `• Avg Confidence: ${metrics.quality.avgConfidence}%`.padEnd(width - 6) + chalk.cyan('  │'));
  console.log(chalk.cyan('│  ') + `• High Confidence (≥85%): ${metrics.quality.highConfidence}`.padEnd(width - 6) + chalk.cyan('  │'));
  console.log(chalk.cyan('│  ') + `• Low Confidence (<70%): ${metrics.quality.lowConfidence}`.padEnd(width - 6) + chalk.cyan('  │'));
  console.log(chalk.cyan('├' + '─'.repeat(width - 2) + '┤'));

  // Debate Value Metrics
  console.log(chalk.cyan('│  ') + chalk.bold('Debate Value Metrics'.padEnd(width - 6)) + chalk.cyan('  │'));
  const avgTotalAgents = metrics.debateValue.avgTotalAgents || 0;
  const avgChangeRatePercent = Math.round(metrics.debateValue.avgChangeRate * 100);
  console.log(
    chalk.cyan('│  ') +
    `• Avg Position Changes: ${metrics.debateValue.avgPositionChanges}/${avgTotalAgents} agents (${avgChangeRatePercent}%)`
      .padEnd(width - 6) +
    chalk.cyan('  │')
  );
  const avgConfidenceIncreasePercent = Math.round(metrics.debateValue.avgConfidenceIncrease * 100);
  console.log(
    chalk.cyan('│  ') +
    `• Avg Confidence Increase: +${avgConfidenceIncreasePercent}%`
      .padEnd(width - 6) +
    chalk.cyan('  │')
  );
  console.log(
    chalk.cyan('│  ') +
    `• Avg Convergence Score: ${metrics.debateValue.avgConvergenceScore.toFixed(2)}`
      .padEnd(width - 6) +
    chalk.cyan('  │')
  );
  const highValuePercent = metrics.totalConsultations > 0
    ? Math.round((metrics.debateValue.highValueDebates / metrics.totalConsultations) * 100)
    : 0;
  console.log(
    chalk.cyan('│  ') +
    `• High-Value Debates (>50% change): ${metrics.debateValue.highValueDebates} (${highValuePercent}%)`
      .padEnd(width - 6) +
    chalk.cyan('  │')
  );
  console.log(
    chalk.cyan('│  ') +
    `• Semantic Comparison Cost: $${metrics.debateValue.totalSemanticComparisonCost.toFixed(4)}`
      .padEnd(width - 6) +
    chalk.cyan('  │')
  );
  console.log(chalk.cyan('├' + '─'.repeat(width - 2) + '┤'));

  // Project Context Metrics
  console.log(chalk.cyan('│  ') + chalk.bold('Project Context'.padEnd(width - 6)) + chalk.cyan('  │'));
  const projectCounts = metrics.projectInsights?.projectTypeCounts || { brownfield: 0, greenfield: 0, unknown: 0 };
  const projectTotal = projectCounts.brownfield + projectCounts.greenfield + projectCounts.unknown;
  const brownfieldPercent = projectTotal > 0 ? Math.round((projectCounts.brownfield / projectTotal) * 100) : 0;
  const greenfieldPercent = projectTotal > 0 ? Math.round((projectCounts.greenfield / projectTotal) * 100) : 0;
  console.log(
    chalk.cyan('│  ') +
    `• Brownfield: ${projectCounts.brownfield} (${brownfieldPercent}%)`
      .padEnd(width - 6) +
    chalk.cyan('  │')
  );
  console.log(
    chalk.cyan('│  ') +
    `• Greenfield: ${projectCounts.greenfield} (${greenfieldPercent}%)`
      .padEnd(width - 6) +
    chalk.cyan('  │')
  );

  const frameworks = metrics.projectInsights?.frameworkUsage || {};
  const frameworkEntries = Object.entries(frameworks);
  if (frameworkEntries.length === 0) {
    console.log(chalk.cyan('│  ') + '• Frameworks: none'.padEnd(width - 6) + chalk.cyan('  │'));
  } else {
    console.log(chalk.cyan('│  ') + '• Frameworks:'.padEnd(width - 6) + chalk.cyan('  │'));
    frameworkEntries.slice(0, 3).forEach(([framework, count]) => {
      console.log(chalk.cyan('│  ') + `    - ${framework}: ${count}`.padEnd(width - 6) + chalk.cyan('  │'));
    });
  }

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

  // Fix Issue #11: Add dissent rate quality check
  const dissentRate = metrics.totalConsultations > 0
    ? (metrics.quality.withDissent / metrics.totalConsultations)
    : 0;
  if (dissentRate > 0.4) {
    console.log(chalk.yellow(`⚠️ Quality: High dissent rate (${Math.round(dissentRate * 100)}%) - agents frequently disagree`));
  } else if (dissentRate > 0) {
    console.log(chalk.green(`• Quality: Healthy dissent rate (${Math.round(dissentRate * 100)}%) ✅`));
  }

  console.log('');
}
