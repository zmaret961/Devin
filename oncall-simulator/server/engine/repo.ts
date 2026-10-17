import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFile, execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { MOCK_TEMPLATE, REPO_PATH, WORKSPACE, WORKTREES } from './paths.ts';
import { DETECTOR_BY_ID } from './detectors.ts';

const run = promisify(execFile);

interface HistoryCommit {
  message: string;
  hoursAgo: number;
  author: [string, string];
  /** File contents for this commit; files not listed are taken from the final template. */
  files?: Record<string, (final: string) => string>;
}

const read = (p: string) => readFileSync(join(MOCK_TEMPLATE, p), 'utf8');

// Older (correct) versions of files whose bugs were introduced by recent deploys, so that
// `git log` / `git show` tell the same story a real repository would.
const OLD: Record<string, (final: string) => string> = {
  'services/auth/src/session.ts': (s) => s.replace('return token.exp < now;', 'return token.exp < Math.floor(now / 1000);'),
  'services/api/src/routes/checkout.ts': (s) =>
    s.replace('    isGuest: boolean;\n    address?: Address;', '    address: Address;').replace(', guest: req.customer.isGuest', ''),
  'services/api/src/server.ts': (s) => s.replace("      if (!body.customer.isGuest) {\n        const denied = requireSession(req);\n        if (denied) return denied;\n      }", '      const denied = requireSession(req);\n      if (denied) return denied;'),
  'services/catalog/src/pricing.ts': (s) => s.replace('`price:${sku}:${region}`', '`price:${sku}`'),
  'docs/runbooks/cpu-warnings.md': (s) => s.replace('\nOnly investigate sustained CPU > 90% or CPU warnings accompanied by latency SLO burn.\n', '\n'),
};

const HISTORY: HistoryCommit[] = [
  { message: 'Initial import of ShopFast monorepo', hoursAgo: 24 * 21, author: ['Priya Raman', 'priya@shopfast.io'], files: OLD },
  {
    message: 'checkout: support guest checkout (v2.13.0)\n\nGuests can now check out without an account; address is collected later in the flow.',
    hoursAgo: 52,
    author: ['Marco Silva', 'marco@shopfast.io'],
    files: { 'services/auth/src/session.ts': OLD['services/auth/src/session.ts'], 'services/catalog/src/pricing.ts': OLD['services/catalog/src/pricing.ts'], 'docs/runbooks/cpu-warnings.md': OLD['docs/runbooks/cpu-warnings.md'] },
  },
  {
    message: 'catalog: include region in price cache key',
    hoursAgo: 31,
    author: ['Lena Fischer', 'lena@shopfast.io'],
    files: { 'services/auth/src/session.ts': OLD['services/auth/src/session.ts'], 'docs/runbooks/cpu-warnings.md': OLD['docs/runbooks/cpu-warnings.md'] },
  },
  {
    message: 'docs: clarify when CPU warnings need attention',
    hoursAgo: 20,
    author: ['Sam Okafor', 'sam@shopfast.io'],
    files: { 'services/auth/src/session.ts': OLD['services/auth/src/session.ts'] },
  },
  {
    message: 'auth: simplify session expiry check (v2.14.0)',
    hoursAgo: 3,
    author: ['Jordan Lee', 'jordan@shopfast.io'],
  },
];

const BOT = ['-c', 'user.name=Devin Oncall', '-c', 'user.email=oncall@devin.ai'];

export function git(cwd: string, args: string[], env: Record<string, string> = {}): string {
  return execFileSync('git', args, { cwd, env: { ...process.env, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

export async function gitAsync(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await run('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 });
  return stdout;
}

/** The mock ShopFast repository that child agents investigate and open PRs against. */
export class MockRepo {
  readonly path = REPO_PATH;
  private lock: Promise<unknown> = Promise.resolve();

  /** Recreates the repo from the template with a realistic commit history. */
  init(): void {
    rmSync(WORKSPACE, { recursive: true, force: true });
    mkdirSync(WORKTREES, { recursive: true });
    cpSync(MOCK_TEMPLATE, REPO_PATH, { recursive: true });
    git(REPO_PATH, ['init', '-q', '-b', 'main']);
    const now = Date.now();
    for (const c of HISTORY) {
      for (const [file, transform] of Object.entries(OLD)) {
        const content = c.files?.[file] ? c.files[file](read(file)) : read(file);
        writeFileSync(join(REPO_PATH, file), content);
      }
      git(REPO_PATH, ['add', '-A']);
      const date = new Date(now - c.hoursAgo * 3600_000).toISOString();
      git(REPO_PATH, ['-c', `user.name=${c.author[0]}`, '-c', `user.email=${c.author[1]}`, 'commit', '-q', '-m', c.message], {
        GIT_AUTHOR_DATE: date,
        GIT_COMMITTER_DATE: date,
      });
    }
  }

  /** Serializes operations that touch shared git metadata (worktree creation, merges). */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.lock.then(fn, fn);
    this.lock = next.catch(() => undefined);
    return next;
  }

  createWorktree(name: string, branch: string): Promise<string> {
    return this.exclusive(async () => {
      const path = join(WORKTREES, name);
      if (existsSync(path)) rmSync(path, { recursive: true, force: true });
      await gitAsync(REPO_PATH, ['worktree', 'add', '-q', '-b', branch, path, 'main']);
      return path;
    });
  }

  async diff(branch: string): Promise<{ diff: string; files: string[]; additions: number; deletions: number }> {
    const diff = await gitAsync(REPO_PATH, ['diff', `main...${branch}`]);
    const numstat = await gitAsync(REPO_PATH, ['diff', '--numstat', `main...${branch}`]);
    let additions = 0;
    let deletions = 0;
    const files: string[] = [];
    for (const line of numstat.trim().split('\n').filter(Boolean)) {
      const [a, d, f] = line.split('\t');
      additions += Number(a);
      deletions += Number(d);
      files.push(f);
    }
    return { diff, files, additions, deletions };
  }

  merge(branch: string, title: string): Promise<void> {
    return this.exclusive(async () => {
      await gitAsync(REPO_PATH, [...BOT, 'merge', '--no-ff', '-q', '-m', `Merge ${branch}: ${title}`, branch]);
    });
  }

  readMain(file: string): string {
    return readFileSync(join(REPO_PATH, file), 'utf8');
  }

  /** True while the planted defect is still present on main (used to stop alerts after a fix is merged). */
  bugPresent(bugId: string, file: string): boolean {
    const d = DETECTOR_BY_ID[bugId];
    if (!d) return true;
    try {
      return d.detect(file, this.readMain(file)).length > 0;
    } catch {
      return true;
    }
  }
}
