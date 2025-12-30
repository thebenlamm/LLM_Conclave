"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const ArtifactTransformer_1 = require("../consult/artifacts/ArtifactTransformer");
const MarkdownFormatter_1 = require("../consult/formatting/MarkdownFormatter");
const AnalyticsIndexer_1 = require("../consult/analytics/AnalyticsIndexer");
/**
 * ConsultLogger - persists consultation results for analytics
 * Saves both JSON (full result) and Markdown (summary) and maintains
 * a monthly index for fast stats queries.
 */
class ConsultLogger {
    constructor() {
        this.logDir = path.join(os.homedir(), '.llm-conclave', 'consult-logs');
        this.indexer = new AnalyticsIndexer_1.AnalyticsIndexer();
    }
    /**
     * Persist a consultation result to disk.
     * Returns the paths written for downstream use or debugging.
     */
    async log(result) {
        await this.ensureLogDir();
        const jsonResult = ArtifactTransformer_1.ArtifactTransformer.consultationResultToJSON(result);
        const jsonPath = path.join(this.logDir, `${result.consultationId}.json`);
        const markdownPath = path.join(this.logDir, `${result.consultationId}.md`);
        await fs.promises.writeFile(jsonPath, JSON.stringify(jsonResult, null, 2), 'utf-8');
        const formatter = new MarkdownFormatter_1.MarkdownFormatter();
        await fs.promises.writeFile(markdownPath, formatter.format(result), 'utf-8');
        const indexPath = await this.updateMonthlyIndex(result);
        // Index for SQLite analytics (Write-Through Pattern from Epic 3, Story 3.1)
        this.indexer.indexConsultation(result);
        return { jsonPath, markdownPath, indexPath };
    }
    async ensureLogDir() {
        await fs.promises.mkdir(this.logDir, { recursive: true });
    }
    /**
     * Update (or create) the monthly index file for the consultation.
     */
    async updateMonthlyIndex(result) {
        const month = this.getMonthString(result.timestamp);
        const indexPath = path.join(this.logDir, `index-${month}.json`);
        let index = { month, consultations: [] };
        if (fs.existsSync(indexPath)) {
            try {
                const existing = await fs.promises.readFile(indexPath, 'utf-8');
                index = JSON.parse(existing);
            }
            catch {
                // If index is corrupted, reset it with the current month metadata.
                index = { month, consultations: [] };
            }
        }
        const entry = {
            id: result.consultationId,
            timestamp: result.timestamp,
            question: result.question,
            duration_ms: result.durationMs,
            cost_usd: result.cost.usd,
            confidence: result.confidence
        };
        // Replace existing entry with same id if present to avoid duplicates.
        index.consultations = index.consultations.filter(c => c.id !== entry.id);
        index.consultations.push(entry);
        // Keep index ordered by timestamp ascending for readability.
        index.consultations.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        await fs.promises.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
        return indexPath;
    }
    getMonthString(timestamp) {
        const date = new Date(timestamp);
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        return `${year}-${month}`;
    }
}
exports.default = ConsultLogger;
