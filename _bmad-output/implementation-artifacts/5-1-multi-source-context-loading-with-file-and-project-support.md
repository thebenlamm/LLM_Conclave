# Story 5.1: Multi-Source Context Loading with File and Project Support

Status: done

## Story

As a **developer**,
I want to provide context from explicit files or entire projects,
So that consultations have the information they need to give relevant advice.

## Acceptance Criteria

1. **Explicit File Context Loading**:
   - When user runs `llm-conclave consult --context file1.ts,file2.md "question"`
   - System reads each specified file
   - Context is formatted with file headers:
     ```
     ### File: file1.ts

     [contents of file1.ts]

     ### File: file2.md

     [contents of file2.md]
     ```
   - Context is prepended to agent prompts in Round 1

2. **File Path Validation**:
   - When invalid file paths are provided
   - Error displayed: `"❌ Context file not found: /path/to/missing.ts"`
   - Valid paths must exist and be readable
   - Consultation does not proceed if any file is missing

3. **Project Context Integration**:
   - When user runs `llm-conclave consult --project ./myproject "question"`
   - System uses existing `ProjectContext` utility
   - Analyzes project structure:
     - Framework detection (from Story 4.4 brownfield detection)
     - File tree summary
     - README.md contents
     - Key configuration files
   - Summary formatted:
     ```
     ### Project Context

     **Framework:** Next.js 14 App Router
     **Structure:**
     - src/app/ (App Router pages)
     - src/components/ (React components)
     - src/lib/ (Utilities)

     **Key Files:**
     - README.md: [summary]
     - package.json: [dependencies]
     ```

4. **Combined Context Support**:
   - When both `--context` and `--project` flags are used
   - Both contexts are included:
     1. Project context first (high-level overview)
     2. Explicit file context second (specific details)

5. **Context Size Warning**:
   - When context exceeds 10,000 tokens (estimated via character count / 4)
   - Warning displayed:
     ```
     ⚠️ Large context detected (~12,500 tokens)
     This may increase cost and response time.
     Continue? [Y/n]
     ```
   - User can cancel before proceeding
   - Respects existing `alwaysAllowUnder` cost gate setting

6. **Context Passed to All Rounds**:
   - Loaded context available throughout consultation (not just Round 1)
   - Context stored in ConsultationContext for access by later rounds if needed

7. **Logged Metadata**:
   - Consultation log includes context metadata:
     ```json
     {
       "context_sources": {
         "files": ["src/auth.ts", "docs/api.md"],
         "project_path": "./myproject",
         "total_tokens_estimated": 8500,
         "file_count": 2,
         "project_summary_included": true
       }
     }
     ```

## Tasks / Subtasks

