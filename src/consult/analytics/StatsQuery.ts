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
      // If DB doesn't exist, we'll return empty metrics
      this.db = null;
    }
  }

  /**
   * Compute all metrics
   */
  public computeMetrics(timeRange: 'week' | 'month' | 'all-time' = 'all-time'): ConsultMetrics {
    if (!this.db) {
      return this.getEmptyMetrics();
    }

    const whereClause = this.getWhereClause(timeRange);
    
    // 1. Usage Metrics
    const usage = this.queryUsage(whereClause);
    
    // 2. Performance Metrics
    const performance = this.queryPerformance(whereClause);
    
    // 3. Cost Metrics
    const cost = this.queryCost(whereClause);
    
    // 4. Quality Metrics
    const quality = this.queryQuality(whereClause);

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

  private getWhereClause(timeRange: 'week' | 'month' | 'all-time'): string {
    if (timeRange === 'all-time') return '1=1';
    
    const date = new Date();
    if (timeRange === 'week') {
      date.setDate(date.getDate() - 7);
    } else if (timeRange === 'month') {
      date.setMonth(date.getMonth() - 1);
    }
    
    return `created_at >= '${date.toISOString()}'`;
  }

  private queryUsage(whereClause: string): any {
    const total = this.db!.prepare(`SELECT count(*) as count FROM consultations WHERE ${whereClause}`).get() as any;
    const dateRange = this.db!.prepare(`SELECT min(created_at) as start, max(created_at) as end FROM consultations WHERE ${whereClause}`).get() as any;
    const activeDays = this.db!.prepare(`SELECT count(distinct date(created_at)) as count FROM consultations WHERE ${whereClause}`).get() as any;
    const byState = this.db!.prepare(`SELECT state, count(*) as count FROM consultations WHERE ${whereClause} GROUP BY state`).all() as any[];

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

  private queryPerformance(whereClause: string): any {
    const durations = this.db!.prepare(`SELECT duration_ms FROM consultations WHERE ${whereClause} AND state = 'complete' ORDER BY duration_ms`).all() as any[];
    
    if (durations.length === 0) {
      return { p50: 0, p95: 0, p99: 0, avgDuration: 0, fastest: { id: '', durationMs: 0 }, slowest: { id: '', durationMs: 0 } };
    }

    const getPercentile = (p: number) => durations[Math.floor(durations.length * p)].duration_ms;
    const avg = durations.reduce((sum, d) => sum + d.duration_ms, 0) / durations.length;
    
    const fastest = this.db!.prepare(`SELECT id, duration_ms FROM consultations WHERE ${whereClause} AND state = 'complete' ORDER BY duration_ms ASC LIMIT 1`).get() as any;
    const slowest = this.db!.prepare(`SELECT id, duration_ms FROM consultations WHERE ${whereClause} AND state = 'complete' ORDER BY duration_ms DESC LIMIT 1`).get() as any;

    return {
      p50: getPercentile(0.5),
      p95: getPercentile(0.95),
      p99: getPercentile(0.99),
      avgDuration: Math.round(avg),
      fastest: { id: fastest.id, durationMs: fastest.duration_ms },
      slowest: { id: slowest.id, durationMs: slowest.duration_ms }
    };
  }

  private queryCost(whereClause: string): any {
    const totals = this.db!.prepare(`SELECT sum(total_cost) as usd, sum(total_tokens) as tokens, count(*) as count FROM consultations WHERE ${whereClause}`).get() as any;
    
    const byProviderRows = this.db!.prepare(`
      SELECT ca.provider, sum(c.total_cost / (SELECT count(*) FROM consultation_agents WHERE consultation_id = c.id)) as cost, 
             sum(c.total_tokens / (SELECT count(*) FROM consultation_agents WHERE consultation_id = c.id)) as tokens
      FROM consultations c
      JOIN consultation_agents ca ON c.id = ca.consultation_id
      WHERE ${whereClause}
      GROUP BY ca.provider
    `).all() as any[];

    const byProvider: any = {};
    byProviderRows.forEach(r => {
      byProvider[r.provider] = { cost: Number(r.cost.toFixed(4)), tokens: Math.round(r.tokens) };
    });

    const mostExpensive = this.db!.prepare(`SELECT id, total_cost FROM consultations WHERE ${whereClause} ORDER BY total_cost DESC LIMIT 1`).get() as any;
    const cheapest = this.db!.prepare(`SELECT id, total_cost FROM consultations WHERE ${whereClause} ORDER BY total_cost ASC LIMIT 1`).get() as any;

    return {
      total: Number((totals.usd || 0).toFixed(2)),
      avgPerConsultation: totals.count > 0 ? Number(((totals.usd || 0) / totals.count).toFixed(4)) : 0,
      totalTokens: totals.tokens || 0,
      byProvider,
      mostExpensive: mostExpensive ? { id: mostExpensive.id, cost: mostExpensive.total_cost } : { id: '', cost: 0 },
      cheapest: cheapest ? { id: cheapest.id, cost: cheapest.total_cost } : { id: '', cost: 0 }
    };
  }

  private queryQuality(whereClause: string): any {
    const stats = this.db!.prepare(`
      SELECT avg(confidence) as avg_conf,
             count(CASE WHEN confidence >= 0.85 THEN 1 END) as high,
             count(CASE WHEN confidence < 0.70 THEN 1 END) as low,
             sum(has_dissent) as with_dissent
      FROM consultations WHERE ${whereClause} AND state = 'complete'
    `).get() as any;

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
