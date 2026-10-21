// Records several shifts of the real engine into web/public/recording.json, which the static
// (Vercel) build of the dashboard replays in the browser. Usage: npm run record -- [shifts]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffSnapshot, type Recording } from '../shared/recording.ts';

const here = dirname(fileURLToPath(import.meta.url));
process.env.ONCALL_DATA_DIR ??= resolve(here, '../data-record');
const shifts = Number(process.argv[2] ?? 3);
const { Engine } = await import('./engine/engine.ts');
const engine = new Engine({ speed: 300, quiet: true });
await engine.reset();

// Deep copy: snapshots share live arrays with the engine.
const snapshot = () => JSON.parse(JSON.stringify(engine.snapshot())) as ReturnType<typeof engine.snapshot>;
const initial = snapshot();
const rec: Recording = { recordedAt: new Date().toISOString(), initial, segments: [], playbooks: { [initial.playbook.version]: initial.playbookMarkdown } };
let prev = initial;
for (let i = 0; i < shifts; i++) {
  await engine.startRun();
  const startNow = snapshot().now;
  const seg: Recording['segments'][number] = { startNow, frames: [] };
  let done = false;
  while (!done) {
    done = engine.runStatus === 'learned';
    const snap = snapshot();
    snap.clock = { running: true, speed: 60 };
    const f = diffSnapshot(prev, snap, Math.max(0, snap.now - startNow));
    if (f) seg.frames.push(f);
    prev = snap;
    rec.playbooks[snap.playbook.version] = snap.playbookMarkdown;
    if (!done) await new Promise((r) => setTimeout(r, 100));
  }
  rec.segments.push(seg);
  const run = prev.runs.at(-1)!;
  console.log(`shift ${run.run}: playbook v${run.playbookVersion}, score ${run.score?.total}, ${seg.frames.length} frames`);
}
await engine.shutdown();
const out = resolve(here, '../web/public/recording.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(rec));
console.log(`wrote ${out}`);
process.exit(0);
