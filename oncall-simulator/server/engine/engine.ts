import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DecisionEntry, Metrics, Playbook, RetroReport, RunSummary, Snapshot } from '../../shared/types.ts';
import { MIN, SimClock } from './clock.ts';
import { Orchestrator } from './master.ts';
import { computeMetrics, HOURS_FORMULA } from './metrics.ts';
import { DATA_DIR, RUNS_DIR } from './paths.ts';
import { loadPlaybooks, renderPlaybook, savePlaybook, seedPlaybook } from './playbook.ts';
import { MockRepo } from './repo.ts';
import { runRetrospective } from './retro.ts';
import { createRng } from './rng.ts';
import { buildShift, INJECTABLES, instantiate, TEMPLATE_BY_ID, type PlannedAlert } from './scenario.ts';

const BUG_FILES: Record<string, string> = {
  'connection-leak': 'packages/db/src/pool.ts',
  'optional-field-null': 'services/api/src/routes/checkout.ts',
  'retry-non-retryable': 'services/worker/src/lib/retry.ts',
  'time-unit-mismatch': 'services/auth/src/session.ts',
  'unbounded-cache': 'services/catalog/src/cache.ts',
  'money-rounding': 'packages/shared/src/money.ts',
};

type RunStatus = Snapshot['run']['status'];

export interface CustomAlert {
  title: string;
  service: string;
  severity: 'P1' | 'P2' | 'P3' | 'P4';
  description: string;
  stackTrace?: string;
}

const C = { dim: '\x1b[2m', reset: '\x1b[0m', magenta: '\x1b[35m', cyan: '\x1b[36m', yellow: '\x1b[33m', green: '\x1b[32m', red: '\x1b[31m' };

export class Engine {
  readonly clock: SimClock;
  readonly repo = new MockRepo();
  versions: Playbook[] = [];
  playbook!: Playbook;
  retros: RetroReport[] = [];
  runs: RunSummary[] = [];
  orch?: Orchestrator;
  config = { maxParallel: 6, autoLearn: true };

  private plan: PlannedAlert[] = [];
  private emitted = 0;
  private resolveQueue: { at: number; alertId: string }[] = [];
  private runNumber = 0;
  private status: RunStatus = 'idle';
  private runStart = 0;
  private timeline: Metrics['timeline'] = [];
  private retroDone = false;
  private injectSeq = 0;

  constructor(private opts: { speed?: number; quiet?: boolean } = {}) {
    this.clock = new SimClock(Date.now(), opts.speed ?? 60);
    this.clock.onTick((now) => this.onTick(now));
    this.load();
  }

  // ---------------------------------------------------------------- persistence

  private historyFile = join(DATA_DIR, 'history.json');

  private load() {
    mkdirSync(DATA_DIR, { recursive: true });
    this.versions = loadPlaybooks();
    if (!this.versions.length) {
      const seed = seedPlaybook();
      savePlaybook(seed);
      this.versions = [seed];
    }
    this.playbook = this.versions.at(-1)!;
    if (existsSync(this.historyFile)) {
      const h = JSON.parse(readFileSync(this.historyFile, 'utf8'));
      this.runs = (h.runs as RunSummary[]).map((r) => (r.status === 'running' || r.status === 'draining' ? { ...r, status: 'aborted' } : r));
      this.retros = h.retros;
    }
    this.runNumber = this.runs.at(-1)?.run ?? 0;
  }

  private saveHistory() {
    writeFileSync(this.historyFile, JSON.stringify({ runs: this.runs, retros: this.retros }, null, 2));
  }

