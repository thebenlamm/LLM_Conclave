import chalk from 'chalk';
import ora from 'ora';
import { EventBus } from '../core/EventBus';

/**
 * Handles real-time console output for Consult Mode
 */
export class ConsultConsoleLogger {
  private eventBus: EventBus;
  private spinners: Map<string, any> = new Map();

  constructor() {
    this.eventBus = EventBus.getInstance();
  }

  /**
   * Start listening to events and logging to console
   */
  public start(): void {
    // Consultation Started
    this.eventBus.on('consultation:started', (event: any) => {
      const payload = event?.payload ?? event;
      console.log(chalk.bold.blue(`
🔍 Starting consultation with ${payload.agents.length} experts...`));
    });

    // Cost Estimated
    this.eventBus.on('consultation:cost_estimated', (event: any) => {
      const payload = event?.payload ?? event;
      console.log(chalk.cyan(`💰 Estimated Cost: $${payload.estimated_cost.toFixed(4)}`));
      console.log(chalk.gray(`   (Input: ${payload.input_tokens}, Expected Output: ${payload.expected_output_tokens})`));
    });

    // User Consent
    this.eventBus.on('consultation:user_consent', (event: any) => {
      const payload = event?.payload ?? event;
      if (payload.approved) {
        console.log(chalk.green(`✅ Approved. Starting execution...`));
      }
    });

    // Agent Thinking
    this.eventBus.on('agent:thinking', (event: any) => {
      const payload = event?.payload ?? event;
      const spinner = ora(chalk.yellow(`⚡ ${payload.agent_name} thinking...`)).start();
      this.spinners.set(payload.agent_name, spinner);
    });

    // Agent Completed
    this.eventBus.on('agent:completed', (event: any) => {
      const payload = event?.payload ?? event;
      const spinner = this.spinners.get(payload.agent_name);
      if (spinner) {
        spinner.succeed(chalk.green(`✅ ${payload.agent_name} completed (${(payload.duration_ms / 1000).toFixed(1)}s)`));
        this.spinners.delete(payload.agent_name);
      } else {
        console.log(chalk.green(`✅ ${payload.agent_name} completed (${(payload.duration_ms / 1000).toFixed(1)}s)`));
      }
    });

    // Round Completed
    this.eventBus.on('round:completed', (event: any) => {
      const payload = event?.payload ?? event;
      console.log(chalk.bold.white(`
📋 Round ${payload.round_number} complete
`));
    });

    // Consultation Completed
    this.eventBus.on('consultation:completed', (event: any) => {
      const payload = event?.payload ?? event;
      console.log(chalk.bold.magenta(`
✨ Consultation complete
`));
    });

    // Error handling?
    // TODO: Add error event listener
  }

  /**
   * Stop listening (cleanup)
   */
  public stop(): void {
    // In a real EventBus, we'd want to unsubscribe.
    // For now we assume the process exits or we rely on weak refs (unlikely).
    // EventBus implementation in this codebase seems simple.
    // We can implement 'off' if EventBus supports it.
  }
}
