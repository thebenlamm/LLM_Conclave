"use strict";
/**
 * StatusDisplay - Claude CLI-style clean output formatting
 */
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * StatusDisplay - Claude CLI-style clean output formatting
 */
class StatusDisplay {
    constructor() {
        this.statusLine = null;
        this.isQuiet = false;
    }
    /**
     * Enable quiet mode (suppress all output)
     */
    quiet() {
        this.isQuiet = true;
    }
    /**
     * Disable quiet mode
     */
    verbose() {
        this.isQuiet = false;
    }
    /**
     * Show a thinking/processing status
     * @param {string} message - Status message
     */
    thinking(message = 'Thinking...') {
        if (this.isQuiet)
            return;
        // Clear previous status if exists
        if (this.statusLine) {
            process.stdout.write('\r' + ' '.repeat(this.statusLine.length) + '\r');
        }
        this.statusLine = `\x1b[90m${message}\x1b[0m`; // Gray text
        process.stdout.write(this.statusLine);
    }
    /**
     * Update status with step progress
     * @param {number} current - Current step
     * @param {number} total - Total steps
     * @param {string} message - Status message
     */
    step(current, total, message) {
        if (this.isQuiet)
            return;
        const status = `\x1b[90m[${current}/${total}] ${message}\x1b[0m`;
        if (this.statusLine) {
            process.stdout.write('\r' + ' '.repeat(this.statusLine.length) + '\r');
        }
        this.statusLine = status;
        process.stdout.write(status);
    }
    /**
     * Clear the current status line
     */
    clear() {
        if (this.statusLine) {
            process.stdout.write('\r' + ' '.repeat(this.statusLine.length) + '\r');
            this.statusLine = null;
        }
    }
    /**
     * Print the final response (main output)
     * @param {string} content - Response content
     */
    response(content) {
        this.clear();
        console.log(content);
    }
    /**
     * Print an error message
     * @param {string} message - Error message
     */
    error(message) {
        this.clear();
        console.error(`\x1b[31m✗\x1b[0m ${message}`);
    }
    /**
     * Print a success message
     * @param {string} message - Success message
     */
    success(message) {
        this.clear();
        console.log(`\x1b[32m✓\x1b[0m ${message}`);
    }
    /**
     * Print an info message (muted)
     * @param {string} message - Info message
     */
    info(message) {
        this.clear();
        console.log(`\x1b[90m${message}\x1b[0m`);
    }
    /**
     * Print a warning message
     * @param {string} message - Warning message
     */
    warning(message) {
        this.clear();
        console.log(`\x1b[33m⚠\x1b[0m ${message}`);
    }
    /**
     * Print a divider
     */
    divider() {
        console.log('\x1b[90m' + '─'.repeat(80) + '\x1b[0m');
    }
}
exports.default = StatusDisplay;
