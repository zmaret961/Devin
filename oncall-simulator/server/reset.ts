import { rmSync } from 'node:fs';
import { DATA_DIR } from './engine/paths.ts';

rmSync(DATA_DIR, { recursive: true, force: true });
console.log(`Removed ${DATA_DIR}. Next start begins from the starter playbook (v1).`);
