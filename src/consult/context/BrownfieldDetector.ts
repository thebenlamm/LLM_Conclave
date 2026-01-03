import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import { DocumentationDiscovery, DocumentationResult } from './DocumentationDiscovery';
import { FrameworkDetector } from './FrameworkDetector';
import { TechStackAnalyzer } from './TechStackAnalyzer';

export type BrownfieldIndicatorType =
  | 'source_files'
  | 'package_manifest'
  | 'config_file'
  | 'documentation'
  | 'git_repo';

export interface BrownfieldIndicator {
  type: BrownfieldIndicatorType;
  name: string;
  path: string;
  details?: string;
}

export interface TechStackAnalysis {
  framework: string | null;
  frameworkVersion: string | null;
  architecturePattern: string | null;
  stateManagement: string | null;
  styling: string | null;
  testing: string[];
  api: string | null;
  database: string | null;
  orm: string | null;
  cicd: string | null;
}

export interface BrownfieldAnalysis {
  projectType: 'brownfield' | 'greenfield';
  indicatorsFound: BrownfieldIndicator[];
  indicatorCount: number;
  techStack: TechStackAnalysis;
  documentation: DocumentationResult;
  biasApplied: boolean;
}

const PACKAGE_MANIFESTS = [
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

const CONFIG_FILES = [
  'tsconfig.json',
  'jsconfig.json',
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.json',
  'webpack.config.js',
  'webpack.config.ts',
  'vite.config.js',
  'vite.config.ts',
  'next.config.js',
  'next.config.mjs',
  '.babelrc',
  'babel.config.js',
  'jest.config.js',
  'vitest.config.ts',
  'tailwind.config.js',
  'tailwind.config.ts',
  '.prettierrc',
  'prettier.config.js'
];

const DOCUMENTATION_FILES = [
  'README.md',
  'README.txt',
  'README',
  'ARCHITECTURE.md',
  'CONTRIBUTING.md',
  'DESIGN.md',
  'CHANGELOG.md',
  'API.md'
];

export class BrownfieldDetector {
  projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = path.resolve(projectPath);
  }

  async detectBrownfield(): Promise<BrownfieldAnalysis> {
    const indicators: BrownfieldIndicator[] = [];

    const sourceCount = await this.countSourceFiles(['src', 'lib', 'app']);
    if (sourceCount >= 10) {
      indicators.push({
        type: 'source_files',
        name: 'Source directories',
        path: this.projectPath,
        details: `${sourceCount} files found`
      });
    }

    indicators.push(...await this.detectFileIndicators(PACKAGE_MANIFESTS, 'package_manifest'));
    indicators.push(...await this.detectConfigIndicators());
    indicators.push(...await this.detectDocumentationIndicators());

    const gitCommits = await this.checkGitCommits();
    if (gitCommits >= 10) {
      indicators.push({
        type: 'git_repo',
        name: 'Git repository',
        path: path.join(this.projectPath, '.git'),
        details: `${gitCommits} commits`
      });
    }

    const techStack = await new TechStackAnalyzer(this.projectPath).analyze();
    const framework = await new FrameworkDetector(this.projectPath).detectFramework();
    techStack.framework = framework.framework;
    techStack.frameworkVersion = framework.frameworkVersion;
    techStack.architecturePattern = framework.architecturePattern;
    const documentation = await new DocumentationDiscovery(this.projectPath).discoverDocumentation();
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

  async countSourceFiles(dirs: string[]): Promise<number> {
    let count = 0;

    for (const dir of dirs) {
      const dirPath = path.join(this.projectPath, dir);
      count += await this.countFilesRecursive(dirPath);
    }

    return count;
  }

  async checkGitCommits(): Promise<number> {
    try {
      const result = execSync('git rev-list --count HEAD', {
        cwd: this.projectPath,
        encoding: 'utf8',
        timeout: 5000
      });
      const parsed = parseInt(String(result).trim(), 10);
      return Number.isFinite(parsed) ? parsed : 0;
    } catch {
      return 0;
    }
  }

  private async countFilesRecursive(dirPath: string, depth: number = 0): Promise<number> {
    if (depth > 5) return 0;

    try {
      const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
      let count = 0;

      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        if (entry.name === 'node_modules') continue;

        const entryPath = path.join(dirPath, entry.name);
        if (entry.isFile()) {
          count += 1;
        } else if (entry.isDirectory()) {
          count += await this.countFilesRecursive(entryPath, depth + 1);
        }
      }

      return count;
    } catch {
      return 0;
    }
  }

  private async detectFileIndicators(
    files: { file: string; name: string }[],
    type: BrownfieldIndicatorType
  ): Promise<BrownfieldIndicator[]> {
    const indicators: BrownfieldIndicator[] = [];

    for (const { file, name } of files) {
      const filePath = path.join(this.projectPath, file);
      if (await this.fileExists(filePath)) {
        indicators.push({
          type,
          name,
          path: filePath
        });
      }
    }

    return indicators;
  }

  private async detectConfigIndicators(): Promise<BrownfieldIndicator[]> {
    const indicators: BrownfieldIndicator[] = [];

    for (const file of CONFIG_FILES) {
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

  private async detectDocumentationIndicators(): Promise<BrownfieldIndicator[]> {
    const indicators: BrownfieldIndicator[] = [];

    for (const file of DOCUMENTATION_FILES) {
      const filePath = path.join(this.projectPath, file);
      if (await this.fileExists(filePath)) {
        indicators.push({
          type: 'documentation',
          name: file,
          path: filePath
        });
      }
    }

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
