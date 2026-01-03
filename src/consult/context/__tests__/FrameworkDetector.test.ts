import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { FrameworkDetector } from '../FrameworkDetector';

const createFile = async (filePath: string, content: string): Promise<void> => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
};

describe('FrameworkDetector', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'framework-detector-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('detects Node frameworks and versions from package.json', async () => {
    const packageJson = {
      dependencies: {
        next: '^14.2.0',
        react: '^18.3.0'
      }
    };
    await createFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );
    await fs.mkdir(path.join(tempDir, 'app'), { recursive: true });

    const detector = new FrameworkDetector(tempDir);
    const result = await detector.detectFramework();

    expect(result.framework).toBe('Next.js');
    expect(result.frameworkVersion).toBe('^14.2.0');
    expect(result.architecturePattern).toBe('app_router');
  });

  it('detects Express, Fastify, and Svelte from package.json', async () => {
    const cases = [
      { dep: 'express', expected: 'Express' },
      { dep: 'fastify', expected: 'Fastify' },
      { dep: 'svelte', expected: 'Svelte' }
    ];

    for (const { dep, expected } of cases) {
      await createFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ dependencies: { [dep]: '^1.0.0' } }, null, 2)
      );

      const detector = new FrameworkDetector(tempDir);
      const result = await detector.detectFramework();

      expect(result.framework).toBe(expected);
      expect(result.frameworkVersion).toBe('^1.0.0');
    }
  });

  it('detects Python frameworks from requirements.txt', async () => {
    await createFile(path.join(tempDir, 'requirements.txt'), 'Django==4.2');

    const detector = new FrameworkDetector(tempDir);
    const result = await detector.detectFramework();

    expect(result.framework).toBe('Django');
  });

  it('detects Rails from Gemfile', async () => {
    await createFile(path.join(tempDir, 'Gemfile'), "gem 'rails'\n");

    const detector = new FrameworkDetector(tempDir);
    const result = await detector.detectFramework();

    expect(result.framework).toBe('Rails');
  });

  it('detects Spring Boot from pom.xml', async () => {
    await createFile(
      path.join(tempDir, 'pom.xml'),
      '<dependency>spring-boot-starter-web</dependency>'
    );

    const detector = new FrameworkDetector(tempDir);
    const result = await detector.detectFramework();

    expect(result.framework).toBe('Spring Boot');
  });

  it('detects Rust frameworks from Cargo.toml', async () => {
    await createFile(
      path.join(tempDir, 'Cargo.toml'),
      '[dependencies]\naxum = "0.7"\n'
    );

    const detector = new FrameworkDetector(tempDir);
    const result = await detector.detectFramework();

    expect(result.framework).toBe('Axum');
  });
});
