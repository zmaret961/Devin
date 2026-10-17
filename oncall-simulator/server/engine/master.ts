import { Worker } from 'node:worker_threads';
import type {
  Alert,
  ChildAgent,
  DecisionEntry,
  Finding,
  Incident,
  Note,
  Playbook,
  PullRequest,
  ScratchEntry,
  StrategyId,
} from '../../shared/types.ts';
import { CATEGORY_LABELS, STRATEGY_LABELS } from '../../shared/types.ts';
import type { Brief, ChildRpc } from './child/brief.ts';
import type { ChildResult } from './child/investigator.ts';
import { MIN, type SimClock } from './clock.ts';
import { DETECTOR_BY_ID } from './detectors.ts';
import { REPO_PATH, TSX_CLI } from './paths.ts';
import type { MockRepo } from './repo.ts';
import { betaSample, type Rng } from './rng.ts';
import type { Truth } from './scenario.ts';
import { classify, fingerprint, ruleMatches, SEV_RANK, signature } from './triage.ts';

const WORKER_URL = new URL('./child/bootstrap.mjs', import.meta.url);
const CLOSED: Incident['status'][] = ['auto-resolved', 'cancelled'];

export interface OrchestratorDeps {
  clock: SimClock;
  repo: MockRepo;
  playbook: Playbook;
  rng: Rng;
  run: number;
  maxParallel: () => number;
  onDecision: (d: DecisionEntry) => void;
  onStep: (child: ChildAgent, text: string) => void;
}

/**
 * The master triage agent. Watches the alert feed, de-duplicates and correlates alerts into incidents,
 * applies the playbook's noise rules, decides how deeply to investigate, and fans heavy work out to child
 * agents running in parallel worker threads. Children coordinate through a shared scratchpad and file
 * claims that the master arbitrates.
 */
export class Orchestrator {
  alerts: Alert[] = [];
  incidents: Incident[] = [];
  children: ChildAgent[] = [];
  decisions: DecisionEntry[] = [];
  prs: PullRequest[] = [];
  notes: Note[] = [];
  scratchpad: ScratchEntry[] = [];
  /** Ground truth by alert id — used only by the retrospective grader, never shown to agents. */
  truth = new Map<string, Truth>();

  private workers = new Map<string, Worker>();
  private queue: string[] = [];
  private claims = new Map<string, { owner: string; incidentId: string; prId?: number }>();
  private seq = { alert: 0, incident: 100, child: 0, decision: 0, pr: 0, note: 0 };
  private disposed = false;

  constructor(private d: OrchestratorDeps) {}

  private get now() {
    return this.d.clock.now();
  }

  private get pb() {
    return this.d.playbook;
  }

  decide(e: Omit<DecisionEntry, 'id' | 't'>) {
    const entry: DecisionEntry = { id: ++this.seq.decision, t: this.now, ...e };
    this.decisions.push(entry);
    this.d.onDecision(entry);
    return entry;
  }

  // ---------------------------------------------------------------- triage

  ingest(body: Omit<Alert, 'id' | 'ts' | 'status' | 'disposition'>, truth: Truth | undefined): Alert {
    const alert: Alert = { ...body, id: `AL-${String(++this.seq.alert).padStart(3, '0')}`, ts: this.now, status: 'firing', disposition: 'pending' };
    this.alerts.push(alert);
    if (truth) this.truth.set(alert.id, truth);
    this.triage(alert);
    return alert;
  }

  resolveAlert(alertId: string) {
    const a = this.alerts.find((x) => x.id === alertId);
    if (!a || a.status === 'resolved') return;
    a.status = 'resolved';
    a.resolvedAt = this.now;
    const inc = this.incidents.find((i) => i.id === a.incidentId);
    if (inc?.status === 'held' && inc.alertIds.every((id) => this.alerts.find((x) => x.id === id)?.status === 'resolved')) {
      inc.status = 'auto-resolved';
      inc.action = 'auto-resolved';
      inc.concludedAt = this.now;
      inc.summary = 'Recovered on its own during the hold window';
      this.decide({
        actor: 'master',
        kind: 'resolve',
        incidentId: inc.id,
        text: `${inc.id} recovered on its own after ${((this.now - inc.createdAt) / MIN).toFixed(1)} min — closed without spending an investigation.`,
        reasoning: [`Held per ${inc.knowledgeRefs?.[0] ?? 'hold rule'}; monitor returned to OK inside the hold window.`],
        rules: inc.knowledgeRefs,
      });
    }
  }

