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
/**
 * ConsultLogger - persists consultation results for analytics
 * Saves both JSON (full result) and Markdown (summary) and maintains
 * a monthly index for fast stats queries.
 */
class ConsultLogger {
    constructor() {
        this.logDir = path.join(os.homedir(), '.llm-conclave', 'consult-logs');
    }
    /**
     * Persist a consultation result to disk.
     * Returns the paths written for downstream use or debugging.
     */
    async log(result) {
        await this.ensureLogDir();
        const jsonPath = path.join(this.logDir, `${result.consultation_id}.json`);
        const markdownPath = path.join(this.logDir, `${result.consultation_id}.md`);
        await fs.promises.writeFile(jsonPath, JSON.stringify(result, null, 2), 'utf-8');
        await fs.promises.writeFile(markdownPath, this.formatMarkdown(result), 'utf-8');
        const indexPath = await this.updateMonthlyIndex(result);
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
            id: result.consultation_id,
            timestamp: result.timestamp,
            question: result.question,
            duration_ms: result.duration_ms,
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
    /**
     * Build a Markdown summary suitable for quick review.
     */
    formatMarkdown(result) {
        const date = new Date(result.timestamp);
        const confidencePercent = (result.confidence * 100).toFixed(0);
        const output = [];
        output.push('# Consultation Summary');
        output.push('');
        output.push(`**Question:** ${result.question}`);
        output.push(`**Date:** ${date.toLocaleString()}`);
        output.push(`**Confidence:** ${confidencePercent}%`);
        output.push('');
        output.push('## Consensus');
        output.push('');
        output.push(result.consensus);
        output.push('');
        output.push('## Recommendation');
        output.push('');
        output.push(result.recommendation);
        output.push('');
        output.push('## Agent Perspectives');
        output.push('');
        for (const perspective of result.perspectives) {
            output.push(`### ${perspective.agent} (${perspective.model})`);
            output.push('');
            output.push(perspective.opinion);
            output.push('');
        }
        if (result.concerns.length > 0) {
            output.push('## Concerns Raised');
            output.push('');
            for (const concern of result.concerns) {
                output.push(`- ${concern}`);
            }
            output.push('');
        }
        if (result.dissent.length > 0) {
            output.push('## Dissenting Views');
            output.push('');
            for (const dissent of result.dissent) {
                output.push(`- ${dissent}`);
            }
            output.push('');
        }
        output.push('---');
        output.push('');
        output.push(`**Cost:** $${result.cost.usd.toFixed(4)} | ` +
            `**Duration:** ${(result.duration_ms / 1000).toFixed(1)}s | ` +
            `**Tokens:** ${result.cost.tokens.total.toLocaleString()}`);
        return output.join('\n');
    }
    getMonthString(timestamp) {
        const date = new Date(timestamp);
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        return `${year}-${month}`;
    }
}
exports.default = ConsultLogger;
