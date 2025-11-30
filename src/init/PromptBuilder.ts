/**
 * PromptBuilder - Helpers for formatted CLI output
 */

/**
 * PromptBuilder - Helpers for formatted CLI output
 */

export default class PromptBuilder {
  /**
   * Print a header banner
   */
  static header(text: string): void {
    const width = 80;
    const padding = Math.max(0, Math.floor((width - text.length - 2) / 2));
    console.log('\n' + '═'.repeat(width));
    console.log('║' + ' '.repeat(padding) + text + ' '.repeat(width - text.length - padding - 2) + '║');
    console.log('═'.repeat(width) + '\n');
  }

  /**
   * Print a question prompt
   */
  static question(text: string): void {
    console.log(`\n${text}`);
  }

  /**
   * Print info text
   */
  static info(text: string): void {
    console.log(text);
  }

  /**
   * Print success message
   */
  static success(text: string): void {
    console.log(`✓ ${text}`);
  }

  /**
   * Print warning message
   */
  static warning(text: string): void {
    console.log(`⚠️  ${text}`);
  }

  /**
   * Print error message
   */
  static error(text: string): void {
    console.log(`❌ ${text}`);
  }

  /**
   * Format a single agent for display
   */
  static formatAgent(agent: any, index: number | null = null): string {
    const prefix = index !== null ? `${index}. ` : '';
    const name = agent.name || 'Unnamed Agent';
    const model = agent.model || 'unknown';
    const role = agent.role || 'No description';
    const domains = agent.domains ? agent.domains.slice(0, 3).join(', ') : '';

    const width = 76;
    const topBorder = '┌─' + '─'.repeat(width - 2) + '┐';
    const bottomBorder = '└─' + '─'.repeat(width - 2) + '┘';

    let output = topBorder + '\n';
    output += `│ ${prefix}${name} (${model})${' '.repeat(Math.max(0, width - 4 - prefix.length - name.length - model.length - 3))}│\n`;

    if (role) {
      const roleText = `   ${role}`;
      output += `│${roleText}${' '.repeat(Math.max(0, width - roleText.length - 1))}│\n`;
    }

    if (domains) {
      const domainsText = `   Domains: ${domains}`;
      const truncated = domainsText.length > width - 2 ? domainsText.substring(0, width - 5) + '...' : domainsText;
      output += `│${truncated}${' '.repeat(Math.max(0, width - truncated.length - 1))}│\n`;
    }

    output += bottomBorder;

    return output;
  }

  /**
   * Format a list of agents for display
   */
  static formatAgentList(agents: any[]): string {
    if (!agents || agents.length === 0) {
      return 'No agents defined.';
    }

    let output = '';
    agents.forEach((agent, index) => {
      output += this.formatAgent(agent, index + 1) + '\n';
      if (index < agents.length - 1) {
        output += '\n';
      }
    });

    return output.trim();
  }

  /**
   * Display a menu with options
   */
  static menu(options: Record<string, string>): void {
    console.log('\nOptions:');
    Object.entries(options).forEach(([key, description]) => {
      console.log(`  [${key}] ${description}`);
    });
    console.log();
  }

  /**
   * Create a thinking/loading message
   */
  static thinking(message: string = 'Thinking...'): void {
    console.log(`\n${message}`);
  }

  /**
   * Print a separator line
   */
  static separator(): void {
    console.log('─'.repeat(80));
  }

  /**
   * Print final setup summary
   */
  static setupSummary(projectName: string, agentCount: number, files: string[]): void {
    console.log('\n' + '═'.repeat(80));
    console.log('🎉 Setup Complete!');
    console.log('═'.repeat(80) + '\n');

    this.success(`Created project: ${projectName}`);
    this.success(`Configured ${agentCount} specialized agents`);

    if (files && files.length > 0) {
      console.log('\nFiles created:');
      files.forEach(file => {
        console.log(`  • ${file}`);
      });
    }

    console.log('\nNext steps:');
    console.log(`  • Edit agent prompts: nano .llm-conclave.json`);
    console.log(`  • Run your first task: llm-conclave --orchestrated "your task"`);
    console.log(`  • View project info: llm-conclave --project-info ${projectName}\n`);
  }
}
