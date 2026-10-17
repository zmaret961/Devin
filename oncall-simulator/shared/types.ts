// Types shared by the engine (server) and the dashboard (web).

export type Severity = 'P1' | 'P2' | 'P3' | 'P4';
export type AlertSource = 'datadog' | 'sentry' | 'pingdom' | 'pagerduty' | 'zendesk' | 'custom';
export type Category =
  | 'exception'
  | 'deploy-regression'
  | 'resource'
  | 'error-rate'
  | 'third-party'
  | 'infra'
  | 'security'
  | 'synthetic'
  | 'unknown';
export type StrategyId =
  | 'keyword-grep'
  | 'stack-trace-first'
  | 'recent-deploy-diff'
  | 'dependency-trace'
  | 'runbook-lookup';
export type Action = 'pr' | 'joined' | 'note' | 'escalate' | 'suppressed' | 'auto-resolved' | 'none';
export type Disposition = 'pending' | 'new-incident' | 'grouped' | 'suppressed' | 'held' | 'stopped';

export interface Alert {
  id: string;
  templateId: string;
  ts: number;
  source: AlertSource;
  severity: Severity;
  service: string;
  env: 'prod' | 'staging';
  monitor: string;
  title: string;
  description: string;
  logs: string[];
  stackTrace?: string;
  codeRefs?: string[];
  tags: Record<string, string>;
  status: 'firing' | 'resolved';
  resolvedAt?: number;
  incidentId?: string;
  disposition: Disposition;
  dispositionReason?: string;
  ruleRef?: string;
  injected?: boolean;
}

export type IncidentStatus =
  | 'held'
  | 'queued'
  | 'investigating'
  | 'fixing'
  | 'pr-open'
  | 'merged'
  | 'noted'
  | 'escalated'
  | 'auto-resolved'
  | 'cancelled';

export interface Finding {
  bugId: string;
  title: string;
  file: string;
  line: number;
  snippet: string;
  explanation: string;
  confidence: number;
  signals: string[];
}

export interface Incident {
  id: string;
  title: string;
  service: string;
  services: string[];
  category: Category;
  severity: Severity;
  env: 'prod' | 'staging';
  fingerprint: string;
  groupKey?: string;
  alertIds: string[];
  createdAt: number;
  status: IncidentStatus;
  goal: ChildGoal;
  strategies: StrategyId[];
  race: boolean;
  childIds: string[];
  holdUntil?: number;
  diagnosis?: Finding;
  diagnosedBy?: string;
  concludedAt?: number;
  action?: Action;
  prId?: number;
  noteId?: string;
  summary?: string;
  knowledgeRefs?: string[];
}

export type ChildGoal = 'diagnose-and-fix' | 'diagnose-and-note' | 'gather-context-and-escalate';
export type ChildStatus = 'queued' | 'running' | 'done' | 'cancelled' | 'failed';

export interface Step {
  t: number;
  kind: 'think' | 'tool' | 'result' | 'scratchpad' | 'decision' | 'error';
  tool?: string;
  text: string;
  code?: string;
}

export interface ChildAgent {
  id: string;
  incidentId: string;
  strategy: StrategyId;
  goal: ChildGoal;
  brief: string;
  raceId?: string;
  status: ChildStatus;
  steps: Step[];
  queuedAt: number;
  startedAt?: number;
  endedAt?: number;
  diagnosedAt?: number;
  action?: Action;
  prId?: number;
  noteId?: string;
  summary?: string;
  finding?: Finding;
  toolCalls: number;
  filesRead: number;
  usedKnowledge?: boolean;
  usedScratchpad?: boolean;
  phase?: string;
}

export interface DecisionEntry {
  id: number;
  t: number;
  actor: string;
  kind: 'triage' | 'suppress' | 'group' | 'hold' | 'spawn' | 'race' | 'cancel' | 'escalate' | 'pr' | 'note' | 'learn' | 'system' | 'resolve';
  incidentId?: string;
  text: string;
  reasoning: string[];
  rules?: string[];
}

export interface TestRun {
  passed: number;
  failed: number;
  output: string;
}

export interface PullRequest {
  id: number;
  title: string;
  branch: string;
  incidentId: string;
  childId: string;
  createdAt: number;
  status: 'open' | 'merged';
  mergedAt?: number;
  body: string;
  diff: string;
  files: string[];
  additions: number;
  deletions: number;
  bugId: string;
  testsBefore: TestRun;
  testsAfter: TestRun;
  comments: { t: number; author: string; body: string }[];
}

export interface Note {
  id: string;
  incidentId: string;
  childId: string;
  kind: 'diagnostic' | 'escalation';
  title: string;
  body: string;
  createdAt: number;
  escalateTo?: string;
}

export interface ScratchEntry {
  t: number;
  author: string;
  kind: 'claim' | 'finding' | 'incidental' | 'race' | 'info' | 'join';
  incidentId?: string;
  bugId?: string;
  file?: string;
  signals?: string[];
  prId?: number;
  text: string;
}

export interface Metrics {
  alertsReceived: number;
  alertsSuppressed: number;
  alertsGrouped: number;
  incidents: number;
  investigated: number;
  childrenSpawned: number;
  activeInvestigations: number;
  queued: number;
  held: number;
  prsOpened: number;
  notes: number;
  escalations: number;
  avgTtdMin: number | null;
  p50TtdMin: number | null;
  p90TtdMin: number | null;
  ttdSamples: number[];
  hoursSaved: number;
  hoursBreakdown: { label: string; count: number; minutesEach: number; minutes: number }[];
  agentMinutes: number;
  timeline: { t: number; received: number; investigated: number; filtered: number }[];
}

