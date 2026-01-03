# Story 4.4: Brownfield Project Detection with Documentation Bias

Status: review

## Story

As a **developer**,
I want automatic detection of brownfield projects with bias toward existing documentation,
So that consultations leverage project-specific context instead of generic advice.

## Acceptance Criteria

1. **Brownfield Detection Logic**:
   - When `--project` flag is used, system scans for brownfield indicators:
     - Existing source files (src/, lib/, app/ directories with 10+ files)
     - Package manifests (package.json, requirements.txt, Cargo.toml, Gemfile, pom.xml, etc.)
     - Configuration files (tsconfig.json, .eslintrc, webpack.config.js, vite.config.ts, etc.)
     - Documentation (README.md, ARCHITECTURE.md, CONTRIBUTING.md, etc.)
     - Git repository with 10+ commits
   - If 3+ indicators found → project classified as brownfield
   - Display: "🏗️ Brownfield project detected. Biasing toward existing patterns."

2. **Framework Detection from package.json**:
   - Detect framework from dependencies when package.json exists:
     - React: "react" in dependencies
     - Next.js: "next" in dependencies (detect App Router vs Pages Router from directory structure)
     - Vue: "vue" in dependencies
     - Angular: "@angular/core" in dependencies
     - Svelte: "svelte" in dependencies
     - Express: "express" in dependencies
     - Fastify: "fastify" in dependencies
     - NestJS: "@nestjs/core" in dependencies
   - Python: requirements.txt → Flask/Django/FastAPI detection
   - Ruby: Gemfile → Rails detection
   - Rust: Cargo.toml → framework from dependencies
   - Java: pom.xml or build.gradle → Spring Boot detection

3. **Documentation Discovery**:
   - When brownfield project detected, search for project documentation:
     - README.md, ARCHITECTURE.md, CONTRIBUTING.md, DESIGN.md
     - docs/ directory
     - .github/ directory (PULL_REQUEST_TEMPLATE, CODING_STANDARDS, etc.)
     - Comments in package.json ("description", "keywords")
     - JSDoc/TSDoc comments in main entry points

4. **Context Augmentation**:
   - When documentation found, agent prompts are augmented with:
     ```
     IMPORTANT: This is a brownfield project with existing patterns.

     Project Context:
     - Framework: [detected framework and version]
     - State Management: [detected]
     - Styling: [detected]
     - Testing: [detected]
     - API Layer: [detected]
     - Database: [detected]

     When recommending solutions:
     1. Prefer patterns already used in this codebase
     2. Maintain consistency with existing architecture
     3. Only suggest changes if they solve specific problems
     4. Consider migration costs and team familiarity
     5. Respect existing tech stack choices unless critically flawed
     ```

5. **Greenfield vs Brownfield Prompting**:
   - If no brownfield indicators found (greenfield project):
     - Prompts focus on best practices and modern patterns
     - No bias toward existing patterns
     - Display: "🆕 Greenfield project. Recommendations based on current best practices."

6. **Override Flag**:
   - Support `--greenfield` flag to ignore brownfield context
   - When used: treats project as greenfield even if brownfield indicators exist
   - Display: "🔧 Ignoring existing patterns (--greenfield mode)"

7. **Logged Metadata**:
   - Consultation log includes `projectContext`:
     ```json
     {
       "project_type": "brownfield",
       "framework_detected": "nextjs",
       "framework_version": "14",
       "architecture_pattern": "app_router",
       "tech_stack": {
         "state_management": "zustand",
         "styling": "tailwind",
         "testing": ["vitest", "playwright"],
         "api": "trpc",
         "database": "postgresql",
         "orm": "prisma"
       },
       "indicators_found": ["package.json", "tsconfig.json", "README.md", "src/", "git"],
       "documentation_used": ["README.md", "ARCHITECTURE.md"],
       "bias_applied": true
     }
     ```

## Tasks / Subtasks

