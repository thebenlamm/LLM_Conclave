import * as fsPromises from 'fs/promises';
import * as path from 'path';
import ProjectScanner from '../../init/ProjectScanner';

export interface FrameworkDetectionResult {
  framework: string | null;
  frameworkVersion: string | null;
  architecturePattern: string | null;
}

const NODE_FRAMEWORK_PACKAGE_MAP: Record<string, string> = {
  'React': 'react',
  'Next.js': 'next',
  'Vue': 'vue',
  'Angular': '@angular/core',
  'Svelte': 'svelte',
  'Express': 'express',
  'Fastify': 'fastify',
  'NestJS': '@nestjs/core'
};

const RUST_FRAMEWORKS: Record<string, string> = {
  'actix-web': 'Actix Web',
  'rocket': 'Rocket',
  'axum': 'Axum',
  'warp': 'Warp',
  'tide': 'Tide'
};

export class FrameworkDetector {
  projectPath: string;
  projectScanner: ProjectScanner;

  constructor(projectPath: string) {
    this.projectPath = path.resolve(projectPath);
    this.projectScanner = new ProjectScanner(this.projectPath);
  }

  async detectFramework(): Promise<FrameworkDetectionResult> {
    const nodeResult = await this.detectNodeFramework();
    if (nodeResult.framework) {
      return nodeResult;
    }

    const pythonFramework = await this.detectPythonFramework();
    if (pythonFramework) {
      return {
        framework: pythonFramework,
        frameworkVersion: null,
        architecturePattern: null
      };
    }

    const rubyFramework = await this.detectRubyFramework();
    if (rubyFramework) {
      return {
        framework: rubyFramework,
        frameworkVersion: null,
        architecturePattern: null
      };
    }

    const javaFramework = await this.detectJavaFramework();
    if (javaFramework) {
      return {
        framework: javaFramework,
        frameworkVersion: null,
        architecturePattern: null
      };
    }

    const rustFramework = await this.detectRustFramework();
    if (rustFramework) {
      return {
        framework: rustFramework,
        frameworkVersion: null,
        architecturePattern: null
      };
    }

    return {
      framework: null,
      frameworkVersion: null,
      architecturePattern: null
    };
  }

  private async detectNodeFramework(): Promise<FrameworkDetectionResult> {
    const packageJson = await this.readPackageJson();
    if (!packageJson) {
      return { framework: null, frameworkVersion: null, architecturePattern: null };
    }

    const framework = await this.projectScanner._detectNodeFramework();
    const frameworkVersion = this.extractFrameworkVersion(framework, packageJson);
    const architecturePattern = framework === 'Next.js'
      ? await this.detectNextArchitecturePattern()
      : null;

    return {
      framework,
      frameworkVersion,
      architecturePattern
    };
  }

  private async detectNextArchitecturePattern(): Promise<string | null> {
    const appDir = path.join(this.projectPath, 'app');
    const pagesDir = path.join(this.projectPath, 'pages');

    if (await this.directoryExists(appDir)) {
      return 'app_router';
    }

    if (await this.directoryExists(pagesDir)) {
      return 'pages_router';
    }

    return null;
  }

  private extractFrameworkVersion(
    framework: string | null,
    packageJson: Record<string, any>
  ): string | null {
    if (!framework || !NODE_FRAMEWORK_PACKAGE_MAP[framework]) {
      return null;
    }

    const dependencyName = NODE_FRAMEWORK_PACKAGE_MAP[framework];
    const dependencies = packageJson.dependencies ?? {};
    const devDependencies = packageJson.devDependencies ?? {};

    return dependencies[dependencyName] ?? devDependencies[dependencyName] ?? null;
  }

  private async detectPythonFramework(): Promise<string | null> {
    const requirementsPath = path.join(this.projectPath, 'requirements.txt');
    const content = await this.readOptionalFile(requirementsPath);
    if (!content) return null;

    const lower = content.toLowerCase();
    if (lower.includes('django')) return 'Django';
    if (lower.includes('flask')) return 'Flask';
    if (lower.includes('fastapi')) return 'FastAPI';

    return null;
  }

  private async detectRubyFramework(): Promise<string | null> {
    const gemfilePath = path.join(this.projectPath, 'Gemfile');
    const content = await this.readOptionalFile(gemfilePath);
    if (!content) return null;

    return content.toLowerCase().includes('rails') ? 'Rails' : null;
  }

  private async detectJavaFramework(): Promise<string | null> {
    const pomPath = path.join(this.projectPath, 'pom.xml');
    const gradlePath = path.join(this.projectPath, 'build.gradle');

    const pomContent = await this.readOptionalFile(pomPath);
    const gradleContent = await this.readOptionalFile(gradlePath);
    const combined = `${pomContent ?? ''}\n${gradleContent ?? ''}`.toLowerCase();

    if (combined.includes('spring-boot-starter') || combined.includes('org.springframework.boot')) {
      return 'Spring Boot';
    }

    return null;
  }

  private async detectRustFramework(): Promise<string | null> {
    const cargoPath = path.join(this.projectPath, 'Cargo.toml');
    const content = await this.readOptionalFile(cargoPath);
    if (!content) return null;

    const lower = content.toLowerCase();
    for (const dependency of Object.keys(RUST_FRAMEWORKS)) {
      if (lower.includes(dependency)) {
        return RUST_FRAMEWORKS[dependency];
      }
    }

    return null;
  }

  private async readPackageJson(): Promise<Record<string, any> | null> {
    const packagePath = path.join(this.projectPath, 'package.json');
    const content = await this.readOptionalFile(packagePath);
    if (!content) return null;

    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  private async readOptionalFile(filePath: string): Promise<string | null> {
    try {
      return await fsPromises.readFile(filePath, 'utf8');
    } catch {
      return null;
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
