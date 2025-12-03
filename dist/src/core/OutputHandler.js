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
const fsPromises = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
/**
 * Handles output formatting and file writing
 */
class OutputHandler {
    /**
     * Save conversation results to files (async with parallel writes)
     * @param {Object} result - Conversation result object
     * @param {string} outputDir - Directory to save files (default: outputs/)
     * @returns {Object} - Paths to created files and formatted content
     */
    static async saveResults(result, outputDir = 'outputs') {
        // Create output directory if it doesn't exist (async)
        await fsPromises.mkdir(outputDir, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const baseFilename = `conclave-${timestamp}`;
        // Format content ONCE (reuse for console output)
        const transcriptContent = this.formatTranscript(result);
        const consensusContent = this.formatConsensus(result);
        const jsonContent = JSON.stringify(result, null, 2);
        // Define file paths
        const transcriptPath = path.join(outputDir, `${baseFilename}-transcript.md`);
        const consensusPath = path.join(outputDir, `${baseFilename}-consensus.md`);
        const jsonPath = path.join(outputDir, `${baseFilename}-full.json`);
        // Write all files in parallel (non-blocking)
        await Promise.all([
            fsPromises.writeFile(transcriptPath, transcriptContent),
            fsPromises.writeFile(consensusPath, consensusContent),
            fsPromises.writeFile(jsonPath, jsonContent)
        ]);
        return {
            transcript: transcriptPath,
            consensus: consensusPath,
            json: jsonPath,
            // Return formatted content to avoid duplicate formatting
            formattedTranscript: transcriptContent,
            formattedConsensus: consensusContent
        };
    }
    /**
     * Format the full conversation transcript as markdown
     * @param {Object} result - Conversation result
     * @returns {string} - Formatted transcript
     */
    static formatTranscript(result) {
        let output = `# LLM Conclave Transcript\n\n`;
        output += `**Task:** ${result.task}\n\n`;
        output += `**Rounds:** ${result.rounds}\n\n`;
        output += `**Consensus Reached:** ${result.consensusReached ? 'Yes' : 'No'}\n\n`;
        output += `**Timestamp:** ${new Date().toISOString()}\n\n`;
        output += `---\n\n`;
        for (const entry of result.conversationHistory) {
            // Detect new rounds (after initial task, every N agent messages)
            if (entry.speaker === 'System') {
                output += `## Initial Task\n\n`;
                output += `${entry.content}\n\n`;
            }
            else if (entry.speaker === 'Judge') {
                output += `### Judge's Guidance\n\n`;
                output += `${entry.content}\n\n`;
            }
            else {
                // Agent message
                const modelInfo = entry.model ? ` *(${entry.model})*` : '';
                output += `### ${entry.speaker}${modelInfo}\n\n`;
                output += `${entry.content}\n\n`;
                if (entry.error) {
                    output += `*[This agent encountered an error]*\n\n`;
                }
            }
            output += `---\n\n`;
        }
        return output;
    }
    /**
     * Format the consensus/final solution as markdown
     * @param {Object} result - Conversation result
     * @returns {string} - Formatted consensus
     */
    static formatConsensus(result) {
        let output = `# LLM Conclave - Final Solution\n\n`;
        output += `**Task:** ${result.task}\n\n`;
        output += `**Rounds:** ${result.rounds}\n\n`;
        output += `**Consensus Reached:** ${result.consensusReached ? 'Yes' : 'No (Final Vote)'}\n\n`;
        output += `**Timestamp:** ${new Date().toISOString()}\n\n`;
        output += `---\n\n`;
        output += `## Solution\n\n`;
        output += `${result.solution}\n\n`;
        output += `---\n\n`;
        output += `## Summary\n\n`;
        if (result.consensusReached) {
            output += `The agents reached consensus after ${result.rounds} round(s) of discussion. `;
            output += `Through collaborative deliberation, they converged on the solution presented above.\n`;
        }
        else {
            output += `The agents discussed for the maximum ${result.rounds} rounds without reaching full consensus. `;
            output += `The judge synthesized the final solution based on all perspectives shared during the discussion.\n`;
        }
        return output;
    }
    /**
     * Print a summary to console
     * @param {Object} result - Conversation result
     * @param {Object} filePaths - Paths to saved files
     */
    static printSummary(result, filePaths) {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`CONVERSATION COMPLETE`);
        console.log(`${'='.repeat(80)}\n`);
        console.log(`Task: ${result.task}`);
        console.log(`Rounds: ${result.rounds}`);
        console.log(`Consensus: ${result.consensusReached ? 'Reached' : 'Not reached (final vote conducted)'}\n`);
        console.log(`Files saved:`);
        console.log(`  - Full transcript: ${filePaths.transcript}`);
        console.log(`  - Consensus/solution: ${filePaths.consensus}`);
        console.log(`  - JSON data: ${filePaths.json}\n`);
        console.log(`Final Solution:`);
        console.log(`${'-'.repeat(80)}`);
        console.log(result.solution);
        console.log(`${'-'.repeat(80)}\n`);
    }
}
exports.default = OutputHandler;