- [x] Task 1: Create BrownfieldDetector Module (AC: #1, #2)
  - [x] Create `src/consult/context/BrownfieldDetector.ts`
  - [x] Define `BrownfieldIndicator` interface
  - [x] Define `BrownfieldAnalysis` interface
  - [x] Define `TechStackAnalysis` interface
  - [x] Implement `detectBrownfield(projectPath: string): Promise<BrownfieldAnalysis>`
  - [x] Implement `countSourceFiles(dirs: string[]): Promise<number>` helper
  - [x] Implement `checkGitCommits(): Promise<number>` helper
  - [x] Add unit tests in `src/consult/context/__tests__/BrownfieldDetector.test.ts`

- [x] Task 2: Extend Framework Detection (AC: #2)
  - [x] Leverage existing `ProjectScanner._detectNodeFramework()` in `src/init/ProjectScanner.ts`
  - [x] Create `src/consult/context/FrameworkDetector.ts` that extends detection
  - [x] Add Next.js App Router vs Pages Router detection (check for `app/` vs `pages/` directory)
  - [x] Add version detection from package.json dependencies
  - [x] Add Python framework detection (Django/Flask/FastAPI from requirements.txt)
  - [x] Add Ruby framework detection (Rails from Gemfile)
  - [x] Add Java framework detection (Spring Boot from pom.xml/build.gradle)
  - [x] Add Rust framework detection (from Cargo.toml)
  - [x] Add unit tests for each framework detection

- [x] Task 3: Implement Tech Stack Analysis (AC: #2)
  - [x] Create `TechStackAnalyzer` class within BrownfieldDetector
  - [x] Detect state management (Redux, Zustand, MobX, Jotai, Recoil, Context)
  - [x] Detect styling (Tailwind, styled-components, Emotion, CSS Modules, Sass)
  - [x] Detect testing (Jest, Vitest, Mocha, Playwright, Cypress, Testing Library)
  - [x] Detect API patterns (tRPC, REST, GraphQL, gRPC)
  - [x] Detect database/ORM (Prisma, TypeORM, Drizzle, Mongoose, Sequelize)
  - [x] Detect CI/CD patterns from .github/workflows, .gitlab-ci.yml, etc.

- [x] Task 4: Implement Documentation Discovery (AC: #3)
  - [x] Create `DocumentationDiscovery` class
  - [x] Implement `discoverDocumentation(projectPath: string): Promise<DocumentationResult>`
  - [x] Search for standard doc files (README.md, ARCHITECTURE.md, CONTRIBUTING.md, DESIGN.md)
  - [x] Search docs/ directory for markdown files
  - [x] Search .github/ directory for templates and guidelines
  - [x] Extract package.json description and keywords
  - [x] Optionally scan main entry points for JSDoc comments (configurable, may be slow)
  - [x] Return list of found documentation with paths and excerpts

- [x] Task 5: Create Context Augmenter (AC: #4)
  - [x] Create `src/consult/context/ContextAugmenter.ts`
  - [x] Implement `augmentPrompt(basePrompt: string, brownfieldAnalysis: BrownfieldAnalysis): string`
  - [x] Format project context block with detected stack
  - [x] Add brownfield-specific guidance rules
  - [x] Handle greenfield case (no augmentation, different guidance)

- [x] Task 6: Integrate with ConsultOrchestrator (AC: #1-#5)
  - [x] Modify `src/orchestration/ConsultOrchestrator.ts`
  - [x] Add `brownfieldAnalysis` to orchestrator options
  - [x] Before Round 1, if `--project` flag used:
    - [x] Run BrownfieldDetector
    - [x] Run DocumentationDiscovery
    - [x] Store analysis result
  - [x] Pass augmented prompts to Round 1 agents
  - [x] Include `projectContext` in ConsultationResult

- [x] Task 7: Add CLI Flags (AC: #5, #6)
  - [x] Modify `src/commands/consult.ts`
  - [x] Add `--greenfield` flag option
  - [x] When `--greenfield` used, skip brownfield detection
  - [x] Display appropriate status messages based on detection result

- [x] Task 8: Update ConsultationResult Types (AC: #7)
  - [x] Add `ProjectContextMetadata` interface to `src/types/consult.ts`
  - [x] Add `projectContext` field to ConsultationResult
  - [x] Add JSON schema for snake_case serialization

- [x] Task 9: Update ConsultLogger (AC: #7)
  - [x] Modify `src/consult/logging/ConsultationFileLogger.ts`
  - [x] Include `project_context` in JSONL output
  - [x] Ensure snake_case conversion for all nested fields

- [x] Task 10: Update SQLite Analytics (AC: #7)
  - [x] Add `project_type` column to consultations table
  - [x] Add `framework_detected` column
  - [x] Add `tech_stack` JSON column
  - [x] Create migration for new columns
  - [x] Update AnalyticsIndexer to capture project context

- [x] Task 11: Update Stats Query for Project Insights
  - [x] Add project type distribution to StatsQuery
  - [x] Add framework usage breakdown
  - [x] Add brownfield vs greenfield consultation counts

- [x] Task 12: Unit and Integration Tests
  - [x] Test brownfield detection with various project structures
  - [x] Test framework detection accuracy
  - [x] Test tech stack analysis
  - [x] Test documentation discovery
  - [x] Test context augmentation
  - [x] Test CLI flag behavior
  - [x] Test logging and analytics capture
  - [x] Integration test: full consultation with brownfield context

## Dev Notes

### Architecture Context

This story implements **FR21: Brownfield project detection** from the epics document. It enhances consultation quality by automatically detecting when users are working with existing codebases and biasing recommendations toward established patterns.

**Design Rationale:**
- Leverages existing `ProjectScanner` infrastructure in `src/init/ProjectScanner.ts`
- Extends existing `ProjectContext` utility in `src/utils/ProjectContext.ts`
- Detection happens once before Round 1, minimal performance impact
- Greenfield override ensures users can opt out of bias when desired

### Existing Code Patterns to Follow

**File Naming (from architecture.md):**
- TypeScript files: PascalCase (`BrownfieldDetector.ts`)
- Variables/functions: camelCase (`detectBrownfield`, `analyzeTechStack`)

**Import Patterns (from existing code):**
```typescript
// Import from existing utilities
import ProjectScanner from '../init/ProjectScanner';
import ProjectContext from '../utils/ProjectContext';

// Import types
import { ConsultationResult } from '../types/consult';
```

**Async I/O Pattern (from ProjectContext.ts):**
```typescript
import * as fsPromises from 'fs/promises';

async function checkFileExists(filePath: string): Promise<boolean> {
  try {
    await fsPromises.access(filePath);
    return true;
  } catch {
    return false;
  }
}
```

### Technical Requirements

**Dependencies:**
- Uses existing `ProjectScanner` for initial framework detection
- Uses existing `ProjectContext` for file reading utilities
- Extends existing async I/O patterns
- Integrates with existing `ConsultOrchestrator`

**Brownfield Indicators Priority:**
1. Source directories with 10+ files (src/, lib/, app/)
2. Package manifest files (package.json, requirements.txt, Cargo.toml)
3. Configuration files (tsconfig.json, .eslintrc, webpack.config.js)
4. Documentation files (README.md, ARCHITECTURE.md)
5. Git repository with 10+ commits

**Classification Thresholds:**
- 3+ indicators = brownfield
- <3 indicators = greenfield

### Project Structure Notes

**New Directory to Create:**
```
src/consult/context/
├── BrownfieldDetector.ts     # Core detection logic
├── FrameworkDetector.ts      # Extended framework detection
├── TechStackAnalyzer.ts      # Tech stack analysis
├── DocumentationDiscovery.ts # Doc discovery
├── ContextAugmenter.ts       # Prompt augmentation
└── __tests__/
    ├── BrownfieldDetector.test.ts
    ├── FrameworkDetector.test.ts
    ├── TechStackAnalyzer.test.ts
    └── DocumentationDiscovery.test.ts
```

**Files to Modify:**
- `src/types/consult.ts` - Add ProjectContextMetadata types
- `src/orchestration/ConsultOrchestrator.ts` - Integrate brownfield analysis
- `src/commands/consult.ts` - Add --greenfield flag
- `src/consult/logging/ConsultationFileLogger.ts` - Log project context
- `src/consult/analytics/AnalyticsIndexer.ts` - Index project metadata

### Key Implementation Details

**BrownfieldAnalysis Interface:**
```typescript
export interface BrownfieldIndicator {
  type: 'source_files' | 'package_manifest' | 'config_file' | 'documentation' | 'git_repo';
  name: string;
  path: string;
  details?: string; // e.g., "15 files found" or "87 commits"
}

export interface TechStackAnalysis {
  framework: string | null;
  frameworkVersion: string | null;
  architecturePattern: string | null; // e.g., 'app_router', 'pages_router'
  stateManagement: string | null;
  styling: string | null;
  testing: string[];
  api: string | null;
  database: string | null;
  orm: string | null;
  cicd: string | null;
}

export interface DocumentationResult {
  files: {
    name: string;
    path: string;
    excerpt: string; // First 500 chars
  }[];
  totalFound: number;
}

export interface BrownfieldAnalysis {
  projectType: 'brownfield' | 'greenfield';
  indicatorsFound: BrownfieldIndicator[];
  indicatorCount: number;
  techStack: TechStackAnalysis;
  documentation: DocumentationResult;
  biasApplied: boolean;
}
```

**BrownfieldDetector Class:**
```typescript
export class BrownfieldDetector {
  private projectPath: string;
  private projectScanner: ProjectScanner;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.projectScanner = new ProjectScanner(projectPath);
  }

  async detect(): Promise<BrownfieldAnalysis> {
    const indicators: BrownfieldIndicator[] = [];

    // Check source directories
    const sourceCount = await this.countSourceFiles(['src', 'lib', 'app']);
    if (sourceCount >= 10) {
      indicators.push({
        type: 'source_files',
        name: 'Source directories',
        path: this.projectPath,
        details: `${sourceCount} files found`
      });
    }

    // Check package manifests
    const manifests = await this.detectPackageManifests();
    indicators.push(...manifests);

    // Check config files
    const configs = await this.detectConfigFiles();
    indicators.push(...configs);

    // Check documentation
    const docs = await this.detectDocumentation();
    indicators.push(...docs);

    // Check git history
    const gitCommits = await this.countGitCommits();
    if (gitCommits >= 10) {
      indicators.push({
        type: 'git_repo',
        name: 'Git repository',
        path: path.join(this.projectPath, '.git'),
        details: `${gitCommits} commits`
      });
    }

    // Run tech stack analysis
    const techStack = await this.analyzeTechStack();

    // Run documentation discovery
    const documentation = await this.discoverDocumentation();

    const isBrownfield = indicators.length >= 3;

    return {
      projectType: isBrownfield ? 'brownfield' : 'greenfield',
      indicatorsFound: indicators,
      indicatorCount: indicators.length,
      techStack,
      documentation,
      biasApplied: isBrownfield
    };
  }

  private async countSourceFiles(dirs: string[]): Promise<number> {
    let count = 0;
    for (const dir of dirs) {
      const dirPath = path.join(this.projectPath, dir);
      try {
        const files = await this.countFilesRecursive(dirPath);
        count += files;
      } catch {
        // Directory doesn't exist
      }
    }
    return count;
  }

  private async countFilesRecursive(dirPath: string, depth: number = 0): Promise<number> {
    if (depth > 5) return 0; // Limit recursion

    try {
      const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
      let count = 0;

      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        if (entry.name === 'node_modules') continue;

        if (entry.isFile()) {
          count++;
        } else if (entry.isDirectory()) {
          count += await this.countFilesRecursive(
            path.join(dirPath, entry.name),
            depth + 1
          );
        }
      }

      return count;
    } catch {
      return 0;
    }
  }

  private async countGitCommits(): Promise<number> {
    try {
      const { execSync } = require('child_process');
      const result = execSync('git rev-list --count HEAD', {
        cwd: this.projectPath,
        encoding: 'utf8',
        timeout: 5000
      });
      return parseInt(result.trim(), 10);
    } catch {
      return 0;
    }
  }

  private async detectPackageManifests(): Promise<BrownfieldIndicator[]> {
    const indicators: BrownfieldIndicator[] = [];
    const manifests = [
      { file: 'package.json', name: 'Node.js manifest' },
      { file: 'requirements.txt', name: 'Python requirements' },
      { file: 'Pipfile', name: 'Python Pipfile' },
      { file: 'pyproject.toml', name: 'Python pyproject' },
      { file: 'Cargo.toml', name: 'Rust Cargo' },
      { file: 'go.mod', name: 'Go modules' },
      { file: 'Gemfile', name: 'Ruby Gemfile' },
      { file: 'pom.xml', name: 'Maven POM' },
      { file: 'build.gradle', name: 'Gradle build' },
      { file: 'composer.json', name: 'PHP Composer' }
    ];

    for (const { file, name } of manifests) {
      const filePath = path.join(this.projectPath, file);
      if (await this.fileExists(filePath)) {
        indicators.push({
          type: 'package_manifest',
          name,
          path: filePath
        });
      }
    }

    return indicators;
  }

  private async detectConfigFiles(): Promise<BrownfieldIndicator[]> {
    const indicators: BrownfieldIndicator[] = [];
    const configs = [
      'tsconfig.json', 'jsconfig.json',
      '.eslintrc', '.eslintrc.js', '.eslintrc.json',
      'webpack.config.js', 'webpack.config.ts',
      'vite.config.js', 'vite.config.ts',
      'next.config.js', 'next.config.mjs',
      '.babelrc', 'babel.config.js',
      'jest.config.js', 'vitest.config.ts',
      'tailwind.config.js', 'tailwind.config.ts',
      '.prettierrc', 'prettier.config.js'
    ];

    for (const file of configs) {
      const filePath = path.join(this.projectPath, file);
      if (await this.fileExists(filePath)) {
        indicators.push({
          type: 'config_file',
          name: file,
          path: filePath
        });
      }
    }

    return indicators;
  }

  private async detectDocumentation(): Promise<BrownfieldIndicator[]> {
    const indicators: BrownfieldIndicator[] = [];
    const docs = [
      'README.md', 'README.txt', 'README',
      'ARCHITECTURE.md', 'CONTRIBUTING.md', 'DESIGN.md',
      'CHANGELOG.md', 'API.md'
    ];

    for (const file of docs) {
      const filePath = path.join(this.projectPath, file);
      if (await this.fileExists(filePath)) {
        indicators.push({
          type: 'documentation',
          name: file,
          path: filePath
        });
      }
    }

    // Check for docs/ directory
    const docsDir = path.join(this.projectPath, 'docs');
    if (await this.directoryExists(docsDir)) {
      indicators.push({
        type: 'documentation',
        name: 'docs/',
        path: docsDir
      });
    }

    return indicators;
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fsPromises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stats = await fsPromises.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }
}
```

**Context Augmentation:**
```typescript
export class ContextAugmenter {
  augmentPrompt(
    basePrompt: string,
    analysis: BrownfieldAnalysis
  ): string {
    if (analysis.projectType === 'greenfield') {
      // No augmentation for greenfield
      return basePrompt + '\n\nNote: This appears to be a greenfield project. Recommendations should follow current best practices without bias toward existing patterns.';
    }

    // Build brownfield context block
    const contextBlock = this.buildContextBlock(analysis);
    const guidelines = this.buildBrownfieldGuidelines();

    return `${contextBlock}\n\n${basePrompt}\n\n${guidelines}`;
  }

  private buildContextBlock(analysis: BrownfieldAnalysis): string {
    const { techStack } = analysis;
    let block = 'IMPORTANT: This is a brownfield project with existing patterns.\n\n';
    block += 'Project Context:\n';

    if (techStack.framework) {
      let frameworkStr = techStack.framework;
      if (techStack.frameworkVersion) {
        frameworkStr += ` ${techStack.frameworkVersion}`;
      }
      if (techStack.architecturePattern) {
        frameworkStr += ` (${techStack.architecturePattern})`;
      }
      block += `- Framework: ${frameworkStr}\n`;
    }

    if (techStack.stateManagement) {
      block += `- State Management: ${techStack.stateManagement}\n`;
    }

    if (techStack.styling) {
      block += `- Styling: ${techStack.styling}\n`;
    }

    if (techStack.testing.length > 0) {
      block += `- Testing: ${techStack.testing.join(', ')}\n`;
    }

    if (techStack.api) {
      block += `- API Layer: ${techStack.api}\n`;
    }

    if (techStack.database || techStack.orm) {
      const dbInfo = [techStack.database, techStack.orm].filter(Boolean).join(' with ');
      block += `- Database: ${dbInfo}\n`;
    }

    return block;
  }

  private buildBrownfieldGuidelines(): string {
    return `When recommending solutions for this brownfield project:
1. Prefer patterns already used in this codebase
2. Maintain consistency with existing architecture
3. Only suggest changes if they solve specific problems
4. Consider migration costs and team familiarity
5. Respect existing tech stack choices unless critically flawed`;
  }
}
```

**CLI Flag Integration:**
```typescript
// In src/commands/consult.ts
program
  .command('consult <question>')
  .option('--project <path>', 'Project directory for context')
  .option('--greenfield', 'Ignore brownfield detection and use greenfield mode')
  .action(async (question, options) => {
    let brownfieldAnalysis: BrownfieldAnalysis | null = null;

    if (options.project && !options.greenfield) {
      const detector = new BrownfieldDetector(options.project);
      brownfieldAnalysis = await detector.detect();

      if (brownfieldAnalysis.projectType === 'brownfield') {
        console.log(chalk.cyan('🏗️ Brownfield project detected. Biasing toward existing patterns.'));
      } else {
        console.log(chalk.green('🆕 Greenfield project. Recommendations based on current best practices.'));
      }
    } else if (options.greenfield) {
      console.log(chalk.yellow('🔧 Ignoring existing patterns (--greenfield mode)'));
    }

    // Pass analysis to orchestrator
    // ...
  });
```

### SQLite Schema Updates

**Migration for Project Context:**
```sql
-- Add columns to consultations table
ALTER TABLE consultations ADD COLUMN project_type TEXT;
ALTER TABLE consultations ADD COLUMN framework_detected TEXT;
ALTER TABLE consultations ADD COLUMN tech_stack TEXT; -- JSON string

CREATE INDEX idx_consultations_project_type ON consultations(project_type);
CREATE INDEX idx_consultations_framework ON consultations(framework_detected);
```

### Testing Requirements

**Unit Tests (BrownfieldDetector):**
```typescript
describe('BrownfieldDetector', () => {
  describe('detect', () => {
    it('classifies project with 3+ indicators as brownfield', async () => {
      // Mock project with package.json, tsconfig.json, README.md, src/ with 15 files
      const detector = new BrownfieldDetector('/path/to/project');
      const result = await detector.detect();
      expect(result.projectType).toBe('brownfield');
      expect(result.indicatorCount).toBeGreaterThanOrEqual(3);
    });

    it('classifies project with <3 indicators as greenfield', async () => {
      // Mock project with only README.md
      const detector = new BrownfieldDetector('/path/to/minimal');
      const result = await detector.detect();
      expect(result.projectType).toBe('greenfield');
      expect(result.indicatorCount).toBeLessThan(3);
    });
  });

  describe('countGitCommits', () => {
    it('returns commit count from git history', async () => {
      const detector = new BrownfieldDetector(process.cwd());
      const commits = await detector['countGitCommits']();
      expect(commits).toBeGreaterThan(0);
    });
  });
});
```

**Integration Tests:**
- Full consultation with brownfield project context
- Verify prompt augmentation contains project context
- Verify logging includes project metadata
- Verify --greenfield flag overrides detection

### Story Dependencies

**From Story 4.1-4.3 (Same Epic):**
- ModeStrategy pattern for prompt customization
- ContextAugmenter can be mode-aware (explore vs converge may need different brownfield guidance)

**Existing Code Integration:**
- Extends `ProjectScanner` in `src/init/ProjectScanner.ts` for framework detection
- Uses `ProjectContext` in `src/utils/ProjectContext.ts` for file loading utilities
- Integrates with `ConsultOrchestrator` for prompt augmentation

### Performance Considerations

**Detection Speed:**
- File existence checks are fast (async I/O)
- Git commit count via execSync with 5s timeout
- Source file counting limited to depth 5
- Total detection should complete in <2 seconds for most projects

**Caching:**
- Consider caching brownfield analysis result per project path
- Cache invalidation: check modification time of key files

### References

- [Source: _bmad-output/planning-artifacts/architecture.md] - Overall architecture
- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.4] - Story requirements (lines 1605-1714)
- [Source: src/init/ProjectScanner.ts] - Existing project scanning (framework detection)
- [Source: src/utils/ProjectContext.ts] - Existing project context utility
- [Source: src/types/consult.ts] - Type definitions for consultation
- [Source: src/orchestration/ConsultOrchestrator.ts] - Orchestrator integration point
- [Source: src/commands/consult.ts] - CLI command implementation
- [Source: _bmad-output/implementation-artifacts/4-3-debate-value-tracking-with-agent-position-analysis.md] - Previous story context

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References
- `npm test -- --runTestsByPath src/consult/context/__tests__/BrownfieldDetector.test.ts --watchman=false`
  (watchman error without `--watchman=false`)
- `npm test -- --runTestsByPath src/consult/context/__tests__/FrameworkDetector.test.ts --watchman=false`
- `npm test -- --runTestsByPath src/consult/context/__tests__/TechStackAnalyzer.test.ts --watchman=false`
- `npm test -- --runTestsByPath src/consult/context/__tests__/DocumentationDiscovery.test.ts --watchman=false`
- `npm test -- --runTestsByPath src/consult/context/__tests__/ContextAugmenter.test.ts --watchman=false`
- `npm test -- --runTestsByPath src/orchestration/__tests__/ConsultOrchestrator.test.ts --watchman=false`
  (timed out after tests completed due to Jest open handles warning)
- `npm test -- --runTestsByPath src/commands/__tests__/consult.test.ts --watchman=false`
- `npm test -- --runTestsByPath src/consult/artifacts/__tests__/ArtifactTransformer.test.ts --watchman=false`
- `npm test -- --runTestsByPath src/consult/logging/__tests__/ConsultationFileLogger.test.ts --watchman=false`
- `npm test -- --runTestsByPath src/consult/analytics/__tests__/ProjectContextAnalytics.test.ts --watchman=false`

### Completion Notes List
- Implemented `BrownfieldDetector` with indicator checks and helper methods.
- Added unit tests covering brownfield vs greenfield classification.
- Implemented `FrameworkDetector` with Node and cross-language framework detection.
- Added version detection and Next.js router pattern detection.
- Added unit tests for framework detection cases.
- Implemented `TechStackAnalyzer` and wired it into brownfield detection.
- Added unit test coverage for tech stack detection signals.
- Implemented `DocumentationDiscovery` and wired documentation results into brownfield analysis.
- Added tests for documentation discovery across standard docs, docs/ content, and package metadata.
- Implemented `ContextAugmenter` for brownfield/greenfield prompt handling.
- Added tests for context augmentation output.
- Integrated brownfield detection into `ConsultOrchestrator` and added project context metadata output.
- Wired Round 1 prompts through strategy-based prompt generation with optional brownfield augmentation.
- Added `--greenfield` CLI flag and routed project options into orchestrator.
- Added project context metadata to consultation types and JSON serialization.
- Added analytics migration and indexing for project context metadata plus stats dashboard reporting.
- Added tests for logging, analytics, CLI flags, and brownfield orchestration flow.

### File List
- src/consult/context/BrownfieldDetector.ts
- src/consult/context/__tests__/BrownfieldDetector.test.ts
- src/consult/context/FrameworkDetector.ts
- src/consult/context/__tests__/FrameworkDetector.test.ts
- src/init/ProjectScanner.ts
- src/consult/context/TechStackAnalyzer.ts
- src/consult/context/__tests__/TechStackAnalyzer.test.ts
- src/consult/context/DocumentationDiscovery.ts
- src/consult/context/__tests__/DocumentationDiscovery.test.ts
- src/consult/context/ContextAugmenter.ts
- src/consult/context/__tests__/ContextAugmenter.test.ts
- src/orchestration/ConsultOrchestrator.ts
- src/types/consult.ts
- src/commands/consult.ts
- src/consult/artifacts/ArtifactTransformer.ts
- src/consult/artifacts/__tests__/ArtifactTransformer.test.ts
- src/consult/logging/__tests__/ConsultationFileLogger.test.ts
- src/consult/analytics/AnalyticsIndexer.ts
- src/consult/analytics/StatsQuery.ts
- src/consult/analytics/__tests__/ProjectContextAnalytics.test.ts
- src/consult/analytics/schemas/migrations/003_project_context.sql
- src/commands/consult-stats.ts
- src/commands/__tests__/consult.test.ts
- src/orchestration/__tests__/ConsultOrchestrator.test.ts

### Change Log

- 2026-01-02: Implemented brownfield context detection, orchestration integration, analytics updates, and tests.
- 2026-01-03: Fixed blocking I/O in BrownfieldDetector, resolved context amnesia in later rounds, and optimized DocumentationDiscovery performance during Adversarial Code Review.

## Story Status
done
