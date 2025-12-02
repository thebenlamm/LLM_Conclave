# LLM Conclave - Claude Development Log

This document tracks development work done with Claude Code on the LLM Conclave project.

## Project Overview

**LLM Conclave** is a command-line tool for orchestrating multi-agent LLM collaborations. It enables multiple AI models to work together through structured discussions, providing diverse perspectives and better solutions through collective intelligence.

### Key Features
- **5 LLM Providers**: OpenAI, Anthropic Claude, xAI Grok, Google Gemini, Mistral AI
- **3 Operational Modes**: Consensus, Orchestrated, Iterative Collaborative
- **Full Tool Support**: File operations across all providers
- **Project Context Analysis**: Automatic codebase understanding

---

## Recent Development Sessions

### Session: December 2025 - Iterative Collaborative Mode & Gemini Migration

#### 1. Iterative Collaborative Mode Implementation

**Commit:** `a296640` - "Add iterative collaborative mode with multi-turn chunk discussions"

**User Request:**
> "Within the single line discussion agents should have an opportunity to speak to each other. It shouldn't be one iteration and done. For example the Hebrew_Specialist might have something to say or add to the conversation after Textual_Validator. We can chunk the job into bigger pieces, for example 'do 3 lines at a time'. But the whole value of the conclave is to have a discussion that builds on itself"

**What Was Built:**

Created new `src/orchestration/IterativeCollaborativeOrchestrator.ts` (441 lines) that enables:
- Work divided into configurable chunks (default: 3 units per chunk)
- Multi-turn discussions within each chunk (default: 5 rounds)
- Agents respond to each other, not just one-and-done
- Per-agent state files (`[AgentName]_notes.md`)
- Judge-coordinated shared output (`shared_output.md`)
- Full tool support with format conversion for all providers

**CLI Integration:**
```bash
llm-conclave --iterative --project oz.txt "Correct all OCR errors"
llm-conclave --iterative --chunk-size 5 "Review documentation"
llm-conclave --iterative --max-rounds-per-chunk 3 "Task"
```

**Key Methods:**
- `run()` - Main orchestration loop
- `planChunks()` - Judge breaks task into chunks
- `discussChunk()` - Multi-turn discussion per chunk
- `executeAgentWithTools()` - Agent execution with tool support
- `judgeEvaluateChunk()` - Check if chunk is complete
- `judgeSynthesizeResult()` - Generate final chunk result
- `updateAgentState()` - Update agent's notes file
- `updateSharedOutput()` - Judge writes to shared output

**Build Errors Fixed:**
1. Agent import: Changed from `'./src/core/Agent'` to `import { Agent } from './src/types'`
2. ToolRegistry constructor: Changed from `new ToolRegistry(process.cwd())` to `new ToolRegistry()`
3. ProjectContext method: Changed from `getFormattedContext()` to `formatContext()`
4. Missing model property: Added `model` field to Agent initialization

---

#### 2. Gemini API Migration

**Commits:**
- `f487ac7` - "Migrate to new @google/genai package (v1.30.0)"
- `5fc64e3` - "Fix Gemini function calling - group responses correctly"

**Problem:**
- Original implementation used `@google/generative-ai` (deprecated)
- All Gemini models returning 404 errors
- User discovered we needed new `@google/genai` package (v1.30.0)

**Investigation:**
- Tested all model names - all failed with 404
- User identified: "The latest gemini npm library is https://www.npmjs.com/package/@google/genai. Are we using an outdated one?"
- **Discovery**: Gemini 1.5 models are DEPRECATED in new API
- Only Gemini 2.x models work: `gemini-2.0-flash-exp`, `gemini-2.5-flash`

**Complete Rewrite of `src/providers/GeminiProvider.ts`:**

**API Changes:**
```typescript
// OLD API
import { GoogleGenerativeAI } from '@google/generative-ai';
this.client = new GoogleGenerativeAI(key);
this.model = this.client.getGenerativeModel({ model: modelName });
const chat = this.model.startChat({ history });
const result = await chat.sendMessage(message);
return { text: response.text() }; // Method

// NEW API
import { GoogleGenAI } from '@google/genai';
this.client = new GoogleGenAI({ apiKey: key }); // Object parameter
const response = await this.client.models.generateContent({
  model: this.modelName,
  contents: contents,
  config: { systemInstruction, tools }
});
return { text: response.text }; // Property
```

