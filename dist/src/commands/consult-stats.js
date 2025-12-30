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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createConsultStatsCommand = createConsultStatsCommand;
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const StatsQuery_1 = require("../consult/analytics/StatsQuery");
const AnalyticsIndexer_1 = require("../consult/analytics/AnalyticsIndexer");
const path = __importStar(require("path"));
const os = __importStar(require("os"));
/**
 * consult-stats command - Display consultation usage analytics
 */
function createConsultStatsCommand() {
    const cmd = new commander_1.Command('consult-stats');
    cmd
        .description('Display consultation usage, performance, and cost analytics')
        .option('--week', 'Show stats for the last 7 days')
        .option('--month [YYYY-MM]', 'Show stats for specific month (e.g., 2025-12) or last 30 days if no value')
        .option('--all-time', 'Show all-time stats (default)')
        .option('--json', 'Output raw JSON metrics')
        .option('--rebuild-index', 'Rebuild the analytics index from JSONL logs')
        .action(async (options) => {
        const logDir = path.join(os.homedir(), '.llm-conclave', 'consult-logs');
        const dbPath = path.join(os.homedir(), '.llm-conclave', 'consult-analytics.db');
        if (options.rebuildIndex) {
            console.log(chalk_1.default.cyan('Rebuilding analytics index...'));
            const indexer = new AnalyticsIndexer_1.AnalyticsIndexer(dbPath);
            indexer.rebuildIndex(logDir);
            indexer.close();
            return;
        }
        // Fix Issue #10: Support --month YYYY-MM for specific month filtering
        let timeRange = 'all-time';
        if (options.week) {
            timeRange = 'week';
        }
        else if (options.month !== undefined) {
            // If --month has a value and matches YYYY-MM format, use it
            if (typeof options.month === 'string' && /^\d{4}-\d{2}$/.test(options.month)) {
                timeRange = options.month; // Specific month like "2025-12"
            }
            else {
                timeRange = 'month'; // Rolling 30 days (backward compatible)
            }
        }
        const query = new StatsQuery_1.StatsQuery(dbPath);
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
function displayDashboard(metrics, timeRange) {
    if (metrics.totalConsultations === 0) {
        console.log(chalk_1.default.yellow('\n📭 No consultations found.\n'));
        console.log('Run your first consultation:');
        console.log(chalk_1.default.cyan('  llm-conclave consult "Your question here"\n'));
        return;
    }
    const title = `LLM Conclave Consult Stats (${timeRange})`;
    // Fix Issue #13: Dynamic dashboard width based on terminal size
    const width = Math.max(60, Math.min(process.stdout.columns || 80, 80));
    console.log(chalk_1.default.cyan('┌' + '─'.repeat(width - 2) + '┐'));
    console.log(chalk_1.default.cyan('│  ') + chalk_1.default.bold(title.padEnd(width - 6)) + chalk_1.default.cyan('  │'));
    console.log(chalk_1.default.cyan('├' + '─'.repeat(width - 2) + '┤'));
    // Usage Metrics
    console.log(chalk_1.default.cyan('│  ') + chalk_1.default.bold('Usage Metrics'.padEnd(width - 6)) + chalk_1.default.cyan('  │'));
    console.log(chalk_1.default.cyan('│  ') + `• Total Consultations: ${metrics.totalConsultations}`.padEnd(width - 6) + chalk_1.default.cyan('  │'));
    const activePercent = Math.round((metrics.activeDays / Math.max(1, metrics.dateRange.totalDays)) * 100);
    console.log(chalk_1.default.cyan('│  ') + `• Active Days: ${metrics.activeDays}/${metrics.dateRange.totalDays} (${activePercent}%)`.padEnd(width - 6) + chalk_1.default.cyan('  │'));
    console.log(chalk_1.default.cyan('│  ') + `• Avg per Day: ${metrics.avgPerDay}`.padEnd(width - 6) + chalk_1.default.cyan('  │'));
    const completedPercent = Math.round((metrics.byState.completed / metrics.totalConsultations) * 100);
    console.log(chalk_1.default.cyan('│  ') + `• Completed: ${metrics.byState.completed} (${completedPercent}%)`.padEnd(width - 6) + chalk_1.default.cyan('  │'));
    console.log(chalk_1.default.cyan('│  ') + `• Aborted: ${metrics.byState.aborted}`.padEnd(width - 6) + chalk_1.default.cyan('  │'));
    console.log(chalk_1.default.cyan('├' + '─'.repeat(width - 2) + '┤'));
    // Performance Metrics
    console.log(chalk_1.default.cyan('│  ') + chalk_1.default.bold('Performance Metrics'.padEnd(width - 6)) + chalk_1.default.cyan('  │'));
    console.log(chalk_1.default.cyan('│  ') + `• Median Response Time: ${(metrics.performance.p50 / 1000).toFixed(1)}s (p50)`.padEnd(width - 6) + chalk_1.default.cyan('  │'));
    console.log(chalk_1.default.cyan('│  ') + `• p95 Response Time: ${(metrics.performance.p95 / 1000).toFixed(1)}s`.padEnd(width - 6) + chalk_1.default.cyan('  │'));
    console.log(chalk_1.default.cyan('│  ') + `• p99 Response Time: ${(metrics.performance.p99 / 1000).toFixed(1)}s`.padEnd(width - 6) + chalk_1.default.cyan('  │'));
    console.log(chalk_1.default.cyan('│  ') + `• Fastest: ${(metrics.performance.fastest.durationMs / 1000).toFixed(1)}s`.padEnd(width - 6) + chalk_1.default.cyan('  │'));
    console.log(chalk_1.default.cyan('│  ') + `• Slowest: ${(metrics.performance.slowest.durationMs / 1000).toFixed(1)}s`.padEnd(width - 6) + chalk_1.default.cyan('  │'));
    console.log(chalk_1.default.cyan('├' + '─'.repeat(width - 2) + '┤'));
    // Cost Metrics
    console.log(chalk_1.default.cyan('│  ') + chalk_1.default.bold('Cost Metrics'.padEnd(width - 6)) + chalk_1.default.cyan('  │'));
    console.log(chalk_1.default.cyan('│  ') + `• Total Cost: $${metrics.cost.total.toFixed(2)}`.padEnd(width - 6) + chalk_1.default.cyan('  │'));
    console.log(chalk_1.default.cyan('│  ') + `• Avg per Consultation: $${metrics.cost.avgPerConsultation.toFixed(3)}`.padEnd(width - 6) + chalk_1.default.cyan('  │'));
    console.log(chalk_1.default.cyan('│  ') + `• Total Tokens: ${metrics.cost.totalTokens.toLocaleString()}`.padEnd(width - 6) + chalk_1.default.cyan('  │'));
    console.log(chalk_1.default.cyan('│  ') + '• By Provider:'.padEnd(width - 6) + chalk_1.default.cyan('  │'));
    // Fix Issue #12: Calculate shares to sum to exactly 100%
    const providerEntries = Object.entries(metrics.cost.byProvider);
    const shares = providerEntries.map(([_, data]) => {
        const provData = data;
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
        const provData = data;
        const share = roundedShares[index];
        console.log(chalk_1.default.cyan('│  ') + `    - ${provider}: $${provData.cost.toFixed(2)} (${share}%)`.padEnd(width - 6) + chalk_1.default.cyan('  │'));
    });
    console.log(chalk_1.default.cyan('├' + '─'.repeat(width - 2) + '┤'));
    // Quality Metrics
    console.log(chalk_1.default.cyan('│  ') + chalk_1.default.bold('Quality Metrics'.padEnd(width - 6)) + chalk_1.default.cyan('  │'));
    console.log(chalk_1.default.cyan('│  ') + `• Avg Confidence: ${metrics.quality.avgConfidence}%`.padEnd(width - 6) + chalk_1.default.cyan('  │'));
    console.log(chalk_1.default.cyan('│  ') + `• High Confidence (≥85%): ${metrics.quality.highConfidence}`.padEnd(width - 6) + chalk_1.default.cyan('  │'));
    console.log(chalk_1.default.cyan('│  ') + `• Low Confidence (<70%): ${metrics.quality.lowConfidence}`.padEnd(width - 6) + chalk_1.default.cyan('  │'));
    console.log(chalk_1.default.cyan('└' + '─'.repeat(width - 2) + '┘'));
    // Success Criteria Validation
    console.log('\n' + chalk_1.default.bold('📊 Progress toward Success Criteria:'));
    if (metrics.totalConsultations >= 150) {
        console.log(chalk_1.default.green('• Usage: 150+ consultations ✅'));
    }
    else {
        console.log(`• Usage: ${metrics.totalConsultations}/150 consultations (${Math.round((metrics.totalConsultations / 150) * 100)}%)`);
    }
    if (metrics.performance.p50 < 15000) {
        console.log(chalk_1.default.green('• Speed: median < 15s ✅'));
    }
    else {
        console.log(chalk_1.default.yellow(`• Speed: ${(metrics.performance.p50 / 1000).toFixed(1)}s median (target: <15s)`));
    }
    if (metrics.cost.total < 20) {
        console.log(chalk_1.default.green('• Cost: < $20 total ✅'));
    }
    else {
        console.log(chalk_1.default.red(`• Cost: $${metrics.cost.total.toFixed(2)}/$20.00 budget`));
    }
    // Fix Issue #11: Add dissent rate quality check
    const dissentRate = metrics.totalConsultations > 0
        ? (metrics.quality.withDissent / metrics.totalConsultations)
        : 0;
    if (dissentRate > 0.4) {
        console.log(chalk_1.default.yellow(`⚠️ Quality: High dissent rate (${Math.round(dissentRate * 100)}%) - agents frequently disagree`));
    }
    else if (dissentRate > 0) {
        console.log(chalk_1.default.green(`• Quality: Healthy dissent rate (${Math.round(dissentRate * 100)}%) ✅`));
    }
    console.log('');
}