- [x] Task 1: Create ContextLoader Module (AC: #1, #2)
  - [x] Create `src/consult/context/ContextLoader.ts`
  - [x] Define `ContextSource` interface (file path, content, token estimate)
  - [x] Define `LoadedContext` interface (sources, formatted content, total tokens)
  - [x] Implement `loadFileContext(filePaths: string[]): Promise<LoadedContext>`
  - [x] Implement file path validation with clear error messages
  - [x] Implement content formatting with file headers
  - [x] Add unit tests in `src/consult/context/__tests__/ContextLoader.test.ts`

- [x] Task 2: Integrate with Existing ProjectContext (AC: #3)
  - [x] Extend `src/utils/ProjectContext.ts` or create adapter
  - [x] Implement `loadProjectContext(projectPath: string): Promise<LoadedContext>`
  - [x] Reuse brownfield detection from Story 4.4 (`BrownfieldDetector`)
  - [x] Format project summary with framework, structure, and key files
  - [x] Add unit tests for project context formatting

- [x] Task 3: Implement Context Combiner (AC: #4)
  - [x] Create `ContextCombiner` class or function
  - [x] Implement `combineContexts(project: LoadedContext, files: LoadedContext): LoadedContext`
  - [x] Ensure proper ordering (project first, files second)
  - [x] Calculate combined token estimate
  - [x] Add unit tests for context combination

- [x] Task 4: Add Token Estimation and Size Warning (AC: #5)
  - [x] Implement `estimateTokens(content: string): number` using character count / 4 heuristic
  - [x] Add context size threshold constant (10,000 tokens)
  - [x] Implement user warning prompt using Inquirer
  - [x] Integrate with existing cost gate flow if possible
  - [x] Add unit tests for token estimation

- [x] Task 5: Update CLI Command Options (AC: #1-#5)
  - [x] Modify `src/commands/consult.ts`
  - [x] Add `--context <files>` option (comma-separated file paths)
  - [x] Ensure `--project` option works with context loading
  - [x] Validate file paths before consultation starts
  - [x] Display appropriate warnings for large contexts
  - [x] Handle both flags together

- [x] Task 6: Integrate with ConsultOrchestrator (AC: #6)
  - [x] Modify `src/orchestration/ConsultOrchestrator.ts`
  - [x] Add `loadedContext` to orchestrator options/state
  - [x] Pass formatted context to Round 1 agent prompts
  - [x] Store context for potential access by later rounds
  - [x] Ensure context augmentation works with brownfield detection (Story 4.4)

- [x] Task 7: Update ConsultationResult Types (AC: #7)
  - [x] Add `ContextMetadata` interface to `src/types/consult.ts`
  - [x] Add `contextMetadata` field to ConsultationResult
  - [x] Add JSON schema for snake_case serialization in ArtifactTransformer

- [x] Task 8: Update Logging and Analytics (AC: #7)
  - [x] Modify `src/consult/logging/ConsultationFileLogger.ts`
  - [x] Include `context_sources` in JSONL output
  - [x] Optionally add context-related columns to SQLite analytics
  - [x] Ensure snake_case conversion for nested fields

- [x] Task 9: Unit and Integration Tests
  - [x] Test file context loading with valid paths
  - [x] Test file context loading with invalid paths (error handling)
  - [x] Test project context loading
  - [x] Test combined context (files + project)
  - [x] Test token estimation accuracy
  - [x] Test size warning prompt
  - [x] Test CLI integration
  - [x] Integration test: full consultation with context

## Dev Notes

### Architecture Context

This story implements **FR10: Explicit file context** from the PRD. It builds on the brownfield detection from Story 4.4 and provides users with flexible ways to provide context to consultations.

**Design Rationale:**
- Leverages existing `ProjectContext` utility in `src/utils/ProjectContext.ts`
- Reuses brownfield detection from Story 4.4 for framework/tech stack analysis
- Simple token estimation (chars/4) is sufficient for warning thresholds
- Context loading happens once before Round 1, stored for potential later use

### Existing Code Patterns to Follow

**File Naming (from architecture.md):**
- TypeScript files: PascalCase (`ContextLoader.ts`)
- Variables/functions: camelCase (`loadFileContext`, `estimateTokens`)

**Import Patterns (from existing code in Story 4.4):**
```typescript
// Import from existing utilities
import { ProjectContext } from '../utils/ProjectContext';
import { BrownfieldDetector } from './BrownfieldDetector';
import { ContextAugmenter } from './ContextAugmenter';

// Import types
import { ConsultationResult } from '../types/consult';

// Async I/O pattern
import * as fsPromises from 'fs/promises';
import * as path from 'path';
```

**Error Handling Pattern (from ProjectContext.ts):**
```typescript
async function readFile(filePath: string): Promise<string> {
  try {
    return await fsPromises.readFile(filePath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Context file not found: ${filePath}`);
    }
    throw error;
  }
}
```

**CLI Option Pattern (from consult.ts):**
```typescript
.option('--context <files>', 'Comma-separated list of files to include as context')
```

### Technical Requirements

**Dependencies:**
- Uses existing `ProjectContext` utility for project analysis
- Reuses `BrownfieldDetector` from Story 4.4 for framework detection
- Uses Inquirer for size warning prompts
- Chalk for colored output

**Token Estimation:**
- Simple heuristic: `characters / 4` (rough approximation)
- Threshold: 10,000 tokens triggers warning
- Matches existing CostEstimator patterns

**Context Format:**
```
### File: src/auth.ts

[file contents here]

### File: docs/api.md

[file contents here]
```

### Project Structure Notes

**New Files to Create:**
```
src/consult/context/
├── ContextLoader.ts          # Core file loading logic (NEW)
└── __tests__/
    └── ContextLoader.test.ts # Unit tests (NEW)
```

**Files to Modify:**
- `src/utils/ProjectContext.ts` - May need adapter or extension
- `src/commands/consult.ts` - Add --context option, validate paths
- `src/orchestration/ConsultOrchestrator.ts` - Integrate loaded context
- `src/types/consult.ts` - Add ContextMetadata types
- `src/consult/logging/ConsultationFileLogger.ts` - Log context metadata
- `src/consult/artifacts/ArtifactTransformer.ts` - Add snake_case conversion

### Key Implementation Details

**ContextSource Interface:**
```typescript
export interface ContextSource {
  type: 'file' | 'project';
  path: string;
  content: string;
  tokenEstimate: number;
  metadata?: {
    // For files
    filename?: string;
    extension?: string;
    // For projects
    framework?: string;
    techStack?: TechStackAnalysis;
  };
}

export interface LoadedContext {
  sources: ContextSource[];
  formattedContent: string;
  totalTokens: number;
  fileCount: number;
  projectIncluded: boolean;
}
```

**ContextLoader Class:**
```typescript
export class ContextLoader {
  private readonly tokenThreshold = 10000;

  async loadFileContext(filePaths: string[]): Promise<LoadedContext> {
    const sources: ContextSource[] = [];
    const errors: string[] = [];

    for (const filePath of filePaths) {
      const absolutePath = path.resolve(filePath);

      // Validate file exists
      try {
        await fsPromises.access(absolutePath);
      } catch {
        errors.push(`Context file not found: ${absolutePath}`);
        continue;
      }

      // Read file content
      const content = await fsPromises.readFile(absolutePath, 'utf-8');
      const tokenEstimate = this.estimateTokens(content);

      sources.push({
        type: 'file',
        path: absolutePath,
        content,
        tokenEstimate,
        metadata: {
          filename: path.basename(absolutePath),
          extension: path.extname(absolutePath)
        }
      });
    }

    if (errors.length > 0) {
      throw new Error(`❌ ${errors.join('\n❌ ')}`);
    }

    return this.formatContext(sources);
  }

  async loadProjectContext(projectPath: string): Promise<LoadedContext> {
    const projectContext = new ProjectContext(projectPath);
    const summary = await projectContext.formatContext();

    // Optionally reuse brownfield detection for tech stack
    const detector = new BrownfieldDetector(projectPath);
    const analysis = await detector.detect();

    const tokenEstimate = this.estimateTokens(summary);

    return {
      sources: [{
        type: 'project',
        path: projectPath,
        content: summary,
        tokenEstimate,
        metadata: {
          framework: analysis.techStack.framework,
          techStack: analysis.techStack
        }
      }],
      formattedContent: `### Project Context\n\n${summary}`,
      totalTokens: tokenEstimate,
      fileCount: 0,
      projectIncluded: true
    };
  }

  combineContexts(
    project: LoadedContext | null,
    files: LoadedContext | null
  ): LoadedContext {
    const sources: ContextSource[] = [];
    let formattedParts: string[] = [];

    if (project) {
      sources.push(...project.sources);
      formattedParts.push(project.formattedContent);
    }

    if (files) {
      sources.push(...files.sources);
      formattedParts.push(files.formattedContent);
    }

    const totalTokens = sources.reduce((sum, s) => sum + s.tokenEstimate, 0);

    return {
      sources,
      formattedContent: formattedParts.join('\n\n'),
      totalTokens,
      fileCount: files?.sources.length ?? 0,
      projectIncluded: project !== null
    };
  }

  estimateTokens(content: string): number {
    // Rough approximation: ~4 characters per token
    return Math.ceil(content.length / 4);
  }

  async checkSizeWarning(context: LoadedContext): Promise<boolean> {
    if (context.totalTokens <= this.tokenThreshold) {
      return true; // No warning needed
    }

    console.log(chalk.yellow(
      `\n⚠️ Large context detected (~${context.totalTokens.toLocaleString()} tokens)\n` +
      'This may increase cost and response time.'
    ));

    const { proceed } = await inquirer.prompt([{
      type: 'confirm',
      name: 'proceed',
      message: 'Continue?',
      default: true
    }]);

    return proceed;
  }

  private formatContext(sources: ContextSource[]): LoadedContext {
    const fileSources = sources.filter(s => s.type === 'file');

    const formattedContent = fileSources.map(source => {
      return `### File: ${source.metadata?.filename || source.path}\n\n${source.content}`;
    }).join('\n\n');

    const totalTokens = sources.reduce((sum, s) => sum + s.tokenEstimate, 0);

    return {
      sources,
      formattedContent,
      totalTokens,
      fileCount: fileSources.length,
      projectIncluded: false
    };
  }
}
```

**CLI Integration:**
```typescript
// In src/commands/consult.ts
program
  .command('consult <question>')
  .option('--context <files>', 'Comma-separated list of files to include as context')
  .option('--project <path>', 'Project directory for context')
  .option('--greenfield', 'Ignore brownfield detection')
  .action(async (question, options) => {
    const contextLoader = new ContextLoader();
    let loadedContext: LoadedContext | null = null;

    try {
      // Load file context if specified
      let fileContext: LoadedContext | null = null;
      if (options.context) {
        const filePaths = options.context.split(',').map((f: string) => f.trim());
        fileContext = await contextLoader.loadFileContext(filePaths);
      }

      // Load project context if specified
      let projectContext: LoadedContext | null = null;
      if (options.project) {
        projectContext = await contextLoader.loadProjectContext(options.project);
      }

      // Combine contexts
      if (fileContext || projectContext) {
        loadedContext = contextLoader.combineContexts(projectContext, fileContext);

        // Check size warning
        const proceed = await contextLoader.checkSizeWarning(loadedContext);
        if (!proceed) {
          console.log(chalk.yellow('Consultation cancelled by user.'));
          return;
        }
      }

      // Pass to orchestrator
      const result = await orchestrator.run({
        question,
        mode: options.mode || 'converge',
        loadedContext,
        // ... other options
      });
    } catch (error) {
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });
```

**Context Metadata Types:**
```typescript
// In src/types/consult.ts
export interface ContextMetadata {
  files: string[];
  projectPath: string | null;
  totalTokensEstimated: number;
  fileCount: number;
  projectSummaryIncluded: boolean;
}

// Add to ConsultationResult
export interface ConsultationResult {
  // ... existing fields
  contextMetadata?: ContextMetadata;
}
```

### Testing Requirements

**Unit Tests (ContextLoader):**
```typescript
describe('ContextLoader', () => {
  describe('loadFileContext', () => {
    it('loads single file successfully', async () => {
      const loader = new ContextLoader();
      const result = await loader.loadFileContext(['./test-fixtures/sample.ts']);
      expect(result.sources).toHaveLength(1);
      expect(result.formattedContent).toContain('### File: sample.ts');
    });

    it('loads multiple files', async () => {
      const loader = new ContextLoader();
      const result = await loader.loadFileContext([
        './test-fixtures/file1.ts',
        './test-fixtures/file2.md'
      ]);
      expect(result.sources).toHaveLength(2);
      expect(result.fileCount).toBe(2);
    });

    it('throws error for missing file', async () => {
      const loader = new ContextLoader();
      await expect(
        loader.loadFileContext(['./nonexistent.ts'])
      ).rejects.toThrow('Context file not found');
    });
  });

  describe('estimateTokens', () => {
    it('estimates tokens based on character count', () => {
      const loader = new ContextLoader();
      // 400 characters ≈ 100 tokens
      const content = 'a'.repeat(400);
      expect(loader.estimateTokens(content)).toBe(100);
    });
  });

  describe('combineContexts', () => {
    it('orders project context before file context', () => {
      const loader = new ContextLoader();
      const project: LoadedContext = {
        sources: [{ type: 'project', path: '/project', content: 'proj', tokenEstimate: 100 }],
        formattedContent: '### Project\nproj',
        totalTokens: 100,
        fileCount: 0,
        projectIncluded: true
      };
      const files: LoadedContext = {
        sources: [{ type: 'file', path: '/file.ts', content: 'file', tokenEstimate: 50 }],
        formattedContent: '### File: file.ts\nfile',
        totalTokens: 50,
        fileCount: 1,
        projectIncluded: false
      };

      const result = loader.combineContexts(project, files);
      expect(result.formattedContent).toMatch(/### Project[\s\S]*### File/);
      expect(result.totalTokens).toBe(150);
    });
  });
});
```

**Integration Tests:**
- Full consultation with file context
- Full consultation with project context
- Full consultation with combined context
- Verify context passed to Round 1 prompts
- Verify context logged in JSONL

### Dependencies on Previous Stories

**From Story 4.4 (Brownfield Detection):**
- Reuse `BrownfieldDetector` for tech stack analysis
- Reuse `ContextAugmenter` for prompt formatting
- Integration with existing project analysis flow

**From Epic 2 (Cost Controls):**
- Context size warning integrates with cost consent flow
- Respects existing `alwaysAllowUnder` settings

### Performance Considerations

**File Loading:**
- Files loaded sequentially to provide clear error messages
- Large files may impact memory - consider streaming for files >1MB
- Token estimation is O(1) after file read

**Caching:**
- No caching needed for single consultation
- Future enhancement: cache project context for repeated consultations

### References

- [Source: _bmad-output/planning-artifacts/architecture.md] - Overall architecture
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.1] - Story requirements (lines 1717-1800)
- [Source: src/utils/ProjectContext.ts] - Existing project context utility
- [Source: src/consult/context/BrownfieldDetector.ts] - Brownfield detection (Story 4.4)
- [Source: src/consult/context/ContextAugmenter.ts] - Context augmentation (Story 4.4)
- [Source: src/commands/consult.ts] - CLI command implementation
- [Source: src/orchestration/ConsultOrchestrator.ts] - Orchestrator integration point
- [Source: _bmad-output/implementation-artifacts/4-4-brownfield-project-detection-with-documentation-bias.md] - Previous story learnings

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Implemented `ContextLoader` class for loading and processing context from files and projects.
- Integrated `ContextLoader` into `consult` CLI command.
- Updated `ConsultOrchestrator` to accept and log context metadata.
- Updated logging system to output context sources in JSON logs.
- Added comprehensive unit tests for context loading and CLI integration.

### File List

- src/consult/context/ContextLoader.ts
- src/consult/context/__tests__/ContextLoader.test.ts
- src/commands/consult.ts
- src/commands/__tests__/consult_context.test.ts
- src/orchestration/ConsultOrchestrator.ts
- src/types/consult.ts
- src/consult/artifacts/ArtifactTransformer.ts

### Change Log

- Implemented `ContextLoader` for loading files and project context.
- Added `loadFileContext` and `loadProjectContext` methods.
- Integrated `ContextLoader` into `consult` command.
- Updated `ConsultOrchestrator` to accept and log `contextMetadata`.
- Updated `ConsultationResult` type and `ArtifactTransformer` for JSON logging.
- Added unit tests for `ContextLoader` and integration tests for CLI.

### Code Review Fixes (2026-01-03)

**Issues Found:** 2 High, 3 Medium, 2 Low

**Fixes Applied:**

1. **[HIGH] loadedContext not passed to ConsultOrchestrator** - Fixed in `src/commands/consult.ts:124`
   - Added `loadedContext: loadedContext ?? undefined` to orchestrator constructor options
   - This enables AC #6 (Context Passed to All Rounds) and AC #7 (Logged Metadata)

2. **[MEDIUM] Empty file array validation missing** - Fixed in `src/consult/context/ContextLoader.ts:15-19`
   - Added validation to filter empty strings and throw helpful error if no valid paths

3. **[MEDIUM] Duplicate contextMetadata code** - Fixed in `src/orchestration/ConsultOrchestrator.ts:1647-1662`
   - Extracted to `buildContextMetadata()` helper method
   - Replaced two duplicate blocks with single method call

4. **[MEDIUM] Missing test coverage** - Added 3 new tests in `ContextLoader.test.ts`
   - Test for empty file paths array
   - Test for array with only empty strings
   - Test for directory path rejection

**Tests:** 17 passed, 0 failed (was 14 passed before review)