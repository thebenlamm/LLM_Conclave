import { Command } from 'commander';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConsultationResult } from '../types';

interface ConsultStatsOptions {
  month?: string;
  week?: boolean;
  allTime?: boolean;
}

interface Metrics {
  periodLabel: string;
  total: number;
  dateRange: {
    start: Date;
    end: Date;
    totalDays: number;
  };
  activeDays: number;
  avgPerDay: number;
  performance: {
    p50: number;
    p95: number;
    p99: number;
  };
  cost: {
    total: number;
    avgPerConsultation: number;
    totalTokens: number;
  };
}

/**
 * Create the consult-stats CLI command.
 */
export function createConsultStatsCommand(): Command {
  const cmd = new Command('consult-stats');

  cmd
    .description('Show consultation statistics and metrics')
    .option('-m, --month <YYYY-MM>', 'Show stats for a specific month')
    .option('-w, --week', 'Show stats for the last 7 days')
    .option('-a, --all-time', 'Show all-time stats')
    .action(async (options: ConsultStatsOptions) => {
      const stats = new ConsultStats();
      const metrics = await stats.compute(options);
      await stats.display(metrics);
    });

  return cmd;
}

class ConsultStats {
  private logDir: string;

  constructor() {
    this.logDir = path.join(os.homedir(), '.llm-conclave', 'consult-logs');
  }

  async compute(options: ConsultStatsOptions): Promise<Metrics | null> {
    const consultations = await this.loadConsultations(options);

    if (consultations.length === 0) {
      return null;
    }

    const durations = consultations.map(c => c.duration_ms || 0);
    const costs = consultations.map(c => c.cost?.usd || 0);
    const tokens = consultations.map(c => c.cost?.tokens?.total || 0);

    const dateRange = this.resolveDateRangeForMetrics(consultations, options);
    const activeDays = this.countActiveDays(consultations);
    const totalDays = Math.max(dateRange.totalDays, 1);

    return {
      periodLabel: dateRange.label,
      total: consultations.length,
      dateRange: {
        start: dateRange.start,
        end: dateRange.end,
        totalDays
      },
      activeDays,
      avgPerDay: consultations.length / totalDays,
      performance: {
        p50: this.percentile(durations, 50),
        p95: this.percentile(durations, 95),
        p99: this.percentile(durations, 99)
      },
      cost: {
        total: costs.reduce((sum, value) => sum + value, 0),
        avgPerConsultation: costs.reduce((sum, value) => sum + value, 0) / consultations.length,
        totalTokens: tokens.reduce((sum, value) => sum + value, 0)
      }
    };
  }

  async display(metrics: Metrics | null): Promise<void> {
    if (!metrics) {
      console.log('\nNo consultation logs found for the selected period. Run a consultation to generate stats.\n');
      return;
    }

    const width = 66;
    const divider = '+' + '-'.repeat(width - 2) + '+';
    const line = (text = '') => `| ${text.padEnd(width - 4)} |`;
    const metric = (label: string, value: string) => line(`${label}: ${value}`);

    console.log('\n' + divider);
    console.log(line(`Consult Stats ${metrics.periodLabel ? `(${metrics.periodLabel})` : ''}`));
    console.log(divider);
    console.log(line('✅ Usage'));
    console.log(metric('Total consultations', metrics.total.toString()));
    const activePercent = ((metrics.activeDays / metrics.dateRange.totalDays) * 100).toFixed(0);
    console.log(metric('Active days', `${metrics.activeDays}/${metrics.dateRange.totalDays} (${activePercent}%)`));
    console.log(metric('Avg per day', metrics.avgPerDay.toFixed(2)));
    console.log(divider);
    console.log(line('⚡ Performance'));
    console.log(metric('p50 response time', this.formatSeconds(metrics.performance.p50)));
    console.log(metric('p95 response time', this.formatSeconds(metrics.performance.p95)));
    console.log(metric('p99 response time', this.formatSeconds(metrics.performance.p99)));
    console.log(divider);
    console.log(line('💰 Cost'));
    console.log(metric('Total cost', `$${metrics.cost.total.toFixed(2)}`));
    console.log(metric('Avg per consultation', `$${metrics.cost.avgPerConsultation.toFixed(4)}`));
    console.log(metric('Total tokens', metrics.cost.totalTokens.toLocaleString()));
    console.log(divider);
    console.log(line('🎯 Tips'));

    if (metrics.total >= 10 && metrics.activeDays >= 5) {
      console.log(line('Great consistency! Keep the cadence going.'));
    } else {
      console.log(line('Consider a daily consult to build momentum.'));
    }

    if (metrics.performance.p50 < 15000) {
      console.log(line('Speed looks good (<15s median).'));
    } else {
      console.log(line('Try quick mode for faster turnarounds.'));
    }

    if (metrics.cost.avgPerConsultation < 0.5) {
      console.log(line('Costs are healthy (<$0.50 per consult).'));
    } else {
      console.log(line('Watch long contexts; they drive token spend.'));
    }

    console.log(divider + '\n');
  }