  private triage(a: Alert) {
    for (const r of this.pb.triageRules) {
      if (r.kind !== 'suppress' || !ruleMatches(r, a)) continue;
      a.disposition = 'suppressed';
      a.ruleRef = r.id;
      a.dispositionReason = r.reason;
      this.decide({ actor: 'master', kind: 'suppress', text: `Suppressed ${a.id} "${a.title}"`, reasoning: [`Matches learned rule ${r.id}: ${r.reason}`, `Evidence: ${r.evidence[0]}`], rules: [r.id] });
      return;
    }

    const fp = fingerprint(a, this.pb);
    const sig = signature(a);
    const corr = this.pb.correlations.find((c) => c.fingerprints.includes(sig));
    const concludedAndQuiet = (i: Incident) => (i.status === 'noted' || i.status === 'escalated') && this.alertsOf(i).every((x) => x.status === 'resolved');
    const open = this.incidents.filter((i) => !CLOSED.includes(i.status) && !concludedAndQuiet(i));
    const byFp = open.find((i) => i.fingerprint === fp);
    const byCorr = corr ? open.find((i) => i.groupKey === corr.groupKey) : undefined;
    const target = byFp ?? byCorr;
    if (target) {
      target.alertIds.push(a.id);
      if (!target.services.includes(a.service)) target.services.push(a.service);
      if (SEV_RANK[a.severity] < SEV_RANK[target.severity]) target.severity = a.severity;
      a.incidentId = target.id;
      a.disposition = 'grouped';
      const why = byFp
        ? this.pb.fingerprint.normalizeNumbers && a.title !== this.alerts.find((x) => x.id === target.alertIds[0])?.title
          ? `Same fingerprint after normalizing host IDs/numbers (\`${fp.split('|')[2]}\`)`
          : 'Identical fingerprint (same service, monitor and title)'
        : `Correlation rule ${corr!.id}: ${corr!.reason}`;
      a.dispositionReason = why;
      if (corr && !byFp) a.ruleRef = corr.id;
      const linked = target.prId ? ` Already covered by PR #${target.prId} — not re-investigating.` : target.childIds.length ? ' Investigation already in progress; evidence forwarded to the scratchpad.' : '';
      this.decide({ actor: 'master', kind: 'group', incidentId: target.id, text: `Grouped ${a.id} into ${target.id}.${linked}`, reasoning: [why], rules: corr && !byFp ? [corr.id] : undefined });
      return;
    }

    const { category, signals } = classify(a);
    const inc: Incident = {
      id: `INC-${++this.seq.incident}`,
      title: a.title,
      service: a.service,
      services: [a.service],
      category,
      severity: a.severity,
      env: a.env,
      fingerprint: fp,
      groupKey: corr?.groupKey,
      alertIds: [a.id],
      createdAt: this.now,
      status: 'queued',
      goal: category === 'security' ? 'gather-context-and-escalate' : 'diagnose-and-fix',
      strategies: [],
      race: false,
      childIds: [],
    };
    this.incidents.push(inc);
    a.incidentId = inc.id;
    a.disposition = 'new-incident';

    const hold = this.pb.triageRules.find((r) => r.kind === 'hold' && ruleMatches(r, a));
    if (hold) {
      inc.status = 'held';
      inc.holdUntil = this.now + (hold.holdMinutes ?? 5) * MIN;
      inc.knowledgeRefs = [hold.id];
      a.disposition = 'held';
      a.ruleRef = hold.id;
      a.dispositionReason = hold.reason;
      this.decide({
        actor: 'master',
        kind: 'hold',
        incidentId: inc.id,
        text: `Holding ${inc.id} "${a.title}" for ${hold.holdMinutes} min before investigating.`,
        reasoning: [`Learned rule ${hold.id}: ${hold.reason}`, `Evidence: ${hold.evidence[0]}`, 'If it is still firing when the hold expires, it will be investigated normally.'],
        rules: [hold.id],
      });
      return;
    }
    this.dispatch(inc, signals);
  }

