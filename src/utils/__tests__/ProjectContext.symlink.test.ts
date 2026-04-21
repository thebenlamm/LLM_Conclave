// Regression guard for the C2 finding in the 2026-04-21 adversarial review.
//
// Claim under review: `ProjectContext.collectFiles` follows symlinks, both
// for files and for intermediate directory components. If true, an
// attacker-controlled LLM issuing `discuss` with `project=/Users/you/Workspace`
// could read any file on disk via a symlink planted in that workspace.
//
// Reality on Node.js (POSIX): `Dirent.isDirectory()` is based on the dirent
// type (DT_DIR vs DT_LNK) and returns false for symlinks to directories.
// `shouldIncludeFile` already rejects symlinks via `lstat().isSymbolicLink()`.
// So the claim is half-wrong — but this test locks the invariant so any
// future refactor that replaces `entry.isDirectory()` with `stat(...)` or
// similar will trip a loud failure instead of silently regressing the
// security property.
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as os from 'os';
import * as path from 'path';
import ProjectContext from '../ProjectContext';

describe('ProjectContext symlink handling (security regression guard)', () => {
  let tmpDir: string;
  let outsideFile: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-conclave-symlink-test-'));
    outsideFile = path.join(tmpDir, 'outside-secret.txt');
    await fs.writeFile(outsideFile, 'SECRET-OUT-OF-SANDBOX', 'utf8');

    const project = path.join(tmpDir, 'project');
    await fs.mkdir(project);
    await fs.writeFile(path.join(project, 'legit.md'), 'legitimate content', 'utf8');

    // Symlink -> file OUTSIDE the project.
    await fs.symlink(outsideFile, path.join(project, 'evil-file.md'));

    // Symlink -> DIRECTORY outside the project (tmpDir itself).
    await fs.symlink(tmpDir, path.join(project, 'evil-dir'));
  });

  afterAll(() => {
    if (tmpDir && fsSync.existsSync(tmpDir)) {
      fsSync.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('collectFiles does not follow file symlinks out of the project', async () => {
    const project = path.join(tmpDir, 'project');
    const ctx = new ProjectContext(project);
    const files = await (ctx as any).collectFiles(project, 0);

    const collectedContents = files.map((f: any) => f.content).join('\n');
    expect(collectedContents).toContain('legitimate content');
    expect(collectedContents).not.toContain('SECRET-OUT-OF-SANDBOX');
  });

  it('collectFiles does not descend into symlinked directories', async () => {
    const project = path.join(tmpDir, 'project');
    const ctx = new ProjectContext(project);
    const files = await (ctx as any).collectFiles(project, 0);

    // The symlinked directory points at tmpDir, which contains outside-secret.txt.
    // If collectFiles followed it, that file would show up in the collection.
    const paths = files.map((f: any) => f.path);
    expect(paths.every((p: string) => !p.includes('outside-secret.txt'))).toBe(true);
  });
});
