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
 * Handles reading and formatting project directory context for LLM agents
 * Optimized with async I/O and configurable limits
 */
class ProjectContext {
    constructor(projectPath, options = {}) {
        this.projectPath = path.resolve(projectPath);
        this.files = [];
        this.fileTree = '';
        this.isSingleFile = false;
        // Configurable limits with sensible defaults
        this.maxFileCount = options.maxFileCount || 100;
        this.maxTotalBytes = options.maxTotalBytes || 1000000; // 1MB default
        this.currentFileCount = 0;
        this.currentTotalBytes = 0;
        // Smart defaults for exclusion
        this.excludeDirs = new Set([
            'node_modules',
            '.git',
            '.svn',
            '.hg',
            'dist',
            'build',
            'out',
            'target',
            '.next',
            '.nuxt',
            'coverage',
            '.pytest_cache',
            '__pycache__',
            '.venv',
            'venv',
            'env'
        ]);
        this.excludeExtensions = new Set([
            '.pyc',
            '.pyo',
            '.exe',
            '.dll',
            '.so',
            '.dylib',
            '.class',
            '.jar',
            '.war',
            '.zip',
            '.tar',
            '.gz',
            '.rar',
            '.7z',
            '.jpg',
            '.jpeg',
            '.png',
            '.gif',
            '.bmp',
            '.ico',
            '.svg',
            '.mp3',
            '.mp4',
            '.avi',
            '.mov',
            '.pdf',
            '.doc',
            '.docx',
            '.xls',
            '.xlsx',
            '.ppt',
            '.pptx'
        ]);
        // Max file size: 100KB (to avoid huge files eating context)
        this.maxFileSize = 100 * 1024;
    }
    /**
     * Load project context by reading directory structure and files (async)
     * @returns {Object} - { success: boolean, fileCount: number, error?: string }
     */
    async load() {
        try {
            // Check if path exists (async)
            try {
                await fsPromises.access(this.projectPath);
            }
            catch {
                return { success: false, error: `Path does not exist: ${this.projectPath}` };
            }
            const stats = await fsPromises.stat(this.projectPath);
            // Handle single file
            if (stats.isFile()) {
                this.isSingleFile = true;
                const content = await this.readFileSafely(this.projectPath);
                if (content === null) {
                    return { success: false, error: `Unable to read file: ${this.projectPath}` };
                }
                this.files.push({
                    path: this.projectPath,
                    relativePath: path.basename(this.projectPath),
                    content: content
                });
                return { success: true, fileCount: 1 };
            }
            // Handle directory
            if (!stats.isDirectory()) {
                return { success: false, error: `Path is not a file or directory: ${this.projectPath}` };
            }
            // Build file tree and collect files in parallel (async)
            const [fileTree, files] = await Promise.all([
                this.buildFileTree(this.projectPath),
                this.collectFiles(this.projectPath)
            ]);
            this.fileTree = fileTree;
            this.files = files;
            const limitReached = this.currentTotalBytes >= this.maxTotalBytes ||
                this.currentFileCount >= this.maxFileCount;
            return {
                success: true,
                fileCount: this.files.length,
                limitReached
            };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    /**
     * Build a visual file tree representation (async with depth limit)
     * @param {string} dirPath - Directory to scan
     * @param {string} prefix - Prefix for tree formatting
     * @param {number} depth - Current depth (for limiting recursion)
     * @returns {Promise<string>} - Formatted file tree
     */
    async buildFileTree(dirPath, prefix = '', depth = 0) {
        // Prevent excessive depth
        if (depth > 10) {
            return '';
        }
        let tree = '';
        try {
            const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
            const filtered = entries.filter(entry => {
                if (entry.isDirectory() && this.excludeDirs.has(entry.name)) {
                    return false;
                }
                if (entry.name.startsWith('.')) {
                    return false;
                }
                return true;
            });
            for (let index = 0; index < filtered.length; index++) {
                const entry = filtered[index];
                const isLast = index === filtered.length - 1;
                const connector = isLast ? '└── ' : '├── ';
                const fullPath = path.join(dirPath, entry.name);
                tree += `${prefix}${connector}${entry.name}\n`;
                if (entry.isDirectory()) {
                    const extension = isLast ? '    ' : '│   ';
                    tree += await this.buildFileTree(fullPath, prefix + extension, depth + 1);
                }
            }
        }
        catch (error) {
            // Skip directories we can't read
        }
        return tree;
    }
    /**
     * Collect all readable files from directory (async with limits and parallelism)
     * @param {string} dirPath - Directory to scan
     * @param {number} depth - Current recursion depth
     * @returns {Promise<Array>} - Array of { path: string, relativePath: string, content: string }
     */
    async collectFiles(dirPath, depth = 0) {
        const files = [];
        // Early termination checks
        if (depth > 10)
            return files;
        if (this.currentFileCount >= this.maxFileCount)
            return files;
        if (this.currentTotalBytes >= this.maxTotalBytes)
            return files;
        try {
            const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
            // Separate directories and files for parallel processing
            const directories = [];
            const fileEntries = [];
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                if (entry.isDirectory()) {
                    if (!this.excludeDirs.has(entry.name) && !entry.name.startsWith('.')) {
                        directories.push(fullPath);
                    }
                }
                else {
                    if (await this.shouldIncludeFile(fullPath, entry.name)) {
                        fileEntries.push({ fullPath, name: entry.name });
                    }
                }
            }
            // Process files in parallel (limited concurrency)
            const filePromises = fileEntries.slice(0, 10).map(async ({ fullPath }) => {
                // Check limits before processing each file
                if (this.currentFileCount >= this.maxFileCount)
                    return;
                if (this.currentTotalBytes >= this.maxTotalBytes)
                    return;
                const content = await this.readFileSafely(fullPath);
                if (content !== null) {
                    this.currentTotalBytes += content.length;
                    this.currentFileCount++;
                    files.push({
                        path: fullPath,
                        relativePath: path.relative(this.projectPath, fullPath),
                        content: content
                    });
                }
            });
            await Promise.all(filePromises);
            // Recurse into directories with limited parallelism
            for (const dir of directories.slice(0, 5)) {
                if (this.currentFileCount >= this.maxFileCount)
                    break;
                if (this.currentTotalBytes >= this.maxTotalBytes)
                    break;
                const subFiles = await this.collectFiles(dir, depth + 1);
                files.push(...subFiles);
            }
        }
        catch (error) {
            // Skip directories we can't read
        }
        return files;
    }
    /**
     * Check if a file should be included based on filters (async)
     * @param {string} fullPath - Full file path
     * @param {string} fileName - File name
     * @returns {Promise<boolean>}
     */
    async shouldIncludeFile(fullPath, fileName) {
        // Check limits first (cheapest)
        if (this.currentFileCount >= this.maxFileCount)
            return false;
        if (this.currentTotalBytes >= this.maxTotalBytes)
            return false;
        // Check name patterns (cheap)
        if (fileName.startsWith('.'))
            return false;
        const ext = path.extname(fileName).toLowerCase();
        if (this.excludeExtensions.has(ext))
            return false;
        // Check size (requires I/O, do last)
        try {
            const stats = await fsPromises.stat(fullPath);
            return stats.size <= this.maxFileSize;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Safely read a file's content (async)
     * @param {string} filePath - Path to file
     * @returns {Promise<string|null>} - File content or null if unreadable
     */
    async readFileSafely(filePath) {
        try {
            const content = await fsPromises.readFile(filePath, 'utf8');
            // Check if content is binary by looking for null bytes
            if (content.includes('\0')) {
                return null;
            }
            return content;
        }
        catch (error) {
            return null;
        }
    }
    /**
     * Format project context for LLM consumption
     * @returns {string} - Formatted context string
     */
    formatContext() {
        let context = '# Project Context\n\n';
        // Handle single file
        if (this.isSingleFile) {
            const file = this.files[0];
            context += `File: ${file.relativePath}\n\n`;
            context += '```\n';
            context += file.content;
            context += '\n```\n\n';
            return context;
        }
        // Handle directory
        context += `Project Path: ${this.projectPath}\n\n`;
        // Add file tree
        context += '## Directory Structure\n\n```\n';
        context += path.basename(this.projectPath) + '/\n';
        context += this.fileTree;
        context += '```\n\n';
        // Add file contents
        context += `## File Contents (${this.files.length} files)\n\n`;
        for (const file of this.files) {
            context += `### ${file.relativePath}\n\n`;
            context += '```\n';
            context += file.content;
            context += '\n```\n\n';
        }
        return context;
    }
    /**
     * Get a summary of what was loaded
     * @returns {string}
     */
    getSummary() {
        const totalSize = this.files.reduce((sum, file) => sum + file.content.length, 0);
        if (this.isSingleFile) {
            return `Loaded file: ${this.files[0].relativePath} (${totalSize} bytes)`;
        }
        const avgSize = this.files.length > 0 ? Math.round(totalSize / this.files.length) : 0;
        return `Loaded ${this.files.length} files (avg ${avgSize} bytes per file, ${totalSize} bytes total)`;
    }
}
exports.default = ProjectContext;