  /** Re-checks held incidents; anything still firing after its hold window gets investigated. */
  tick() {
    for (const inc of this.incidents) {
      if (inc.status !== 'held' || !inc.holdUntil || this.now < inc.holdUntil) continue;
      this.decide({ actor: 'master', kind: 'triage', incidentId: inc.id, text: `${inc.id} is still firing after the hold window — investigating.`, reasoning: ['Hold rules only filter monitors that recover on their own; this one did not.'], rules: inc.knowledgeRefs });
      inc.status = 'queued';
      this.dispatch(inc, classify(this.alertsOf(inc)[0]).signals);
    }
  }

  private pickStrategies(inc: Incident, hasKnowledge: boolean): { strategies: StrategyId[]; why: string[] } {
    const route = this.pb.routing[inc.category];
    const stats = this.pb.stats[inc.category] ?? {};
    const record = (s: StrategyId) => {
      const st = stats[s];
      return st ? `${st.wins}/${st.trials} wins, ${(st.totalMin / Math.max(1, st.trials)).toFixed(1)} min avg` : 'untried';
    };
    const why = [`Playbook v${this.pb.version} routing for ${CATEGORY_LABELS[inc.category]}: ${STRATEGY_LABELS[route.strategy]} (confidence ${Math.round(route.confidence * 100)}%, ${route.reason}).`];
    if (hasKnowledge && route.race) {
      why.push('Known signature from playbook knowledge → one agent with the hint is enough; skipping the strategy race.');
      return { strategies: [route.strategy], why };
    }
    if (route.race && (inc.severity === 'P1' || inc.severity === 'P2') && route.candidates.length > 1) {
      const size = route.confidence < 0.4 ? 3 : 2;
      const strategies = [route.strategy, ...route.candidates.filter((c) => c !== route.strategy)].slice(0, size);
      why.push(`${inc.severity} with low routing confidence → racing ${strategies.length} strategies in parallel (${strategies.map((s) => `${STRATEGY_LABELS[s]}: ${record(s)}`).join('; ')}). First verified root cause wins.`);
      return { strategies, why };
    }
    if (route.confidence < 0.6 && route.candidates.length > 1 && this.d.rng() < this.pb.exploration + 0.25) {
      const scored = route.candidates.map((s) => ({ s, v: betaSample(this.d.rng, (stats[s]?.wins ?? 0) + 1, (stats[s]?.trials ?? 0) - (stats[s]?.wins ?? 0) + 1) }));
      scored.sort((a, b) => b.v - a.v);
      why.push(`Exploring: Thompson-sampled ${STRATEGY_LABELS[scored[0].s]} among ${route.candidates.length} candidates to gather outcome data.`);
      return { strategies: [scored[0].s], why };
    }
    why.push(`Using preferred strategy (${record(route.strategy)}).`);
    return { strategies: [route.strategy], why };
  }

