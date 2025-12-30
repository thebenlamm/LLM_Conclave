import * as path from 'path';
import * as os from 'os';
import Database from 'better-sqlite3';
import { ConsultMetrics } from '../../types/consult';

export class StatsQuery {
  private readonly dbPath: string;
  private db: Database.Database | null = null;

  constructor(dbPath?: string) {
    // Default database path: ~/.llm-conclave/consult-analytics.db
    this.dbPath = dbPath || path.join(os.homedir(), '.llm-conclave', 'consult-analytics.db');
    this.initDatabase();
  }

  private initDatabase(): void {
    try {
      this.db = new Database(this.dbPath, { readonly: true, fileMustExist: true });
    } catch (error: any) {
      // Fix Issue #9: Cleanup database connection on init failure
      if (this.db) {
        try {
          this.db.close();
        } catch (closeError: any) {
          // Ignore close errors during cleanup
        }
      }
      // If DB doesn't exist, we'll return empty metrics
      this.db = null;
    }
  }

  /**
   * Compute all metrics
   */
  public computeMetrics(timeRange: 'week' | 'month' | 'all-time' | string = 'all-time'): ConsultMetrics {
    if (!this.db) {
      return this.getEmptyMetrics();
    }

    const where = this.getWhereClause(timeRange);

    // 1. Usage Metrics
    const usage = this.queryUsage(where);

    // 2. Performance Metrics
    const performance = this.queryPerformance(where);

    // 3. Cost Metrics
    const cost = this.queryCost(where);

    // 4. Quality Metrics
    const quality = this.queryQuality(where);

    return {
      totalConsultations: usage.total,
      dateRange: usage.dateRange,
      activeDays: usage.activeDays,
      avgPerDay: usage.avgPerDay,
      byState: usage.byState,
      performance,
      cost,
      quality
    };
  }

  private getWhereClause(timeRange: 'week' | 'month' | 'all-time' | string): { clause: string; params: any[] } {
    if (timeRange === 'all-time') return { clause: '1=1', params: [] };

    // Fix Issue #10: Support specific month format YYYY-MM
    if (typeof timeRange === 'string' && /^\d{4}-\d{2}$/.test(timeRange)) {
      // Specific month: YYYY-MM format
      const [year, month] = timeRange.split('-').map(Number);
      const startDate = new Date(year, month - 1, 1); // First day of month
      const endDate = new Date(year, month, 0, 23, 59, 59, 999); // Last day of month
      return {
        clause: 'created_at >= ? AND created_at <= ?',
        params: [startDate.toISOString(), endDate.toISOString()]
      };
    }

    const date = new Date();
    if (timeRange === 'week') {
      date.setDate(date.getDate() - 7);
    } else if (timeRange === 'month') {
      date.setMonth(date.getMonth() - 1);
    }

    // Fix Issue #7: Use parameterized queries instead of string interpolation
    return { clause: 'created_at >= ?', params: [date.toISOString()] };
  }

