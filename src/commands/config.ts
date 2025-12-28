import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { ConfigCascade } from '../cli/ConfigCascade';

/**
 * Config command - Manage configuration
 */
export function createConfigCommand(): Command {
  const cmd = new Command('config');

  cmd.description('Manage configuration');

  // Show current config
  cmd
    .command('show')
    .description('Show current configuration (with cascade resolution)')
    .action(() => {
      console.log(chalk.blue('\n⚙️  Current Configuration:\n'));

      const resolved = ConfigCascade.resolve({}, process.env);
      console.log(JSON.stringify(resolved, null, 2));
      console.log();
    });

  // Edit config
  cmd
    .command('edit')
    .description('Open configuration file in editor')
    .option('-g, --global', 'Edit global config')
    .action((options: any) => {
      const configPath = options.global
        ? path.join(os.homedir(), '.config', 'llm-conclave', 'config.json')
        : '.llm-conclave.json';

      // Create file if it doesn't exist
      if (!fs.existsSync(configPath)) {
        const dir = path.dirname(configPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(configPath, '{}', 'utf-8');
      }

      const editor = process.env.EDITOR || process.env.VISUAL || 'vim';
      console.log(chalk.blue(`\nOpening ${configPath} in ${editor}...\n`));

      exec(`${editor} ${configPath}`, (error) => {
        if (error) {
          console.error(chalk.red(`Error opening editor: ${error.message}`));
          process.exit(1);
        }
      });
    });

  // Set config value
  cmd
    .command('set <key> <value>')
    .description('Set a configuration value')
    .option('-g, --global', 'Set in global config')
    .action((key: string, value: string, options: any) => {
      const configPath = options.global
        ? path.join(os.homedir(), '.config', 'llm-conclave', 'config.json')
        : '.llm-conclave.json';

      // Load existing config
      let config: any = {};
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      } else {
        const dir = path.dirname(configPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }

      // Set nested key (e.g., "judge.model")
      const keys = key.split('.');
      let current = config;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
      }

      // Parse value
      let parsedValue: any = value;
      if (value === 'true') parsedValue = true;
      else if (value === 'false') parsedValue = false;
      else if (!isNaN(Number(value))) parsedValue = Number(value);
      else if (value.startsWith('{') || value.startsWith('[')) {
        try {
          parsedValue = JSON.parse(value);
        } catch {
          // Keep as string
        }
      }

      current[keys[keys.length - 1]] = parsedValue;

      // Save config
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

      console.log(chalk.green(`\n✓ Set ${key} = ${JSON.stringify(parsedValue)} in ${configPath}\n`));
    });

  // Get config value
  cmd
    .command('get <key>')
    .description('Get a configuration value')
    .action((key: string) => {
      const resolved = ConfigCascade.resolve({}, process.env);

      const keys = key.split('.');
      let value = resolved;
      for (const k of keys) {
        if (value && typeof value === 'object') {
          value = value[k];
        } else {
          value = undefined;
          break;
        }
      }

      if (value !== undefined) {
        console.log(chalk.green(`\n${key} = ${JSON.stringify(value, null, 2)}\n`));
      } else {
        console.log(chalk.yellow(`\n${key} is not set\n`));
      }
    });

  return cmd;
}