  private async loadConsultations(options: ConsultStatsOptions): Promise<ConsultationResult[]> {
    if (!fs.existsSync(this.logDir)) {
      return [];
    }

    const files = await fs.promises.readdir(this.logDir);
    const consultationFiles = files.filter(f => f.endsWith('.json') && !f.startsWith('index-'));

    const consultations: ConsultationResult[] = [];

    for (const file of consultationFiles) {
      const fullPath = path.join(this.logDir, file);
      try {
        const content = await fs.promises.readFile(fullPath, 'utf-8');
        const parsed = JSON.parse(content) as ConsultationResult;
        consultations.push(parsed);
      } catch {
        // Skip malformed logs; keep stats resilient.
        continue;
      }
    }

    return this.filterByDateRange(consultations, options);
  }

  private filterByDateRange(
    consultations: ConsultationResult[],
    options: ConsultStatsOptions
  ): ConsultationResult[] {
    const range = this.resolveDateRange(options, consultations);
    if (!range.start && !range.end) {
      return consultations;
    }

    return consultations.filter(c => {
      const ts = new Date(c.timestamp).getTime();
      const afterStart = range.start ? ts >= range.start.getTime() : true;
      const beforeEnd = range.end ? ts <= range.end.getTime() : true;
      return afterStart && beforeEnd;
    });
  }

  private resolveDateRange(
    options: ConsultStatsOptions,
    consultations: ConsultationResult[]
  ): { start: Date | null; end: Date | null; label: string } {
    if (options.week) {
      const end = this.endOfDay(new Date());
      const start = this.startOfDay(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));
      return { start, end, label: 'Last 7 days' };
    }

    if (options.month) {
      const [year, month] = options.month.split('-').map(Number);
      if (year && month) {
        const start = this.startOfDay(new Date(year, month - 1, 1));
        const end = this.endOfDay(new Date(year, month, 0));
        return { start, end, label: options.month };
      }
    }

    if (options.allTime) {
      return { start: null, end: null, label: 'All time' };
    }

    // Default to current month
    const now = new Date();
    const start = this.startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
    const end = this.endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    const label = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    return { start, end, label };
  }

  private resolveDateRangeForMetrics(
    consultations: ConsultationResult[],
    options: ConsultStatsOptions
  ): { start: Date; end: Date; totalDays: number; label: string } {
    const range = this.resolveDateRange(options, consultations);

    if (!range.start || !range.end) {
      // All-time: derive bounds from data.
      const timestamps = consultations.map(c => new Date(c.timestamp).getTime());
      const minTs = Math.min(...timestamps);
      const maxTs = Math.max(...timestamps);
      const start = this.startOfDay(new Date(minTs));
      const end = this.endOfDay(new Date(maxTs));
      return { start, end, totalDays: this.daysBetween(start, end), label: range.label };
    }

    return {
      start: range.start,
      end: range.end,
      totalDays: this.daysBetween(range.start, range.end),
      label: range.label
    };
  }

  private countActiveDays(consultations: ConsultationResult[]): number {
    const daySet = new Set<string>();
    consultations.forEach(c => {
      const d = new Date(c.timestamp);
      const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
      daySet.add(key);
    });
    return daySet.size;
  }

  private percentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = (percentile / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    const weight = index - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  private daysBetween(start: Date, end: Date): number {
    const msPerDay = 24 * 60 * 60 * 1000;
    const startMs = this.startOfDay(start).getTime();
    const endMs = this.startOfDay(end).getTime();
    return Math.floor((endMs - startMs) / msPerDay) + 1;
  }

  private startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  }

  private endOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  }

  private formatSeconds(ms: number): string {
    return `${(ms / 1000).toFixed(1)}s`;
  }
}
