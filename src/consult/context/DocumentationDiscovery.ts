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

export const STANDARD_DOC_FILES = [
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
    const filePromises: Promise<DocumentationFile | null>[] = [];

    // Standard docs
    for (const doc of STANDARD_DOC_FILES) {
      filePromises.push(this.readDocFile(path.join(this.projectPath, doc)));
    }

    // Docs directory
    const docsDir = path.join(this.projectPath, 'docs');
    if (await this.directoryExists(docsDir)) {
      filePromises.push(this.readDocsDirectory(docsDir).then(files => files.length ? files : null as any)); // Flattening handled later
    }

    // Github docs
    const githubDir = path.join(this.projectPath, '.github');
    if (await this.directoryExists(githubDir)) {
      filePromises.push(this.readGithubDocs(githubDir).then(files => files.length ? files : null as any));
    }

    // Package metadata
    filePromises.push(this.readPackageMetadata());

    const results = await Promise.all(filePromises);
    
    // Flatten and filter results
    const files: DocumentationFile[] = [];
    for (const result of results) {
      if (!result) continue;
      if (Array.isArray(result)) {
        files.push(...result);
      } else {
        files.push(result);
      }
    }

    return {
      files,
      totalFound: files.length
    };
  }

  private async readDocsDirectory(dirPath: string): Promise<DocumentationFile[]> {
    try {
      const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
      const promises = entries
        .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
        .map(entry => this.readDocFile(path.join(dirPath, entry.name)));
      
      const results = await Promise.all(promises);
      return results.filter((doc): doc is DocumentationFile => doc !== null);
    } catch {
      return [];
    }
  }

  private async readGithubDocs(dirPath: string): Promise<DocumentationFile[]> {
    try {
      const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
      const promises = entries
        .filter(entry => {
          if (!entry.isFile()) return false;
          const lower = entry.name.toLowerCase();
          return lower.includes('template') || lower.includes('guide') || lower.includes('cod');
        })
        .map(entry => this.readDocFile(path.join(dirPath, entry.name)));

      const results = await Promise.all(promises);
      return results.filter((doc): doc is DocumentationFile => doc !== null);
    } catch {
      return [];
    }
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
