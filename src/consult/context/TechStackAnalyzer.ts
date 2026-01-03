import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { TechStackAnalysis } from './BrownfieldDetector';

const STATE_MANAGEMENT_DEPS = [
  { name: 'Redux', deps: ['redux', '@reduxjs/toolkit'] },
  { name: 'Zustand', deps: ['zustand'] },
  { name: 'MobX', deps: ['mobx'] },
  { name: 'Jotai', deps: ['jotai'] },
  { name: 'Recoil', deps: ['recoil'] }
];

const STYLING_DEPS = [
  { name: 'Tailwind', deps: ['tailwindcss'] },
  { name: 'styled-components', deps: ['styled-components'] },
  { name: 'Emotion', deps: ['@emotion/react', '@emotion/styled'] },
  { name: 'CSS Modules', deps: ['postcss-modules'] },
  { name: 'Sass', deps: ['sass', 'node-sass'] }
];

const TESTING_DEPS = [
  { name: 'Jest', deps: ['jest'] },
  { name: 'Vitest', deps: ['vitest'] },
  { name: 'Mocha', deps: ['mocha'] },
  { name: 'Playwright', deps: ['playwright', '@playwright/test'] },
  { name: 'Cypress', deps: ['cypress'] },
  { name: 'Testing Library', deps: ['@testing-library/react', '@testing-library/vue', '@testing-library/angular'] }
];

const API_DEPS = [
  { name: 'tRPC', deps: ['@trpc/server', '@trpc/client'] },
  { name: 'GraphQL', deps: ['graphql', '@apollo/server', 'apollo-server'] },
  { name: 'gRPC', deps: ['@grpc/grpc-js', 'grpc'] },
  { name: 'REST', deps: ['express', 'fastify', 'koa', 'hapi'] }
];

const DATABASE_DEPS = [
  { name: 'PostgreSQL', deps: ['pg'] },
  { name: 'MySQL', deps: ['mysql', 'mysql2'] },
  { name: 'SQLite', deps: ['sqlite3', 'better-sqlite3'] },
  { name: 'MongoDB', deps: ['mongodb'] }
];

const ORM_DEPS = [
  { name: 'Prisma', deps: ['prisma'] },
  { name: 'TypeORM', deps: ['typeorm'] },
  { name: 'Drizzle', deps: ['drizzle-orm'] },
  { name: 'Mongoose', deps: ['mongoose'] },
  { name: 'Sequelize', deps: ['sequelize'] }
];

export class TechStackAnalyzer {
  projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = path.resolve(projectPath);
  }

  async analyze(): Promise<TechStackAnalysis> {
    const deps = await this.readAllDependencies();

    return {
      framework: null,
      frameworkVersion: null,
      architecturePattern: null,
      stateManagement: this.detectSingleMatch(deps, STATE_MANAGEMENT_DEPS),
      styling: this.detectSingleMatch(deps, STYLING_DEPS),
      testing: this.detectMultiMatch(deps, TESTING_DEPS),
      api: this.detectSingleMatch(deps, API_DEPS),
      database: this.detectSingleMatch(deps, DATABASE_DEPS),
      orm: this.detectSingleMatch(deps, ORM_DEPS),
      cicd: await this.detectCICD()
    };
  }

  private async readAllDependencies(): Promise<Set<string>> {
    const packagePath = path.join(this.projectPath, 'package.json');
    try {
      const content = await fsPromises.readFile(packagePath, 'utf8');
      const pkg = JSON.parse(content);
      const deps = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {})
      };
      return new Set(Object.keys(deps));
    } catch {
      return new Set();
    }
  }

  private detectSingleMatch(
    deps: Set<string>,
    candidates: { name: string; deps: string[] }[]
  ): string | null {
    for (const candidate of candidates) {
      if (candidate.deps.some((dep) => deps.has(dep))) {
        return candidate.name;
      }
    }

    return null;
  }

  private detectMultiMatch(
    deps: Set<string>,
    candidates: { name: string; deps: string[] }[]
  ): string[] {
    const matches: string[] = [];

    for (const candidate of candidates) {
      if (candidate.deps.some((dep) => deps.has(dep))) {
        matches.push(candidate.name);
      }
    }

    return matches;
  }

  private async detectCICD(): Promise<string | null> {
    const githubDir = path.join(this.projectPath, '.github', 'workflows');
    const gitlabFile = path.join(this.projectPath, '.gitlab-ci.yml');
    const circleFile = path.join(this.projectPath, '.circleci', 'config.yml');
    const azureFile = path.join(this.projectPath, 'azure-pipelines.yml');

    if (await this.directoryExists(githubDir)) {
      return 'GitHub Actions';
    }

    if (await this.fileExists(gitlabFile)) {
      return 'GitLab CI';
    }

    if (await this.fileExists(circleFile)) {
      return 'CircleCI';
    }

    if (await this.fileExists(azureFile)) {
      return 'Azure Pipelines';
    }

    return null;
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