  private runDir() {
    const dir = join(RUNS_DIR, `run-${this.runNumber}`);
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  // ---------------------------------------------------------------- logging

  private elapsed(t: number) {
    return `+${((t - this.runStart) / MIN).toFixed(1).padStart(4)}m`;
  }

  private onDecision = (d: DecisionEntry) => {
    const line = `[run ${this.runNumber} ${this.elapsed(d.t)}] ${d.actor.padEnd(8)} ${d.kind.padEnd(8)} ${d.text}`;
    appendFileSync(join(this.runDir(), 'decisions.log'), `${line}\n${d.reasoning.map((r) => `${' '.repeat(22)}↳ ${r}`).join('\n')}\n`);
    if (this.opts.quiet) return;
    const color = d.actor === 'master' ? C.magenta : d.actor === 'retro' ? C.green : C.cyan;
    console.log(`${C.dim}[run ${this.runNumber} ${this.elapsed(d.t)}]${C.reset} ${color}${d.actor.padEnd(8)}${C.reset} ${d.text}`);
    for (const r of d.reasoning) console.log(`${C.dim}${' '.repeat(24)}↳ ${r}${C.reset}`);
  };

  private onStep = (child: { id: string; incidentId: string }, text: string) => {
    appendFileSync(join(this.runDir(), 'agents.log'), `[${this.elapsed(this.clock.now())}] ${child.id} (${child.incidentId}) ${text}\n`);
  };

  // ---------------------------------------------------------------- run lifecycle

  async startRun() {
    if (this.orch) {
      if (!this.retroDone && this.orch.incidents.length) this.learn();
      await this.orch.dispose();
      const last = this.runs.at(-1);
      if (last && (last.status === 'running' || last.status === 'draining')) last.status = 'aborted';
    }
    this.runNumber = (this.runs.at(-1)?.run ?? 0) + 1;
    rmSync(this.runDir(), { recursive: true, force: true });
    this.repo.init();
    this.clock.reset(Date.now());
    this.runStart = this.clock.now();
    this.plan = buildShift(this.runNumber);
    this.emitted = 0;
    this.resolveQueue = [];
    this.timeline = [];
    this.retroDone = false;
    this.orch = new Orchestrator({
      clock: this.clock,
      repo: this.repo,
      playbook: this.playbook,
      rng: createRng(4242 + this.runNumber),
      run: this.runNumber,
      maxParallel: () => this.config.maxParallel,
      onDecision: this.onDecision,
      onStep: this.onStep,
    });
    this.runs.push({ run: this.runNumber, playbookVersion: this.playbook.version, status: 'running', startedAt: this.runStart });
    this.status = 'running';
    this.orch.decide({ actor: 'master', kind: 'system', text: `Shift ${this.runNumber} started with playbook v${this.playbook.version}. ${this.plan.length} alerts scheduled.`, reasoning: [`Fresh checkout of the ShopFast repo; up to ${this.config.maxParallel} child agents in parallel.`] });
    this.saveHistory();
    this.clock.start();
  }

  private onTick(now: number) {
    const o = this.orch;
    if (!o || (this.status !== 'running' && this.status !== 'draining')) return;
    const elapsed = (now - this.runStart) / MIN;
    while (this.emitted < this.plan.length && this.plan[this.emitted].atMin <= elapsed) this.emit(this.plan[this.emitted++]);
    const due = this.resolveQueue.filter((r) => r.at <= now);
    if (due.length) {
      this.resolveQueue = this.resolveQueue.filter((r) => r.at > now);
      for (const r of due) o.resolveAlert(r.alertId);
    }
    o.tick();
    const minute = Math.floor(elapsed);
    if (this.timeline.length === 0 || this.timeline.at(-1)!.t < minute) {
      this.timeline.push({
        t: minute,
        received: o.alerts.length,
        investigated: o.incidents.filter((i) => i.childIds.length).length,
        filtered: o.alerts.filter((a) => a.disposition === 'suppressed' || a.disposition === 'grouped').length + o.incidents.filter((i) => i.status === 'auto-resolved').length,
      });
    }
    if (this.status === 'running' && this.emitted >= this.plan.length) this.status = 'draining';
    if (this.status === 'draining' && !o.busy) this.complete();
  }

  private emit(p: PlannedAlert) {
    const o = this.orch!;
    const truth = p.template.truth;
    if (truth.bugId && !this.repo.bugPresent(truth.bugId, BUG_FILES[truth.bugId])) {
      o.decide({ actor: 'master', kind: 'system', text: `Monitor quiet: "${p.body.title}" did not fire — its fix is merged on main.`, reasoning: ['The merged PR removed the defect, so this symptom no longer occurs.'] });
      return;
    }
    const alert = o.ingest({ ...p.body, templateId: p.template.id, injected: p.atMin === -1 ? true : undefined }, truth);
    if (p.resolvesAfterMin) this.resolveQueue.push({ at: alert.ts + p.resolvesAfterMin * MIN, alertId: alert.id });
  }

  private complete() {
    this.status = 'complete';
    const o = this.orch!;
    const m = computeMetrics(o, this.timeline);
    const summary = this.runs.at(-1)!;
    summary.status = 'complete';
    summary.endedAt = this.clock.now();
    summary.metrics = {
      alerts: m.alertsReceived,
      incidents: m.incidents,
      children: m.childrenSpawned,
      wasted: 0,
      duplicates: o.incidents.filter((i) => i.action === 'joined').length,
      raceLosers: o.children.filter((c) => c.raceId && c.status === 'cancelled').length,
      prs: m.prsOpened,
      avgTtdMin: m.avgTtdMin,
      hoursSaved: m.hoursSaved,
      agentMinutes: m.agentMinutes,
    };
    o.decide({ actor: 'master', kind: 'system', text: `Shift ${this.runNumber} complete: ${m.alertsReceived} alerts → ${m.incidents} incidents, ${m.prsOpened} PRs, ${m.hoursSaved.toFixed(1)} engineer-hours saved.`, reasoning: [`Average time to diagnosis ${m.avgTtdMin?.toFixed(1) ?? '—'} min across ${m.investigated} investigated incidents.`] });
    const dir = this.runDir();
    writeFileSync(join(dir, 'scratchpad.md'), this.scratchpadMarkdown());
    writeFileSync(join(dir, 'summary.json'), JSON.stringify({ metrics: m, prs: o.prs.map((p) => ({ id: p.id, title: p.title, branch: p.branch })), notes: o.notes.map((n) => ({ id: n.id, title: n.title })) }, null, 2));
    this.saveHistory();
    if (this.config.autoLearn && !this.retroDone) {
      this.status = 'learning';
      setTimeout(() => this.learn(), this.opts.quiet ? 0 : 1500);
    }
  }

  learn(): RetroReport | undefined {
    const o = this.orch;
    if (!o || this.retroDone) return;
    this.retroDone = true;
    const { playbook, report } = runRetrospective(o, this.playbook, this.runNumber);
    savePlaybook(playbook);
    this.versions.push(playbook);
    this.playbook = playbook;
    this.retros.push(report);
    const summary = this.runs.find((r) => r.run === this.runNumber)!;
    summary.score = report.score;
    if (summary.metrics) {
      summary.metrics.wasted = report.evaluations.filter((e) => e.wasted).length;
      summary.metrics.duplicates = report.evaluations.filter((e) => e.duplicate).length;
    }
    if (summary.status === 'complete' || summary.status === 'running' || summary.status === 'draining') summary.status = 'learned';
    o.decide({ actor: 'retro', kind: 'learn', text: `Retrospective on shift ${this.runNumber}: score ${report.score.total}/100 → playbook v${playbook.version} (${report.learnings.length} learnings)`, reasoning: report.learnings.map((l) => `${l.id} ${l.title}`) });
    writeFileSync(join(this.runDir(), 'retrospective.json'), JSON.stringify(report, null, 2));
    this.saveHistory();
    if (this.status === 'learning' || this.status === 'complete') this.status = 'learned';
    return report;
  }

  // ---------------------------------------------------------------- controls

  pause() {
    this.clock.pause();
  }

  resume() {
    this.clock.start();
  }

  setSpeed(speed: number) {
    this.clock.speed = Math.max(1, Math.min(5000, speed));
  }

  inject(templateId?: string, custom?: CustomAlert): string {
    if (!this.orch) throw new Error('Start a shift first');
    let planned: PlannedAlert;
    if (custom) {
      planned = {
        atMin: -1,
        template: { id: 'custom', label: 'Custom', kind: 'investigation', truth: undefined as never, make: () => undefined as never },
        body: {
          source: 'custom',
          severity: custom.severity,
          service: custom.service,
          env: 'prod',
          monitor: 'custom:manual',
          title: custom.title,
          description: custom.description,
          logs: [],
          stackTrace: custom.stackTrace || undefined,
          tags: { env: 'prod', service: custom.service },
        },
      };
    } else {
      if (!templateId || !TEMPLATE_BY_ID[templateId]) throw new Error(`Unknown alert template ${templateId}`);
      planned = { ...instantiate(templateId, 9000 + ++this.injectSeq * 31 + this.runNumber), atMin: -1 };
    }
    if (this.status === 'complete' || this.status === 'learned' || this.status === 'learning') this.status = 'draining';
    const o = this.orch;
    const before = o.alerts.length;
    if (custom) {
      const alert = o.ingest({ ...planned.body, templateId: 'custom', injected: true }, undefined);
      return alert.id;
    }
    this.emit(planned);
    this.clock.start();
    return o.alerts.length > before ? o.alerts.at(-1)!.id : 'suppressed-by-merged-fix';
  }

  async merge(prId: number) {
    const o = this.orch;
    const pr = o?.prs.find((p) => p.id === prId);
    if (!o || !pr || pr.status === 'merged') return;
    await this.repo.merge(pr.branch, pr.title);
    pr.status = 'merged';
    pr.mergedAt = this.clock.now();
    for (const inc of o.incidents) if (inc.prId === prId) inc.status = 'merged';
    o.decide({ actor: 'human', kind: 'pr', text: `PR #${prId} approved and merged into main by the on-call engineer.`, reasoning: ['Human-in-the-loop: the agent proposes, a human approves (guardrail G2). Alerts for this defect will stop firing.'] });
  }

  async reset() {
    this.clock.pause();
    await this.orch?.dispose();
    this.orch = undefined;
    rmSync(DATA_DIR, { recursive: true, force: true });
    this.versions = [];
    this.runs = [];
    this.retros = [];
    this.status = 'idle';
    this.runNumber = 0;
    this.load();
  }

  async shutdown() {
    await this.orch?.dispose();
    this.clock.dispose();
  }

  get runStatus(): RunStatus {
    if ((this.status === 'running' || this.status === 'draining') && !this.clock.running) return 'paused';
    return this.status;
  }

  scratchpadMarkdown(): string {
    const o = this.orch;
    if (!o) return '';
    return [`# Shared scratchpad — shift ${this.runNumber}`, '', ...o.scratchpad.map((e) => `- \`${this.elapsed(e.t)}\` **${e.author}** [${e.kind}] ${e.text}`)].join('\n');
  }

  snapshot(): Snapshot {
    const o = this.orch;
    const empty = { alerts: [], incidents: [], children: [], decisions: [], prs: [], notes: [], scratchpad: [] };
    const metrics = o
      ? computeMetrics(o, this.timeline)
      : computeMetrics({ alerts: [], incidents: [], children: [], prs: [], notes: [], decisions: [] } as unknown as Orchestrator, []);
    return {
      now: this.clock.now(),
      clock: { running: this.clock.running, speed: this.clock.speed },
      run: {
        number: this.runNumber,
        status: this.runStatus,
        playbookVersion: this.runs.at(-1)?.playbookVersion ?? this.playbook.version,
        alertsPlanned: this.plan.length,
        alertsEmitted: this.emitted,
        startedAt: this.runStart,
      },
      ...(o
        ? {
            alerts: o.alerts,
            incidents: o.incidents,
            children: o.children.map((c) => {
              const { _brief, ...rest } = c as typeof c & { _brief?: unknown };
              void _brief;
              return rest;
            }),
            decisions: o.decisions,
            prs: o.prs,
            notes: o.notes,
            scratchpad: o.scratchpad,
          }
        : empty),
      metrics,
      playbook: this.playbook,
      playbookMarkdown: renderPlaybook(this.playbook),
      playbookVersions: this.versions.map((v) => ({ version: v.version, createdAt: v.createdAt, learnings: this.retros.find((r) => r.toVersion === v.version)?.learnings.length ?? 0, score: this.runs.find((r) => r.playbookVersion === v.version && r.score)?.score?.total })),
      retros: this.retros,
      runs: this.runs,
      injectables: INJECTABLES,
      config: this.config,
      hoursFormula: HOURS_FORMULA.map((h) => ({ label: h.label, minutes: h.minutes, explain: h.explain })),
    };
  }
}
