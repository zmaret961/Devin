import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const MOCK_TEMPLATE = resolve(ROOT, 'mock-repo');
export const DATA_DIR = resolve(process.env.ONCALL_DATA_DIR ?? resolve(ROOT, 'data'));
export const WORKSPACE = resolve(DATA_DIR, 'workspace');
export const REPO_PATH = resolve(WORKSPACE, 'shopfast');
export const WORKTREES = resolve(WORKSPACE, 'worktrees');
export const PLAYBOOK_DIR = resolve(DATA_DIR, 'playbook');
export const RUNS_DIR = resolve(DATA_DIR, 'runs');
export const WEB_DIST = resolve(ROOT, 'web/dist');
export const TSX_CLI = createRequire(import.meta.url).resolve('tsx/cli');
