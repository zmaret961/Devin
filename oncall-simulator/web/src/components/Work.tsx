import { GitMerge, GitPullRequest, NotebookPen, Siren } from 'lucide-react';
import { useState } from 'react';
import type { Snapshot } from '../../../shared/types.ts';
import { CATEGORY_LABELS } from '../../../shared/types.ts';
import { INC_STATUS, SEV, fmtMin, rel } from '../util.ts';
import { ActionIcon, Card, Chip, Empty, StrategyChip, useSelect } from './ui.tsx';

export function InvestigationsTab({ s }: { s: Snapshot }) {
  const select = useSelect();
  const [filter, setFilter] = useState<'all' | 'investigated' | 'filtered'>('all');
  const list = [...s.incidents].reverse().filter((i) => (filter === 'all' ? true : filter === 'investigated' ? i.childIds.length > 0 : i.childIds.length === 0));
  const suppressed = s.alerts.filter((a) => a.disposition === 'suppressed');
  return (
    <div className="grid grid-cols-12 gap-4">
      <Card
        className="col-span-12 xl:col-span-8"
        title={`Incidents (${s.incidents.length})`}
        right={
          <div className="flex gap-1 text-[11px]">
            {(['all', 'investigated', 'filtered'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`rounded-md px-2 py-0.5 capitalize ${filter === f ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                {f}
              </button>
            ))}
          </div>
        }
      >
        {!list.length ? (
          <Empty>No incidents yet.</Empty>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead className="text-left text-[10.5px] uppercase tracking-wider text-slate-500">
              <tr className="border-b border-white/[0.06]">
                <th className="px-4 py-2 font-medium">Incident</th>
                <th className="px-2 py-2 font-medium">Category</th>
                <th className="px-2 py-2 font-medium">Alerts</th>
                <th className="px-2 py-2 font-medium">Strategy</th>
                <th className="px-2 py-2 font-medium">TTD</th>
                <th className="px-2 py-2 font-medium">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {list.map((i) => (
                <tr key={i.id} className="cursor-pointer hover:bg-white/[0.03]" onClick={() => select({ type: 'incident', id: i.id })}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="mono text-[11px] text-slate-500">{i.id}</span>
                      <Chip cls={SEV[i.severity]}>{i.severity}</Chip>
                    </div>
                    <div className="mt-0.5 max-w-[420px] truncate text-slate-200">{i.title}</div>
                  </td>
                  <td className="px-2 py-2.5 text-slate-400">{CATEGORY_LABELS[i.category]}</td>
                  <td className="px-2 py-2.5 tabular-nums text-slate-300">{i.alertIds.length}</td>
                  <td className="px-2 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {i.strategies.map((st) => (
                        <StrategyChip key={st} s={st} />
                      ))}
                      {!i.strategies.length && <span className="text-slate-600">—</span>}
                    </div>
                  </td>
                  <td className="px-2 py-2.5 tabular-nums text-cyan-200">{i.concludedAt && i.childIds.length ? fmtMin((i.concludedAt - i.createdAt) / 60000) : '—'}</td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <ActionIcon action={i.action} />
                      <Chip cls={INC_STATUS[i.status].cls}>{INC_STATUS[i.status].label}</Chip>
                      {i.prId && <span className="mono text-[11px] text-emerald-300">#{i.prId}</span>}
                    </div>
                    {i.summary && <div className="mt-0.5 max-w-[260px] truncate text-[11px] text-slate-500">{i.summary}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <div className="col-span-12 space-y-4 xl:col-span-4">
        <Card title={`Notes & escalations (${s.notes.length})`} bodyClass="max-h-[420px] overflow-y-auto">
          {!s.notes.length ? (
            <Empty>Diagnostic notes and escalations appear here.</Empty>
          ) : (
            <ul className="divide-y divide-white/[0.04]">
              {[...s.notes].reverse().map((n) => (
                <li key={n.id} className="flex cursor-pointer items-start gap-2 px-4 py-2.5 hover:bg-white/[0.03]" onClick={() => select({ type: 'note', id: n.id })}>
                  {n.kind === 'escalation' ? <Siren className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" /> : <NotebookPen className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />}
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] text-slate-200">{n.title}</div>
                    <div className="text-[11px] text-slate-500">
                      {n.childId} · {rel(n.createdAt, s.run.startedAt)}
                      {n.escalateTo ? ` · paged ${n.escalateTo}` : ''}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={`Suppressed alerts (${suppressed.length})`} bodyClass="max-h-[300px] overflow-y-auto">
          {!suppressed.length ? (
            <Empty>Nothing suppressed. Learned noise rules show their effect here.</Empty>
          ) : (
            <ul className="divide-y divide-white/[0.04]">
              {suppressed.map((a) => (
                <li key={a.id} className="px-4 py-2 text-[12px]">
                  <div className="truncate text-slate-300">{a.title}</div>
                  <div className="text-[11px] text-slate-500">
                    <span className="text-violet-300">{a.ruleRef}</span> · {a.dispositionReason}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

export function PrsTab({ s }: { s: Snapshot }) {
  const select = useSelect();
  return (
    <Card title={`Pull requests · shopfast (local mock repo) · ${s.prs.length}`}>
      {!s.prs.length ? (
        <Empty>When a child agent reproduces a bug with a failing test and fixes it, its PR shows up here.</Empty>
      ) : (
        <ul className="divide-y divide-white/[0.05]">
          {[...s.prs].reverse().map((pr) => (
            <li key={pr.id} className="flex cursor-pointer items-start gap-3 px-5 py-3.5 hover:bg-white/[0.03]" onClick={() => select({ type: 'pr', id: pr.id })}>
              {pr.status === 'merged' ? <GitMerge className="mt-0.5 h-5 w-5 text-purple-300" /> : <GitPullRequest className="mt-0.5 h-5 w-5 text-emerald-300" />}
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-medium text-slate-100">
                  {pr.title} <span className="font-normal text-slate-500">#{pr.id}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
                  <span>
                    opened {rel(pr.createdAt, s.run.startedAt)} by <b className="text-slate-300">{pr.childId}</b>
                  </span>
                  <span>· {pr.incidentId}</span>
                  <code className="mono rounded bg-white/5 px-1 text-[11px] text-sky-200">{pr.branch}</code>
                  <Chip cls="bg-emerald-500/10 text-emerald-300 ring-emerald-500/25">✓ {pr.testsAfter.passed} tests</Chip>
                  <Chip cls="bg-rose-500/10 text-rose-200 ring-rose-500/25">reproduced: {pr.testsBefore.failed} failing before</Chip>
                  {pr.comments.length > 0 && <Chip cls="bg-violet-500/10 text-violet-200 ring-violet-500/25">+{pr.comments.length} linked incident(s)</Chip>}
                </div>
              </div>
              <div className="mono text-[12px]">
                <span className="text-emerald-300">+{pr.additions}</span> <span className="text-rose-300">−{pr.deletions}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
