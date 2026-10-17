import type { Alert, Category, Playbook, TriageRule } from '../../shared/types.ts';

export function normalizeTitle(title: string): string {
  return title
    .replace(/ord_[0-9a-f]+/g, 'ord_*')
    .replace(/-[0-9a-f]{5}\b/g, '-*')
    .replace(/\d+(\.\d+)?/g, '#');
}

/** Signature used by learned rules (correlations, knowledge): always normalized so it survives across runs. */
export function signature(a: Pick<Alert, 'service' | 'monitor' | 'title'>): string {
  return `${a.service}|${a.monitor}|${normalizeTitle(a.title)}`;
}

export function fingerprint(a: Alert, pb: Playbook): string {
  return pb.fingerprint.normalizeNumbers ? signature(a) : `${a.service}|${a.monitor}|${a.title}`;
}

export function ruleMatches(r: TriageRule, a: Alert): boolean {
  if (r.match.envNot && a.env === r.match.envNot) return false;
  if (r.match.monitor && a.monitor !== r.match.monitor) return false;
  if (r.match.severity && !r.match.severity.includes(a.severity)) return false;
  if (r.match.tag && a.tags[r.match.tag[0]] !== r.match.tag[1]) return false;
  return true;
}

/** Classifies an alert from its observable features only (never from ground truth). */
export function classify(a: Alert): { category: Category; signals: string[] } {
  const t = `${a.title} ${a.description}`.toLowerCase();
  const has = (...w: string[]) => w.filter((x) => t.includes(x));
  let s: string[];
  if ((s = has('suspicious', 'failed attempts', 'admin login')).length) return { category: 'security', signals: s };
  if (a.source === 'pingdom') return { category: 'synthetic', signals: ['source=pingdom'] };
  if ((s = has('status page', 'statuspage', 'external dependency', 'upstream')).length) return { category: 'third-party', signals: s };
  if ((s = has('disk usage', 'tls', 'certificate', 'replication', 'no data', 'cpu ')).length) return { category: 'infra', signals: s };
  if (a.stackTrace) return { category: 'exception', signals: ['stack trace present'] };
  if (a.tags.deploy || /after deploy/.test(t)) return { category: 'deploy-regression', signals: [a.tags.deploy ? `deploy=${a.tags.deploy}` : 'after deploy'] };
  if ((s = has('memory', 'oom', 'pool', 'saturation', 'heap')).length) return { category: 'resource', signals: s };
  if ((s = has('5xx', 'error rate', 'rate limited', '429', 'tickets')).length) return { category: 'error-rate', signals: s };
  return { category: 'unknown', signals: [] };
}

export const SEV_RANK = { P1: 0, P2: 1, P3: 2, P4: 3 } as const;
