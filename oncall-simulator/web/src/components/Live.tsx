import { Activity, AlarmClock, Bell, Bot, BrainCircuit, Clock, Filter, GitPullRequest, Hourglass, Info, NotebookPen, Siren, Swords, Users, Workflow } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ChildAgent, Snapshot } from '../../../shared/types.ts';
import { CATEGORY_LABELS, STRATEGY_LABELS } from '../../../shared/types.ts';
import { DISPOSITION, INC_STATUS, PHASES, SEV, SOURCE, fmtMin, rel } from '../util.ts';
import { ActionIcon, Card, Chip, Empty, InlineCode, StepList, StrategyChip, useSelect } from './ui.tsx';

function Kpi({ icon, label, value, sub, accent = 'text-white', info }: { icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode; accent?: string; info?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card relative px-4 py-3">
      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-slate-400">
        <span className="flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        {info && (
          <button onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} className="text-slate-500 hover:text-slate-300">
            <Info className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className={`mt-1.5 text-[26px] font-semibold leading-none tabular-nums ${accent}`}>{value}</div>
      {sub && <div className="mt-1.5 text-[11.5px] text-slate-500">{sub}</div>}
      {open && info && <div className="absolute right-0 top-9 z-30 w-[380px] rounded-xl border border-white/10 bg-[#13141c] p-4 text-xs shadow-2xl">{info}</div>}
    </div>
  );
}

export function KpiRow({ s }: { s: Snapshot }) {
  const m = s.metrics;
  const filtered = m.alertsSuppressed + m.alertsGrouped;
  const lastScore = s.runs.filter((r) => r.score).at(-1)?.score?.total;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
      <Kpi icon={<Bell className="h-3.5 w-3.5" />} label="Alerts" value={m.alertsReceived} sub={`${filtered} grouped / suppressed`} />
      <Kpi icon={<Filter className="h-3.5 w-3.5" />} label="Investigated" value={m.investigated} sub={`of ${m.incidents} incidents · ${m.held} held`} />
      <Kpi icon={<Bot className="h-3.5 w-3.5" />} label="Active agents" value={m.activeInvestigations} accent="text-violet-300" sub={`${m.queued} queued · ${m.childrenSpawned} spawned`} />
      <Kpi icon={<Clock className="h-3.5 w-3.5" />} label="Avg time to diagnosis" value={fmtMin(m.avgTtdMin)} accent="text-cyan-200" sub={`p50 ${fmtMin(m.p50TtdMin)} · p90 ${fmtMin(m.p90TtdMin)}`} />
      <Kpi icon={<GitPullRequest className="h-3.5 w-3.5" />} label="PRs opened" value={m.prsOpened} accent="text-emerald-300" sub="each with a regression test" />
      <Kpi icon={<NotebookPen className="h-3.5 w-3.5" />} label="Notes · Escalations" value={`${m.notes} · ${m.escalations}`} sub="no code change needed" />
      <Kpi
        icon={<Hourglass className="h-3.5 w-3.5" />}
        label="Eng. hours saved"
        value={m.hoursSaved.toFixed(1)}
        accent="text-amber-200"
        sub={`${Math.round(m.agentMinutes)} agent-min spent`}
        info={
          <div className="space-y-2">
            <div className="font-semibold text-slate-200">How hours saved is calculated</div>
            {m.hoursBreakdown.map((h, i) => (
              <div key={h.label} className="flex justify-between gap-3">
                <div>
                  <div className="text-slate-300">{h.label}</div>
                  <div className="text-[11px] text-slate-500">{s.hoursFormula[i]?.explain}</div>
                </div>
                <div className="mono shrink-0 text-right text-slate-300">
                  {h.count} × {h.minutesEach}m
                  <div className="text-slate-500">= {(h.minutes / 60).toFixed(1)}h</div>
                </div>
              </div>
            ))}
          </div>
        }
      />
      <Kpi icon={<BrainCircuit className="h-3.5 w-3.5" />} label="Playbook" value={`v${s.run.playbookVersion}`} accent="text-violet-300" sub={lastScore !== undefined ? `last shift scored ${lastScore}/100` : 'no retrospective yet'} />
    </div>
  );
}

