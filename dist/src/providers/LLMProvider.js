"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Base class for all LLM providers
 * Defines the interface that all LLM implementations must follow
 */
class LLMProvider {
    constructor(modelName) {
        this.modelName = modelName;
    }
    /**
     * Get the model name
     */
    getModelName() {
        return this.modelName;
    }
}
exports.default = LLMProvider;
