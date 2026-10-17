import { Bot, ExternalLink, GitMerge, GitPullRequest, NotebookPen, Siren, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Snapshot } from '../../../shared/types.ts';
import { CATEGORY_LABELS, STRATEGY_LABELS } from '../../../shared/types.ts';
import { control } from '../api.ts';
import { CHILD_STATUS, DISPOSITION, INC_STATUS, SEV, SOURCE, fmtMin, rel } from '../util.ts';
import { Chip, DiffView, Markdown, StepList, StrategyChip, useSelect, type Selection } from './ui.tsx';

export function Drawer({ s, sel, onClose }: { s: Snapshot; sel: Selection; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  if (!sel) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50 backdrop-blur-[2px]" onClick={onClose}>
      <aside className="animate-fade-in h-full w-full max-w-[860px] overflow-y-auto border-l border-white/10 bg-[#0e0f15] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="sticky top-3 float-right mr-3 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
          <X className="h-5 w-5" />
        </button>
        <div className="p-6">
          {sel.type === 'incident' && <IncidentView s={s} id={String(sel.id)} />}
          {sel.type === 'child' && <ChildView s={s} id={String(sel.id)} />}
          {sel.type === 'pr' && <PrView s={s} id={Number(sel.id)} />}
          {sel.type === 'note' && <NoteView s={s} id={String(sel.id)} />}
        </div>
      </aside>
    </div>
  );
}

