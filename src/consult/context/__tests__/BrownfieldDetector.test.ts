import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
import { BrownfieldDetector } from '../BrownfieldDetector';

jest.mock('child_process', () => ({
  execSync: jest.fn()
}));

const createFile = async (filePath: string, content: string = 'test'): Promise<void> => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
};

describe('BrownfieldDetector', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'brownfield-detector-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    jest.clearAllMocks();
  });

  it('classifies project with 3+ indicators as brownfield', async () => {
    const srcDir = path.join(tempDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        createFile(path.join(srcDir, `file-${index}.ts`), 'export {};\n')
      )
    );

    await createFile(path.join(tempDir, 'package.json'), '{"dependencies": {}}');
    await createFile(path.join(tempDir, 'tsconfig.json'), '{"compilerOptions": {}}');
    await createFile(path.join(tempDir, 'README.md'), '# Test Project');

    (execSync as jest.Mock).mockReturnValue('12\n');

    const detector = new BrownfieldDetector(tempDir);
    const result = await detector.detectBrownfield();

    const indicatorTypes = result.indicatorsFound.map((indicator) => indicator.type);

    expect(result.projectType).toBe('brownfield');
    expect(result.indicatorCount).toBeGreaterThanOrEqual(3);
    expect(indicatorTypes).toEqual(
      expect.arrayContaining(['source_files', 'package_manifest', 'config_file', 'documentation', 'git_repo'])
    );
    expect(result.biasApplied).toBe(true);
  });

  it('classifies project with fewer than 3 indicators as greenfield', async () => {
    await createFile(path.join(tempDir, 'README.md'), '# Minimal Project');

    (execSync as jest.Mock).mockImplementation(() => {
      throw new Error('not a git repo');
    });

    const detector = new BrownfieldDetector(tempDir);
    const result = await detector.detectBrownfield();

    expect(result.projectType).toBe('greenfield');
    expect(result.indicatorCount).toBe(1);
    expect(result.biasApplied).toBe(false);
  });
});
