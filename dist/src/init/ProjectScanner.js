"use strict";
/**
 * ProjectScanner - Analyzes project directory to provide context for agent generation
 */
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
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
/**
 * ProjectScanner - Analyzes project directory to provide context for agent generation
 */
class ProjectScanner {
    constructor(projectPath = process.cwd()) {
        this.projectPath = projectPath;
        this.results = {
            projectType: null,
            framework: null,
            structure: [],
            keyFiles: [],
            domains: [],
            summary: ''
        };
    }
    /**
     * Ask user if they want to scan the project
     * @param {readline.Interface} rl - Readline interface to use
     * @returns {Promise<boolean>}
     */
    static async shouldScan(rl) {
        // Check if we're in a directory with files (not empty)
        try {
            const files = await fs.readdir(process.cwd());
            if (files.length === 0) {
                return false; // Empty directory, no point scanning
            }
        }
        catch (error) {
            return false;
        }
        console.log('\nI can analyze your project directory to better understand your needs.');
        console.log('This will scan key files (README, package.json, etc.) and take ~20 seconds.\n');
        return new Promise((resolve) => {
            rl.question('Scan project? (y/n): ', (answer) => {
                resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
            });
        });
    }
    /**
     * Scan the project directory
     * @param {number} timeoutMs - Timeout in milliseconds
     * @returns {Promise<Object>} Scan results
     */
    async scan(timeoutMs = 30000) {
        const startTime = Date.now();
        try {
            // Run analysis with timeout
            await Promise.race([
                this._analyze(),
                this._timeout(timeoutMs)
            ]);
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            this.results.summary = this._buildSummary(elapsed);
            return this.results;
        }
        catch (error) {
            if (error.message === 'SCAN_TIMEOUT') {
                console.log('⚠️  Scan timed out, using partial results');
                this.results.summary = this._buildSummary('timeout');
                return this.results;
            }
            throw error;
        }
    }
    /**
     * Timeout helper
     */
    async _timeout(ms) {
        return new Promise((_, reject) => {
            setTimeout(() => reject(new Error('SCAN_TIMEOUT')), ms);
        });
    }
    /**
     * Main analysis logic
     */
    async _analyze() {
        // Step 1: Detect project type
        await this._detectProjectType();
        // Step 2: Analyze structure
        await this._analyzeStructure();
        // Step 3: Find and read key files
        await this._findKeyFiles();
        // Step 4: Detect domains/features
        await this._detectDomains();
    }
    /**
     * Detect project type (Node.js, Python, Java, etc.)
     */
    async _detectProjectType() {
        const indicators = [
            { file: 'package.json', type: 'Node.js', framework: await this._detectNodeFramework() },
            { file: 'requirements.txt', type: 'Python', framework: await this._detectPythonFramework() },
            { file: 'Pipfile', type: 'Python', framework: await this._detectPythonFramework() },
            { file: 'pom.xml', type: 'Java', framework: 'Maven' },
            { file: 'build.gradle', type: 'Java', framework: 'Gradle' },
            { file: 'Cargo.toml', type: 'Rust', framework: 'Cargo' },
            { file: 'go.mod', type: 'Go', framework: 'Go Modules' },
            { file: 'composer.json', type: 'PHP', framework: await this._detectPHPFramework() },
            { file: 'Gemfile', type: 'Ruby', framework: await this._detectRubyFramework() }
        ];
        for (const indicator of indicators) {
            try {
                await fs.access(path.join(this.projectPath, indicator.file));
                this.results.projectType = indicator.type;
                this.results.framework = indicator.framework;
                return;
            }
            catch (error) {
                // File doesn't exist, continue
            }
        }
        // Default to generic if no specific type detected
        this.results.projectType = 'Generic';
    }
    /**
     * Detect Node.js framework
     */
    async _detectNodeFramework() {
        try {
            const packagePath = path.join(this.projectPath, 'package.json');
            const content = await fs.readFile(packagePath, 'utf8');
            const pkg = JSON.parse(content);
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };
            if (deps['react'])
                return 'React';
            if (deps['vue'])
                return 'Vue';
            if (deps['@angular/core'])
                return 'Angular';
            if (deps['next'])
                return 'Next.js';
            if (deps['express'])
                return 'Express';
            if (deps['nestjs'])
                return 'NestJS';
            return 'Node.js';
        }
        catch (error) {
            return null;
        }
    }
    /**
     * Detect Python framework
     */
    async _detectPythonFramework() {
        try {
            const reqPath = path.join(this.projectPath, 'requirements.txt');
            const content = await fs.readFile(reqPath, 'utf8');
            if (content.includes('django'))
                return 'Django';
            if (content.includes('flask'))
                return 'Flask';
            if (content.includes('fastapi'))
                return 'FastAPI';
            return 'Python';
        }
        catch (error) {
            return null;
        }
    }
    /**
     * Detect PHP framework
     */
    async _detectPHPFramework() {
        try {
            const composerPath = path.join(this.projectPath, 'composer.json');
            const content = await fs.readFile(composerPath, 'utf8');
            if (content.includes('laravel'))
                return 'Laravel';
            if (content.includes('symfony'))
                return 'Symfony';
            return 'PHP';
        }
        catch (error) {
            return null;
        }
    }
    /**
     * Detect Ruby framework
     */
    async _detectRubyFramework() {
        try {
            const gemfilePath = path.join(this.projectPath, 'Gemfile');
            const content = await fs.readFile(gemfilePath, 'utf8');
            if (content.includes('rails'))
                return 'Ruby on Rails';
            return 'Ruby';
        }
        catch (error) {
            return null;
        }
    }
    /**
     * Analyze directory structure
     */
    async _analyzeStructure() {
        try {
            const entries = await fs.readdir(this.projectPath, { withFileTypes: true });
            const dirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'));
            const importantDirs = ['src', 'lib', 'app', 'components', 'api', 'server', 'client',
                'frontend', 'backend', 'services', 'tests', 'docs', 'public'];
            this.results.structure = dirs
                .filter(d => importantDirs.includes(d.name.toLowerCase()))
                .map(d => d.name);
        }
        catch (error) {
            // Ignore errors
        }
    }
    /**
     * Find and read key files
     */
    async _findKeyFiles() {
        const keyFileNames = [
            'README.md',
            'README.txt',
            'package.json',
            'requirements.txt',
            // AI/LLM documentation files
            'CLAUDE.md',
            'CLAUDE_INSTRUCTIONS.md',
            'AI.md',
            'LLM.md',
            'PROMPTS.md',
            '.cursorrules',
            '.claude/instructions.md'
        ];
        for (const fileName of keyFileNames) {
            try {
                const filePath = path.join(this.projectPath, fileName);
                const stats = await fs.stat(filePath);
                // Skip if file is too large (>50KB)
                if (stats.size > 50000)
                    continue;
                const content = await fs.readFile(filePath, 'utf8');
                // Truncate to first 1000 characters for AI docs (they're usually more relevant)
                // Standard docs get 500 characters
                const isAIDoc = fileName.toUpperCase().includes('CLAUDE') ||
                    fileName.toUpperCase().includes('AI') ||
                    fileName.toUpperCase().includes('LLM') ||
                    fileName === '.cursorrules';
                const maxLength = isAIDoc ? 1000 : 500;
                const truncated = content.substring(0, maxLength);
                this.results.keyFiles.push({
                    name: fileName,
                    content: truncated,
                    isAIDoc
                });
            }
            catch (error) {
                // File doesn't exist or can't be read, continue
            }
        }
    }
    /**
     * Detect domains/features from structure and files
     */
    async _detectDomains() {
        const domains = new Set();
        // Check structure for domains
        const structureLower = this.results.structure.map(s => s.toLowerCase());
        if (structureLower.includes('api'))
            domains.add('API development');
        if (structureLower.includes('frontend') || structureLower.includes('client'))
            domains.add('Frontend');
        if (structureLower.includes('backend') || structureLower.includes('server'))
            domains.add('Backend');
        if (structureLower.includes('components'))
            domains.add('Component architecture');
        if (structureLower.includes('tests'))
            domains.add('Testing');
        if (structureLower.includes('docs'))
            domains.add('Documentation');
        // Check README content for keywords
        const readme = this.results.keyFiles.find(f => f.name.startsWith('README'));
        if (readme) {
            const content = readme.content.toLowerCase();
            if (content.includes('e-commerce') || content.includes('shop'))
                domains.add('E-commerce');
            if (content.includes('authentication') || content.includes('auth'))
                domains.add('Authentication');
            if (content.includes('database') || content.includes('db'))
                domains.add('Database');
            if (content.includes('api'))
                domains.add('API');
            if (content.includes('mobile'))
                domains.add('Mobile');
            if (content.includes('web app') || content.includes('webapp'))
                domains.add('Web application');
            if (content.includes('saas'))
                domains.add('SaaS');
            if (content.includes('analytics'))
                domains.add('Analytics');
            if (content.includes('ai') || content.includes('machine learning') || content.includes('ml')) {
                domains.add('AI/ML');
            }
        }
        this.results.domains = Array.from(domains);
    }
    /**
     * Build summary text for LLM
     */
    _buildSummary(elapsed) {
        let summary = 'PROJECT SCAN RESULTS:\n';
        if (this.results.projectType) {
            summary += `Type: ${this.results.projectType}`;
            if (this.results.framework) {
                summary += ` (${this.results.framework})`;
            }
            summary += '\n';
        }
        if (this.results.structure.length > 0) {
            summary += `Structure: ${this.results.structure.join(', ')}\n`;
        }
        if (this.results.domains.length > 0) {
            summary += `Domains: ${this.results.domains.join(', ')}\n`;
        }
        if (this.results.keyFiles.length > 0) {
            summary += `Key files analyzed: ${this.results.keyFiles.map(f => f.name).join(', ')}\n`;
        }
        if (elapsed !== 'timeout') {
            summary += `\nScan completed in ${elapsed} seconds`;
        }
        return summary;
    }
    /**
     * Format results for LLM consumption
     */
    formatForLLM() {
        let output = this.results.summary;
        // Prioritize AI documentation files (most relevant for agent generation)
        const aiDocs = this.results.keyFiles.filter(f => f.isAIDoc);
        if (aiDocs.length > 0) {
            output += '\n\nAI DOCUMENTATION FOUND:\n';
            aiDocs.forEach(doc => {
                output += `\n${doc.name}:\n`;
                output += doc.content;
                if (doc.content.length >= 1000) {
                    output += '\n[truncated]';
                }
                output += '\n';
            });
        }
        // Add README excerpt if available
        const readme = this.results.keyFiles.find(f => f.name.startsWith('README'));
        if (readme) {
            output += '\nREADME excerpt:\n';
            output += readme.content;
            if (readme.content.length >= 500) {
                output += '\n[truncated]';
            }
        }
        return output;
    }
    /**
     * Get a brief summary for console output
     */
    getBriefSummary() {
        const parts = [];
        if (this.results.projectType) {
            let typeStr = this.results.projectType;
            if (this.results.framework && this.results.framework !== this.results.projectType) {
                typeStr += ` + ${this.results.framework}`;
            }
            parts.push(typeStr);
        }
        if (this.results.domains.length > 0) {
            parts.push(this.results.domains.slice(0, 2).join(', '));
        }
        // Mention if AI docs were found
        const aiDocs = this.results.keyFiles.filter(f => f.isAIDoc);
        if (aiDocs.length > 0) {
            const aiDocNames = aiDocs.map(d => d.name).join(', ');
            parts.push(`AI docs: ${aiDocNames}`);
        }
        return parts.length > 0 ? `I see: ${parts.join(', ')}` : 'Scan completed';
    }
}
exports.default = ProjectScanner;
