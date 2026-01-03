import * as fsPromises from 'fs/promises';
import * as path from 'path';

export interface DocumentationFile {
  name: string;
  path: string;
  excerpt: string;
}

export interface DocumentationResult {
  files: DocumentationFile[];
  totalFound: number;
}

const STANDARD_DOC_FILES = [
  'README.md',
  'ARCHITECTURE.md',
  'CONTRIBUTING.md',
  'DESIGN.md'
];

export class DocumentationDiscovery {
  projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = path.resolve(projectPath);
  }

  async discoverDocumentation(): Promise<DocumentationResult> {
    const files: DocumentationFile[] = [];

    for (const doc of STANDARD_DOC_FILES) {
      const found = await this.readDocFile(path.join(this.projectPath, doc));
      if (found) files.push(found);
    }

    const docsDir = path.join(this.projectPath, 'docs');
    if (await this.directoryExists(docsDir)) {
      const docFiles = await this.readDocsDirectory(docsDir);
      files.push(...docFiles);
    }

    const githubDir = path.join(this.projectPath, '.github');
    if (await this.directoryExists(githubDir)) {
      const githubFiles = await this.readGithubDocs(githubDir);
      files.push(...githubFiles);
    }

    const packageDoc = await this.readPackageMetadata();
    if (packageDoc) {
      files.push(packageDoc);
    }

    return {
      files,
      totalFound: files.length
    };
  }

  private async readDocsDirectory(dirPath: string): Promise<DocumentationFile[]> {
    const files: DocumentationFile[] = [];

    try {
      const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!entry.name.toLowerCase().endsWith('.md')) continue;

        const doc = await this.readDocFile(path.join(dirPath, entry.name));
        if (doc) files.push(doc);
      }
    } catch {
      return files;
    }

    return files;
  }

  private async readGithubDocs(dirPath: string): Promise<DocumentationFile[]> {
    const files: DocumentationFile[] = [];

    try {
      const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const lower = entry.name.toLowerCase();

        if (!lower.includes('template') && !lower.includes('guide') && !lower.includes('cod')) {
          continue;
        }

        const doc = await this.readDocFile(path.join(dirPath, entry.name));
        if (doc) files.push(doc);
      }
    } catch {
      return files;
    }

    return files;
  }

  private async readPackageMetadata(): Promise<DocumentationFile | null> {
    const packagePath = path.join(this.projectPath, 'package.json');
    try {
      const content = await fsPromises.readFile(packagePath, 'utf8');
      const pkg = JSON.parse(content);
      const description = typeof pkg.description === 'string' ? pkg.description : '';
      const keywords = Array.isArray(pkg.keywords) ? pkg.keywords.join(', ') : '';
      const excerpt = [description, keywords].filter(Boolean).join('\n');

      if (!excerpt) {
        return null;
      }

      return {
        name: 'package.json',
        path: packagePath,
        excerpt: excerpt.slice(0, 500)
      };
    } catch {
      return null;
    }
  }

  private async readDocFile(filePath: string): Promise<DocumentationFile | null> {
    try {
      const content = await fsPromises.readFile(filePath, 'utf8');
      return {
        name: path.basename(filePath),
        path: filePath,
        excerpt: content.slice(0, 500)
      };
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