  private dispatch(inc: Incident, signals: string[]) {
    const first = this.alertsOf(inc)[0];
    const reasoning = [`Classified as ${CATEGORY_LABELS[inc.category]}${signals.length ? ` (signals: ${signals.join(', ')})` : ''}.`];
    if (inc.groupKey) reasoning.push(`Opened under correlation group \`${inc.groupKey}\` so related alerts on other services join this incident.`);
    let strategies: StrategyId[];
    let rules: string[] | undefined;
    const knowledge = this.pb.knowledge.filter((k) => inc.alertIds.some((id) => k.fingerprints.includes(signature(this.alerts.find((a) => a.id === id)!))));
    if (inc.category === 'security') {
      strategies = ['runbook-lookup'];
      rules = ['G1'];
      reasoning.push('Guardrail G1: suspected security incident → gather context only, then page security on-call. No autonomous remediation.');
    } else {
      const pick = this.pickStrategies(inc, knowledge.length > 0);
      strategies = pick.strategies;
      reasoning.push(...pick.why);
    }
    if (knowledge.length) {
      reasoning.push(`Attaching playbook knowledge ${knowledge.map((k) => k.id).join(', ')} to the brief (seen this signature before → ${knowledge[0].file}).`);
      rules = [...(rules ?? []), ...knowledge.map((k) => k.id)];
      for (const k of knowledge) k.uses += 1;
    }
    inc.strategies = strategies;
    inc.race = strategies.length > 1;
    inc.knowledgeRefs = knowledge.map((k) => k.id);
    const raceId = inc.race ? `race-${inc.id}` : undefined;
    for (const s of strategies) this.createChild(inc, s, raceId, knowledge);
    this.decide({
      actor: 'master',
      kind: inc.race ? 'race' : inc.category === 'security' ? 'escalate' : 'spawn',
      incidentId: inc.id,
      text: inc.race
        ? `Spawned ${strategies.length} child agents to race on ${inc.id} "${first.title}"`
        : `Spawned ${inc.childIds.at(-1)} on ${inc.id} "${first.title}" (${STRATEGY_LABELS[strategies[0]]})`,
      reasoning,
      rules,
    });
    this.pump();
  }

  // ---------------------------------------------------------------- children

  private alertsOf(inc: Incident) {
    return inc.alertIds.map((id) => this.alerts.find((a) => a.id === id)!);
  }

  private createChild(inc: Incident, strategy: StrategyId, raceId: string | undefined, knowledge: Playbook['knowledge']) {
    const id = `devin-${++this.seq.child}`;
    const brief: Brief = {
      childId: id,
      incidentId: inc.id,
      strategy,
      goal: inc.goal,
      category: inc.category,
      severity: inc.severity,
      service: inc.service,
      alerts: [],
      repoPath: REPO_PATH,
      tsxCli: TSX_CLI,
      knowledge: knowledge.map((k) => ({ id: k.id, file: k.file, bugId: k.bugId, hint: k.hint })),
      raceSize: raceId ? inc.strategies.length : 1,
      budget: 14,
    };
    const child: ChildAgent = {
      id,
      incidentId: inc.id,
      strategy,
      goal: inc.goal,
      brief: '',
      raceId,
      status: 'queued',
      steps: [],
      queuedAt: this.now,
      toolCalls: 0,
      filesRead: 0,
      usedKnowledge: knowledge.length > 0,
      phase: 'queued',
    };
    (child as ChildAgent & { _brief: Brief })._brief = brief;
    inc.childIds.push(id);
    this.children.push(child);
    this.queue.push(id);
  }

  private briefMarkdown(b: Brief, inc: Incident): string {
    const alerts = this.alertsOf(inc);
    return `**${inc.id}** · ${inc.severity} · ${inc.service} · ${CATEGORY_LABELS[inc.category]}

**Goal:** ${b.goal === 'gather-context-and-escalate' ? 'gather context and escalate (guardrail G1)' : 'find the root cause; open a PR with a regression test if it is a code defect, otherwise leave a diagnostic note or escalate'}
**Strategy:** ${STRATEGY_LABELS[b.strategy]}${b.raceSize > 1 ? ` (racing ${b.raceSize - 1} sibling(s))` : ''}
**Budget:** ${b.budget} tool calls
**Alerts (${alerts.length}):**
${alerts.slice(0, 5).map((a) => `- ${a.source} · ${a.title}`).join('\n')}${b.knowledge.length ? `\n**Knowledge:** ${b.knowledge.map((k) => `${k.id} → ${k.file}`).join(', ')}` : ''}
**Shared scratchpad:** read before acting; claim files before editing.`;
  }

