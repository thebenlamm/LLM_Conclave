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
      this.runMigrations();
      this.createTables();
    } catch (error: any) {
      console.error(`Failed to initialize analytics database: ${error.message}`);
      this.db = null;
    }
  }

  /**
   * Run pending database migrations
   */
  private runMigrations(): void {
    if (!this.db) return;

    // Create schema_version table if it doesn't exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);

    // Get current schema version
    const currentVersion = this.db.prepare('SELECT MAX(version) as version FROM schema_version').get() as any;
    const version = currentVersion?.version || 0;

    // Define migrations
    // Fix Issue #2: Robust path resolution for both ts-node (dev) and compiled (prod)
    // In development (ts-node): __dirname = /path/to/project/src/consult/analytics
    // In production (compiled): __dirname = /path/to/project/dist/src/consult/analytics
    const migrationsPath = __dirname.includes('/dist/')
      ? path.join(__dirname, '../../../../src/consult/analytics/schemas/migrations') // Compiled: go back to root, then to src
      : path.join(__dirname, 'schemas/migrations'); // ts-node: relative to current dir

    const migrations = [
      {
        version: 1,
        sql: fs.readFileSync(path.join(migrationsPath, '001_initial_schema.sql'), 'utf8')
      },
      {
        version: 2,
        sql: fs.readFileSync(path.join(migrationsPath, '002_debate_value_metrics.sql'), 'utf8')
      },
      {
        version: 3,
        sql: fs.readFileSync(path.join(migrationsPath, '003_project_context.sql'), 'utf8')
      }
      // Future migrations go here:
      // { version: 2, sql: fs.readFileSync(path.join(migrationsPath, '002_...')) }
    ];

    // Run pending migrations
    for (const migration of migrations) {
      if (migration.version > version) {
        try {
          this.db.exec(migration.sql);
          this.db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(
            migration.version,
            new Date().toISOString()
          );
          console.log(`✅ Applied migration ${migration.version}`);
        } catch (error: any) {
          console.error(`❌ Failed to apply migration ${migration.version}: ${error.message}`);
          throw error;
        }
      }
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
        has_dissent INTEGER DEFAULT 0,
        project_type TEXT,
        framework_detected TEXT,
        tech_stack TEXT,
        agents_changed_position INTEGER,
        total_agents INTEGER,
        change_rate REAL,
        avg_confidence_increase REAL,
        convergence_score REAL,
        semantic_comparison_cost REAL
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
      CREATE INDEX IF NOT EXISTS idx_consultations_project_type ON consultations(project_type);
      CREATE INDEX IF NOT EXISTS idx_consultations_framework ON consultations(framework_detected);
    `);
  }

  /**
   * Check available disk space
   */
  private checkDiskSpace(): void {
    try {
      // Fix Issue #8: Explicit disk space check before large operations
      const stats = fs.statfsSync(path.dirname(this.dbPath));
      const availableBytes = stats.bavail * stats.bsize;
      const minRequired = 10 * 1024 * 1024; // 10MB minimum

      if (availableBytes < minRequired) {
        throw new Error(`Insufficient disk space for indexing: ${Math.round(availableBytes / 1024 / 1024)}MB available, ${Math.round(minRequired / 1024 / 1024)}MB required`);
      }
    } catch (error: any) {
      // statfsSync not available on all platforms, fail gracefully
      if (error.code !== 'ENOSYS') {
        console.warn(`Unable to check disk space: ${error.message}`);
      }
    }
  }

  /**
   * Index a consultation result
   */
  public indexConsultation(result: ConsultationResult): void {
    if (!this.db) return;

    // Check disk space before large write operations
    this.checkDiskSpace();

    const insertConsultation = this.db.prepare(`
      INSERT OR REPLACE INTO consultations (
        id, question, mode, final_recommendation, confidence, 
        total_cost, total_tokens, duration_ms, created_at, schema_version, state, has_dissent,
        project_type, framework_detected, tech_stack,
        agents_changed_position, total_agents, change_rate, avg_confidence_increase,
        convergence_score, semantic_comparison_cost
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertAgent = this.db.prepare(`
      INSERT INTO consultation_agents (consultation_id, agent_id, model, provider)
      VALUES (?, ?, ?, ?)
    `);

    const insertRound = this.db.prepare(`
      INSERT INTO consultation_rounds (consultation_id, round_number, round_type, duration_ms, tokens_used)
      VALUES (?, ?, ?, ?, ?)
    `);

    // Prepare delete statements (will be executed inside transaction)
    const deleteAgents = this.db.prepare('DELETE FROM consultation_agents WHERE consultation_id = ?');
    const deleteRounds = this.db.prepare('DELETE FROM consultation_rounds WHERE consultation_id = ?');

    // Use a transaction for atomic writes - all deletes and inserts happen atomically
    const transaction = this.db.transaction((res: ConsultationResult) => {
      // 1. Insert consultation (with defensive checks for old/incomplete logs)
      insertConsultation.run(
        res.consultationId,
        res.question || '',
        res.mode || 'consensus', // Default mode for old logs
        res.recommendation || null,
        res.confidence || 0,
        res.actualCost || res.estimatedCost || 0,
        res.cost?.tokens?.total || 0, // Safe navigation for missing cost data
        res.durationMs || 0,
        res.timestamp,
        '1.0',
        res.state || 'complete', // Default state for old logs
        (res.dissent && res.dissent.length > 0) ? 1 : 0,
        res.projectContext?.projectType ?? null,
        res.projectContext?.frameworkDetected ?? null,
        res.projectContext?.techStack ? JSON.stringify(res.projectContext.techStack) : null,
        res.debateValueAnalysis?.agentsChangedPosition ?? null,
        res.debateValueAnalysis?.totalAgents ?? null,
        res.debateValueAnalysis?.changeRate ?? null,
        res.debateValueAnalysis?.avgConfidenceIncrease ?? null,
        res.debateValueAnalysis?.convergenceScore ?? null,
        res.debateValueAnalysis?.semanticComparisonCost ?? null
      );

      // 2. Clear and insert agents atomically (defensive check for old logs without agents array)
      deleteAgents.run(res.consultationId);
      if (res.agents && Array.isArray(res.agents)) {
        for (const agent of res.agents) {
          insertAgent.run(res.consultationId, agent.name, agent.model, agent.provider);
        }
      }

      // 3. Clear and insert rounds atomically
      deleteRounds.run(res.consultationId);

      // Round 1 - Fix Issue #10: Calculate tokens from agentResponses (defensive for old logs)
      if (res.responses && res.responses.round1) {
        const round1Tokens = res.responses.round1.reduce((sum, art) => {
          // Find matching agent response to get token count
          const agentResp = res.agentResponses?.find(r => r.agentId === art.agentId);
          return sum + (agentResp?.tokens?.total || 0);
        }, 0);
        insertRound.run(res.consultationId, 1, 'independent', 0, round1Tokens);
      }

      // Rounds 2-4 (defensive checks for old logs)
      if (res.responses && res.responses.round2) {
        insertRound.run(res.consultationId, 2, 'synthesis', 0, 0);
      }
      if (res.responses && res.responses.round3) {
        insertRound.run(res.consultationId, 3, 'cross_exam', 0, 0);
      }
      if (res.responses && res.responses.round4) {
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

          // Fix Issue #9: Validate JSON before parsing
          let data: any;
          try {
            data = JSON.parse(content);
          } catch (parseError: any) {
            console.error(`❌ Invalid JSON in ${file}: ${parseError.message}`);
            continue; // Skip this file
          }

          // Fix Issue #9: Validate required fields before indexing
          if (!data.consultation_id || !data.question || !data.timestamp) {
            console.error(`❌ Missing required fields in ${file} (needs: consultation_id, question, timestamp)`);
            continue; // Skip this file
          }

          // We need to map snake_case JSON to camelCase TypeScript if possible,
          // but for indexing we can just use the fields directly if we know them.
          // Actually, using ArtifactTransformer would be better if available.
          // For now, let's assume we can parse it.

          // Basic mapping for indexing (this might need to be more robust)
          const result: any = {
            consultationId: data.consultation_id,
            question: data.question,
            mode: data.mode || 'consensus', // Default for old logs
            recommendation: data.recommendation,
            confidence: data.confidence,
            actualCost: data.actual_cost,
            estimatedCost: data.estimated_cost,
            cost: data.cost,
            durationMs: data.duration_ms,
            timestamp: data.timestamp,
            state: data.state || 'complete', // Default for old logs
            agents: data.agents || [],
            responses: data.responses || {},
            dissent: data.dissent || [],
            agentResponses: data.agent_responses || [],
            projectContext: data.project_context
              ? {
                  projectType: data.project_context.project_type,
                  frameworkDetected: data.project_context.framework_detected,
                  frameworkVersion: data.project_context.framework_version,
                  architecturePattern: data.project_context.architecture_pattern,
                  techStack: {
                    stateManagement: data.project_context.tech_stack?.state_management ?? null,
                    styling: data.project_context.tech_stack?.styling ?? null,
                    testing: data.project_context.tech_stack?.testing ?? [],
                    api: data.project_context.tech_stack?.api ?? null,
                    database: data.project_context.tech_stack?.database ?? null,
                    orm: data.project_context.tech_stack?.orm ?? null,
                    cicd: data.project_context.tech_stack?.cicd ?? null
                  },
                  indicatorsFound: data.project_context.indicators_found ?? [],
                  documentationUsed: data.project_context.documentation_used ?? [],
                  biasApplied: data.project_context.bias_applied ?? false
                }
              : undefined
          };

          this.indexConsultation(result as ConsultationResult);
          indexedCount++;
          if (indexedCount % 10 === 0) {
            process.stdout.write(`Rebuilding index... [${indexedCount}/${files.length}] consultations\r`);
          }
        } catch (err: any) {
          // Generic error (not JSON parse or validation)
          console.error(`❌ Failed to index ${file}: ${err.message}`);
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
