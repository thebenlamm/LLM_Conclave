import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { DocumentationDiscovery } from '../DocumentationDiscovery';

const createFile = async (filePath: string, content: string): Promise<void> => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
};

describe('DocumentationDiscovery', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'documentation-discovery-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('finds standard docs, docs directory markdown, and package metadata', async () => {
    await createFile(path.join(tempDir, 'README.md'), '# Project');
    await createFile(path.join(tempDir, 'ARCHITECTURE.md'), 'Architecture details');
    await createFile(path.join(tempDir, 'docs', 'design.md'), 'Design doc');
    await createFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ description: 'Test project', keywords: ['cli', 'ai'] }, null, 2)
    );

    const discovery = new DocumentationDiscovery(tempDir);
    const result = await discovery.discoverDocumentation();

    const names = result.files.map((file) => file.name);

    expect(result.totalFound).toBeGreaterThanOrEqual(4);
    expect(names).toEqual(expect.arrayContaining(['README.md', 'ARCHITECTURE.md', 'design.md', 'package.json']));
  });
});