  pump() {
    if (this.disposed) return;
    const running = () => this.children.filter((c) => c.status === 'running').length;
    this.queue.sort((a, b) => {
      const ia = this.incidentOf(a);
      const ib = this.incidentOf(b);
      return SEV_RANK[ia.severity] - SEV_RANK[ib.severity] || this.child(a).queuedAt - this.child(b).queuedAt;
    });
    while (running() < this.d.maxParallel() && this.queue.length) {
      const id = this.queue.shift()!;
      this.start(this.child(id));
    }
  }

  private child(id: string) {
    return this.children.find((c) => c.id === id)!;
  }

  private incidentOf(childId: string) {
    const c = this.child(childId);
    return this.incidents.find((i) => i.id === c.incidentId)!;
  }

  private start(child: ChildAgent) {
    const inc = this.incidentOf(child.id);
    const brief = (child as ChildAgent & { _brief: Brief })._brief;
    brief.alerts = this.alertsOf(inc).map((a) => ({ ...a }));
    brief.severity = inc.severity;
    child.brief = this.briefMarkdown(brief, inc);
    child.status = 'running';
    child.startedAt = this.now;
    child.phase = 'briefing';
    if (inc.status === 'queued') inc.status = 'investigating';
    const worker = new Worker(WORKER_URL, { workerData: brief });
    this.workers.set(child.id, worker);
    worker.on('message', (msg) => this.onMessage(child, worker, msg));
    worker.on('error', (err) => this.finish(child, 'failed', { action: 'none', summary: `Worker crashed: ${err.message}` }));
  }

  private async onMessage(child: ChildAgent, worker: Worker, msg: { type: string; id?: number; method?: keyof ChildRpc; params?: any; result?: ChildResult; error?: string }) {
    if (msg.type === 'done') return this.finish(child, 'done', msg.result!);
    if (msg.type === 'cancelled') return this.finish(child, 'cancelled');
    if (msg.type === 'failed') return this.finish(child, 'failed', { action: 'none', summary: msg.error?.split('\n')[0] ?? 'failed' });
    if (msg.type !== 'rpc') return;
    try {
      const result = await this.handleRpc(child, msg.method!, msg.params);
      if (child.status === 'running') worker.postMessage({ type: 'rpc-result', id: msg.id, result });
    } catch (err) {
      if (child.status === 'running') worker.postMessage({ type: 'rpc-result', id: msg.id, error: (err as Error).message });
    }
  }

