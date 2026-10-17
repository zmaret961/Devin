import { ArrowRight, BookOpen, Brain, GitCompare, Layers, Merge, ShieldCheck, Swords, Timer, Undo2, VolumeX } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Learning, Snapshot } from '../../../shared/types.ts';
import { CATEGORY_LABELS, STRATEGY_LABELS } from '../../../shared/types.ts';
import { fmtMin } from '../util.ts';
import { Card, Chip, DiffView, Empty, InlineCode, Markdown, StrategyChip } from './ui.tsx';

const tooltipStyle = { background: '#13141c', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, fontSize: 12 };

const TYPE: Record<Learning['type'], { label: string; icon: ReactNode; cls: string }> = {
  fingerprint: { label: 'De-duplication', icon: <Layers className="h-4 w-4" />, cls: 'text-sky-300 bg-sky-500/10' },
  correlation: { label: 'Correlation', icon: <Merge className="h-4 w-4" />, cls: 'text-cyan-300 bg-cyan-500/10' },
  'noise-rule': { label: 'Noise rule', icon: <VolumeX className="h-4 w-4" />, cls: 'text-slate-300 bg-slate-500/15' },
  'hold-rule': { label: 'Hold rule', icon: <Timer className="h-4 w-4" />, cls: 'text-amber-300 bg-amber-500/10' },
  routing: { label: 'Strategy routing', icon: <GitCompare className="h-4 w-4" />, cls: 'text-violet-300 bg-violet-500/10' },
  'race-policy': { label: 'Race policy', icon: <Swords className="h-4 w-4" />, cls: 'text-orange-300 bg-orange-500/10' },
  knowledge: { label: 'Knowledge', icon: <Brain className="h-4 w-4" />, cls: 'text-fuchsia-300 bg-fuchsia-500/10' },
  revert: { label: 'Safety revert', icon: <Undo2 className="h-4 w-4" />, cls: 'text-rose-300 bg-rose-500/10' },
};

const VERDICT: Record<string, string> = {
  correct: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  partial: 'bg-amber-500/10 text-amber-200 ring-amber-500/25',
  wrong: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  wasted: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
  unscored: 'bg-white/5 text-slate-400 ring-white/10',
};

