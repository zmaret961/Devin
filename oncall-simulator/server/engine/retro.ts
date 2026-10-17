import type {
  Alert,
  Category,
  ChildAgent,
  CorrelationRule,
  Incident,
  IncidentEval,
  KnowledgeEntry,
  Learning,
  Playbook,
  RetroReport,
  ScoreBreakdown,
  StratStats,
  StrategyId,
  TriageRule,
} from '../../shared/types.ts';
import { CATEGORY_LABELS, STRATEGY_LABELS } from '../../shared/types.ts';
import { lineDiff } from '../../shared/diff.ts';
import { MIN } from './clock.ts';
import type { Orchestrator } from './master.ts';
import { CATEGORIES, renderPlaybook } from './playbook.ts';
import type { Truth } from './scenario.ts';
import { ruleMatches, signature } from './triage.ts';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const pct = (x: number) => `${Math.round(x * 100)}%`;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * The retrospective: after a shift, the master agent grades every decision it and its children made,
 * then rewrites its own playbook — new noise rules, correlations, routing preferences and knowledge —
 * each backed by evidence and a safety check. The next run loads the new version.
 */
export function runRetrospective(o: Orchestrator, pb: Playbook, run: number): { playbook: Playbook; report: RetroReport } {
  const truthOf = (a: Alert): Truth | undefined => o.truth.get(a.id);
  const alertsOf = (i: Incident) => i.alertIds.map((id) => o.alerts.find((a) => a.id === id)!);
  const childrenOf = (i: Incident) => i.childIds.map((id) => o.children.find((c) => c.id === id)!);
  const incTruth = (i: Incident) => {
    const ts = alertsOf(i).map(truthOf).filter((t): t is Truth => !!t);
    return ts.find((t) => t.kind === 'bug') ?? ts.find((t) => t.kind !== 'noise') ?? ts[0];
  };
  const next: Playbook = clone(pb);
  next.version = pb.version + 1;
  next.parentVersion = pb.version;
  next.createdAt = Date.now();
  const learnings: Learning[] = [];
  let lid = 0;
  const learn = (l: Omit<Learning, 'id'>) => learnings.push({ id: `L${next.version}.${++lid}`, ...l });

  // ------------------------------------------------------------ 1. grade every incident
  const ownPrBug = new Map<string, string>();
  const evaluations: IncidentEval[] = o.incidents.map((i) => {
    const t = incTruth(i);
    const actual = i.action ?? (i.status === 'auto-resolved' ? 'auto-resolved' : 'none');
    const base = { incidentId: i.id, title: i.title, category: i.category, strategies: i.strategies, actual, ttdMin: i.concludedAt ? (i.concludedAt - i.createdAt) / MIN : null };
    if (!t) return { ...base, expected: 'n/a', rootCauseCorrect: null, actionCorrect: true, wasted: false, duplicate: false, verdict: 'unscored', note: 'Injected custom alert (no ground truth)' };
    const wasted = t.kind === 'noise' && i.childIds.length > 0;
    const rootCauseCorrect = t.kind === 'bug' ? i.diagnosis?.bugId === t.bugId : null;
    const actionCorrect =
      t.expected === 'pr' ? actual === 'pr' || actual === 'joined' : t.expected === 'suppress' ? actual === 'auto-resolved' || i.childIds.length === 0 : actual === t.expected;
    let duplicate = actual === 'joined';
    if (actual === 'pr' && i.diagnosis) {
      if (ownPrBug.has(i.diagnosis.bugId)) duplicate = true;
      ownPrBug.set(i.diagnosis.bugId, i.id);
    }
    const verdict: IncidentEval['verdict'] = wasted ? 'wasted' : actionCorrect && rootCauseCorrect !== false ? (duplicate ? 'partial' : 'correct') : 'wrong';
    const note = wasted
      ? `Noise (${t.label}) — spent ${childrenOf(i).length} investigation(s)`
      : duplicate
        ? `Correct, but duplicated effort on ${t.label}`
        : verdict === 'correct'
          ? t.label
          : `Expected ${t.expected}${t.bugId ? ` (${t.bugId})` : ''}, got ${actual}${i.diagnosis ? ` (${i.diagnosis.bugId})` : ''}`;
    return { ...base, expected: t.expected + (t.bugId ? ` · ${t.bugId}` : ''), rootCauseCorrect, actionCorrect, wasted, duplicate, verdict, note };
  });

  const suppressed = o.alerts.filter((a) => a.disposition === 'suppressed');
  const falseSuppressions = suppressed.filter((a) => truthOf(a) && truthOf(a)!.kind !== 'noise');

  // ------------------------------------------------------------ 2. score the run
  const bugEvals = evaluations.filter((e) => e.rootCauseCorrect !== null);
  const scored = evaluations.filter((e) => e.verdict !== 'unscored');
  const children = o.children.filter((c) => c.startedAt);
  const wastedChildren = o.incidents.filter((i) => evaluations.find((e) => e.incidentId === i.id)?.wasted).flatMap(childrenOf).filter((c) => c.startedAt).length;
  const dupChildren = o.incidents.filter((i) => evaluations.find((e) => e.incidentId === i.id)?.duplicate).flatMap(childrenOf).filter((c) => c.startedAt).length;
  const raceLosers = o.children.filter((c) => c.raceId && c.status === 'cancelled' && c.startedAt).length;
  const bugTtd = bugEvals.filter((e) => e.ttdMin !== null && !e.duplicate).map((e) => e.ttdMin!);
  const score: ScoreBreakdown = {
    accuracy: bugEvals.length ? bugEvals.filter((e) => e.rootCauseCorrect).length / bugEvals.length : 1,
    actionCorrectness: (scored.filter((e) => e.actionCorrect).length + suppressed.length - falseSuppressions.length) / Math.max(1, scored.length + suppressed.length),
    efficiency: Math.max(0, 1 - (wastedChildren + dupChildren + 0.5 * raceLosers) / Math.max(1, children.length)),
    speed: Math.max(0, Math.min(1, 1 - avg(bugTtd) / 30)),
    total: 0,
  };
  score.total = Math.round(100 * (0.3 * score.accuracy + 0.25 * score.actionCorrectness + 0.25 * score.efficiency + 0.2 * score.speed));

  // ------------------------------------------------------------ 3. revert rules that hid real incidents
  for (const a of falseSuppressions) {
    const rule = next.triageRules.find((r) => r.id === a.ruleRef);
    if (!rule) continue;
    next.triageRules = next.triageRules.filter((r) => r !== rule);
    learn({ type: 'revert', title: `Reverted ${rule.id}: it suppressed a real incident`, detail: `${a.id} "${a.title}" was a real ${truthOf(a)!.label} but was suppressed by ${rule.id}.`, evidence: [rule.reason], impact: 'Safety: rules that hide real incidents are removed immediately.' });
  }

  // ------------------------------------------------------------ 4. fingerprint normalization
  if (!next.fingerprint.normalizeNumbers) {
    const bySig = new Map<string, Incident[]>();
    for (const i of o.incidents) {
      const s = signature(alertsOf(i)[0]);
      bySig.set(s, [...(bySig.get(s) ?? []), i]);
    }
    const dupGroups = [...bySig.values()].filter((g) => g.length > 1);
    const safe = dupGroups.every((g) => new Set(g.map((i) => incTruth(i)?.label)).size === 1);
    if (dupGroups.length && safe) {
      const wastedHere = dupGroups.flatMap((g) => g.slice(1)).flatMap(childrenOf).filter((c) => c.startedAt).length;
      next.fingerprint = { normalizeNumbers: true, stripHostIds: true, addedIn: next.version };
      learn({
        type: 'fingerprint',
        title: 'Normalize host IDs and numbers when de-duplicating',
        detail: `${dupGroups.length} alert types opened separate incidents per host/value, e.g. ${dupGroups
          .slice(0, 2)
          .map((g) => g.map((i) => `${i.id} "${i.title}"`).join(' vs '))
          .join('; ')}.`,
        evidence: [`${dupGroups.reduce((n, g) => n + g.length - 1, 0)} redundant incidents, ${wastedHere} extra child agents`, 'Safety check: every merged group shared one root cause'],
        impact: `Repeated alerts from different hosts now join one incident instead of spawning new agents.`,
      });
    }
  }

  // ------------------------------------------------------------ 5. correlation rules from the agents' own findings
  const byBug = new Map<string, Incident[]>();
  for (const i of o.incidents) if (i.diagnosis) byBug.set(i.diagnosis.bugId, [...(byBug.get(i.diagnosis.bugId) ?? []), i]);
  let corrSeq = next.correlations.length;
  for (const [bugId, incs] of byBug) {
    const sigs = [...new Set(incs.flatMap((i) => alertsOf(i).map(signature)))];
    if (new Set(incs.map((i) => signature(alertsOf(i)[0]))).size < 2) continue;
    if (!incs.every((i) => incTruth(i)?.bugId === bugId)) continue;
    const groupKey = `bug:${bugId}`;
    const existing = next.correlations.find((c) => c.groupKey === groupKey);
    const services = [...new Set(incs.flatMap((i) => i.services))];
    const evidence = incs.map((i) => `${i.id} (${i.service} · ${i.title.slice(0, 48)}) → ${i.diagnosis!.file} by ${i.diagnosedBy}`);
    if (existing) {
      const added = sigs.filter((s) => !existing.fingerprints.includes(s));
      if (!added.length) continue;
      existing.fingerprints.push(...added);
      existing.services = [...new Set([...existing.services, ...services])];
      learn({ type: 'correlation', title: `Extended ${existing.id} with ${added.length} more alert signature(s)`, detail: `New symptom variants of ${bugId} appeared this run.`, evidence, impact: 'More related alerts join the same incident at triage time.' });
      continue;
    }
    const rule: CorrelationRule = {
      id: `CR-${++corrSeq}`,
      groupKey,
      fingerprints: sigs,
      services,
      reason: `Symptoms of one root cause (${incs[0].diagnosis!.title}) across ${services.join(', ')}`,
      evidence,
      addedIn: next.version,
    };
    next.correlations.push(rule);
    learn({
      type: 'correlation',
      title: `Group ${services.join(' + ')} alerts that share root cause ${bugId}`,
      detail: `${incs.length} incidents were investigated separately but child agents traced all of them to \`${incs[0].diagnosis!.file}\`.`,
      evidence,
      impact: `Next time these ${sigs.length} alert signatures become one incident and one investigation.`,
    });
  }

  // ------------------------------------------------------------ 6. noise rules (hold / suppress) with safety check
  const wastedIncs = o.incidents.filter((i) => evaluations.find((e) => e.incidentId === i.id)?.wasted);
  type Cand = { rule: Omit<TriageRule, 'id' | 'kind' | 'reason' | 'evidence' | 'addedIn' | 'holdMinutes'>; priority: number; label: string };
  const cands: Cand[] = [];
  for (const i of wastedIncs) {
    const a = alertsOf(i)[0];
    if (a.env !== 'prod') cands.push({ rule: { match: { envNot: 'prod' } }, priority: 3, label: 'non-production environment' });
    for (const [k, v] of Object.entries(a.tags)) if (k !== 'env' && k !== 'service') cands.push({ rule: { match: { monitor: a.monitor, tag: [k, v] } }, priority: 2, label: `${a.monitor} with ${k}=${v}` });
    cands.push({ rule: { match: { monitor: a.monitor } }, priority: 1, label: `monitor ${a.monitor}` });
  }
  const uniq = cands.filter((c, idx) => cands.findIndex((d) => JSON.stringify(d.rule) === JSON.stringify(c.rule)) === idx);
  const covered = new Set<string>();
  let ruleSeq = Math.max(0, ...next.triageRules.map((r) => Number(r.id.split('-')[1]))) ;
  const evaluated = uniq
    .map((c) => {
      const probe = { ...c.rule, id: '', kind: 'suppress', reason: '', evidence: [], addedIn: 0 } as TriageRule;
      const hits = o.alerts.filter((a) => ruleMatches(probe, a) && truthOf(a));
      return { c, hits, noise: hits.filter((a) => truthOf(a)!.kind === 'noise'), real: hits.filter((a) => truthOf(a)!.kind !== 'noise') };
    })
    .filter((x) => x.noise.length >= 2)
    .sort((a, b) => b.noise.length - a.noise.length || b.c.priority - a.c.priority);
  for (const x of evaluated) {
    if (x.real.length) continue;
    const newly = x.noise.filter((a) => wastedIncs.some((i) => i.alertIds.includes(a.id)) && !covered.has(a.id));
    if (!newly.length) continue;
    if (next.triageRules.some((r) => JSON.stringify(r.match) === JSON.stringify(x.c.rule.match))) continue;
    x.noise.forEach((a) => covered.add(a.id));
    const recover = x.noise.filter((a) => a.resolvedAt).map((a) => (a.resolvedAt! - a.ts) / MIN);
    const selfHealing = recover.length === x.noise.length && Math.max(...recover) <= 3.5;
    const incs = wastedIncs.filter((i) => i.alertIds.some((id) => x.noise.some((a) => a.id === id)));
    const spent = incs.flatMap(childrenOf).reduce((n, c) => n + ((c.endedAt ?? c.startedAt ?? 0) - (c.startedAt ?? 0)) / MIN, 0);
    const conclusions = [...new Set(incs.map((i) => i.summary).filter(Boolean))].slice(0, 2);
    const rule: TriageRule = {
      id: `NR-${++ruleSeq}`,
      kind: selfHealing ? 'hold' : 'suppress',
      match: x.c.rule.match,
      holdMinutes: selfHealing ? 5 : undefined,
      reason: selfHealing
        ? `${x.c.label} recovered on its own ${x.noise.length}/${x.noise.length} times (max ${Math.max(...recover).toFixed(1)} min)`
        : `${x.c.label} never required action (${x.noise.length}/${x.noise.length} alerts were noise)`,
      evidence: [`${x.noise.length} alerts, ${incs.length} investigations, ${spent.toFixed(0)} agent-min spent, 0 real incidents matched`, ...conclusions.map((s) => `Agent conclusion: "${s}"`)],
      addedIn: next.version,
    };
    next.triageRules.push(rule);
    learn({
      type: selfHealing ? 'hold-rule' : 'noise-rule',
      title: selfHealing ? `Hold ${x.c.label} for 5 min before investigating` : `Suppress ${x.c.label}`,
      detail: rule.reason + '.',
      evidence: [...rule.evidence, `Safety check (G5): rule matches 0 of ${o.alerts.length - x.noise.length} non-noise alerts this run`],
      impact: selfHealing ? 'Self-healing blips close themselves; anything still firing after 5 min is investigated as usual.' : `Saves ~${(spent / Math.max(1, incs.length)).toFixed(0)} agent-min per occurrence.`,
    });
  }

  // ------------------------------------------------------------ 7. strategy routing (multi-armed bandit over outcomes)
  const childWon = (c: ChildAgent, t: Truth | undefined) => {
    if (!t) return false;
    if (t.kind === 'bug') return !!c.diagnosedAt && c.finding?.bugId === t.bugId;
    if (t.kind === 'noise') return false;
    return c.status === 'done' && c.action === t.expected;
  };
  for (const i of o.incidents) {
    const t = incTruth(i);
    if (!t || t.kind === 'noise') continue;
    for (const c of childrenOf(i)) {
      if (!c.startedAt || c.usedKnowledge || c.usedScratchpad) continue;
      const stats = (next.stats[i.category] ??= {});
      const s: StratStats = (stats[c.strategy] ??= { trials: 0, wins: 0, totalMin: 0, totalSteps: 0 });
      s.trials += 1;
      if (childWon(c, t)) s.wins += 1;
      s.totalMin += ((c.diagnosedAt ?? c.endedAt ?? c.startedAt) - c.startedAt) / MIN;
      s.totalSteps += c.toolCalls;
    }
  }
  for (const cat of CATEGORIES) {
    if (cat === 'security') continue;
    const route = next.routing[cat];
    const stats = next.stats[cat];
    if (!stats) continue;
    const ranked = (Object.entries(stats) as [StrategyId, StratStats][])
      .map(([s, st]) => {
        const winRate = (st.wins + 1) / (st.trials + 2);
        const avgMin = st.totalMin / Math.max(1, st.trials);
        return { s, st, winRate, avgMin, value: winRate - 0.03 * avgMin };
      })
      .filter((r) => r.st.wins > 0)
      .sort((a, b) => b.value - a.value);
    if (!ranked.length) continue;
    const best = ranked[0];
    const confidence = Math.min(0.97, best.winRate * (best.st.trials / (best.st.trials + 1)) + (ranked.length > 1 ? 0.15 : 0));
    const record = ranked.map((r) => `${STRATEGY_LABELS[r.s]}: ${r.st.wins}/${r.st.trials} wins, ${r.avgMin.toFixed(1)} min avg`);
    const losers = (Object.entries(stats) as [StrategyId, StratStats][]).filter(([, st]) => st.wins === 0).map(([s, st]) => `${STRATEGY_LABELS[s]}: 0/${st.trials} wins`);
    if (best.s !== route.strategy) {
      learn({
        type: 'routing',
        title: `${CATEGORY_LABELS[cat]}: prefer ${STRATEGY_LABELS[best.s]} over ${STRATEGY_LABELS[route.strategy]}`,
        detail: `${STRATEGY_LABELS[best.s]} found the right answer ${best.st.wins}/${best.st.trials} times in ${best.avgMin.toFixed(1)} min on average.`,
        evidence: [...record, ...losers],
        impact: `Future ${CATEGORY_LABELS[cat].toLowerCase()} incidents start with ${STRATEGY_LABELS[best.s]}.`,
      });
    }
    const wasRacing = route.race;
    next.routing[cat] = { ...route, strategy: best.s, confidence, race: route.race && confidence < 0.5, reason: `learned: ${best.st.wins}/${best.st.trials} wins, ${best.avgMin.toFixed(1)} min avg` };
    if (wasRacing && !next.routing[cat].race) {
      learn({
        type: 'race-policy',
        title: `Stop racing strategies on ${CATEGORY_LABELS[cat].toLowerCase()} incidents`,
        detail: `Routing confidence reached ${pct(confidence)}; one agent is enough.`,
        evidence: record,
        impact: 'Fewer parallel agents per incident → lower compute cost for the same outcome.',
      });
    }
  }
  next.exploration = Math.max(0.05, Math.round(pb.exploration * 0.5 * 100) / 100);

  // ------------------------------------------------------------ 8. knowledge from verified fixes
  for (const [bugId, incs] of byBug) {
    const own = incs.find((i) => i.action === 'pr' && incTruth(i)?.bugId === bugId);
    if (!own) continue;
    const sigs = [...new Set(incs.flatMap((i) => alertsOf(i).map(signature)))];
    const existing = next.knowledge.find((k) => k.bugId === bugId);
    if (existing) {
      const added = sigs.filter((s) => !existing.fingerprints.includes(s));
      existing.fingerprints.push(...added);
      continue;
    }
    const k: KnowledgeEntry = {
      id: `K-${next.knowledge.length + 1}`,
      fingerprints: sigs,
      bugId,
      file: own.diagnosis!.file,
      hint: `${own.diagnosis!.title} (fixed in run ${run}, PR #${own.prId})`,
      addedIn: next.version,
      uses: 0,
    };
    next.knowledge.push(k);
    learn({
      type: 'knowledge',
      title: `Remember: ${own.diagnosis!.title.toLowerCase()} → ${k.file}`,
      detail: `Verified by a failing-then-passing regression test in PR #${own.prId}.`,
      evidence: [`${incs.length} incident(s), ${sigs.length} alert signature(s)`],
      impact: 'Children seeing these signatures check this file first (like Devin Knowledge).',
    });
  }

  next.changelog = [...next.changelog, { version: next.version, at: Date.now(), items: learnings.length ? learnings.map((l) => l.title) : ['No changes: nothing new to learn from this run.'] }];

  const strategyBoard = (Object.entries(next.stats) as [Category, Partial<Record<StrategyId, StratStats>>][]).flatMap(([category, s]) =>
    (Object.entries(s) as [StrategyId, StratStats][]).map(([strategy, st]) => ({ category, strategy, trials: st.trials, wins: st.wins, avgMin: st.totalMin / Math.max(1, st.trials) })),
  );
  const correct = evaluations.filter((e) => e.verdict === 'correct').length;
  const report: RetroReport = {
    run,
    fromVersion: pb.version,
    toVersion: next.version,
    createdAt: Date.now(),
    score,
    evaluations,
    learnings,
    strategyBoard,
    playbookDiff: lineDiff(renderPlaybook(pb), renderPlaybook(next)),
    summary: `Run ${run}: ${correct}/${scored.length} incidents fully correct, ${wastedChildren} wasted and ${dupChildren} duplicate investigations, ${raceLosers} race losers. ${learnings.length} learning${learnings.length === 1 ? '' : 's'} → playbook v${next.version}.`,
  };
  return { playbook: next, report };
}
