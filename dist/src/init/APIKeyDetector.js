"use strict";
/**
 * APIKeyDetector - Detects which LLM provider API keys are available
 */
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * APIKeyDetector - Detects which LLM provider API keys are available
 */
class APIKeyDetector {
    /**
     * Detect all available API keys
     * @returns {Array} Array of { provider, keyName, available, model }
     */
    static detect() {
        const providers = [
            {
                provider: 'Anthropic Claude',
                keyName: 'ANTHROPIC_API_KEY',
                model: 'claude-sonnet-4-5',
                priority: 1 // Highest priority
            },
            {
                provider: 'OpenAI GPT',
                keyName: 'OPENAI_API_KEY',
                model: 'gpt-4o',
                priority: 2
            },
            {
                provider: 'xAI Grok',
                keyName: 'XAI_API_KEY',
                model: 'grok-3',
                priority: 3
            }
        ];
        return providers.map(p => ({
            ...p,
            available: !!process.env[p.keyName]
        }));
    }
    /**
     * Check if any API key is available
     * @returns {boolean}
     */
    static hasAnyKey() {
        return this.detect().some(p => p.available);
    }
    /**
     * Get the best available provider (highest priority)
     * @returns {Object|null} Provider object or null if none available
     */
    static getBestProvider() {
        const available = this.detect()
            .filter(p => p.available)
            .sort((a, b) => a.priority - b.priority);
        return available.length > 0 ? available[0] : null;
    }
    /**
     * Print availability status to console
     */
    static printAvailability() {
        const providers = this.detect();
        const available = providers.filter(p => p.available);
        if (available.length === 0) {
            console.log('⚠️  No API keys detected\n');
            console.log('To use interactive setup, add one of these to your environment:');
            providers.forEach(p => {
                console.log(`  • ${p.keyName} (for ${p.provider})`);
            });
            console.log('\nOr create a .env file with your API keys.');
            return false;
        }
        console.log('Checking for API keys...');
        available.forEach(p => {
            console.log(`✓ Found: ${p.keyName}`);
        });
        console.log();
        return true;
    }
    /**
     * Get all available models
     * @returns {Array<string>} List of available model names
     */
    static getAvailableModels() {
        return this.detect()
            .filter(p => p.available)
            .map(p => p.model);
    }
}
exports.default = APIKeyDetector;
