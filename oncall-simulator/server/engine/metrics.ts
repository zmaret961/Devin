import type { Metrics } from '../../shared/types.ts';
import { MIN } from './clock.ts';
import type { Orchestrator } from './master.ts';

/** Engineer-minutes avoided per outcome. Conservative, net of the human time to review the agent's work. */
export const HOURS_FORMULA = [
  { key: 'pr', label: 'Fix shipped as a tested PR', minutes: 75, explain: '≈90 min for an on-call engineer to page in, find, fix and test — minus ≈15 min to review the PR' },
  { key: 'joined', label: 'Duplicate incident linked to an existing PR', minutes: 5, explain: 'Counted like any duplicate alert: ack + link + close' },
  { key: 'note', label: 'Diagnostic note (no code change needed)', minutes: 40, explain: '≈45 min of investigation to reach the same conclusion — minus ≈5 min to read the note' },
  { key: 'escalate', label: 'Escalation with pre-triaged context', minutes: 20, explain: 'Context-gathering the responder no longer has to do before acting' },
  { key: 'noise', label: 'Duplicate or noise alert filtered, grouped or self-recovered', minutes: 5, explain: 'Ack + glance + close (or link) for an alert that needed no separate action' },
] as const;

export function computeMetrics(o: Orchestrator, timeline: Metrics['timeline']): Metrics {
  const inv = o.incidents.filter((i) => i.childIds.length > 0);
  const ttd = inv
    .filter((i) => i.concludedAt !== undefined && i.action && i.action !== 'none')
    .map((i) => (i.concludedAt! - i.createdAt) / MIN)
    .sort((a, b) => a - b);
  const q = (p: number) => (ttd.length ? ttd[Math.min(ttd.length - 1, Math.floor(p * ttd.length))] : null);
  const noiseNote = (s?: string) => !!s && /recovered on its own|no actionable/i.test(s);
  const count = {
    pr: o.incidents.filter((i) => i.action === 'pr').length,
    joined: o.incidents.filter((i) => i.action === 'joined').length,
    note: o.incidents.filter((i) => i.action === 'note' && !noiseNote(i.summary)).length,
    escalate: o.incidents.filter((i) => i.action === 'escalate').length,
    noise:
      o.alerts.filter((a) => a.disposition === 'suppressed' || a.disposition === 'grouped').length +
      o.incidents.filter((i) => i.action === 'auto-resolved' || (i.action === 'note' && noiseNote(i.summary))).length,
  };
  const hoursBreakdown = HOURS_FORMULA.map((h) => ({ label: h.label, count: count[h.key], minutesEach: h.minutes, minutes: count[h.key] * h.minutes }));
  const agentMinutes = o.children.reduce((n, c) => n + (c.startedAt ? ((c.endedAt ?? o.decisions.at(-1)?.t ?? c.startedAt) - c.startedAt) / MIN : 0), 0);
  return {
    alertsReceived: o.alerts.length,
    alertsSuppressed: o.alerts.filter((a) => a.disposition === 'suppressed').length,
    alertsGrouped: o.alerts.filter((a) => a.disposition === 'grouped').length,
    incidents: o.incidents.length,
    investigated: inv.length,
    childrenSpawned: o.children.length,
    activeInvestigations: o.children.filter((c) => c.status === 'running').length,
    queued: o.children.filter((c) => c.status === 'queued').length,
    held: o.incidents.filter((i) => i.status === 'held').length,
    prsOpened: o.prs.length,
    notes: o.notes.filter((n) => n.kind === 'diagnostic').length,
    escalations: o.notes.filter((n) => n.kind === 'escalation').length,
    avgTtdMin: ttd.length ? ttd.reduce((a, b) => a + b, 0) / ttd.length : null,
    p50TtdMin: q(0.5),
    p90TtdMin: q(0.9),
    ttdSamples: ttd,
    hoursSaved: hoursBreakdown.reduce((n, h) => n + h.minutes, 0) / 60,
    hoursBreakdown,
    agentMinutes,
    timeline,
  };
}
