import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { ConsultationResult } from '../../types/consult';

// We will use better-sqlite3 for the indexer
// Note: better-sqlite3 needs to be installed: npm install better-sqlite3
import Database from 'better-sqlite3';

export class AnalyticsIndexer {
  private readonly dbPath: string;
  private db: Database.Database | null = null;

  constructor(dbPath?: string) {
    // Default database path: ~/.llm-conclave/consult-analytics.db
    this.dbPath = dbPath || path.join(os.homedir(), '.llm-conclave', 'consult-analytics.db');
    this.initDatabase();
  }

  /**
   * Initialize the SQLite database and create tables if they don't exist
   */
  private initDatabase(): void {
    try {
      // Ensure directory exists
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      this.db = new Database(this.dbPath);
      this.createTables();
    } catch (error: any) {
      console.error(`Failed to initialize analytics database: ${error.message}`);
      this.db = null;
    }
  }

  /**
   * Create database tables
   */
  private createTables(): void {
    if (!this.db) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS consultations (
        id TEXT PRIMARY KEY,
        question TEXT NOT NULL,
        mode TEXT NOT NULL,
        final_recommendation TEXT,
        confidence REAL,
        total_cost REAL,
        total_tokens INTEGER,
        duration_ms INTEGER,
        created_at TEXT NOT NULL,
        schema_version TEXT,
        state TEXT NOT NULL,
        has_dissent INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS consultation_agents (
        consultation_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        model TEXT NOT NULL,
        provider TEXT NOT NULL,
        FOREIGN KEY (consultation_id) REFERENCES consultations(id)
      );

      CREATE TABLE IF NOT EXISTS consultation_rounds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        consultation_id TEXT NOT NULL,
        round_number INTEGER NOT NULL,
        round_type TEXT NOT NULL,
        duration_ms INTEGER,
        tokens_used INTEGER,
        FOREIGN KEY (consultation_id) REFERENCES consultations(id)
      );

      CREATE INDEX IF NOT EXISTS idx_consultations_created_at ON consultations(created_at);
      CREATE INDEX IF NOT EXISTS idx_consultations_cost ON consultations(total_cost);
      CREATE INDEX IF NOT EXISTS idx_consultations_mode ON consultations(mode);
      CREATE INDEX IF NOT EXISTS idx_consultations_state ON consultations(state);
    `);
  }

  /**
   * Index a consultation result
   */
  public indexConsultation(result: ConsultationResult): void {
    if (!this.db) return;

    const insertConsultation = this.db.prepare(`
      INSERT OR REPLACE INTO consultations (
        id, question, mode, final_recommendation, confidence, 
        total_cost, total_tokens, duration_ms, created_at, schema_version, state, has_dissent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertAgent = this.db.prepare(`
      INSERT INTO consultation_agents (consultation_id, agent_id, model, provider)
      VALUES (?, ?, ?, ?)
    `);

    const insertRound = this.db.prepare(`
      INSERT INTO consultation_rounds (consultation_id, round_number, round_type, duration_ms, tokens_used)
      VALUES (?, ?, ?, ?, ?)
    `);

    // Use a transaction for atomic writes
    const transaction = this.db.transaction((res: ConsultationResult) => {
      // 1. Insert consultation
      insertConsultation.run(
        res.consultationId,
        res.question,
        res.mode,
        res.recommendation || null,
        res.confidence || 0,
        res.actualCost || res.estimatedCost || 0,
        res.cost.tokens.total,
        res.durationMs,
        res.timestamp,
        '1.0',
        res.state,
        (res.dissent && res.dissent.length > 0) ? 1 : 0
      );

      // 2. Clear and insert agents
      this.db?.prepare('DELETE FROM consultation_agents WHERE consultation_id = ?').run(res.consultationId);
      for (const agent of res.agents) {
        insertAgent.run(res.consultationId, agent.name, agent.model, agent.provider);
      }

      // 3. Clear and insert rounds
      this.db?.prepare('DELETE FROM consultation_rounds WHERE consultation_id = ?').run(res.consultationId);
      
      // Round 1
      if (res.responses.round1) {
        const round1Tokens = res.responses.round1.reduce((sum, art) => sum + (res.agentResponses?.find(r => r.agentId === art.agentId)?.tokens.total || 0), 0);
        insertRound.run(res.consultationId, 1, 'independent', 0, round1Tokens); // Duration per round not explicitly tracked in top-level result yet
      }

      // Rounds 2-4
      if (res.responses.round2) {
        insertRound.run(res.consultationId, 2, 'synthesis', 0, 0);
      }
      if (res.responses.round3) {
        insertRound.run(res.consultationId, 3, 'cross_exam', 0, 0);
      }
      if (res.responses.round4) {
        insertRound.run(res.consultationId, 4, 'verdict', 0, 0);
      }
    });

    try {
      transaction(result);
    } catch (error: any) {
      console.error(`Failed to index consultation ${result.consultationId}: ${error.message}`);
    }
  }

  /**
   * Rebuild the index from JSONL files
   */
  public rebuildIndex(logDir: string): void {
    if (!this.db) return;

    try {
      // Clear existing data
      this.db.exec('DELETE FROM consultation_rounds; DELETE FROM consultation_agents; DELETE FROM consultations;');

      if (!fs.existsSync(logDir)) return;

      const files = fs.readdirSync(logDir).filter(f => f.endsWith('.json'));
      let indexedCount = 0;

      for (const file of files) {
        try {
          const filePath = path.join(logDir, file);
          const content = fs.readFileSync(filePath, 'utf8');
          const data = JSON.parse(content);
          
          // We need to map snake_case JSON to camelCase TypeScript if possible, 
          // but for indexing we can just use the fields directly if we know them.
          // Actually, using ArtifactTransformer would be better if available.
          // For now, let's assume we can parse it.
          
          // Basic mapping for indexing (this might need to be more robust)
          const result: any = {
            consultationId: data.consultation_id,
            question: data.question,
            mode: data.mode,
            recommendation: data.recommendation,
            confidence: data.confidence,
            actualCost: data.actual_cost,
            estimatedCost: data.estimated_cost,
            cost: data.cost,
            durationMs: data.duration_ms,
            timestamp: data.timestamp,
            state: data.state,
            agents: data.agents,
            responses: data.responses || {},
            dissent: data.dissent || []
          };

          this.indexConsultation(result as ConsultationResult);
          indexedCount++;
          if (indexedCount % 10 === 0) {
            process.stdout.write(`Rebuilding index... [${indexedCount}/${files.length}] consultations\r`);
          }
        } catch (err: any) {
          console.error(`Failed to index file ${file}: ${err.message}`);
        }
      }
      console.log(`\n✅ Index rebuilt successfully. [${indexedCount}] consultations indexed.`);
    } catch (error: any) {
      console.error(`Failed to rebuild index: ${error.message}`);
    }
  }

  /**
   * Close the database connection
   */
  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}