  private async handleRpc(child: ChildAgent, method: keyof ChildRpc, p: any): Promise<unknown> {
    const inc = this.incidentOf(child.id);
    switch (method) {
      case 'sleep':
        return this.d.clock.sleep(p.min * MIN);
      case 'step': {
        child.steps.push({ ...p.step, t: this.now });
        if (p.phase) child.phase = p.phase;
        if (p.counters) {
          child.toolCalls = p.counters.toolCalls;
          child.filesRead = p.counters.filesRead;
        }
        if (p.phase === 'fixing' && inc.status === 'investigating') inc.status = 'fixing';
        this.d.onStep(child, p.step.text);
        return;
      }
      case 'scratchpad.read':
        return this.scratchpad.map((e) => ({ ...e }));
      case 'scratchpad.write':
        this.scratchpad.push({ t: this.now, author: child.id, incidentId: inc.id, ...p, signals: p.bugId ? DETECTOR_BY_ID[p.bugId]?.signals : undefined });
        return;
      case 'diagnosed':
        return this.onDiagnosed(child, inc, p.finding, p.viaScratchpad, p.viaKnowledge);
      case 'claim': {
        const existing = this.claims.get(p.bugId);
        if (!existing) {
          this.claims.set(p.bugId, { owner: child.id, incidentId: inc.id });
          this.scratchpad.push({ t: this.now, author: child.id, kind: 'claim', incidentId: inc.id, bugId: p.bugId, file: p.file, text: `${child.id} claimed ${p.file} to fix ${p.bugId}` });
          return { ok: true };
        }
        if (existing.owner === child.id) return { ok: true };
        return { ok: false, owner: existing.owner, prId: existing.prId, incidentId: existing.incidentId };
      }
      case 'pr.join': {
        const pr = this.prs.find((x) => x.id === p.prId);
        pr?.comments.push({ t: this.now, author: child.id, body: p.comment });
        inc.prId = p.prId;
        inc.status = pr?.status === 'merged' ? 'merged' : 'pr-open';
        this.scratchpad.push({ t: this.now, author: child.id, kind: 'join', incidentId: inc.id, prId: p.prId, text: `${inc.id} linked to PR #${p.prId} (same root cause)` });
        this.decide({ actor: child.id, kind: 'pr', incidentId: inc.id, text: `${child.id} linked ${inc.id} to existing PR #${p.prId} instead of opening a duplicate`, reasoning: ['Claim on the root-cause file was held by a sibling agent (shared scratchpad).'] });
        return;
      }
      case 'worktree.create':
        return this.d.repo.createWorktree(child.id, p.branch);
      case 'pr.open': {
        const { diff, files, additions, deletions } = await this.d.repo.diff(p.branch);
        const pr: PullRequest = {
          id: ++this.seq.pr,
          title: p.title,
          branch: p.branch,
          incidentId: inc.id,
          childId: child.id,
          createdAt: this.now,
          status: 'open',
          body: p.body,
          diff,
          files,
          additions,
          deletions,
          bugId: p.bugId,
          testsBefore: p.testsBefore,
          testsAfter: p.testsAfter,
          comments: [],
        };
        this.prs.push(pr);
        const claim = this.claims.get(p.bugId);
        if (claim) claim.prId = pr.id;
        inc.prId = pr.id;
        inc.status = 'pr-open';
        this.scratchpad.push({ t: this.now, author: child.id, kind: 'info', incidentId: inc.id, bugId: p.bugId, prId: pr.id, text: `PR #${pr.id} opened: ${p.title}` });
        this.decide({ actor: child.id, kind: 'pr', incidentId: inc.id, text: `${child.id} opened PR #${pr.id}: ${p.title}`, reasoning: [`Regression test failed before the fix (${p.testsBefore.failed} failing) and the full suite passes after (${p.testsAfter.passed} passed).`, `${files.length} file(s), +${additions} −${deletions}.`] });
        return pr.id;
      }
      case 'note.write':
      case 'escalate': {
        const note: Note = {
          id: `${method === 'escalate' ? 'ESC' : 'NOTE'}-${++this.seq.note}`,
          incidentId: inc.id,
          childId: child.id,
          kind: method === 'escalate' ? 'escalation' : 'diagnostic',
          title: p.title,
          body: p.body,
          createdAt: this.now,
          escalateTo: p.to,
        };
        this.notes.push(note);
        inc.noteId = note.id;
        if (inc.status !== 'pr-open' && inc.status !== 'merged') inc.status = method === 'escalate' ? 'escalated' : 'noted';
        this.decide({
          actor: child.id,
          kind: method === 'escalate' ? 'escalate' : 'note',
          incidentId: inc.id,
          text: method === 'escalate' ? `${child.id} escalated ${inc.id} to ${p.to}` : `${child.id} left diagnostic note ${note.id} on ${inc.id}`,
          reasoning: [p.title.replace(/^INC-\d+: /, '')],
        });
        return note.id;
      }
      case 'alerts.status': {
        const list = this.alertsOf(inc);
        const firing = list.filter((a) => a.status === 'firing').length;
        return { allResolved: firing === 0, firing, total: list.length };
      }
    }
  }

