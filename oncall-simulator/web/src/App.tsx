import { BrainCircuit, ChevronDown, FastForward, Pause, Play, Plus, RotateCcw, Sparkles, Zap } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Snapshot } from '../../shared/types.ts';
import { control, useSnapshot } from './api.ts';
import { Drawer } from './components/Drawer.tsx';
import { LearningTab, PlaybookTab } from './components/Learning.tsx';
import { LiveTab } from './components/Live.tsx';
import { InvestigationsTab, PrsTab } from './components/Work.tsx';
import { SelectContext, type Selection } from './components/ui.tsx';
import { clock } from './util.ts';

type Tab = 'live' | 'investigations' | 'prs' | 'learning' | 'playbook';

const STATUS: Record<Snapshot['run']['status'], { label: string; cls: string; dot: string }> = {
  idle: { label: 'Idle', cls: 'text-slate-300', dot: 'bg-slate-500' },
  running: { label: 'On call · streaming alerts', cls: 'text-emerald-300', dot: 'bg-emerald-400 animate-pulse' },
  draining: { label: 'Finishing investigations', cls: 'text-violet-300', dot: 'bg-violet-400 animate-pulse' },
  paused: { label: 'Paused', cls: 'text-amber-300', dot: 'bg-amber-400' },
  complete: { label: 'Shift complete', cls: 'text-slate-200', dot: 'bg-slate-300' },
  learning: { label: 'Retrospective running…', cls: 'text-fuchsia-300', dot: 'bg-fuchsia-400 animate-pulse' },
  learned: { label: 'Shift complete · playbook updated', cls: 'text-fuchsia-200', dot: 'bg-fuchsia-300' },
};