export interface TriageRule {
  id: string;
  kind: 'suppress' | 'hold';
  match: {
    monitor?: string;
    envNot?: string;
    severity?: Severity[];
    tag?: [string, string];
  };
  holdMinutes?: number;
  reason: string;
  evidence: string[];
  addedIn: number;
}

export interface CorrelationRule {
  id: string;
  groupKey: string;
  fingerprints: string[];
  services: string[];
  reason: string;
  evidence: string[];
  addedIn: number;
}

export interface RouteEntry {
  strategy: StrategyId;
  candidates: StrategyId[];
  confidence: number;
  race: boolean;
  reason: string;
}

export interface KnowledgeEntry {
  id: string;
  fingerprints: string[];
  bugId: string;
  file: string;
  hint: string;
  addedIn: number;
  uses: number;
}

export interface StratStats {
  trials: number;
  wins: number;
  totalMin: number;
  totalSteps: number;
}

export interface Playbook {
  version: number;
  createdAt: number;
  parentVersion?: number;
  guardrails: string[];
  fingerprint: { normalizeNumbers: boolean; stripHostIds: boolean; addedIn?: number };
  triageRules: TriageRule[];
  correlations: CorrelationRule[];
  routing: Record<Category, RouteEntry>;
  knowledge: KnowledgeEntry[];
  stats: Partial<Record<Category, Partial<Record<StrategyId, StratStats>>>>;
  exploration: number;
  changelog: { version: number; at: number; items: string[] }[];
}

export interface ScoreBreakdown {
  total: number;
  accuracy: number;
  actionCorrectness: number;
  efficiency: number;
  speed: number;
}

export interface IncidentEval {
  incidentId: string;
  title: string;
  category: Category;
  strategies: StrategyId[];
  expected: string;
  actual: string;
  rootCauseCorrect: boolean | null;
  actionCorrect: boolean;
  wasted: boolean;
  duplicate: boolean;
  ttdMin: number | null;
  verdict: 'correct' | 'partial' | 'wrong' | 'wasted' | 'unscored';
  note: string;
}

export interface Learning {
  id: string;
  type: 'fingerprint' | 'correlation' | 'noise-rule' | 'hold-rule' | 'routing' | 'race-policy' | 'knowledge' | 'revert';
  title: string;
  detail: string;
  evidence: string[];
  impact: string;
}

export interface RetroReport {
  run: number;
  fromVersion: number;
  toVersion: number;
  createdAt: number;
  score: ScoreBreakdown;
  evaluations: IncidentEval[];
  learnings: Learning[];
  strategyBoard: { category: Category; strategy: StrategyId; trials: number; wins: number; avgMin: number }[];
  playbookDiff: string;
  summary: string;
}

export interface RunSummary {
  run: number;
  playbookVersion: number;
  status: 'running' | 'draining' | 'complete' | 'learned' | 'aborted';
  startedAt: number;
  endedAt?: number;
  metrics?: {
    alerts: number;
    incidents: number;
    children: number;
    wasted: number;
    duplicates: number;
    raceLosers: number;
    prs: number;
    avgTtdMin: number | null;
    hoursSaved: number;
    agentMinutes: number;
  };
  score?: ScoreBreakdown;
}

export interface Injectable {
  id: string;
  label: string;
  kind: 'code-bug' | 'investigation' | 'noise' | 'security';
}

export interface Snapshot {
  now: number;
  clock: { running: boolean; speed: number };
  run: {
    number: number;
    status: 'idle' | 'running' | 'paused' | 'draining' | 'complete' | 'learning' | 'learned';
    playbookVersion: number;
    alertsPlanned: number;
    alertsEmitted: number;
    startedAt: number;
  };
  alerts: Alert[];
  incidents: Incident[];
  children: ChildAgent[];
  decisions: DecisionEntry[];
  prs: PullRequest[];
  notes: Note[];
  scratchpad: ScratchEntry[];
  metrics: Metrics;
  playbook: Playbook;
  playbookMarkdown: string;
  playbookVersions: { version: number; createdAt: number; learnings: number; score?: number }[];
  retros: RetroReport[];
  runs: RunSummary[];
  injectables: Injectable[];
  config: { maxParallel: number; autoLearn: boolean };
  hoursFormula: { label: string; minutes: number; explain: string }[];
}

export const STRATEGY_LABELS: Record<StrategyId, string> = {
  'keyword-grep': 'Keyword search',
  'stack-trace-first': 'Stack trace first',
  'recent-deploy-diff': 'Recent deploy diff',
  'dependency-trace': 'Dependency trace',
  'runbook-lookup': 'Runbook lookup',
};

export const CATEGORY_LABELS: Record<Category, string> = {
  exception: 'Exception',
  'deploy-regression': 'Deploy regression',
  resource: 'Resource saturation',
  'error-rate': 'Error-rate spike',
  'third-party': 'Third-party',
  infra: 'Infrastructure',
  security: 'Security',
  synthetic: 'Synthetic check',
  unknown: 'Unknown',
};