function IncidentView({ s, id }: { s: Snapshot; id: string }) {
  const select = useSelect();
  const inc = s.incidents.find((i) => i.id === id);
  if (!inc) return <div className="text-slate-400">Incident not found in the current shift.</div>;
  const alerts = s.alerts.filter((a) => inc.alertIds.includes(a.id));
  const children = s.children.filter((c) => c.incidentId === id);
  const decisions = s.decisions.filter((d) => d.incidentId === id);
  const note = s.notes.find((n) => n.id === inc.noteId);
  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 text-[12px] text-slate-400">
          <span className="mono">{inc.id}</span>
          <Chip cls={SEV[inc.severity]}>{inc.severity}</Chip>
          <Chip cls={INC_STATUS[inc.status].cls}>{INC_STATUS[inc.status].label}</Chip>
          <span>{CATEGORY_LABELS[inc.category]}</span>
          <span>· {inc.services.join(', ')}</span>
        </div>
        <h2 className="mt-2 text-xl font-semibold text-white">{inc.title}</h2>
        <div className="mt-2 flex flex-wrap gap-4 text-[12.5px] text-slate-400">
          <span>Opened {rel(inc.createdAt, s.run.startedAt)}</span>
          <span>Time to diagnosis <b className="text-cyan-200">{inc.concludedAt ? fmtMin((inc.concludedAt - inc.createdAt) / 60000) : '—'}</b></span>
          <span>{children.length} agent(s){inc.race ? ' raced' : ''}</span>
          {inc.knowledgeRefs?.length ? <span>Playbook refs: {inc.knowledgeRefs.join(', ')}</span> : null}
        </div>
      </div>
      {inc.diagnosis && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-300">Root cause · found by {inc.diagnosedBy}</div>
          <div className="mt-1 text-[14px] font-medium text-white">{inc.diagnosis.title}</div>
          <div className="mono mt-0.5 text-[12px] text-emerald-200/80">{inc.diagnosis.file}:{inc.diagnosis.line}</div>
          <p className="mt-2 text-[13px] text-slate-300">{inc.diagnosis.explanation.replace(/`/g, '')}</p>
          <pre className="mono mt-2 overflow-x-auto rounded-lg bg-black/40 p-2.5 text-[11.5px] text-slate-300">{inc.diagnosis.snippet}</pre>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {inc.prId && (
          <button className="btn-ghost" onClick={() => select({ type: 'pr', id: inc.prId! })}>
            <GitPullRequest className="h-4 w-4 text-emerald-300" /> PR #{inc.prId}
          </button>
        )}
        {note && (
          <button className="btn-ghost" onClick={() => select({ type: 'note', id: note.id })}>
            {note.kind === 'escalation' ? <Siren className="h-4 w-4 text-rose-300" /> : <NotebookPen className="h-4 w-4 text-sky-300" />} {note.id}
          </button>
        )}
      </div>
      <section>
        <h3 className="card-title mb-2">Alerts ({alerts.length})</h3>
        <div className="space-y-2">
          {alerts.map((a) => (
            <details key={a.id} className="card px-3 py-2">
              <summary className="flex cursor-pointer items-center gap-2 text-[12.5px]">
                <Chip cls={SOURCE[a.source].cls}>{SOURCE[a.source].label}</Chip>
                <span className="flex-1 truncate text-slate-200">{a.title}</span>
                <Chip cls={DISPOSITION[a.disposition].cls}>{DISPOSITION[a.disposition].label}</Chip>
              </summary>
              <div className="mt-2 space-y-2 text-[12px] text-slate-400">
                <p>{a.description}</p>
                {a.dispositionReason && <p className="text-violet-200/80">Triage: {a.dispositionReason}</p>}
                {(a.stackTrace || a.logs.length > 0) && <pre className="mono overflow-x-auto rounded-md bg-black/40 p-2 text-[11px] text-slate-300">{[a.stackTrace, ...a.logs].filter(Boolean).join('\n')}</pre>}
              </div>
            </details>
          ))}
        </div>
      </section>
      <section>
        <h3 className="card-title mb-2">Master decisions</h3>
        <ul className="space-y-2">
          {decisions.map((d) => (
            <li key={d.id} className="text-[12.5px]">
              <span className="mono mr-2 text-[10.5px] text-slate-600">{rel(d.t, s.run.startedAt)}</span>
              <span className="text-slate-200">{d.text}</span>
              <ul className="ml-14 mt-0.5 list-disc pl-3 text-[11.5px] text-slate-500">
                {d.reasoning.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="card-title mb-2">Child agents</h3>
        <div className="space-y-2">
          {children.map((c) => (
            <button key={c.id} onClick={() => select({ type: 'child', id: c.id })} className="card flex w-full items-center gap-3 px-3 py-2 text-left hover:border-violet-400/30">
              <Bot className="h-4 w-4 text-violet-300" />
              <span className="mono text-[12px] text-slate-200">{c.id}</span>
              <StrategyChip s={c.strategy} />
              <span className={`text-[12px] ${CHILD_STATUS[c.status]}`}>{c.status}</span>
              <span className="flex-1 truncate text-[12px] text-slate-400">{c.summary}</span>
              <span className="mono text-[11px] text-slate-500">{c.toolCalls} calls</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function ChildView({ s, id }: { s: Snapshot; id: string }) {
  const select = useSelect();
  const c = s.children.find((x) => x.id === id);
  if (!c) return <div className="text-slate-400">Agent not found.</div>;
  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 text-[12px] text-slate-400">
          <Bot className="h-4 w-4 text-violet-300" />
          <span className="mono">{c.id}</span>
          <StrategyChip s={c.strategy} />
          <span className={CHILD_STATUS[c.status]}>{c.status}</span>
          {c.raceId && <Chip cls="bg-amber-500/10 text-amber-200 ring-amber-500/25">race</Chip>}
        </div>
        <h2 className="mt-2 text-xl font-semibold text-white">
          Child agent on{' '}
          <button className="text-violet-300 hover:underline" onClick={() => select({ type: 'incident', id: c.incidentId })}>
            {c.incidentId}
          </button>
        </h2>
        <div className="mt-1 text-[12.5px] text-slate-400">
          {c.toolCalls} tool calls · {c.filesRead} files read · {c.startedAt ? `ran ${fmtMin(((c.endedAt ?? s.now) - c.startedAt) / 60000)}` : 'queued'}
          {c.summary ? ` · ${c.summary}` : ''}
        </div>
      </div>
      <section className="card p-4">
        <h3 className="card-title mb-2">Brief from master</h3>
        <Markdown>{c.brief || '_Queued — brief is assembled when a slot frees up._'}</Markdown>
      </section>
      <section>
        <h3 className="card-title mb-3">Reasoning trace · {STRATEGY_LABELS[c.strategy]}</h3>
        <StepList steps={c.steps} start={s.run.startedAt} />
      </section>
      {c.prId && (
        <button className="btn-ghost" onClick={() => select({ type: 'pr', id: c.prId! })}>
          <GitPullRequest className="h-4 w-4 text-emerald-300" /> Open PR #{c.prId}
        </button>
      )}
    </div>
  );
}

export function PrView({ s, id }: { s: Snapshot; id: number }) {
  const select = useSelect();
  const pr = s.prs.find((p) => p.id === id);
  const [tab, setTab] = useState<'conversation' | 'files' | 'tests'>('conversation');
  const [busy, setBusy] = useState(false);
  if (!pr) return <div className="text-slate-400">PR not found.</div>;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-white">
          {pr.title} <span className="font-normal text-slate-500">#{pr.id}</span>
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-slate-400">
          <Chip cls={pr.status === 'merged' ? 'bg-purple-500/20 text-purple-200 ring-purple-500/40' : 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30'}>
            {pr.status === 'merged' ? <GitMerge className="h-3 w-3" /> : <GitPullRequest className="h-3 w-3" />} {pr.status === 'merged' ? 'Merged' : 'Open'}
          </Chip>
          <span>
            <b className="text-slate-200">{pr.childId}</b> wants to merge <code className="mono rounded bg-white/5 px-1 text-[11.5px] text-sky-200">{pr.branch}</code> into <code className="mono rounded bg-white/5 px-1 text-[11.5px]">main</code>
          </span>
          <span className="text-emerald-300">+{pr.additions}</span>
          <span className="text-rose-300">−{pr.deletions}</span>
          <button className="text-violet-300 hover:underline" onClick={() => select({ type: 'incident', id: pr.incidentId })}>
            {pr.incidentId}
          </button>
        </div>
      </div>
      <div className="flex items-center gap-1 border-b border-white/10">
        {(['conversation', 'files', 'tests'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-3 py-2 text-[13px] capitalize ${tab === t ? 'border-violet-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
            {t === 'files' ? `Files changed (${pr.files.length})` : t === 'tests' ? 'Checks' : `Conversation${pr.comments.length ? ` (${pr.comments.length})` : ''}`}
          </button>
        ))}
        <div className="ml-auto pb-1.5">
          {pr.status === 'open' ? (
            <button
              className="btn-primary bg-emerald-600 hover:bg-emerald-500"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await control({ action: 'merge', prId: pr.id }).finally(() => setBusy(false));
              }}
            >
              <GitMerge className="h-4 w-4" /> Approve & merge
            </button>
          ) : (
            <span className="text-[12px] text-purple-200">Merged by on-call engineer</span>
          )}
        </div>
      </div>
      {tab === 'conversation' && (
        <div className="space-y-4">
          <div className="card p-4">
            <Markdown>{pr.body}</Markdown>
          </div>
          {pr.comments.map((c, i) => (
            <div key={i} className="card p-4">
              <div className="mb-1 text-[12px] text-slate-400">
                <b className="text-slate-200">{c.author}</b> commented {rel(c.t, s.run.startedAt)}
              </div>
              <Markdown>{c.body}</Markdown>
            </div>
          ))}
        </div>
      )}
      {tab === 'files' && <DiffView diff={pr.diff} />}
      {tab === 'tests' && (
        <div className="space-y-3">
          <div className="card p-4">
            <div className="text-[13px] font-medium text-rose-200">Before fix — regression test on main: {pr.testsBefore.failed} failing</div>
            <pre className="mono mt-2 overflow-x-auto text-[11.5px] text-slate-400">{pr.testsBefore.output}</pre>
          </div>
          <div className="card p-4">
            <div className="text-[13px] font-medium text-emerald-200">After fix — full suite: {pr.testsAfter.passed} passed, {pr.testsAfter.failed} failed</div>
            <pre className="mono mt-2 overflow-x-auto text-[11.5px] text-slate-400">{pr.testsAfter.output}</pre>
          </div>
        </div>
      )}
      <a className="inline-flex items-center gap-1 text-[12px] text-slate-500" href="#" onClick={(e) => e.preventDefault()}>
        <ExternalLink className="h-3 w-3" /> Branch lives in the local mock repo: data/workspace/shopfast
      </a>
    </div>
  );
}

function NoteView({ s, id }: { s: Snapshot; id: string }) {
  const select = useSelect();
  const n = s.notes.find((x) => x.id === id);
  if (!n) return <div className="text-slate-400">Note not found.</div>;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-[12px] text-slate-400">
        {n.kind === 'escalation' ? <Siren className="h-4 w-4 text-rose-300" /> : <NotebookPen className="h-4 w-4 text-sky-300" />}
        <span className="mono">{n.id}</span>
        <span>by {n.childId}</span>
        {n.escalateTo && <Chip cls="bg-rose-500/15 text-rose-200 ring-rose-500/30">paged {n.escalateTo}</Chip>}
        <button className="text-violet-300 hover:underline" onClick={() => select({ type: 'incident', id: n.incidentId })}>
          {n.incidentId}
        </button>
      </div>
      <h2 className="text-xl font-semibold text-white">{n.title}</h2>
      <div className="card p-4">
        <Markdown>{n.body}</Markdown>
      </div>
    </div>
  );
}