function InjectMenu({ s }: { s: Snapshot }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [form, setForm] = useState({ title: '', service: 'checkout-api', severity: 'P2', description: '' });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const groups = [
    ['code-bug', 'Code defects'],
    ['investigation', 'Investigation only'],
    ['security', 'Security'],
    ['noise', 'Noise'],
  ] as const;
  const disabled = !s.run.number;
  return (
    <div className="relative" ref={ref}>
      <button className="btn-ghost" disabled={disabled} onClick={() => setOpen(!open)} title={disabled ? 'Start a shift first' : 'Inject an alert now'}>
        <Plus className="h-4 w-4" /> Inject alert <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 max-h-[70vh] w-[360px] overflow-y-auto rounded-xl border border-white/10 bg-[#13141c] p-2 shadow-2xl">
          {groups.map(([k, label]) => (
            <div key={k} className="mb-1">
              <div className="px-2 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
              {s.injectables
                .filter((i) => i.kind === k)
                .map((i) => (
                  <button
                    key={i.id}
                    className="block w-full rounded-lg px-2 py-1.5 text-left text-[12.5px] text-slate-200 hover:bg-white/[0.06]"
                    onClick={async () => {
                      setOpen(false);
                      await control({ action: 'inject', templateId: i.id });
                    }}
                  >
                    {i.label}
                  </button>
                ))}
            </div>
          ))}
          <button className="mt-1 block w-full rounded-lg border-t border-white/10 px-2 py-2 text-left text-[12.5px] text-violet-300 hover:bg-white/[0.06]" onClick={() => setCustom(true)}>
            Custom alert…
          </button>
        </div>
      )}
      {custom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setCustom(false)}>
          <form
            className="w-[480px] space-y-3 rounded-2xl border border-white/10 bg-[#13141c] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault();
              await control({ action: 'inject', custom: form });
              setCustom(false);
              setOpen(false);
            }}
          >
            <div className="text-[15px] font-semibold text-white">Inject a custom alert</div>
            <input required placeholder="Title, e.g. TypeError: Cannot read properties of undefined (reading 'zip')" className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-violet-500" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <div className="flex gap-2">
              <select className="flex-1 rounded-lg bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10" value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })}>
                {['checkout-api', 'auth-service', 'payment-worker', 'catalog-api', 'db-primary'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              <select className="rounded-lg bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                {['P1', 'P2', 'P3', 'P4'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </div>
            <textarea placeholder="Description / symptoms" rows={3} className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-violet-500" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setCustom(false)}>
                Cancel
              </button>
              <button className="btn-primary">Fire alert</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Header({ s }: { s: Snapshot }) {
  const st = STATUS[s.run.status];
  const active = s.run.status === 'running' || s.run.status === 'draining';
  const finished = s.run.status === 'learned' || s.run.status === 'complete' || s.run.status === 'learning';
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#0a0b10]/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-4 px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-900/40">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-[15px] font-semibold tracking-tight text-white">Devin Oncall Simulator</div>
            <div className="text-[11.5px] text-slate-500">ShopFast production · agentic first responder</div>
          </div>
        </div>
        <div className="ml-4 flex items-center gap-4 rounded-xl bg-white/[0.03] px-4 py-1.5 ring-1 ring-white/[0.06]">
          <span className={`flex items-center gap-2 text-[12.5px] font-medium ${st.cls}`}>
            <span className={`h-2 w-2 rounded-full ${st.dot}`} /> {st.label}
          </span>
          {s.run.number > 0 && (
            <>
              <span className="text-[12px] text-slate-400">
                Shift <b className="text-slate-200">#{s.run.number}</b>
              </span>
              <span className="flex items-center gap-1 text-[12px] text-slate-400">
                <BrainCircuit className="h-3.5 w-3.5 text-violet-300" /> playbook <b className="text-violet-200">v{s.run.playbookVersion}</b>
              </span>
              <span className="mono text-[12px] text-slate-400" title="Simulated clock">
                {clock(s.now)}
              </span>
            </>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[12px] text-slate-400" title="Simulated minutes per real second">
            <FastForward className="h-3.5 w-3.5" />
            <select className="rounded-md bg-white/5 px-1.5 py-1 text-[12px] ring-1 ring-white/10" value={s.clock.speed} onChange={(e) => control({ action: 'speed', speed: Number(e.target.value) })}>
              {[30, 60, 120, 240, 600].map((v) => (
                <option key={v} value={v}>
                  {v / 60}× · {v / 60} sim-min/s
                </option>
              ))}
            </select>
          </label>
          <InjectMenu s={s} />
          {active ? (
            s.clock.running ? (
              <button className="btn-ghost" onClick={() => control({ action: 'pause' })}>
                <Pause className="h-4 w-4" /> Pause
              </button>
            ) : (
              <button className="btn-primary" onClick={() => control({ action: 'start' })}>
                <Play className="h-4 w-4" /> Resume
              </button>
            )
          ) : s.run.status === 'paused' ? (
            <button className="btn-primary" onClick={() => control({ action: 'start' })}>
              <Play className="h-4 w-4" /> Resume
            </button>
          ) : (
            <button className="btn-primary" onClick={() => control({ action: 'start' })}>
              <Play className="h-4 w-4" /> {finished ? `Start shift #${s.run.number + 1} with v${s.playbook.version}` : 'Start shift'}
            </button>
          )}
          {s.run.number > 0 && !finished && (
            <button className="btn-ghost" onClick={() => control({ action: 'replay' })} title="Learn from this shift now and start the next one">
              <RotateCcw className="h-4 w-4" /> Replay
            </button>
          )}
          <button
            className="btn-ghost px-2"
            title="Reset demo: wipe shifts and return to the starter playbook (v1)"
            onClick={() => window.confirm('Reset the demo? This wipes all shifts and returns to playbook v1.') && control({ action: 'reset' })}
          >
            Reset
          </button>
        </div>
      </div>
    </header>
  );
}

function LearnBanner({ s, go }: { s: Snapshot; go: (t: Tab) => void }) {
  const retro = s.retros.find((r) => r.run === s.run.number);
  if (s.run.status === 'learning')
    return (
      <div className="card flex items-center gap-3 border-fuchsia-500/25 bg-fuchsia-500/[0.06] px-5 py-3 text-[13.5px] text-fuchsia-100">
        <Sparkles className="h-5 w-5 animate-pulse text-fuchsia-300" /> Master agent is grading every decision from this shift and rewriting its playbook…
      </div>
    );
  if (!retro || s.run.status !== 'learned') return null;
  const prev = s.runs.find((r) => r.run === retro.run - 1)?.score?.total;
  return (
    <div className="card flex flex-wrap items-center gap-4 border-fuchsia-500/25 bg-gradient-to-r from-fuchsia-500/[0.08] via-violet-500/[0.06] to-transparent px-5 py-3.5">
      <Sparkles className="h-5 w-5 text-fuchsia-300" />
      <div className="text-[13.5px] text-slate-200">
        <b className="text-white">Shift {retro.run} scored {retro.score.total}/100</b>
        {prev !== undefined && (
          <span className={retro.score.total >= prev ? 'text-emerald-300' : 'text-rose-300'}>
            {' '}
            ({retro.score.total >= prev ? '+' : ''}
            {retro.score.total - prev} vs shift {retro.run - 1})
          </span>
        )}
        . The retrospective produced <b className="text-fuchsia-200">{retro.learnings.length} learning{retro.learnings.length === 1 ? '' : 's'}</b> → playbook <b className="text-violet-200">v{retro.toVersion}</b>.
      </div>
      <div className="ml-auto flex gap-2">
        <button className="btn-ghost" onClick={() => go('learning')}>
          See what it learned
        </button>
        <button className="btn-ghost" onClick={() => go('playbook')}>
          Playbook diff
        </button>
        <button className="btn-primary" onClick={() => control({ action: 'start' })}>
          <Play className="h-4 w-4" /> Run shift #{s.run.number + 1} with v{s.playbook.version}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const { snap, error } = useSnapshot();
  const [tab, setTab] = useState<Tab>('live');
  const [sel, setSel] = useState<Selection>(null);
  const close = useCallback(() => setSel(null), []);
  if (!snap)
    return (
      <div className="flex h-screen items-center justify-center text-sm text-slate-400">
        {error ? (
          <div className="text-center">
            Can't reach the engine ({error}).
            <br />
            Start it with <code className="mono text-slate-200">npm run demo</code>.
          </div>
        ) : (
          'Connecting to engine…'
        )}
      </div>
    );
  const tabs: [Tab, string, number?][] = [
    ['live', 'Live'],
    ['investigations', 'Investigations', snap.incidents.length],
    ['prs', 'Pull requests', snap.prs.length],
    ['learning', 'Learning', snap.retros.length],
    ['playbook', 'Playbook', snap.playbook.version],
  ];
  return (
    <SelectContext.Provider value={setSel}>
      <Header s={snap} />
      <main className="mx-auto max-w-[1800px] space-y-4 px-6 py-4">
        {error && <div className="rounded-lg bg-rose-500/10 px-4 py-2 text-sm text-rose-200">Lost connection to engine: {error}</div>}
        <nav className="flex items-center gap-1 border-b border-white/[0.06]">
          {tabs.map(([id, label, n]) => (
            <button key={id} onClick={() => setTab(id)} className={`-mb-px flex items-center gap-2 border-b-2 px-3.5 py-2 text-[13.5px] ${tab === id ? 'border-violet-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
              {label}
              {n !== undefined && <span className={`rounded-full px-1.5 text-[10.5px] ${tab === id ? 'bg-violet-500/25 text-violet-100' : 'bg-white/[0.06] text-slate-400'}`}>{id === 'playbook' ? `v${n}` : n}</span>}
            </button>
          ))}
        </nav>
        <LearnBanner s={snap} go={setTab} />
        {tab === 'live' && <LiveTab s={snap} />}
        {tab === 'investigations' && <InvestigationsTab s={snap} />}
        {tab === 'prs' && <PrsTab s={snap} />}
        {tab === 'learning' && <LearningTab s={snap} />}
        {tab === 'playbook' && <PlaybookTab s={snap} />}
      </main>
      <Drawer s={snap} sel={sel} onClose={close} />
    </SelectContext.Provider>
  );
}