  private onDiagnosed(child: ChildAgent, inc: Incident, finding: Finding, viaScratchpad: boolean, viaKnowledge: boolean) {
    if (inc.diagnosis && inc.diagnosedBy !== child.id) {
      return { proceed: false, reason: `${inc.diagnosedBy} already confirmed the root cause for ${inc.id}.` };
    }
    child.diagnosedAt = this.now;
    child.finding = finding;
    child.usedScratchpad = viaScratchpad;
    child.usedKnowledge = viaKnowledge;
    inc.diagnosis = finding;
    inc.diagnosedBy = child.id;
    inc.concludedAt = this.now;
    this.scratchpad.push({ t: this.now, author: child.id, kind: 'finding', incidentId: inc.id, bugId: finding.bugId, file: finding.file, signals: finding.signals, text: `${finding.title} at ${finding.file}:${finding.line}` });
    const ttd = ((this.now - inc.createdAt) / MIN).toFixed(1);
    const how = viaScratchpad ? 'via a sibling\'s scratchpad finding' : viaKnowledge ? 'via playbook knowledge' : `using ${STRATEGY_LABELS[child.strategy]}`;
    this.decide({ actor: child.id, kind: 'triage', incidentId: inc.id, text: `${child.id} diagnosed ${inc.id} in ${ttd} min ${how}: ${finding.title} (${finding.file}:${finding.line})`, reasoning: [finding.explanation] });
    if (inc.race) {
      const losers = inc.childIds.filter((id) => id !== child.id && ['running', 'queued'].includes(this.child(id).status));
      for (const id of losers) this.cancel(id, `lost the race to ${child.id} (${STRATEGY_LABELS[child.strategy]})`);
      if (losers.length) {
        this.scratchpad.push({ t: this.now, author: 'master', kind: 'race', incidentId: inc.id, text: `${STRATEGY_LABELS[child.strategy]} won the race on ${inc.id} in ${ttd} min; cancelled ${losers.join(', ')}` });
        this.decide({ actor: 'master', kind: 'cancel', incidentId: inc.id, text: `Race on ${inc.id} won by ${child.id} (${STRATEGY_LABELS[child.strategy]}). Cancelled ${losers.join(', ')}.`, reasoning: ['Root cause verified; parallel siblings would only duplicate work. Outcome recorded for the retrospective.'] });
      }
    }
    return { proceed: true };
  }

  private cancel(id: string, reason: string) {
    const c = this.child(id);
    c.steps.push({ t: this.now, kind: 'decision', text: `Cancelled by master: ${reason}.` });
    if (c.status === 'queued') {
      this.queue = this.queue.filter((q) => q !== id);
      c.status = 'cancelled';
      c.endedAt = this.now;
      c.summary = reason;
      return;
    }
    c.summary = reason;
    const w = this.workers.get(id);
    w?.postMessage({ type: 'cancel' });
    this.finish(c, 'cancelled');
  }

  private finish(child: ChildAgent, status: ChildAgent['status'], result?: ChildResult) {
    if (child.status !== 'running') return;
    child.status = status;
    for (const [bugId, claim] of this.claims) if (claim.owner === child.id && !claim.prId) this.claims.delete(bugId);
    child.endedAt = this.now;
    const w = this.workers.get(child.id);
    this.workers.delete(child.id);
    setTimeout(() => void w?.terminate(), 100);
    const inc = this.incidentOf(child.id);
    if (result) {
      child.action = result.action;
      child.summary = result.summary;
      child.prId = result.prId;
      child.noteId = result.noteId;
      if (result.finding && !child.finding) child.finding = result.finding;
      if (result.action !== 'none') {
        inc.action = result.action;
        inc.summary = result.summary;
        inc.concludedAt ??= this.now;
      }
    }
    if (status === 'failed') {
      child.steps.push({ t: this.now, kind: 'error', text: result?.summary ?? 'failed' });
    }
    const siblingsActive = inc.childIds.some((id) => ['running', 'queued'].includes(this.child(id).status));
    if (!siblingsActive && ['investigating', 'fixing', 'queued'].includes(inc.status)) {
      inc.status = inc.action === 'pr' || inc.action === 'joined' ? 'pr-open' : inc.action === 'escalate' ? 'escalated' : inc.action === 'note' ? 'noted' : 'cancelled';
      inc.concludedAt ??= this.now;
    }
    this.pump();
  }

  get busy(): boolean {
    return this.children.some((c) => c.status === 'running' || c.status === 'queued') || this.incidents.some((i) => i.status === 'held');
  }

  async dispose() {
    this.disposed = true;
    for (const w of this.workers.values()) await w.terminate();
    this.workers.clear();
    for (const c of this.children) if (c.status === 'running' || c.status === 'queued') {
      c.status = 'cancelled';
      c.endedAt = this.now;
    }
  }
}
