const fs = require('fs');
const path = require('path');

/**
 * Handles output formatting and file writing
 */
class OutputHandler {
  /**
   * Save conversation results to files
   * @param {Object} result - Conversation result object
   * @param {string} outputDir - Directory to save files (default: outputs/)
   * @returns {Object} - Paths to created files
   */
  static saveResults(result, outputDir = 'outputs') {
    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const baseFilename = `conclave-${timestamp}`;

    // Save full transcript
    const transcriptPath = path.join(outputDir, `${baseFilename}-transcript.md`);
    const transcriptContent = this.formatTranscript(result);
    fs.writeFileSync(transcriptPath, transcriptContent);

    // Save consensus/solution
    const consensusPath = path.join(outputDir, `${baseFilename}-consensus.md`);
    const consensusContent = this.formatConsensus(result);
    fs.writeFileSync(consensusPath, consensusContent);

    // Also save as JSON for programmatic access
    const jsonPath = path.join(outputDir, `${baseFilename}-full.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));

    return {
      transcript: transcriptPath,
      consensus: consensusPath,
      json: jsonPath
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

    let currentRound = 0;
    let messageCount = 0;

    for (const entry of result.conversationHistory) {
      // Detect new rounds (after initial task, every N agent messages)
      if (entry.speaker === 'System') {
        output += `## Initial Task\n\n`;
        output += `${entry.content}\n\n`;
      } else if (entry.speaker === 'Judge') {
        output += `### Judge's Guidance\n\n`;
        output += `${entry.content}\n\n`;
      } else {
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
    } else {
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

module.exports = OutputHandler;
