import { execFile, execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import type { Finding, ScratchEntry, StrategyId, TestRun } from '../../../shared/types.ts';
import { STRATEGY_LABELS } from '../../../shared/types.ts';
import { DETECTOR_BY_ID, relevance, runDetectors } from '../detectors.ts';
import type { Brief, ChildRpc } from './brief.ts';

export class Cancelled extends Error {
  constructor() {
    super('cancelled');
  }
}

export interface ChildResult {
  action: 'pr' | 'joined' | 'note' | 'escalate' | 'none';
  summary: string;
  finding?: Finding;
  prId?: number;
  noteId?: string;
}

/** Simulated minutes each kind of tool call takes (what a real agent would spend). */
const COST = {
  think: 0.2,
  scratchpad: 0.3,
  parse: 0.5,
  grep: 1.0,
  read: 1.2,
  analyze: 0.9,
  gitlog: 0.8,
  gitshow: 1.0,
  catalog: 0.6,
  runbook: 1.0,
  writeTest: 2.5,
  runTests: 1.5,
  fix: 2.0,
  commit: 0.5,
  pr: 1.0,
  note: 1.5,
  escalate: 0.8,
};

const PR_TITLES: Record<string, string> = {
  'connection-leak': 'fix(db): always release pooled connections when the callback throws',
  'optional-field-null': 'fix(checkout): return 400 for guest checkout without address instead of crashing',
  'retry-non-retryable': 'fix(payment-worker): stop retrying non-retryable 4xx Stripe errors',
  'time-unit-mismatch': 'fix(auth): compare session expiry in seconds (regression from v2.14.0)',
  'unbounded-cache': 'fix(catalog): bound the in-memory price cache and evict expired entries',
  'money-rounding': 'fix(shared): round tax to the nearest cent to match the processor',
};

const STOPWORDS = new Set(
  'the and for with from that this have been after over under into than then when what were your our are not all any its per via has had was out off one two api min last more most only same rate high low prod each every within across while order orders looks like during service services threshold events users minutes since right'.split(' '),
);

const RUNBOOK_KEYS: [string, string[]][] = [
  ['security', ['suspicious', 'failed attempts', 'admin login', 'credential']],
  ['tls', ['tls', 'certificate']],
  ['disk', ['disk usage', 'disk ']],
  ['replication', ['replication']],
  ['stripe', ['stripe']],
  ['synthetic', ['synthetic', 'probe']],
  ['no-data', ['no data']],
  ['cpu', ['cpu ']],
];

interface Candidate {
  file: string;
  why: string;
  focus?: number;
}

interface Runbook {
  key: string;
  path: string;
  content: string;
}

class Investigation {
  private toolCalls = 0;
  private filesRead = 0;
  private read = new Set<string>();
  private incidentalLogged = new Set<string>();
  private phase = 'briefing';
  private text: string;
  private catalogCache?: { services: Record<string, { team: string; paths: string[]; dependsOn: string[] }>; runbooks: Record<string, string> };
  private viaScratchpad = false;
  private viaKnowledge = false;
  private trail: string[] = [];

  constructor(private b: Brief, private rpc: ChildRpc, private isCancelled: () => boolean) {
    this.text = b.alerts
      .map((a) => [a.title, a.description, ...a.logs, a.stackTrace ?? ''].join('\n'))
      .join('\n')
      .toLowerCase();
  }

  // ---------- primitives ----------

  private async step(kind: 'think' | 'result' | 'scratchpad' | 'decision' | 'error', text: string, code?: string) {
    if (this.isCancelled()) throw new Cancelled();
    await this.rpc.step({ step: { kind, text, code }, phase: this.phase, counters: { toolCalls: this.toolCalls, filesRead: this.filesRead } });
  }

  private async tool<T>(tool: string, text: string, minutes: number, fn: () => T | Promise<T>, code?: string): Promise<T> {
    if (this.isCancelled()) throw new Cancelled();
    this.toolCalls += 1;
    await this.rpc.step({ step: { kind: 'tool', tool, text, code }, phase: this.phase, counters: { toolCalls: this.toolCalls, filesRead: this.filesRead } });
    await this.rpc.sleep({ min: minutes });
    return fn();
  }

  private overBudget() {
    return this.toolCalls >= this.b.budget;
  }

  private repoFile(p: string) {
    return readFileSync(join(this.b.repoPath, p), 'utf8');
  }

  private walk(dir = '', exts = ['.ts', '.md', '.json']): string[] {
    const abs = join(this.b.repoPath, dir);
    if (!existsSync(abs)) return [];
    return readdirSync(abs).flatMap((f) => {
      if (f === '.git' || f === 'node_modules') return [];
      const rel = dir ? `${dir}/${f}` : f;
      return statSync(join(abs, f)).isDirectory() ? this.walk(rel, exts) : exts.some((e) => f.endsWith(e)) ? [rel] : [];
    });
  }

  private async catalog() {
    if (!this.catalogCache) {
      this.catalogCache = await this.tool('read_file', 'Reading service catalog `catalog/services.json`', COST.catalog, () => JSON.parse(this.repoFile('catalog/services.json')));
    }
    return this.catalogCache!;
  }

  // ---------- reading code ----------

  /** Reads candidate files and runs bug-pattern analysis; returns the first finding that explains the alert. */
  private async examine(cands: Candidate[], limit = 3): Promise<Finding | undefined> {
    let examined = 0;
    for (const c of cands) {
      if (examined >= limit || this.overBudget()) break;
      if (this.read.has(c.file) || !existsSync(join(this.b.repoPath, c.file))) continue;
      this.read.add(c.file);
      examined += 1;
      const content = await this.tool('read_file', `Reading \`${c.file}\`${c.focus ? `:${c.focus}` : ''} — ${c.why}`, COST.read, () => this.repoFile(c.file));
      this.filesRead += 1;
      this.trail.push(c.file);
      const findings = await this.tool('analyze', `Analyzing \`${c.file}\` against the symptoms`, COST.analyze, () => runDetectors(c.file, content));
      const scored = findings.map((f) => ({ f, score: relevance(f, this.text) })).sort((a, b) => b.score - a.score);
      const best = scored[0];
      if (best && best.score > 0) {
        await this.step('result', `Root cause found in \`${best.f.file}:${best.f.line}\` — ${best.f.title}. ${best.f.explanation}`, best.f.snippet);
        return best.f;
      }
      for (const { f } of scored) {
        if (this.incidentalLogged.has(f.bugId)) continue;
        this.incidentalLogged.add(f.bugId);
        await this.step('scratchpad', `Spotted an unrelated defect (${f.title}) in \`${f.file}:${f.line}\`. It doesn't explain these symptoms — posting it to the shared scratchpad for siblings.`);
        await this.rpc['scratchpad.write']({ kind: 'incidental', text: `${f.title} in ${f.file}:${f.line}`, bugId: f.bugId, file: f.file });
      }
      if (!scored.length) await this.step('result', `Nothing in \`${c.file}\` explains the symptoms.`);
    }
    return undefined;
  }

  // ---------- strategies ----------

  private tokens(): string[] {
    const words = (this.b.alerts[0].title + ' ' + this.b.alerts[0].description).toLowerCase().match(/[a-z][a-z0-9_]{3,}/g) ?? [];
    const out: string[] = [];
    for (const w of words) {
      if (STOPWORDS.has(w) || /^[a-f0-9]{5}$/.test(w) || out.includes(w)) continue;
      out.push(w);
    }
    return out.slice(0, 7);
  }

  private async keywordGrep(): Promise<Finding | Runbook | undefined> {
    const tokens = this.tokens();
    const pattern = tokens.join('|');
    const files = this.walk();
    const hits = await this.tool('grep', `Searching the codebase for alert keywords`, COST.grep, () =>
      files
        .map((f) => {
          const content = this.repoFile(f).toLowerCase();
          const matched = tokens.filter((t) => content.includes(t));
          const count = tokens.reduce((n, t) => n + (content.split(t).length - 1), 0);
          return { f, matched, count };
        })
        .filter((h) => h.count > 0 && !h.f.startsWith('tests/'))
        .sort((a, b) => b.matched.length - a.matched.length || b.count - a.count),
      `grep -rniE "${pattern}" --include=*.ts --include=*.md .`,
    );
    await this.step('result', hits.length ? `${hits.length} files match. Top: ${hits.slice(0, 4).map((h) => `${h.f} (${h.matched.join(', ')})`).join('; ')}` : 'No matches.');
    const code = hits.filter((h) => h.f.endsWith('.ts')).map((h) => ({ file: h.f, why: `matched ${h.matched.join(', ')}` }));
    const found = await this.examine(code, 3);
    if (found) return found;
    const doc = hits.find((h) => h.f.startsWith('docs/runbooks/'));
    if (doc && !this.overBudget()) {
      const content = await this.tool('read_file', `Reading runbook \`${doc.f}\``, COST.runbook, () => this.repoFile(doc.f));
      return { key: doc.f.replace(/^.*\/|\.md$/g, ''), path: doc.f, content };
    }
    return undefined;
  }

  private frames(): { fn: string; file: string; line: number }[] {
    const src = this.b.alerts.map((a) => [a.stackTrace ?? '', ...a.logs].join('\n')).join('\n');
    const out: { fn: string; file: string; line: number }[] = [];
    for (const m of src.matchAll(/at (?:async )?([\w.<>]+) \(([^():]+\.ts):(\d+)(?::\d+)?\)/g)) {
      if (m[2].startsWith('node:') || out.some((o) => o.file === m[2])) continue;
      out.push({ fn: m[1], file: m[2], line: Number(m[3]) });
    }
    return out;
  }

  private async stackTraceFirst(): Promise<Finding | Runbook | undefined> {
    const frames = await this.tool('parse_stacktrace', 'Parsing stack traces from the alert payload', COST.parse, () => this.frames());
    if (!frames.length) {
      await this.step('think', 'No in-app stack frames in this alert (metric/monitor alert). Falling back to keyword search.');
      return this.keywordGrep();
    }
    await this.step('result', `In-app frames: ${frames.map((f) => `${f.fn} @ ${f.file}:${f.line}`).join(' → ')}`);
    const found = await this.examine(frames.map((f) => ({ file: f.file, why: `stack frame ${f.fn}`, focus: f.line })), 3);
    if (found) return found;
    const top = frames[0].file;
    if (!existsSync(join(this.b.repoPath, top))) return this.keywordGrep();
    const imports = [...this.repoFile(top).matchAll(/from '(\.{1,2}\/[^']+)'/g)].map((m) => normalize(join(dirname(top), m[1])));
    if (imports.length) {
      await this.step('think', `Frames themselves look correct; the bad value is probably computed upstream. Following imports of \`${top}\`.`);
      const f = await this.examine(imports.map((file) => ({ file, why: `imported by ${top}` })), 2);
      if (f) return f;
    }
    return this.keywordGrep();
  }

  private servicePaths(cat: Awaited<ReturnType<Investigation['catalog']>>) {
    const svc = cat.services[this.b.service];
    return svc ? { own: svc.paths, deps: svc.dependsOn } : { own: [] as string[], deps: [] as string[] };
  }

  private async recentDeployDiff(): Promise<Finding | Runbook | undefined> {
    const cat = await this.catalog();
    const { own, deps } = this.servicePaths(cat);
    const scope = [...own, ...deps];
    const log = await this.tool('git', 'Listing commits deployed in the last 72h', COST.gitlog, () => this.git(['log', '--since=72 hours ago', '--name-only', '--format=@@%h|%an|%ar|%s']), 'git log --since="72 hours ago" --name-only');
    const commits = log
      .split('@@')
      .filter(Boolean)
      .map((chunk) => {
        const [head, ...files] = chunk.trim().split('\n');
        const [sha, author, when, subject] = head.split('|');
        return { sha, author, when, subject, files: files.filter(Boolean) };
      });
    await this.step('result', `${commits.length} recent commits: ${commits.map((c) => `${c.sha} "${c.subject}" (${c.author}, ${c.when})`).join('; ')}`);
    const deployTag = this.b.alerts.map((a) => a.tags.deploy ?? a.tags.release).find(Boolean);
    const relevant = commits
      .filter((c) => c.files.some((f) => f.endsWith('.ts') && scope.some((s) => f.startsWith(s))))
      .sort((a, b) => Number(Boolean(deployTag && b.subject.includes(deployTag))) - Number(Boolean(deployTag && a.subject.includes(deployTag))));
    if (!relevant.length) {
      await this.step('think', `No recent code changes touch ${this.b.service} or its dependencies. Falling back to keyword search.`);
      return this.keywordGrep();
    }
    if (deployTag) await this.step('think', `Alert is tagged ${deployTag}; prioritizing the matching commit.`);
    for (const c of relevant.slice(0, 2)) {
      const diff = await this.tool('git', `Inspecting ${c.sha} "${c.subject}"`, COST.gitshow, () => this.git(['show', '--format=', c.sha, '--', ...c.files.filter((f) => f.endsWith('.ts'))]), undefined);
      await this.step('result', `Diff of ${c.sha}`, diff.split('\n').filter((l) => /^[+-][^+-]/.test(l)).slice(0, 8).join('\n'));
      const f = await this.examine(c.files.filter((f) => f.endsWith('.ts')).map((file) => ({ file, why: `changed in ${c.sha}` })), 2);
      if (f) return f;
    }
    return this.keywordGrep();
  }

  private async dependencyTrace(): Promise<Finding | Runbook | undefined> {
    const cat = await this.catalog();
    const { own, deps } = this.servicePaths(cat);
    if (!own.length && !deps.length) {
      await this.step('think', `${this.b.service} has no application code in this repo (infrastructure). Switching to runbook lookup.`);
      return this.runbookLookup();
    }
    await this.step('think', `Tracing ${this.b.service} → own code ${own.join(', ')}; dependencies ${deps.join(', ')}. Resource symptoms usually come from long-lived state: pools, caches, timers.`);
    const files = await this.tool('list_files', `Listing source files for ${this.b.service} and its dependencies`, COST.grep, () =>
      [...own, ...deps].flatMap((d) => this.walk(d, ['.ts'])),
    );
    const ranked = files
      .map((file) => {
        const c = this.repoFile(file);
        const state = (c.match(/^const \w+ = new (Map|Set)|class \w*Pool|acquire\(|setInterval\(/gm) ?? []).length;
        const words = this.tokens().filter((t) => c.toLowerCase().includes(t)).length;
        return { file, score: state * 2 + words };
      })
      .sort((a, b) => b.score - a.score);
    await this.step('result', `Ranked ${files.length} files by long-lived state + symptom overlap: ${ranked.slice(0, 3).map((r) => r.file).join(', ')}`);
    const f = await this.examine(ranked.map((r) => ({ file: r.file, why: 'holds long-lived state' })), 3);
    return f ?? this.keywordGrep();
  }

  private async runbookLookup(): Promise<Finding | Runbook | undefined> {
    const cat = await this.catalog();
    const key = RUNBOOK_KEYS.find(([, words]) => words.some((w) => this.text.includes(w)))?.[0];
    if (!key || !cat.runbooks[key]) {
      await this.step('think', 'No runbook matches these symptoms. Falling back to keyword search.');
      return this.keywordGrep();
    }
    const path = cat.runbooks[key];
    const content = await this.tool('read_file', `Reading runbook \`${path}\``, COST.runbook, () => this.repoFile(path));
    await this.step('result', `Runbook "${content.split('\n')[0].replace(/^#\s*/, '')}" applies.`);
    return { key, path, content };
  }

  private git(args: string[]): string {
    return execFileSyncSafe('git', args, this.b.repoPath);
  }

  // ---------- main flow ----------

  async run(): Promise<ChildResult> {
    const a = this.b.alerts[0];
    await this.step('think', `Picked up ${this.b.incidentId} (${this.b.severity}, ${this.b.service}): "${a.title}". ${this.b.alerts.length > 1 ? `${this.b.alerts.length} grouped alerts. ` : ''}Plan: ${STRATEGY_LABELS[this.b.strategy]}.`);
    if (this.b.raceSize > 1) await this.step('think', `Racing ${this.b.raceSize - 1} sibling agent(s) that use different strategies. First verified root cause wins; the rest stand down.`);
    this.phase = 'investigating';

    let result: Finding | Runbook | undefined;

    const pad = await this.tool('scratchpad', 'Checking the shared scratchpad for related findings', COST.scratchpad, () => this.rpc['scratchpad.read']());
    const related = this.related(pad);
    if (related.length) {
      this.viaScratchpad = true;
      await this.step('scratchpad', `${related[0].author} already traced similar symptoms to \`${related[0].file}\` (${related[0].bugId}). Verifying that hypothesis first.`);
      result = await this.examine(related.map((r) => ({ file: r.file!, why: `finding from ${r.author}` })), 2);
      if (!result) this.viaScratchpad = false;
    }

    if (!result && this.b.knowledge.length) {
      this.viaKnowledge = true;
      for (const k of this.b.knowledge) await this.step('think', `Playbook knowledge ${k.id}: similar incidents were traced to \`${k.file}\` — ${k.hint}`);
      result = await this.examine(this.b.knowledge.map((k) => ({ file: k.file, why: `playbook knowledge ${k.id}` })), 2);
      if (!result) this.viaKnowledge = false;
    }

    if (!result) {
      const strategies: Record<StrategyId, () => Promise<Finding | Runbook | undefined>> = {
        'keyword-grep': () => this.keywordGrep(),
        'stack-trace-first': () => this.stackTraceFirst(),
        'recent-deploy-diff': () => this.recentDeployDiff(),
        'dependency-trace': () => this.dependencyTrace(),
        'runbook-lookup': () => this.runbookLookup(),
      };
      result = await strategies[this.b.strategy]();
    }

    if (result && 'bugId' in result) return this.onFinding(result);
    return this.conclude(result);
  }

  private related(pad: ScratchEntry[]) {
    return pad
      .filter((e) => (e.kind === 'finding' || e.kind === 'incidental') && e.file && e.bugId && e.incidentId !== this.b.incidentId)
      .filter((e) => {
        const signals = e.signals ?? DETECTOR_BY_ID[e.bugId!]?.signals ?? [];
        return signals.some((s) => this.text.includes(s));
      })
      .filter((e, i, all) => all.findIndex((o) => o.file === e.file) === i)
      .slice(0, 2);
  }

  private async onFinding(f: Finding): Promise<ChildResult> {
    this.phase = 'diagnosed';
    const verdict = await this.rpc.diagnosed({ finding: f, viaScratchpad: this.viaScratchpad, viaKnowledge: this.viaKnowledge });
    if (!verdict.proceed) {
      await this.step('decision', `Standing down: ${verdict.reason}`);
      return { action: 'none', summary: verdict.reason ?? 'stood down', finding: f };
    }
    if (this.b.goal === 'gather-context-and-escalate') return this.escalate(this.b.service, `Context gathered; code finding attached (${f.title}).`, f);

    const claim = await this.rpc.claim({ bugId: f.bugId, file: f.file });
    let acquired = claim.ok;
    if (!claim.ok) {
      let prId = claim.prId;
      if (!prId) {
        await this.step('scratchpad', `${claim.owner} (${claim.incidentId}) is already fixing ${f.bugId}. Waiting for their PR instead of writing a duplicate fix.`);
        for (let i = 0; i < 30 && !prId && !acquired; i++) {
          await this.rpc.sleep({ min: 1 });
          const retry = await this.rpc.claim({ bugId: f.bugId, file: f.file });
          prId = retry.prId;
          acquired = retry.ok;
        }
        if (acquired) await this.step('scratchpad', `${claim.owner} finished without a PR — taking over the fix for ${f.bugId}.`);
      }
      if (prId && !acquired) {
        this.phase = 'reporting';
        await this.tool('comment_pr', `Adding evidence from ${this.b.incidentId} to PR #${prId}`, COST.commit, () =>
          this.rpc['pr.join']({ prId: prId!, comment: `Additional evidence from **${this.b.incidentId}** (${this.b.alerts.length} alert(s): "${this.b.alerts[0].title}"). Same root cause confirmed independently by ${this.b.childId} in \`${f.file}:${f.line}\`.` }),
        );
        await this.step('decision', `Linked ${this.b.incidentId} to PR #${prId} (opened by ${claim.owner}) instead of opening a duplicate.`);
        return { action: 'joined', prId, finding: f, summary: `Same root cause as PR #${prId}: ${f.title}` };
      }
      if (!acquired) return this.note(`Fix in progress by ${claim.owner}`, f);
    }

    const d = DETECTOR_BY_ID[f.bugId];
    this.phase = 'fixing';
    const branch = `devin/${this.b.incidentId.toLowerCase()}-${f.bugId}`;
    const wt = await this.tool('git', `Creating an isolated worktree on branch \`${branch}\``, COST.commit, () => this.rpc['worktree.create']({ branch }), `git worktree add ../worktrees/${this.b.childId} -b ${branch} main`);
    await this.tool('write_file', `Writing regression test \`${d.regressionTest.path}\``, COST.writeTest, () => writeFileSync(join(wt, d.regressionTest.path), d.regressionTest.content), d.regressionTest.content);
    this.phase = 'testing';
    const before = await this.tool('run_tests', 'Running the regression test against current main', COST.runTests, () => runTests(this.b.tsxCli, wt, [d.regressionTest.path]), `npx tsx --test ${d.regressionTest.path}`);
    if (before.failed === 0) {
      await this.step('result', 'Regression test passes on current code — could not reproduce. Not changing code without a reproduction.');
      return this.note('Could not reproduce with a unit test', f);
    }
    await this.step('result', `✗ ${before.failed} failing — bug reproduced before touching any code.`, before.output);
    this.phase = 'fixing';
    const original = readFileSync(join(wt, f.file), 'utf8');
    const fixed = d.fix(original);
    if (!fixed) return this.note('Automatic fix not safe for this code shape', f);
    await this.tool('edit_file', `Applying fix to \`${f.file}\`: ${d.fixSummary}`, COST.fix, () => writeFileSync(join(wt, f.file), fixed), miniDiff(original, fixed));
    this.phase = 'testing';
    const tests = readdirSync(join(wt, 'tests')).filter((t) => t.endsWith('.test.ts')).map((t) => `tests/${t}`);
    const after = await this.tool('run_tests', 'Running the full test suite', COST.runTests, () => runTests(this.b.tsxCli, wt, tests), 'npm test');
    if (after.failed > 0) {
      await this.step('error', `${after.failed} test(s) failing after the fix — not opening a PR.`, after.output);
      return this.escalate(this.b.service, 'Automatic fix broke tests', f);
    }
    await this.step('result', `✓ ${after.passed} passed, 0 failed.`);
    await this.tool('git', 'Committing the fix', COST.commit, () => {
      execFileSyncSafe('git', ['add', '-A'], wt);
      execFileSyncSafe('git', ['-c', 'user.name=Devin Oncall', '-c', 'user.email=oncall@devin.ai', 'commit', '-q', '-m', `${PR_TITLES[f.bugId]}\n\nRefs ${this.b.incidentId}`], wt);
    }, `git commit -m "${PR_TITLES[f.bugId]}"`);
    this.phase = 'reporting';
    const prId = await this.tool('open_pr', `Opening pull request: ${PR_TITLES[f.bugId]}`, COST.pr, () =>
      this.rpc['pr.open']({ title: PR_TITLES[f.bugId], branch, bugId: f.bugId, body: this.prBody(f, before, after), testsBefore: before, testsAfter: after }),
    );
    await this.step('decision', `Opened PR #${prId}. Root cause verified by a failing-then-passing regression test.`);
    return { action: 'pr', prId, finding: f, summary: `${f.title} — PR #${prId}` };
  }

  private async conclude(rb: Runbook | undefined): Promise<ChildResult> {
    this.phase = 'reporting';
    const status = await this.tool('check_monitor', 'Re-checking alert status before deciding', COST.scratchpad, () => this.rpc['alerts.status']());
    if (this.b.category === 'security' || rb?.key === 'security') {
      return this.escalate('security-oncall', 'Security guardrail: automated agents never remediate suspected security incidents.', undefined, rb);
    }
    if (rb && /escalate/i.test(rb.content) && (this.b.severity === 'P1' || this.b.severity === 'P2') && !status.allResolved) {
      return this.escalate(rb.key === 'replication' ? 'dba-oncall' : `${this.b.service}-oncall`, 'Runbook requires a human decision and the cause is not determinable from code or telemetry available to the agent.', undefined, rb);
    }
    if (rb) return this.note(status.allResolved ? 'Recovered on its own — no action needed' : 'No code change required — follow runbook', undefined, rb, status.allResolved);
    if (status.allResolved) return this.note('Recovered on its own — no defect found', undefined, undefined, true);
    if (this.b.severity === 'P1' || this.b.severity === 'P2') return this.escalate(`${this.b.service}-oncall`, `Root cause not found within the ${this.b.budget}-step budget.`);
    return this.note('No actionable defect found');
  }

  private evidence(): string {
    return this.b.alerts
      .slice(0, 6)
      .map((a) => `- **${a.source}** ${a.severity} · ${a.title}`)
      .join('\n');
  }

  private prBody(f: Finding, before: TestRun, after: TestRun): string {
    const d = DETECTOR_BY_ID[f.bugId];
    const log = this.b.alerts.flatMap((a) => a.logs).slice(0, 2);
    return `## Summary
Automated fix opened by **Devin Oncall** (\`${this.b.childId}\`) for **${this.b.incidentId}** — ${this.b.alerts[0].title}.

## Root cause
\`${f.file}:${f.line}\` — ${f.explanation}

\`\`\`ts
${f.snippet}
\`\`\`

## Evidence
${this.evidence()}
${log.length ? `\nLog excerpt:\n\`\`\`\n${log.join('\n')}\n\`\`\`` : ''}

Investigation path: ${this.viaScratchpad ? 'shared scratchpad → ' : ''}${this.viaKnowledge ? 'playbook knowledge → ' : ''}${STRATEGY_LABELS[this.b.strategy]}; read ${this.trail.map((t) => `\`${t}\``).join(', ')} (${this.toolCalls} tool calls).

## Fix
${d.fixSummary}

## Verification
- Regression test \`${d.regressionTest.path}\`: **${before.failed} failing before the fix → passing after**
- Full suite: **${after.passed} passed, ${after.failed} failed**

## Rollout
Small, isolated change. Recommend merge and deploy; the linked monitors should recover within one evaluation window.`;
  }

  private async note(headline: string, f?: Finding, rb?: Runbook, recovered = false): Promise<ChildResult> {
    const steps = rb ? rb.content.split('\n').filter((l) => /^(\d+\.|-)\s/.test(l)).slice(0, 4) : [];
    const title = `${this.b.incidentId}: ${headline}`;
    const body = `## Assessment
${headline}.${recovered ? ' The monitor recovered without intervention while the agent was investigating.' : ''}${f ? `\n\nRelated code finding: ${f.title} in \`${f.file}:${f.line}\`.` : ''}

## Evidence
${this.evidence()}

## What was checked
${this.trail.length ? this.trail.map((t) => `- \`${t}\``).join('\n') : '- No application code is involved'}${rb ? `\n- Runbook \`${rb.path}\`` : ''}
${steps.length ? `\n## Recommended next steps (from runbook)\n${steps.join('\n')}` : ''}

## Why no code change
${rb ? 'This is an operational/upstream issue; the runbook resolution does not involve application code.' : 'No defect in the codebase matches these symptoms.'}`;
    const id = await this.tool('write_note', `Writing diagnostic note: "${headline}"`, COST.note, () => this.rpc['note.write']({ title, body }));
    await this.step('decision', `Left a diagnostic note (${id}) instead of a code change: ${headline}.`);
    return { action: 'note', noteId: id, finding: f, summary: headline };
  }

  private async escalate(to: string, why: string, f?: Finding, rb?: Runbook): Promise<ChildResult> {
    this.phase = 'reporting';
    const body = `## Why this needs a human
${why}

## Context gathered
${this.evidence()}
${f ? `\nSuspected code location: \`${f.file}:${f.line}\` — ${f.explanation}` : ''}${rb ? `\nRunbook consulted: \`${rb.path}\`` : ''}

## Suggested first steps
${rb ? rb.content.split('\n').filter((l) => /^(\d+\.|-)\s/.test(l)).slice(0, 3).join('\n') : '- Review the evidence above and confirm impact.'}`;
    const id = await this.tool('escalate', `Paging ${to} with a pre-triaged summary`, COST.escalate, () => this.rpc.escalate({ to, title: `${this.b.incidentId}: ${this.b.alerts[0].title}`, body }));
    await this.step('decision', `Escalated to ${to} (${id}). ${why}`);
    return { action: 'escalate', noteId: id, finding: f, summary: `Escalated to ${to}` };
  }
}

function execFileSyncSafe(cmd: string, args: string[], cwd: string): string {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function runTests(tsxCli: string, cwd: string, files: string[]): Promise<TestRun> {
  return new Promise((resolve) => {
    execFile(process.execPath, [tsxCli, '--test', ...files], { cwd, env: { ...process.env, LOG_SILENT: '1' }, maxBuffer: 4 * 1024 * 1024 }, (_err, stdout, stderr) => {
      const out = `${stdout}\n${stderr}`;
      const passed = Number(/ℹ pass (\d+)/.exec(out)?.[1] ?? 0);
      const failed = Number(/ℹ fail (\d+)/.exec(out)?.[1] ?? (_err ? 1 : 0));
      const summary = out
        .split('\n')
        .filter((l) => /^\s*(✔|✖)/.test(l) || /AssertionError|expected|actual/.test(l))
        .map((l) => l.replace(/\s+\([\d.]+ms\)$/, ''))
        .slice(0, 14)
        .join('\n');
      resolve({ passed, failed, output: summary });
    });
  });
}

function miniDiff(a: string, b: string): string {
  const x = a.split('\n');
  const y = b.split('\n');
  let start = 0;
  while (start < x.length && x[start] === y[start]) start++;
  let endX = x.length - 1;
  let endY = y.length - 1;
  while (endX > start && endY > start && x[endX] === y[endY]) {
    endX--;
    endY--;
  }
  return [...x.slice(start, endX + 1).map((l) => `- ${l}`), ...y.slice(start, endY + 1).map((l) => `+ ${l}`)].join('\n');
}

export function investigate(brief: Brief, rpc: ChildRpc, isCancelled: () => boolean): Promise<ChildResult> {
  return new Investigation(brief, rpc, isCancelled).run();
}

