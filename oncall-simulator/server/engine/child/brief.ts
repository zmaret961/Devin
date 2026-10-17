import type { Alert, Category, ChildGoal, Finding, Severity, Step, StrategyId, TestRun } from '../../../shared/types.ts';

export interface Brief {
  childId: string;
  incidentId: string;
  strategy: StrategyId;
  goal: ChildGoal;
  category: Category;
  severity: Severity;
  service: string;
  alerts: Alert[];
  repoPath: string;
  tsxCli: string;
  knowledge: { id: string; file: string; bugId: string; hint: string }[];
  raceSize: number;
  budget: number;
}

/** Calls a child agent can make back to the master (the parent thread). */
export interface ChildRpc {
  sleep(p: { min: number }): Promise<void>;
  step(p: { step: Omit<Step, 't'>; phase?: string; counters?: { toolCalls: number; filesRead: number } }): Promise<void>;
  'scratchpad.read'(): Promise<import('../../../shared/types.ts').ScratchEntry[]>;
  'scratchpad.write'(p: { kind: 'incidental' | 'info'; text: string; bugId?: string; file?: string }): Promise<void>;
  diagnosed(p: { finding: Finding; viaScratchpad: boolean; viaKnowledge: boolean }): Promise<{ proceed: boolean; reason?: string }>;
  claim(p: { bugId: string; file: string }): Promise<{ ok: boolean; owner?: string; prId?: number; incidentId?: string }>;
  'pr.join'(p: { prId: number; comment: string }): Promise<void>;
  'worktree.create'(p: { branch: string }): Promise<string>;
  'pr.open'(p: { title: string; branch: string; body: string; bugId: string; testsBefore: TestRun; testsAfter: TestRun }): Promise<number>;
  'note.write'(p: { title: string; body: string }): Promise<string>;
  escalate(p: { to: string; title: string; body: string }): Promise<string>;
  'alerts.status'(): Promise<{ allResolved: boolean; firing: number; total: number }>;
}

export type RpcMethod = keyof ChildRpc;