  private queryUsage(where: { clause: string; params: any[] }): any {
    const total = this.db!.prepare(`SELECT count(*) as count FROM consultations WHERE ${where.clause}`).get(...where.params) as any;
    const dateRange = this.db!.prepare(`SELECT min(created_at) as start, max(created_at) as end FROM consultations WHERE ${where.clause}`).get(...where.params) as any;
    const activeDays = this.db!.prepare(`SELECT count(distinct date(created_at)) as count FROM consultations WHERE ${where.clause}`).get(...where.params) as any;
    const byState = this.db!.prepare(`SELECT state, count(*) as count FROM consultations WHERE ${where.clause} GROUP BY state`).all(...where.params) as any[];

    const start = dateRange.start || new Date().toISOString();
    const end = dateRange.end || new Date().toISOString();
    const totalDays = Math.max(1, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24)));

    const stateMap: any = { completed: 0, aborted: 0 };
    byState.forEach(s => {
      if (s.state === 'complete') stateMap.completed = s.count;
      else stateMap.aborted += s.count;
    });

    return {
      total: total.count,
      dateRange: {
        start,
        end,
        totalDays
      },
      activeDays: activeDays.count,
      avgPerDay: Number((total.count / Math.max(1, activeDays.count)).toFixed(1)),
      byState: stateMap
    };
  }

  private queryPerformance(where: { clause: string; params: any[] }): any {
    const durations = this.db!.prepare(`SELECT duration_ms FROM consultations WHERE ${where.clause} AND state = 'complete' ORDER BY duration_ms`).all(...where.params) as any[];

    if (durations.length === 0) {
      return { p50: 0, p95: 0, p99: 0, avgDuration: 0, fastest: { id: '', durationMs: 0 }, slowest: { id: '', durationMs: 0 } };
    }

    // Fix Issue #6: Correct percentile calculation to avoid off-by-one errors
    const getPercentile = (p: number) => {
      const index = Math.ceil(durations.length * p) - 1;
      const clampedIndex = Math.max(0, Math.min(index, durations.length - 1));
      return durations[clampedIndex].duration_ms;
    };
    const avg = durations.reduce((sum, d) => sum + d.duration_ms, 0) / durations.length;

    const fastest = this.db!.prepare(`SELECT id, duration_ms FROM consultations WHERE ${where.clause} AND state = 'complete' ORDER BY duration_ms ASC LIMIT 1`).get(...where.params) as any;
    const slowest = this.db!.prepare(`SELECT id, duration_ms FROM consultations WHERE ${where.clause} AND state = 'complete' ORDER BY duration_ms DESC LIMIT 1`).get(...where.params) as any;

    return {
      p50: getPercentile(0.5),
      p95: getPercentile(0.95),
      p99: getPercentile(0.99),
      avgDuration: Math.round(avg),
      fastest: { id: fastest.id, durationMs: fastest.duration_ms },
      slowest: { id: slowest.id, durationMs: slowest.duration_ms }
    };
  }

  private queryCost(where: { clause: string; params: any[] }): any {
    const totals = this.db!.prepare(`SELECT sum(total_cost) as usd, sum(total_tokens) as tokens, count(*) as count FROM consultations WHERE ${where.clause}`).get(...where.params) as any;

    // Fix Issue #5: Optimize O(n²) subquery with CTE for O(n) performance
    const byProviderRows = this.db!.prepare(`
      WITH agent_counts AS (
        SELECT consultation_id, count(*) as num_agents
        FROM consultation_agents
        GROUP BY consultation_id
      )
      SELECT ca.provider,
             sum(c.total_cost / ac.num_agents) as cost,
             sum(c.total_tokens / ac.num_agents) as tokens
      FROM consultations c
      JOIN consultation_agents ca ON c.id = ca.consultation_id
      JOIN agent_counts ac ON c.id = ac.consultation_id
      WHERE ${where.clause}
      GROUP BY ca.provider
    `).all(...where.params) as any[];

    const byProvider: any = {};
    byProviderRows.forEach(r => {
      byProvider[r.provider] = { cost: Number(r.cost.toFixed(4)), tokens: Math.round(r.tokens) };
    });

    const mostExpensive = this.db!.prepare(`SELECT id, total_cost FROM consultations WHERE ${where.clause} ORDER BY total_cost DESC LIMIT 1`).get(...where.params) as any;
    const cheapest = this.db!.prepare(`SELECT id, total_cost FROM consultations WHERE ${where.clause} ORDER BY total_cost ASC LIMIT 1`).get(...where.params) as any;

    return {
      total: Number((totals.usd || 0).toFixed(2)),
      avgPerConsultation: totals.count > 0 ? Number(((totals.usd || 0) / totals.count).toFixed(4)) : 0,
      totalTokens: totals.tokens || 0,
      byProvider,
      mostExpensive: mostExpensive ? { id: mostExpensive.id, cost: mostExpensive.total_cost } : { id: '', cost: 0 },
      cheapest: cheapest ? { id: cheapest.id, cost: cheapest.total_cost } : { id: '', cost: 0 }
    };
  }

  private queryQuality(where: { clause: string; params: any[] }): any {
    const stats = this.db!.prepare(`
      SELECT avg(confidence) as avg_conf,
             count(CASE WHEN confidence >= 0.85 THEN 1 END) as high,
             count(CASE WHEN confidence < 0.70 THEN 1 END) as low,
             sum(has_dissent) as with_dissent
      FROM consultations WHERE ${where.clause} AND state = 'complete'
    `).get(...where.params) as any;

    return {
      avgConfidence: Number(((stats.avg_conf || 0) * 100).toFixed(0)),
      highConfidence: stats.high || 0,
      lowConfidence: stats.low || 0,
      withDissent: stats.with_dissent || 0
    };
  }

  private getEmptyMetrics(): ConsultMetrics {
    const now = new Date().toISOString();
    return {
      totalConsultations: 0,
      dateRange: { start: now, end: now, totalDays: 0 },
      activeDays: 0,
      avgPerDay: 0,
      byState: { completed: 0, aborted: 0 },
      performance: { p50: 0, p95: 0, p99: 0, avgDuration: 0, fastest: { id: '', durationMs: 0 }, slowest: { id: '', durationMs: 0 } },
      cost: { total: 0, avgPerConsultation: 0, totalTokens: 0, byProvider: {}, mostExpensive: { id: '', cost: 0 }, cheapest: { id: '', cost: 0 } },
      quality: { avgConfidence: 0, highConfidence: 0, lowConfidence: 0, withDissent: 0 }
    };
  }

  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
