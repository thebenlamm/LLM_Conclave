import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { TechStackAnalyzer } from '../TechStackAnalyzer';

const createFile = async (filePath: string, content: string): Promise<void> => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
};

describe('TechStackAnalyzer', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tech-stack-analyzer-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('detects key tech stack signals from package.json and CI config', async () => {
    const packageJson = {
      dependencies: {
        redux: '^5.0.0',
        tailwindcss: '^3.4.0',
        '@trpc/server': '^10.0.0',
        pg: '^8.11.0',
        prisma: '^5.0.0'
      },
      devDependencies: {
        jest: '^30.0.0',
        vitest: '^1.6.0'
      }
    };

    await createFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );
    await createFile(
      path.join(tempDir, '.github', 'workflows', 'ci.yml'),
      'name: CI'
    );

    const analyzer = new TechStackAnalyzer(tempDir);
    const result = await analyzer.analyze();

    expect(result.stateManagement).toBe('Redux');
    expect(result.styling).toBe('Tailwind');
    expect(result.testing).toEqual(expect.arrayContaining(['Jest', 'Vitest']));
    expect(result.api).toBe('tRPC');
    expect(result.database).toBe('PostgreSQL');
    expect(result.orm).toBe('Prisma');
    expect(result.cicd).toBe('GitHub Actions');
  });
});
