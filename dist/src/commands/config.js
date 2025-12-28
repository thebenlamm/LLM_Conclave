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
exports.createConfigCommand = createConfigCommand;
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const child_process_1 = require("child_process");
const ConfigCascade_1 = require("../cli/ConfigCascade");
/**
 * Config command - Manage configuration
 */
function createConfigCommand() {
    const cmd = new commander_1.Command('config');
    cmd.description('Manage configuration');
    // Show current config
    cmd
        .command('show')
        .description('Show current configuration (with cascade resolution)')
        .action(() => {
        console.log(chalk_1.default.blue('\n⚙️  Current Configuration:\n'));
        const resolved = ConfigCascade_1.ConfigCascade.resolve({}, process.env);
        console.log(JSON.stringify(resolved, null, 2));
        console.log();
    });
    // Edit config
    cmd
        .command('edit')
        .description('Open configuration file in editor')
        .option('-g, --global', 'Edit global config')
        .action((options) => {
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
        console.log(chalk_1.default.blue(`\nOpening ${configPath} in ${editor}...\n`));
        (0, child_process_1.exec)(`${editor} ${configPath}`, (error) => {
            if (error) {
                console.error(chalk_1.default.red(`Error opening editor: ${error.message}`));
                process.exit(1);
            }
        });
    });
    // Set config value
    cmd
        .command('set <key> <value>')
        .description('Set a configuration value')
        .option('-g, --global', 'Set in global config')
        .action((key, value, options) => {
        const configPath = options.global
            ? path.join(os.homedir(), '.config', 'llm-conclave', 'config.json')
            : '.llm-conclave.json';
        // Load existing config
        let config = {};
        if (fs.existsSync(configPath)) {
            config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        }
        else {
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
        let parsedValue = value;
        if (value === 'true')
            parsedValue = true;
        else if (value === 'false')
            parsedValue = false;
        else if (!isNaN(Number(value)))
            parsedValue = Number(value);
        else if (value.startsWith('{') || value.startsWith('[')) {
            try {
                parsedValue = JSON.parse(value);
            }
            catch {
                // Keep as string
            }
        }
        current[keys[keys.length - 1]] = parsedValue;
        // Save config
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
        console.log(chalk_1.default.green(`\n✓ Set ${key} = ${JSON.stringify(parsedValue)} in ${configPath}\n`));
    });
    // Get config value
    cmd
        .command('get <key>')
        .description('Get a configuration value')
        .action((key) => {
        const resolved = ConfigCascade_1.ConfigCascade.resolve({}, process.env);
        const keys = key.split('.');
        let value = resolved;
        for (const k of keys) {
            if (value && typeof value === 'object') {
                value = value[k];
            }
            else {
                value = undefined;
                break;
            }
        }
        if (value !== undefined) {
            console.log(chalk_1.default.green(`\n${key} = ${JSON.stringify(value, null, 2)}\n`));
        }
        else {
            console.log(chalk_1.default.yellow(`\n${key} is not set\n`));
        }
    });
    return cmd;
}
