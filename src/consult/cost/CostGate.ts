import { CostEstimate } from './CostEstimator';
// import inquirer from 'inquirer'; // Dynamic import used instead
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigPaths } from '../../utils/ConfigPaths';

export type ConsentResult = 'approved' | 'denied' | 'always';

/**
 * CostGate - User consent and cost control for consultations
 *
 * Implements Epic 2, Story 1: User Consent Flow with Cost Gate
 * - Prompts user for approval when cost exceeds threshold
 * - Allows setting auto-approval threshold
 * - Saves preferences to global config
 */
export class CostGate {
  /**
   * Check if user consent is needed based on config threshold
   *
   * @param estimate - Cost estimate from CostEstimator
   * @param config - Resolved configuration object
   * @returns true if user prompt needed, false if auto-approved
   */
  shouldPromptUser(estimate: CostEstimate, config: any): boolean {
    const threshold = config?.consult?.alwaysAllowUnder || 0.50;
    return estimate.estimatedCostUsd > threshold;
  }

  /**
   * Prompt user for consent with cost details
   *
   * @param estimate - Cost estimate with token breakdown
   * @param agents - Agent count for display
   * @param rounds - Round count for display
   * @returns 'approved' | 'denied' | 'always'
   */
  async getUserConsent(
    estimate: CostEstimate,
    agents: number = 3,
    rounds: number = 4
  ): Promise<ConsentResult> {
    // Auto-approve in MCP mode (no stdin available for prompts)
    if (process.env.LLM_CONCLAVE_MCP === '1') {
      console.error(`[MCP] Auto-approving cost: $${estimate.estimatedCostUsd.toFixed(4)}`);
      return 'approved';
    }

    console.log(chalk.yellow('\n💰 Cost Estimate'));
    console.log(chalk.gray('━'.repeat(50)));
    console.log(`Estimated cost: ${chalk.yellow(`$${estimate.estimatedCostUsd.toFixed(4)}`)}`);
    console.log(`- Input tokens: ${estimate.inputTokens.toLocaleString()}`);
    console.log(`- Expected output tokens: ~${estimate.outputTokens.toLocaleString()}`);
    console.log(`- ${agents} agents × ${rounds} rounds`);
    console.log(chalk.gray('━'.repeat(50)) + '\n');

    const { default: inquirer } = await import('inquirer');

    const { consent } = await inquirer.prompt([
      {
        type: 'list',
        name: 'consent',
        message: 'Proceed with consultation?',
        choices: [
          { name: 'Yes', value: 'approved' },
          { name: 'No (cancel)', value: 'denied' },
          { name: 'Always (set auto-approve threshold)', value: 'always' }
        ],
        default: 'approved'
      }
    ]);

    if (consent === 'always') {
      // Prompt for threshold amount
      const { threshold } = await inquirer.prompt([
        {
          type: 'input',
          name: 'threshold',
          message: 'Auto-approve consultations under (USD):',
          default: estimate.estimatedCostUsd.toFixed(2),
          validate: (input: string) => {
            const num = parseFloat(input);
            if (isNaN(num) || num < 0) {
              return 'Please enter a valid positive number';
            }
            return true;
          }
        }
      ]);

      const thresholdAmount = parseFloat(threshold);
      await this.saveAutoApproveThreshold(thresholdAmount);
      console.log(chalk.green(`✓ Auto-approve threshold set to $${thresholdAmount.toFixed(2)}`));

      // After setting threshold, current consultation is approved
      return 'approved';
    }

    return consent;
  }

  /**
   * Save auto-approve threshold to global config
   *
   * @param amount - USD threshold amount
   */
  async saveAutoApproveThreshold(amount: number): Promise<void> {
    const configPath = ConfigPaths.globalConfig;

    // Ensure directory exists
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Read existing config or start with empty object
    let config: any = {};
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf-8');
        config = JSON.parse(content);
      } catch (error) {
        console.warn('Warning: Could not parse existing config, creating new one');
        config = {};
      }
    }

    // Merge new values
    if (!config.consult) {
      config.consult = {};
    }
    config.consult.alwaysAllowUnder = amount;

    // Atomic write: write to temp file then rename
    const tempPath = `${configPath}.tmp.${Date.now()}`;
    try {
      fs.writeFileSync(tempPath, JSON.stringify(config, null, 2), 'utf-8');
      fs.renameSync(tempPath, configPath);
    } catch (error: any) {
      // Clean up temp file if it exists
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      throw new Error(`Failed to save config atomically: ${error.message}`);
    }
  }

  /**
   * Display auto-approval message for consultations under threshold
   *
   * @param cost - Actual cost in USD
   */
  displayAutoApproved(cost: number): void {
    console.log(chalk.green(`💰 Estimated cost: $${cost.toFixed(4)} (auto-approved)`));
  }
}