**Tool Format Changes:**
- OLD: `parameters` field
- NEW: `parametersJsonSchema` field

**Model Mappings Updated:**
```typescript
// ProviderFactory.ts
if (modelLower === 'gemini-flash' || modelLower === 'gemini-pro') {
  fullModelName = 'gemini-2.0-flash-exp'; // Default to Gemini 2.0
}
```

---

#### 3. Gemini Function Calling Fix

**Problem:**
```
Error: Please ensure that the number of function response parts is equal to
the number of function call parts of the function call turn.
```

**Root Cause:**
Gemini requires:
1. All function responses grouped in SINGLE Content object
2. Responses must match function calls 1-to-1
3. Must use actual function name, not tool_use_id

**Solution:**
Rewrote `convertMessagesToGeminiFormat()` to:
1. Collect consecutive `tool_result` messages into array
2. Map `tool_use_id` to actual function name from previous `tool_calls`
3. Group ALL responses in single Content with role='function':

```typescript
convertMessagesToGeminiFormat(messages: Message[]): any[] {
  const contents: any[] = [];
  let pendingFunctionResponses: any[] = [];
  let lastToolCallsMap: Map<string, string> = new Map(); // tool_use_id → function name

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === 'tool_result') {
      // Collect responses
      const toolResult = msg as any;
      const functionName = lastToolCallsMap.get(toolResult.tool_use_id) || 'unknown';
      pendingFunctionResponses.push({
        functionResponse: {
          name: functionName, // Use actual function name
          response: { result: toolResult.content }
        }
      });
    } else {
      // Add grouped responses before next message
      if (pendingFunctionResponses.length > 0) {
        contents.push({
          role: 'function',
          parts: pendingFunctionResponses // ALL responses grouped
        });
        pendingFunctionResponses = [];
      }

      // Store tool call mappings for later
      if (msg.role === 'assistant' && assistantMsg.tool_calls) {
        lastToolCallsMap.clear();
        for (const tc of assistantMsg.tool_calls) {
          lastToolCallsMap.set(tc.id, tc.name);
        }
      }
      // ... rest of message handling
    }
  }

  // Add any remaining responses
  if (pendingFunctionResponses.length > 0) {
    contents.push({
      role: 'function',
      parts: pendingFunctionResponses
    });
  }

  return contents;
}
```

---

## Architecture Notes

### Agent Type Definition
```typescript
// src/types.ts
interface Agent {
  name: string;
  model: string;  // Important: Added during iterative mode implementation
  provider: LLMProvider;
  systemPrompt: string;
}
```

### Tool Message Format (Standardized)
```typescript
// Anthropic format (our standard)
{
  role: 'assistant',
  tool_calls: [
    { id: 'call_123', name: 'read_file', input: { path: 'file.txt' } }
  ]
}
{
  role: 'tool_result',
  tool_use_id: 'call_123',
  content: 'file contents'
}

// OpenAI format (used by Grok, Mistral)
{
  role: 'assistant',
  tool_calls: [
    {
      id: 'call_123',
      type: 'function',
      function: { name: 'read_file', arguments: '{"path":"file.txt"}' }
    }
  ]
}
{
  role: 'tool',
  tool_call_id: 'call_123',
  content: 'file contents'
}

// Gemini format
{
  role: 'model',
  parts: [
    { functionCall: { name: 'read_file', args: { path: 'file.txt' } } }
  ]
}
{
  role: 'function',
  parts: [
    {
      functionResponse: {
        name: 'read_file', // Must be function name, not ID!
        response: { result: 'file contents' }
      }
    }
  ]
}
```

---

## Files Created/Modified

### New Files
- `src/orchestration/IterativeCollaborativeOrchestrator.ts` (441 lines)
- `PLANNED_FEATURES.md` (782 lines) - Comprehensive feature roadmap

