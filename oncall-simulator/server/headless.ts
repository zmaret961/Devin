// Runs shifts end-to-end without the UI and prints how the playbook improves. Usage: npm run headless -- [runs] [speed]
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.ONCALL_DATA_DIR ??= resolve(dirname(fileURLToPath(import.meta.url)), '../data-headless');
const runs = Number(process.argv[2] ?? 2);
const speed = Number(process.argv[3] ?? 600);
const { Engine } = await import('./engine/engine.ts');
const engine = new Engine({ speed, quiet: !process.env.VERBOSE });
await engine.reset();

for (let i = 0; i < runs; i++) {
  const t0 = Date.now();
  await engine.startRun();
  while (engine.runStatus !== 'learned') await new Promise((r) => setTimeout(r, 200));
  const s = engine.snapshot();
  const run = s.runs.at(-1)!;
  const retro = s.retros.at(-1)!;
  const m = run.metrics!;
  console.log(`\n=== Shift ${run.run} (playbook v${run.playbookVersion}) — ${((Date.now() - t0) / 1000).toFixed(1)}s wall ===`);
  console.log(`alerts ${m.alerts} → incidents ${m.incidents} | children ${m.children} (race losers ${m.raceLosers}) | wasted incidents ${m.wasted} | duplicates ${m.duplicates} | PRs ${m.prs} | avg TTD ${m.avgTtdMin?.toFixed(1)} min | hours saved ${m.hoursSaved.toFixed(1)} | agent-min ${m.agentMinutes.toFixed(0)}`);
  console.log(`score ${retro.score.total} (acc ${retro.score.accuracy.toFixed(2)}, action ${retro.score.actionCorrectness.toFixed(2)}, eff ${retro.score.efficiency.toFixed(2)}, speed ${retro.score.speed.toFixed(2)})`);
  for (const e of retro.evaluations) console.log(`  ${e.verdict.padEnd(8)} ${e.incidentId} [${e.category}] ${e.strategies.join('+') || '-'} → ${e.actual} (${e.ttdMin?.toFixed(1) ?? '-'}m) ${e.title.slice(0, 60)} — ${e.note}`);
  console.log(`learnings → v${retro.toVersion}:`);
  for (const l of retro.learnings) console.log(`  ${l.id} [${l.type}] ${l.title}`);
}
await engine.shutdown();
process.exit(0);