export function LearningTab({ s }: { s: Snapshot }) {
  const [sel, setSel] = useState<number | null>(null);
  const retro = s.retros.find((r) => r.run === sel) ?? s.retros.at(-1);
  const runs = s.runs.filter((r) => r.metrics);
  const chart = runs.map((r) => ({ name: `Shift ${r.run} · v${r.playbookVersion}`, score: r.score?.total ?? null, ttd: r.metrics?.avgTtdMin ? Number(r.metrics.avgTtdMin.toFixed(1)) : null, agents: r.metrics?.children ?? 0 }));
  if (!s.retros.length) {
    return (
      <Card>
        <Empty>
          <div className="max-w-md space-y-2 py-10">
            <Brain className="mx-auto h-8 w-8 text-violet-300" />
            <div className="text-slate-300">No retrospective yet.</div>
            <div>When a shift finishes, the master agent grades every decision it made, then rewrites its own playbook. Run a full shift to see what it learns.</div>
          </div>
        </Empty>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 h-[320px] xl:col-span-7" title="Improvement across shifts" right={<span className="text-[11px] text-slate-500">same class of incidents each shift, fresh repo</span>} bodyClass="p-3">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chart} margin={{ left: -10, right: 0, top: 10 }}>
              <CartesianGrid stroke="rgba(255,255,255,.05)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="l" domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="r" orientation="right" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,.03)' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="l" dataKey="score" name="Retro score /100" fill="#8b5cf6" radius={[6, 6, 0, 0]} barSize={46} isAnimationActive={false} />
              <Line yAxisId="r" type="monotone" dataKey="ttd" name="Avg time to diagnosis (min)" stroke="#22d3ee" strokeWidth={2.5} dot={{ r: 4 }} isAnimationActive={false} />
              <Line yAxisId="r" type="monotone" dataKey="agents" name="Child agents spawned" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3 }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
        <Card className="col-span-12 xl:col-span-5" title="Shift comparison" bodyClass="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="text-left text-[10.5px] uppercase tracking-wider text-slate-500">
              <tr className="border-b border-white/[0.06]">
                {['Shift', 'Alerts → incidents', 'Agents', 'Wasted', 'Dupes', 'TTD', 'Agent-min', 'Score'].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04] tabular-nums">
              {runs.map((r) => (
                <tr key={r.run} className={`cursor-pointer hover:bg-white/[0.03] ${retro?.run === r.run ? 'bg-violet-500/[0.06]' : ''}`} onClick={() => setSel(r.run)}>
                  <td className="px-3 py-2 text-slate-200">
                    #{r.run} <span className="text-slate-500">v{r.playbookVersion}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-300">
                    {r.metrics!.alerts} → {r.metrics!.incidents}
                  </td>
                  <td className="px-3 py-2 text-slate-300">
                    {r.metrics!.children}
                    {r.metrics!.raceLosers ? <span className="text-slate-500"> ({r.metrics!.raceLosers} raced)</span> : null}
                  </td>
                  <td className="px-3 py-2 text-slate-300">{r.metrics!.wasted}</td>
                  <td className="px-3 py-2 text-slate-300">{r.metrics!.duplicates}</td>
                  <td className="px-3 py-2 text-cyan-200">{fmtMin(r.metrics!.avgTtdMin)}</td>
                  <td className="px-3 py-2 text-slate-300">{Math.round(r.metrics!.agentMinutes)}</td>
                  <td className="px-3 py-2 font-semibold text-violet-200">{r.score?.total ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {retro && (
            <div className="grid grid-cols-4 gap-2 border-t border-white/[0.06] p-3 text-center">
              {(
                [
                  ['Root-cause accuracy', retro.score.accuracy],
                  ['Right action', retro.score.actionCorrectness],
                  ['Efficiency', retro.score.efficiency],
                  ['Speed', retro.score.speed],
                ] as const
              ).map(([l, v]) => (
                <div key={l} className="rounded-lg bg-white/[0.03] px-2 py-2">
                  <div className="text-[18px] font-semibold text-white">{Math.round(v * 100)}%</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">{l}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {retro && (
        <>
          <div className="card flex flex-wrap items-center gap-3 px-5 py-3.5">
            <ShieldCheck className="h-5 w-5 text-emerald-300" />
            <div className="text-[13.5px] text-slate-200">
              <b className="text-white">Retrospective on shift {retro.run}</b> — {retro.summary}
            </div>
            <div className="ml-auto flex items-center gap-2 text-[13px] text-slate-400">
              v{retro.fromVersion} <ArrowRight className="h-4 w-4" /> <span className="font-semibold text-violet-300">v{retro.toVersion}</span>
            </div>
          </div>
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 space-y-3 xl:col-span-7">
              <h3 className="card-title px-1">What it learned ({retro.learnings.length})</h3>
              {!retro.learnings.length && <Card><Empty>Nothing new — the playbook has converged for this mix of incidents.</Empty></Card>}
              {retro.learnings.map((l) => (
                <div key={l.id} className="card animate-fade-in p-4">
                  <div className="flex items-start gap-3">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TYPE[l.type].cls}`}>{TYPE[l.type].icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-wider text-slate-500">
                        <span className="mono">{l.id}</span> {TYPE[l.type].label}
                      </div>
                      <div className="mt-0.5 text-[14px] font-medium text-white">
                        <InlineCode text={l.title} />
                      </div>
                      <div className="mt-1 text-[12.5px] text-slate-400">
                        <InlineCode text={l.detail} />
                      </div>
                      <ul className="mt-2 space-y-0.5 border-l border-white/10 pl-3">
                        {l.evidence.map((e, i) => (
                          <li key={i} className="text-[11.5px] text-slate-500">
                            <InlineCode text={e} />
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2 text-[12px] text-emerald-300/90">→ {l.impact}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="col-span-12 space-y-4 xl:col-span-5">
              <Card title="Strategy leaderboard (cumulative)" bodyClass="max-h-[360px] overflow-y-auto">
                <table className="w-full text-[12px]">
                  <thead className="text-left text-[10.5px] uppercase tracking-wider text-slate-500">
                    <tr className="border-b border-white/[0.06]">
                      <th className="px-4 py-2 font-medium">Category</th>
                      <th className="px-2 py-2 font-medium">Strategy</th>
                      <th className="px-2 py-2 font-medium">Wins</th>
                      <th className="px-2 py-2 font-medium">Avg</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {[...retro.strategyBoard]
                      .sort((a, b) => a.category.localeCompare(b.category) || b.wins / b.trials - a.wins / a.trials)
                      .map((r) => {
                        const preferred = s.playbook.routing[r.category]?.strategy === r.strategy;
                        return (
                          <tr key={`${r.category}-${r.strategy}`} className={preferred ? 'bg-violet-500/[0.06]' : ''}>
                            <td className="px-4 py-1.5 text-slate-300">{CATEGORY_LABELS[r.category]}</td>
                            <td className="px-2 py-1.5">
                              <StrategyChip s={r.strategy} /> {preferred && <span className="text-[10px] text-violet-300">preferred</span>}
                            </td>
                            <td className="px-2 py-1.5 tabular-nums text-slate-300">
                              {r.wins}/{r.trials}
                            </td>
                            <td className="px-2 py-1.5 tabular-nums text-slate-400">{fmtMin(r.avgMin)}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </Card>
              <Card title={`Graded decisions · shift ${retro.run}`} right={<span className="text-[11px] text-slate-500">grader = on-call feedback</span>} bodyClass="max-h-[460px] overflow-y-auto">
                <ul className="divide-y divide-white/[0.04]">
                  {retro.evaluations.map((e) => (
                    <li key={e.incidentId} className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Chip cls={VERDICT[e.verdict]}>{e.verdict}</Chip>
                        <span className="mono text-[11px] text-slate-500">{e.incidentId}</span>
                        <span className="min-w-0 flex-1 truncate text-[12px] text-slate-300">{e.title}</span>
                        <span className="mono text-[11px] text-cyan-200">{fmtMin(e.ttdMin)}</span>
                      </div>
                      <div className="mt-0.5 pl-1 text-[11px] text-slate-500">
                        {e.strategies.map((x) => STRATEGY_LABELS[x]).join(' vs ') || 'no agent'} · {e.note}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function PlaybookTab({ s }: { s: Snapshot }) {
  const [version, setVersion] = useState(s.playbook.version);
  const [mode, setMode] = useState<'doc' | 'diff'>('doc');
  const [md, setMd] = useState(s.playbookMarkdown);
  useEffect(() => setVersion(s.playbook.version), [s.playbook.version]);
  useEffect(() => {
    if (version === s.playbook.version) return setMd(s.playbookMarkdown);
    fetch(`/api/playbook/v${version}.md`).then(async (r) => setMd(await r.text()));
  }, [version, s.playbook.version, s.playbookMarkdown]);
  const retro = s.retros.find((r) => r.toVersion === version);
  const diff = retro?.playbookDiff
    .split('\n')
    .map((l, i, all) => ({ l, keep: l[0] !== ' ' || all.slice(Math.max(0, i - 2), i + 3).some((x) => x[0] !== ' ') }))
    .filter((x) => x.keep)
    .map((x) => x.l)
    .join('\n');
  return (
    <div className="grid grid-cols-12 gap-4">
      <Card className="col-span-12 lg:col-span-3" title={<><BookOpen className="h-3.5 w-3.5" /> Versions</>}>
        <ul className="p-2">
          {[...s.playbookVersions].reverse().map((v) => (
            <li key={v.version}>
              <button onClick={() => setVersion(v.version)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] ${version === v.version ? 'bg-violet-500/15 text-white' : 'text-slate-300 hover:bg-white/[0.04]'}`}>
                <span className="font-semibold">v{v.version}</span>
                <span className="text-[11.5px] text-slate-500">{v.version === 1 ? 'starter (human-written)' : `+${v.learnings} learnings`}</span>
                {v.version === s.playbook.version && <Chip cls="ml-auto bg-emerald-500/10 text-emerald-300 ring-emerald-500/25">active</Chip>}
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-white/[0.06] p-4 text-[12px] leading-relaxed text-slate-500">
          The playbook is the master agent's operating manual. Guardrails are human-authored and locked; everything else is rewritten by the retrospective with evidence for each change. Files: <code className="mono text-slate-400">data/playbook/v*.md</code>
        </div>
      </Card>
      <Card
        className="col-span-12 lg:col-span-9"
        title={`playbook.md · v${version}`}
        right={
          <div className="flex gap-1 text-[11px]">
            <button onClick={() => setMode('doc')} className={`rounded-md px-2 py-0.5 ${mode === 'doc' ? 'bg-white/10 text-white' : 'text-slate-400'}`}>
              Document
            </button>
            <button disabled={!retro} onClick={() => setMode('diff')} className={`rounded-md px-2 py-0.5 disabled:opacity-30 ${mode === 'diff' ? 'bg-white/10 text-white' : 'text-slate-400'}`}>
              Diff vs v{version - 1}
            </button>
          </div>
        }
        bodyClass="p-5"
      >
        {mode === 'diff' && diff ? <DiffView diff={diff} /> : <Markdown>{md}</Markdown>}
      </Card>
    </div>
  );
}