### Modified Files
- `index.ts` - Added iterative mode CLI integration
- `src/providers/GeminiProvider.ts` - Complete rewrite for new API
- `src/providers/ProviderFactory.ts` - Updated Gemini model mappings
- `README.md` - Documented iterative mode and Gemini 2.x
- `package.json` - Updated dependency: `@google/genai@^1.30.0`

---

## Testing Notes

### Iterative Mode Testing
```bash
# Test command used during development
npm run build && node dist/index.js --iterative --chunk-size 1 \
  --max-rounds-per-chunk 2 --project test-iterative.txt \
  "Correct the typos in each line (replace numbers with letters)"
```

### Gemini Model Testing
```bash
# Test script created to verify model names
node test-gemini-models.js

# Results:
# ❌ gemini-1.5-pro - NOT FOUND (deprecated)
# ❌ gemini-1.5-flash - NOT FOUND (deprecated)
# ✅ gemini-2.0-flash-exp - SUCCESS
# ✅ gemini-2.5-flash - SUCCESS
```

---

## Lessons Learned

1. **Always check package deprecation**: The `@google/generative-ai` → `@google/genai` migration was undocumented in many places. When models consistently 404, check for new package versions.

2. **User feedback is valuable**: User caught my mistake when I tried to remove `-latest` suffix - we had JUST added it in a previous commit. Always check recent commit history before reverting.

3. **Provider-specific quirks**: Each LLM API has unique requirements:
   - OpenAI: Tool arguments must be JSON string
   - Anthropic: Tool arguments are JSON object
   - Gemini: Function responses must be grouped and use function names not IDs
   - Grok/Mistral: Use OpenAI format

4. **Multi-turn discussions need careful state management**: Iterative mode required:
   - Per-agent state files for context
   - Shared output file for cumulative results
   - Tool format conversion per provider
   - Judge coordination for chunk completion

---

## Current Status

### ✅ Completed Features
- 5 LLM providers fully operational
- 3 operational modes (Consensus, Orchestrated, Iterative Collaborative)
- Tool support across all providers
- Project context analysis
- Gemini 2.x migration complete
- Function calling working for all providers

### 📋 Planned Features (see PLANNED_FEATURES.md)
- Cost & performance tracking
- Streaming output
- Resume/checkpoint system
- Web UI/dashboard
- Template library
- RAG for large codebases
- Extended git integration
- MCP (Model Context Protocol) support

---

## Usage Examples

### Iterative Collaborative Mode
```bash
# OCR correction with multi-turn discussions
llm-conclave --iterative --project document.txt \
  "Correct all OCR errors line by line"

# Code review with detailed discussions
llm-conclave --iterative --chunk-size 5 \
  --project ./src "Review code quality and suggest improvements"

# Documentation improvement
llm-conclave --iterative --max-rounds-per-chunk 3 \
  --project ./docs "Improve clarity and add examples"
```

### Consensus Mode
```bash
llm-conclave "Design authentication system for web app"
```

### Orchestrated Mode
```bash
llm-conclave --orchestrated --project ./src \
  "Refactor authentication module for better security"
```

---

## Git Commit History (Recent)

```
5fc64e3 Fix Gemini function calling - group responses correctly
438e62a Add comprehensive planned features documentation
f487ac7 Migrate to new @google/genai package (v1.30.0)
462f8da Revert "Fix Gemini model names - remove deprecated -latest suffix"
3967865 Fix Gemini model names - remove deprecated -latest suffix
a296640 Add iterative collaborative mode with multi-turn chunk discussions
```

---

## Notes for Future Development

### Iterative Mode Enhancements
- Consider allowing user to set different max-rounds per chunk dynamically
- Add progress indicators for long-running tasks
- Implement checkpoint/resume functionality
- Add cost tracking per chunk
- Consider parallel chunk processing for independent chunks

### Gemini Provider
- Monitor for Gemini 2.5 stable release
- Test with larger context windows
- Explore Gemini's experimental features (grounding, code execution)
- Consider adding vision support for multimodal capabilities

### Tool Support
- Add more tool types (web search, database queries, API calls)
- Implement tool result caching
- Add tool usage analytics
- Consider MCP (Model Context Protocol) integration

---

*Last Updated: December 2, 2025*