export function AlertFeed({ s }: { s: Snapshot }) {
  const select = useSelect();
  const alerts = [...s.alerts].reverse();
  return (
    <Card title={<><Activity className="h-3.5 w-3.5" /> Alert feed</>} right={<span className="text-[11px] text-slate-500">{s.run.alertsEmitted}/{s.run.alertsPlanned} scheduled</span>} className="h-[640px]" bodyClass="overflow-y-auto">
      {!alerts.length ? (
        <Empty>Press <b className="mx-1 text-slate-300">Start shift</b> to begin streaming production alerts.</Empty>
      ) : (
        <ul className="divide-y divide-white/[0.04]">
          {alerts.map((a) => (
            <li key={a.id} className={`animate-fade-in cursor-pointer px-4 py-2.5 hover:bg-white/[0.03] ${a.disposition === 'suppressed' ? 'opacity-55' : ''}`} onClick={() => a.incidentId && select({ type: 'incident', id: a.incidentId })}>
              <div className="flex items-center gap-1.5">
                <Chip cls={SOURCE[a.source].cls}>{SOURCE[a.source].label}</Chip>
                <Chip cls={SEV[a.severity]}>{a.severity}</Chip>
                {a.env !== 'prod' && <Chip cls="bg-slate-500/10 text-slate-300 ring-slate-500/25">{a.env}</Chip>}
                <span className="ml-auto mono text-[10.5px] text-slate-600">{rel(a.ts, s.run.startedAt)}</span>
              </div>
              <div className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-slate-200">{a.title}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                <span>{a.service}</span>
                <span>·</span>
                <Chip cls={DISPOSITION[a.disposition].cls}>{DISPOSITION[a.disposition].label}{a.incidentId && a.disposition !== 'suppressed' ? ` → ${a.incidentId}` : ''}</Chip>
                {a.ruleRef && <Chip cls="bg-violet-500/10 text-violet-200 ring-violet-500/25">{a.ruleRef}</Chip>}
                {a.status === 'resolved' && <Chip cls="bg-emerald-500/10 text-emerald-300 ring-emerald-500/25">recovered</Chip>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ChildCard({ c, s }: { c: ChildAgent; s: Snapshot }) {
  const select = useSelect();
  const inc = s.incidents.find((i) => i.id === c.incidentId);
  const phaseIdx = PHASES.indexOf((c.phase ?? 'briefing') as (typeof PHASES)[number]);
  const done = c.status !== 'running' && c.status !== 'queued';
  return (
    <button onClick={() => select({ type: 'child', id: c.id })} className={`card group flex h-[214px] flex-col overflow-hidden text-left transition hover:border-violet-400/30 ${c.status === 'running' ? 'border-violet-500/25 bg-violet-500/[0.04]' : ''} ${c.status === 'cancelled' ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2 border-b border-white/[0.05] px-3 py-2">
        <span className={`relative flex h-6 w-6 items-center justify-center rounded-md bg-violet-500/15 ${c.status === 'running' ? 'animate-pulse-ring' : ''}`}>
          <Bot className="h-3.5 w-3.5 text-violet-300" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-100">
            {c.id}
            <span className="font-normal text-slate-500">on {c.incidentId}</span>
            {c.raceId && <Swords className="h-3 w-3 text-amber-300" />}
          </div>
          <div className="truncate text-[11px] text-slate-500">{inc?.title}</div>
        </div>
        {done && <ActionIcon action={c.action ?? (c.status === 'cancelled' ? 'none' : undefined)} />}
      </div>
      <div className="flex items-center gap-1.5 px-3 pt-2">
        <StrategyChip s={c.strategy} />
        {c.usedKnowledge && <Chip cls="bg-violet-500/10 text-violet-200 ring-violet-500/25">knowledge</Chip>}
        {c.usedScratchpad && <Chip cls="bg-sky-500/10 text-sky-200 ring-sky-500/25">scratchpad</Chip>}
        <span className="ml-auto mono text-[10.5px] text-slate-500">{c.toolCalls}/14 calls</span>
      </div>
      <div className="flex gap-0.5 px-3 pt-2">
        {PHASES.map((p, i) => (
          <div key={p} title={p} className={`h-1 flex-1 rounded-full ${c.status === 'cancelled' ? 'bg-white/10' : done || i < phaseIdx ? 'bg-violet-400/70' : i === phaseIdx ? 'bg-violet-300 animate-pulse' : 'bg-white/10'}`} />
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-3 pb-2 pt-2">
        {c.status === 'queued' ? <div className="text-[12px] text-slate-500">Waiting for a free slot…</div> : <StepList steps={c.steps} start={s.run.startedAt} limit={4} showCode={false} compact />}
      </div>
    </button>
  );
}

export function AgentBoard({ s }: { s: Snapshot }) {
  const running = s.children.filter((c) => c.status === 'running');
  const queued = s.children.filter((c) => c.status === 'queued');
  const recent = s.children.filter((c) => c.status !== 'running' && c.status !== 'queued').sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
  const shown = [...running, ...queued.slice(0, 2), ...recent].slice(0, 9);
  const races = s.incidents.filter((i) => i.race).length;
  const lastMaster = [...s.decisions].reverse().find((d) => d.actor === 'master');
  return (
    <Card title={<><Workflow className="h-3.5 w-3.5" /> Agent orchestration</>} right={<span className="text-[11px] text-slate-500">max {s.config.maxParallel} parallel · isolated worker threads + git worktrees</span>} className="h-[640px]" bodyClass="flex flex-col overflow-hidden p-3 gap-3">
      <div className="rounded-xl border border-violet-500/25 bg-gradient-to-br from-violet-600/15 via-violet-600/5 to-transparent p-3">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600 shadow-lg shadow-violet-900/50 ${s.run.status === 'running' || s.run.status === 'draining' ? 'animate-pulse-ring' : ''}`}>
            <BrainCircuit className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-white">Master triage agent <span className="font-normal text-violet-200/70">· playbook v{s.run.playbookVersion}</span></div>
            <div className="truncate text-[11.5px] text-slate-400">{lastMaster ? <InlineCode text={lastMaster.text} /> : 'Idle — waiting for alerts'}</div>
          </div>
          <div className="grid grid-cols-4 gap-3 text-center">
            {[
              ['Incidents', s.metrics.incidents],
              ['Running', running.length],
              ['Queued', queued.length],
              ['Races', races],
            ].map(([l, v]) => (
              <div key={l as string}>
                <div className="text-[17px] font-semibold tabular-nums text-white">{v}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {shown.length ? (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 overflow-y-auto pr-1 md:grid-cols-2 2xl:grid-cols-3">
          {shown.map((c) => (
            <ChildCard key={c.id} c={c} s={s} />
          ))}
        </div>
      ) : (
        <Empty>Child agents appear here as the master fans out investigations.</Empty>
      )}
    </Card>
  );
}

const KIND_CLS: Record<string, string> = {
  suppress: 'text-slate-400',
  group: 'text-sky-300',
  hold: 'text-amber-300',
  spawn: 'text-violet-300',
  race: 'text-amber-300',
  cancel: 'text-slate-400',
  escalate: 'text-rose-300',
  pr: 'text-emerald-300',
  note: 'text-sky-300',
  learn: 'text-fuchsia-300',
  resolve: 'text-emerald-300',
  triage: 'text-cyan-300',
  system: 'text-slate-300',
};

export function DecisionLog({ s, className = 'h-[640px]' }: { s: Snapshot; className?: string }) {
  const [onlyMaster, setOnlyMaster] = useState(false);
  const select = useSelect();
  const list = [...s.decisions].reverse().filter((d) => !onlyMaster || d.actor === 'master' || d.actor === 'retro');
  return (
    <Card
      title={<><Users className="h-3.5 w-3.5" /> Decision log</>}
      right={
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-500">
          <input type="checkbox" checked={onlyMaster} onChange={(e) => setOnlyMaster(e.target.checked)} className="accent-violet-500" /> master only
        </label>
      }
      className={className}
      bodyClass="overflow-y-auto"
    >
      {!list.length ? (
        <Empty>Every triage decision is logged here with its reasoning.</Empty>
      ) : (
        <ul className="divide-y divide-white/[0.04]">
          {list.map((d) => (
            <li key={d.id} className="animate-fade-in cursor-pointer px-4 py-2.5 hover:bg-white/[0.02]" onClick={() => d.incidentId && select({ type: 'incident', id: d.incidentId })}>
              <div className="flex items-center gap-2 text-[10.5px]">
                <span className={`mono font-semibold uppercase ${KIND_CLS[d.kind]}`}>{d.kind}</span>
                <span className="text-slate-500">{d.actor}</span>
                {d.rules?.map((r) => (
                  <Chip key={r} cls="bg-violet-500/10 text-violet-200 ring-violet-500/25">{r}</Chip>
                ))}
                <span className="ml-auto mono text-slate-600">{rel(d.t, s.run.startedAt)}</span>
              </div>
              <div className="mt-1 text-[12.5px] leading-snug text-slate-200">
                <InlineCode text={d.text} />
              </div>
              {d.reasoning.length > 0 && (
                <ul className="mt-1 space-y-0.5 border-l border-white/10 pl-2.5">
                  {d.reasoning.map((r, i) => (
                    <li key={i} className="text-[11.5px] leading-snug text-slate-500">
                      <InlineCode text={r} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const tooltipStyle = { background: '#13141c', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, fontSize: 12 };

export function TimelineChart({ s }: { s: Snapshot }) {
  return (
    <Card title={<><Activity className="h-3.5 w-3.5" /> Alerts received vs investigated</>} right={<span className="text-[11px] text-slate-500">simulated minutes into shift</span>} className="h-[260px]" bodyClass="p-3">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={s.metrics.timeline} margin={{ left: -18, right: 8, top: 6 }}>
          <defs>
            <linearGradient id="gr" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#94a3b8" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gi" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.55} />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gf" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,.05)" vertical={false} />
          <XAxis dataKey="t" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => `minute ${l}`} />
          <Area type="monotone" dataKey="received" name="Received" stroke="#94a3b8" fill="url(#gr)" strokeWidth={2} isAnimationActive={false} />
          <Area type="monotone" dataKey="filtered" name="Filtered (grouped/suppressed/self-healed)" stroke="#38bdf8" fill="url(#gf)" strokeWidth={2} isAnimationActive={false} />
          <Area type="monotone" dataKey="investigated" name="Investigated" stroke="#8b5cf6" fill="url(#gi)" strokeWidth={2} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function TtdHistogram({ s }: { s: Snapshot }) {
  const data = useMemo(() => {
    const buckets = [0, 5, 10, 15, 20, 30, 45, 60];
    return buckets.map((b, i) => {
      const hi = buckets[i + 1] ?? Infinity;
      return { label: hi === Infinity ? `${b}+` : `${b}–${hi}`, count: s.metrics.ttdSamples.filter((x) => x >= b && x < hi).length };
    });
  }, [s.metrics.ttdSamples]);
  return (
    <Card title={<><AlarmClock className="h-3.5 w-3.5" /> Time to diagnosis</>} right={<span className="text-[11px] text-slate-500">human baseline 45–90m</span>} className="h-[260px]" bodyClass="p-3">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -22, right: 4, top: 6 }}>
          <CartesianGrid stroke="rgba(255,255,255,.05)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10.5 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,.03)' }} formatter={(v) => [v, 'incidents']} labelFormatter={(l) => `${l} min`} />
          <Bar dataKey="count" fill="#22d3ee" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function Scratchpad({ s }: { s: Snapshot }) {
  const list = [...s.scratchpad].reverse();
  const cls: Record<string, string> = { finding: 'text-emerald-300', claim: 'text-amber-300', incidental: 'text-sky-300', race: 'text-amber-300', join: 'text-violet-300', info: 'text-slate-300' };
  return (
    <Card title={<><Users className="h-3.5 w-3.5" /> Shared scratchpad</>} right={<a href="/api/scratchpad.md" target="_blank" className="text-[11px] text-slate-500 hover:text-slate-300">scratchpad.md ↗</a>} className="h-[260px]" bodyClass="overflow-y-auto px-4 py-2">
      {!list.length ? (
        <Empty>Children post findings, file claims and race results here so siblings don't duplicate work.</Empty>
      ) : (
        <ul className="space-y-1.5">
          {list.map((e, i) => (
            <li key={i} className="animate-fade-in flex gap-2 text-[12px] leading-snug">
              <span className="mono w-12 shrink-0 text-[10.5px] text-slate-600">{rel(e.t, s.run.startedAt)}</span>
              <span className={`mono w-16 shrink-0 text-[10.5px] uppercase ${cls[e.kind]}`}>{e.kind}</span>
              <span className="text-slate-300">
                <b className="font-medium text-slate-100">{e.author}</b> {e.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function RecentInvestigations({ s }: { s: Snapshot }) {
  const select = useSelect();
  const list = [...s.incidents].filter((i) => i.childIds.length || i.status === 'held' || i.status === 'auto-resolved').reverse().slice(0, 30);
  return (
    <Card title={<><Siren className="h-3.5 w-3.5" /> Recent investigations</>} className="h-[260px]" bodyClass="overflow-y-auto">
      {!list.length ? (
        <Empty>Incidents and their outcomes show up here.</Empty>
      ) : (
        <ul className="divide-y divide-white/[0.04]">
          {list.map((i) => (
            <li key={i.id} className="flex cursor-pointer items-center gap-2.5 px-4 py-2 hover:bg-white/[0.03]" onClick={() => select({ type: 'incident', id: i.id })}>
              <ActionIcon action={i.action} />
              <span className="mono w-16 shrink-0 text-[11px] text-slate-400">{i.id}</span>
              <Chip cls={SEV[i.severity]}>{i.severity}</Chip>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-200">{i.summary ?? i.title}</span>
              {i.prId && <span className="mono text-[11px] text-emerald-300">#{i.prId}</span>}
              <span className="hidden text-[11px] text-slate-500 lg:inline">{CATEGORY_LABELS[i.category]}</span>
              <Chip cls={INC_STATUS[i.status].cls}>{INC_STATUS[i.status].label}</Chip>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function LiveTab({ s }: { s: Snapshot }) {
  return (
    <div className="space-y-4">
      <KpiRow s={s} />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-3">
          <AlertFeed s={s} />
        </div>
        <div className="col-span-12 lg:col-span-6">
          <AgentBoard s={s} />
        </div>
        <div className="col-span-12 lg:col-span-3">
          <DecisionLog s={s} />
        </div>
      </div>
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-6">
          <TimelineChart s={s} />
        </div>
        <div className="col-span-12 lg:col-span-3">
          <TtdHistogram s={s} />
        </div>
        <div className="col-span-12 lg:col-span-3">
          <StrategyMix s={s} />
        </div>
      </div>
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-6">
          <RecentInvestigations s={s} />
        </div>
        <div className="col-span-12 lg:col-span-6">
          <Scratchpad s={s} />
        </div>
      </div>
    </div>
  );
}

function StrategyMix({ s }: { s: Snapshot }) {
  const counts = new Map<string, { n: number; won: number }>();
  for (const c of s.children) {
    const e = counts.get(c.strategy) ?? { n: 0, won: 0 };
    e.n += 1;
    if (c.finding && c.diagnosedAt) e.won += 1;
    counts.set(c.strategy, e);
  }
  const data = [...counts.entries()].map(([k, v]) => ({ name: STRATEGY_LABELS[k as keyof typeof STRATEGY_LABELS], spawned: v.n, diagnosed: v.won }));
  return (
    <Card title={<><Swords className="h-3.5 w-3.5" /> Strategies this shift</>} className="h-[260px]" bodyClass="p-3">
      {!data.length ? (
        <Empty>Which investigation strategies the master picked, and how often each produced the diagnosis.</Empty>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 30, right: 8 }}>
            <CartesianGrid stroke="rgba(255,255,255,.05)" horizontal={false} />
            <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} width={100} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,.03)' }} />
            <Bar dataKey="spawned" name="Agents spawned" fill="#475569" radius={[0, 4, 4, 0]} isAnimationActive={false} />
            <Bar dataKey="diagnosed" name="Found root cause" fill="#8b5cf6" radius={[0, 4, 4, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
