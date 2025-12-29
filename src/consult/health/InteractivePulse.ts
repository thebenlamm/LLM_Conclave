import inquirer from 'inquirer';
import chalk from 'chalk';

export interface AgentStatus {
  name: string;
  elapsedSeconds: number;
  startTime: Date;
}

export class InteractivePulse {
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private startTimes: Map<string, Date> = new Map();

  /**
   * Start pulse timer for an agent
   * @param agentName Name of the agent being executed
   * @param callback Function to call when 60s elapsed
   */
  startTimer(agentName: string, callback: () => void): void {
    // If timer already exists, don't overwrite start time, just reset timer?
    // Actually, startTimer implies starting a new tracking period or continuation.
    // If it's a new start, we set start time.
    // If it's a continuation (recursive call), we keep original start time?
    // The story says "track elapsed time". Elapsed time is total time since START.
    // So if we recursively call startTimer, we probably shouldn't reset startTime if it exists?
    // But the callback logic in story implies we just call startTimer again.
    
    // Let's look at the requirement: "Elapsed time tracking per agent".
    // If I restart timer, I want to keep the ORIGINAL start time.
    if (!this.startTimes.has(agentName)) {
        this.startTimes.set(agentName, new Date());
    }
    
    // Clear existing timer if any (safe restart)
    if (this.timers.has(agentName)) {
        clearTimeout(this.timers.get(agentName)!);
    }

    const timerId = setTimeout(callback, 60000); // 60 seconds
    this.timers.set(agentName, timerId);
  }

  /**
   * Cancel pulse timer for completed agent
   * @param agentName Name of the agent
   */
  cancelTimer(agentName: string): void {
    const timerId = this.timers.get(agentName);
    if (timerId) {
      clearTimeout(timerId);
      this.timers.delete(agentName);
    }
    this.startTimes.delete(agentName);
  }

  /**
   * Get elapsed seconds for an agent
   * @param agentName Name of the agent
   * @returns Elapsed seconds
   */
  getElapsedSeconds(agentName: string): number {
    const startTime = this.startTimes.get(agentName);
    if (!startTime) return 0;
    return Math.floor((new Date().getTime() - startTime.getTime()) / 1000);
  }

  /**
   * Get all agents currently running with elapsed times
   * @returns Array of agent statuses
   */
  getRunningAgents(): AgentStatus[] {
    const statuses: AgentStatus[] = [];
    for (const [name, startTime] of this.startTimes.entries()) {
      statuses.push({
        name,
        elapsedSeconds: this.getElapsedSeconds(name),
        startTime
      });
    }
    // Filter for those that have been running at least close to 60s (or just all running?)
    // Story says: "All slow agents are listed... when multiple agents exceed 60s"
    // So we should return all running, but maybe the caller filters?
    // The docblock says "Get all agents currently running".
    // But the implementation in story example says: `return statuses.filter(s => s.elapsedSeconds >= 60);`
    // I will follow the story implementation.
    return statuses.filter(s => s.elapsedSeconds >= 60);
  }

  /**
   * Prompt user to continue waiting
   * @param agents Array of agents still running (>60s)
   * @returns true if user wants to continue, false to cancel
   */
  async promptUserToContinue(agents: AgentStatus[]): Promise<boolean> {
    if (agents.length === 0) return true;

    let message: string;
    if (agents.length === 1) {
      const agent = agents[0];
      message = chalk.yellow(
        `⏱️ Still waiting on ${agent.name} (${agent.elapsedSeconds}s elapsed).\nContinue waiting?`
      );
    } else {
      const agentList = agents
        .map(a => `  - ${a.name} (${a.elapsedSeconds}s)`) 
        .join('\n');
      message = chalk.yellow(
        `⏱️ Still waiting on:\n${agentList}\nContinue waiting?`
      );
    }

    // Inquirer prompt
    const answers = await inquirer.prompt([{
      type: 'confirm',
      name: 'shouldContinue',
      message,
      default: true
    }]);

    const shouldContinue = answers.shouldContinue;

    if (shouldContinue) {
      console.log(chalk.cyan('⏳ Continuing...'));
    } else {
        // Get max elapsed time from all agents
        const maxElapsed = agents.length > 0
          ? Math.max(...agents.map(a => a.elapsedSeconds))
          : 0;
        console.log(chalk.red(`Consultation cancelled by user after ${maxElapsed}s`));
    }

    return shouldContinue;
  }

  /**
   * Cleanup all timers
   */
  cleanup(): void {
    for (const [_, timerId] of this.timers) {
      clearTimeout(timerId);
    }
    this.timers.clear();
    this.startTimes.clear();
  }
}
