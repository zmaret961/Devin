import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Alert, AlertSource, Injectable, Severity } from '../../shared/types.ts';
import { MOCK_TEMPLATE } from './paths.ts';
import { createRng, hex, int, pick, type Rng } from './rng.ts';

/**
 * Hidden ground truth for each alert template. Agents never see this — only the feed (to stop
 * alerts once a fix is merged) and the retrospective grader (standing in for on-call feedback).
 */
export interface Truth {
  kind: 'bug' | 'third-party' | 'infra' | 'security' | 'noise';
  bugId?: string;
  expected: 'pr' | 'note' | 'escalate' | 'suppress';
  label: string;
}

type AlertBody = Pick<Alert, 'source' | 'severity' | 'service' | 'env' | 'monitor' | 'title' | 'description' | 'logs' | 'stackTrace' | 'codeRefs' | 'tags'>;

interface Ctx {
  rng: Rng;
  host(service: string): string;
  n(min: number, max: number): number;
  line(file: string, needle: string): number;
}

export interface AlertTemplate {
  id: string;
  label: string;
  kind: Injectable['kind'];
  truth: Truth;
  /** Minutes after firing that the monitor recovers on its own (flapping / transient). */
  resolvesAfterMin?: (rng: Rng) => number;
  make(c: Ctx): AlertBody;
}

const lineCache = new Map<string, string[]>();
function lineOf(file: string, needle: string): number {
  let src = lineCache.get(file);
  if (!src) {
    src = readFileSync(join(MOCK_TEMPLATE, file), 'utf8').split('\n');
    lineCache.set(file, src);
  }
  const idx = src.findIndex((l) => l.includes(needle));
  return idx === -1 ? 1 : idx + 1;
}

const json = (o: Record<string, unknown>) => JSON.stringify(o);
const base = (source: AlertSource, severity: Severity, service: string, monitor: string): Pick<AlertBody, 'source' | 'severity' | 'service' | 'env' | 'monitor' | 'tags'> => ({
  source,
  severity,
  service,
  env: 'prod',
  monitor,
  tags: { env: 'prod', service },
});

export const TEMPLATES: AlertTemplate[] = [
  {
    id: 'db-pool-saturation',
    label: 'Datadog · DB pool saturation (checkout-api)',
    kind: 'code-bug',
    truth: { kind: 'bug', bugId: 'connection-leak', expected: 'pr', label: 'Connection leak in packages/db' },
    make: (c) => {
      const waiting = c.n(38, 84);
      return {
        ...base('datadog', 'P2', 'checkout-api', 'dd:db-pool-saturation'),
        title: `DB connection pool saturation on ${c.host('checkout-api')} (waiting=${waiting})`,
        description: `Monitor \`max(last_5m):shopfast.db.pool.waiting{service:checkout-api} > 25\` triggered. in_use=20/20, waiting=${waiting}. p99 latency on POST /v1/checkout is ${(c.n(38, 61) / 10).toFixed(1)}s. Pool usage climbs steadily and never drops after error bursts.`,
        logs: [
          json({ level: 'warn', service: 'db', msg: 'pool acquire timeout', idle: 0, inUse: 20, waiting }),
          json({ level: 'error', service: 'payment-worker', msg: 'charge failed', err: 'HttpError: stripe /charges failed with 402' }),
          json({ level: 'warn', service: 'db', msg: 'pool acquire timeout', idle: 0, inUse: 20, waiting: waiting + 3 }),
        ],
      };
    },
  },
  {
    id: 'db-pool-timeout',
    label: 'Sentry · PoolTimeoutError (payment-worker)',
    kind: 'code-bug',
    truth: { kind: 'bug', bugId: 'connection-leak', expected: 'pr', label: 'Connection leak in packages/db' },
    make: (c) => ({
      ...base('sentry', 'P2', 'payment-worker', 'sentry:payment-worker'),
      title: 'PoolTimeoutError: Timed out acquiring connection after 5000ms',
      description: `${c.n(140, 420)} events in the last 15 minutes across ${c.n(3, 6)} worker pods. Jobs fail before reaching Stripe.`,
      logs: [json({ level: 'warn', service: 'db', msg: 'pool acquire timeout', idle: 0, inUse: 20, waiting: c.n(30, 60) })],
      stackTrace: [
        'PoolTimeoutError: Timed out acquiring connection after 5000ms',
        `    at Timeout._onTimeout (packages/db/src/pool.ts:${c.line('packages/db/src/pool.ts', 'reject(new PoolTimeoutError')}:16)`,
        `    at ConnectionPool.acquire (packages/db/src/pool.ts:${c.line('packages/db/src/pool.ts', 'const timer = setTimeout')}:21)`,
        `    at withConnection (packages/db/src/pool.ts:${c.line('packages/db/src/pool.ts', 'const conn = await pool.acquire()')}:27)`,
        `    at chargePayment (services/worker/src/jobs/chargePayment.ts:${c.line('services/worker/src/jobs/chargePayment.ts', 'return withConnection(pool')}:10)`,
        '    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)',
      ].join('\n'),
    }),
  },
  {
    id: 'guest-checkout-typeerror',
    label: "Sentry · TypeError reading 'zip' (checkout-api)",
    kind: 'code-bug',
    truth: { kind: 'bug', bugId: 'optional-field-null', expected: 'pr', label: 'Guest checkout crashes without address' },
    make: (c) => ({
      ...base('sentry', 'P1', 'checkout-api', 'sentry:checkout-api'),
      title: "TypeError: Cannot read properties of undefined (reading 'zip')",
      description: `Unhandled exception in POST /v1/checkout. ${c.n(180, 460)} events / ${c.n(150, 400)} users in 10 min. First seen in release v2.13.0. Every event has customer.isGuest=true.`,
      logs: [json({ level: 'error', service: 'checkout-api', msg: 'checkout failed', err: "TypeError: Cannot read properties of undefined (reading 'zip')" })],
      stackTrace: [
        "TypeError: Cannot read properties of undefined (reading 'zip')",
        `    at handleCheckout (services/api/src/routes/checkout.ts:${c.line('services/api/src/routes/checkout.ts', 'address.zip')}:52)`,
        `    at async router (services/api/src/server.ts:${c.line('services/api/src/server.ts', 'return await handleCheckout')}:16)`,
        '    at async Server.<anonymous> (node:internal/http/server:112:9)',
      ].join('\n'),
      tags: { env: 'prod', service: 'checkout-api', release: 'v2.13.0', 'customer.isGuest': 'true' },
    }),
  },
  {
    id: 'checkout-5xx-rate',
    label: 'Datadog · checkout-api 5xx error rate',
    kind: 'code-bug',
    truth: { kind: 'bug', bugId: 'optional-field-null', expected: 'pr', label: 'Guest checkout crashes without address' },
    make: (c) => ({
      ...base('datadog', 'P2', 'checkout-api', 'dd:checkout-5xx'),
      title: `checkout-api 5xx error rate ${(c.n(31, 64) / 10).toFixed(1)}% (threshold 2%)`,
      description: 'Error budget burn rate 14x over 10 minutes on POST /v1/checkout. Errors are concentrated on guest checkouts.',
      logs: [
        json({ level: 'error', service: 'checkout-api', msg: 'checkout failed', err: "TypeError: Cannot read properties of undefined (reading 'zip')" }),
        `    at handleCheckout (services/api/src/routes/checkout.ts:${c.line('services/api/src/routes/checkout.ts', 'address.zip')}:52)`,
      ],
    }),
  },
  {
    id: 'stripe-429',
    label: 'Datadog · Stripe 429 rate limited (payment-worker)',
    kind: 'code-bug',
    truth: { kind: 'bug', bugId: 'retry-non-retryable', expected: 'pr', label: 'Retry storm on 4xx responses' },
    make: (c) => ({
      ...base('datadog', 'P2', 'payment-worker', 'dd:stripe-429'),
      title: `payment-worker: Stripe API 429 rate limited (${c.n(900, 1900)} req/min)`,
      description: `Outbound requests to api.stripe.com are ${(c.n(48, 71) / 10).toFixed(1)}x baseline while order volume is flat — looks like retry amplification. 429 Too Many Requests on /v1/charges.`,
      logs: [
        json({ level: 'warn', service: 'payment-worker', msg: 'retrying', err: 'HttpError: stripe /charges failed with 400', attempt: 7, max: 8 }),
        json({ level: 'warn', service: 'payment-worker', msg: 'retrying', err: 'HttpError: stripe /charges failed with 402', attempt: 5, max: 8 }),
      ],
    }),
  },
  {
    id: 'stripe-invalid-retried',
    label: 'Sentry · HttpError 400 retried 8 times (payment-worker)',
    kind: 'code-bug',
    truth: { kind: 'bug', bugId: 'retry-non-retryable', expected: 'pr', label: 'Retry storm on 4xx responses' },
    make: (c) => ({
      ...base('sentry', 'P2', 'payment-worker', 'sentry:payment-worker'),
      title: 'HttpError: stripe /charges failed with 400 (retried 8 times)',
      description: `${c.n(60, 200)} events. Invalid payment method requests are retried with backoff before failing.`,
      logs: [],
      stackTrace: [
        'HttpError: stripe /charges failed with 400',
        `    at Object.request (services/worker/src/clients/stripe.ts:${c.line('services/worker/src/clients/stripe.ts', 'throw new HttpError(res.status')}:30)`,
        `    at withRetry (services/worker/src/lib/retry.ts:${c.line('services/worker/src/lib/retry.ts', 'return await fn()')}:20)`,
        `    at chargePayment (services/worker/src/jobs/chargePayment.ts:${c.line('services/worker/src/jobs/chargePayment.ts', 'withRetry(')}:26)`,
      ].join('\n'),
    }),
  },
  {
    id: 'auth-401-spike',
    label: 'Datadog · auth-service 401 spike after deploy',
    kind: 'code-bug',
    truth: { kind: 'bug', bugId: 'time-unit-mismatch', expected: 'pr', label: 'Sessions expire immediately (v2.14.0)' },
    make: (c) => ({
      ...base('datadog', 'P1', 'auth-service', 'dd:auth-401-rate'),
      title: `auth-service 401 rate ${c.n(36, 52)}% after deploy v2.14.0`,
      description: '401 Unauthorized responses jumped from 0.3% to over 35% within 4 minutes of deploy v2.14.0. Signed-in checkout is failing; guest checkout unaffected.',
      logs: [
        json({ level: 'info', service: 'auth-service', msg: 'session expired', sub: `user_${c.n(1000, 9999)}` }),
        json({ level: 'info', service: 'auth-service', msg: 'session expired', sub: `user_${c.n(1000, 9999)}` }),
      ],
      tags: { env: 'prod', service: 'auth-service', deploy: 'v2.14.0' },
    }),
  },
  {
    id: 'login-complaints',
    label: "Zendesk · 'logged out immediately' ticket spike",
    kind: 'code-bug',
    truth: { kind: 'bug', bugId: 'time-unit-mismatch', expected: 'pr', label: 'Sessions expire immediately (v2.14.0)' },
    make: (c) => ({
      ...base('zendesk', 'P2', 'auth-service', 'zendesk:ticket-spike'),
      title: "Support: spike in 'logged out immediately' tickets",
      description: `${c.n(25, 48)} tickets in 30 minutes: customers are logged out right after login and cannot finish checkout. Session cookie looks present.`,
      logs: ['#48213 "It keeps logging me out the second I sign in"', '#48219 "Checkout says my session expired, I just logged in!"'],
    }),
  },
  {
    id: 'catalog-oom',
    label: 'Datadog · catalog-api OOMKilled',
    kind: 'code-bug',
    truth: { kind: 'bug', bugId: 'unbounded-cache', expected: 'pr', label: 'Unbounded in-memory price cache' },
    make: (c) => ({
      ...base('datadog', 'P1', 'catalog-api', 'dd:container-oom'),
      title: `catalog-api container OOMKilled on ${c.host('catalog-api')} (limit 512Mi)`,
      description: `Container restarted ${c.n(4, 9)} times in 1h. RSS grows linearly (~40MB / 10 min) after each restart until it hits the 512Mi memory limit.`,
      logs: ['FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory', json({ level: 'warn', service: 'catalog-api', msg: 'gc pause', ms: c.n(400, 900) })],
    }),
  },
  {
    id: 'catalog-memory',
    label: 'Datadog · catalog-api memory high',
    kind: 'code-bug',
    truth: { kind: 'bug', bugId: 'unbounded-cache', expected: 'pr', label: 'Unbounded in-memory price cache' },
    make: (c) => ({
      ...base('datadog', 'P2', 'catalog-api', 'dd:memory-high'),
      title: `catalog-api memory usage ${c.n(88, 97)}% on ${c.host('catalog-api')}`,
      description: 'Memory usage has not plateaued since the last restart; heap snapshots show a growing Map of price entries.',
      logs: [json({ level: 'warn', service: 'catalog-api', msg: 'heap usage high', heapUsedMb: c.n(430, 500) })],
    }),
  },
  {
    id: 'order-total-mismatch',
    label: 'Sentry · OrderTotalMismatch (payment-worker)',
    kind: 'code-bug',
    truth: { kind: 'bug', bugId: 'money-rounding', expected: 'pr', label: 'Tax truncation off by one cent' },
    make: (c) => {
      const [sub, rate] = pick(c.rng, [[1999, 0.08], [1599, 0.0825], [4599, 0.06], [1299, 0.0875]] as const);
      const charged = Math.round(sub * (1 + rate));
      const computed = Math.floor(sub * (1 + rate));
      return {
        ...base('sentry', 'P2', 'payment-worker', 'sentry:payment-worker'),
        title: `OrderTotalMismatch: computed ${computed} != charged ${charged} (order ord_${hex(c.rng, 6)})`,
        description: `Nightly reconciliation: ${c.n(120, 260)} orders off by exactly 1 cent. Finance flagged a ledger mismatch.`,
        logs: [],
        stackTrace: [
          `OrderTotalMismatch: computed ${computed} != charged ${charged}`,
          `    at reconcileOrder (services/worker/src/jobs/reconcile.ts:${c.line('services/worker/src/jobs/reconcile.ts', 'throw new OrderTotalMismatch')}:11)`,
          '    at Array.forEach (<anonymous>)',
          '    at runNightlyReconcile (node:internal/jobs:44:12)',
        ].join('\n'),
      };
    },
  },
  {
    id: 'stripe-latency',
    label: 'Datadog · Stripe latency elevated (third-party)',
    kind: 'investigation',
    truth: { kind: 'third-party', expected: 'note', label: 'Upstream Stripe degradation' },
    make: (c) => ({
      ...base('datadog', 'P3', 'payment-worker', 'dd:external-latency'),
      title: `External dependency latency: api.stripe.com p95 ${(c.n(28, 41) / 10).toFixed(1)}s`,
      description: 'p95 latency to api.stripe.com elevated in us-east-1. Error rate on our side is normal; Stripe status page shows degraded performance for the Charges API.',
      logs: [json({ level: 'info', service: 'payment-worker', msg: 'stripe call slow', ms: c.n(2600, 4200) })],
    }),
  },
  {
    id: 'stripe-status',
    label: 'PagerDuty · Stripe status page degraded (third-party)',
    kind: 'investigation',
    truth: { kind: 'third-party', expected: 'note', label: 'Upstream Stripe degradation' },
    make: () => ({
      ...base('pagerduty', 'P3', 'payment-worker', 'statuspage:stripe'),
      title: 'Statuspage: Stripe — Degraded performance (Charges API)',
      description: 'Stripe reports elevated latency for a subset of API requests in North America. Investigating.',
      logs: [],
    }),
  },
  {
    id: 'disk-usage',
    label: 'Datadog · Disk usage high on db-primary (infra)',
    kind: 'investigation',
    truth: { kind: 'infra', expected: 'note', label: 'Postgres logs not rotated' },
    make: (c) => ({
      ...base('datadog', 'P3', 'db-primary', 'dd:disk-usage'),
      title: `Disk usage ${c.n(84, 89)}% on db-primary /var/lib/postgresql`,
      description: 'Disk has grown 6% in 24h. pg_log directory is 41GB; WAL archive healthy.',
      logs: ['du -sh /var/lib/postgresql/16/main/pg_log → 41G'],
    }),
  },
  {
    id: 'tls-expiry',
    label: 'Datadog · TLS certificate expiring (infra)',
    kind: 'investigation',
    truth: { kind: 'infra', expected: 'note', label: 'ACM auto-renew blocked' },
    make: () => ({
      ...base('datadog', 'P3', 'edge', 'dd:tls-expiry'),
      title: 'TLS certificate for api.shopfast.io expires in 12 days',
      description: 'ACM certificate has not auto-renewed (renewal window opened 18 days ago). DNS validation status: pending.',
      logs: [],
    }),
  },
  {
    id: 'replication-lag',
    label: 'Datadog · Replication lag on db-replica-2 (infra)',
    kind: 'investigation',
    truth: { kind: 'infra', expected: 'escalate', label: 'Needs DBA (unclear cause)' },
    make: (c) => ({
      ...base('datadog', 'P2', 'db-replica-2', 'dd:replication-lag'),
      title: `Replication lag ${c.n(90, 150)}s on db-replica-2`,
      description: 'Intermittent lag spikes; no matching write bursts on the primary. Replica serves read traffic for order history.',
      logs: [],
    }),
  },
  {
    id: 'security-admin-login',
    label: 'PagerDuty · Suspicious admin login (security)',
    kind: 'security',
    truth: { kind: 'security', expected: 'escalate', label: 'Possible credential stuffing' },
    make: (c) => ({
      ...base('pagerduty', 'P1', 'auth-service', 'sec:admin-login'),
      title: `Suspicious admin login: new country + ${c.n(18, 31)} failed attempts`,
      description: `Admin account ops-admin@shopfast.io signed in from a new country (AS${c.n(10000, 60000)}) after a burst of failed login attempts within 3 minutes.`,
      logs: [`${c.n(18, 31)} failed attempts from 185.${c.n(1, 254)}.${c.n(1, 254)}.${c.n(1, 254)}`],
    }),
  },
  {
    id: 'synthetic-flap',
    label: 'Pingdom · checkout page check (1/3 locations, flapping)',
    kind: 'noise',
    truth: { kind: 'noise', expected: 'suppress', label: 'Probe-side network blip' },
    resolvesAfterMin: (rng) => 1.2 + rng() * 1.3,
    make: (c) => ({
      ...base('pingdom', 'P3', 'checkout-api', 'pingdom:checkout-page'),
      title: 'Synthetic check failed: storefront checkout page (1/3 locations)',
      description: `Probe from ${pick(c.rng, ['eu-west', 'ap-south', 'sa-east'])} timed out after 30s; us-east and us-west OK.`,
      logs: [],
    }),
  },
  {
    id: 'synthetic-real',
    label: 'Pingdom · checkout page check (3/3 locations)',
    kind: 'code-bug',
    truth: { kind: 'bug', bugId: 'optional-field-null', expected: 'pr', label: 'Guest checkout crashes without address' },
    make: () => ({
      ...base('pingdom', 'P2', 'checkout-api', 'pingdom:checkout-page'),
      title: 'Synthetic check failed: storefront checkout page (3/3 locations)',
      description: "Guest checkout step returns HTTP 500 from all probe locations: TypeError: Cannot read properties of undefined (reading 'zip').",
      logs: [],
    }),
  },
  {
    id: 'staging-error-rate',
    label: 'Datadog · [staging] search-api error rate (noise)',
    kind: 'noise',
    truth: { kind: 'noise', expected: 'suppress', label: 'Staging load test' },
    make: (c) => ({
      ...base('datadog', 'P3', 'search-api', 'dd:error-rate'),
      env: 'staging',
      tags: { env: 'staging', service: 'search-api' },
      title: `[staging] search-api error rate ${c.n(8, 19)}%`,
      description: 'Elevated errors in staging during the nightly load test.',
      logs: [],
    }),
  },
  {
    id: 'no-data-host',
    label: 'Datadog · No data from host (autoscaler, noise)',
    kind: 'noise',
    truth: { kind: 'noise', expected: 'suppress', label: 'Host terminated by autoscaler' },
    make: (c) => {
      const service = pick(c.rng, ['checkout-api', 'catalog-api']);
      return {
        ...base('datadog', 'P3', service, 'dd:no-data'),
        title: `No data from ${c.host(service)} for 10 minutes`,
        description: 'Host stopped reporting metrics. ASG activity: instance terminated by scale-in policy.',
        logs: [],
        tags: { env: 'prod', service, asg_event: 'terminated' },
      };
    },
  },
  {
    id: 'cpu-warn',
    label: 'Datadog · CPU warning search-api (noise)',
    kind: 'noise',
    truth: { kind: 'noise', expected: 'suppress', label: 'Traffic peak, autoscaler handles it' },
    resolvesAfterMin: (rng) => 4 + rng() * 4,
    make: (c) => ({
      ...base('datadog', 'P4', 'search-api', 'dd:cpu-warn'),
      title: `CPU ${c.n(71, 79)}% on ${c.host('search-api')} (warn > 70%)`,
      description: 'CPU above warning threshold during evening traffic peak.',
      logs: [],
    }),
  },
];

export const TEMPLATE_BY_ID: Record<string, AlertTemplate> = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));

/** One on-call shift: when each alert fires, in simulated minutes after the run starts. */
const SHIFT: [number, string][] = [
  [0.4, 'cpu-warn'],
  [1.0, 'db-pool-saturation'],
  [1.6, 'staging-error-rate'],
  [2.2, 'db-pool-timeout'],
  [2.8, 'synthetic-flap'],
  [3.4, 'db-pool-saturation'],
  [4.0, 'guest-checkout-typeerror'],
  [4.6, 'checkout-5xx-rate'],
  [5.3, 'guest-checkout-typeerror'],
  [6.0, 'no-data-host'],
  [7.0, 'disk-usage'],
  [8.0, 'stripe-429'],
  [9.0, 'stripe-invalid-retried'],
  [9.6, 'cpu-warn'],
  [10.2, 'staging-error-rate'],
  [11.0, 'synthetic-flap'],
  [12.0, 'auth-401-spike'],
  [12.7, 'login-complaints'],
  [13.4, 'auth-401-spike'],
  [14.2, 'security-admin-login'],
  [15.2, 'stripe-latency'],
  [16.0, 'stripe-status'],
  [17.0, 'catalog-oom'],
  [18.0, 'catalog-memory'],
  [19.0, 'no-data-host'],
  [20.0, 'catalog-oom'],
  [21.0, 'order-total-mismatch'],
  [22.0, 'synthetic-flap'],
  [23.0, 'tls-expiry'],
  [24.0, 'replication-lag'],
  [25.0, 'order-total-mismatch'],
  [26.0, 'cpu-warn'],
  [27.0, 'staging-error-rate'],
  [28.0, 'db-pool-saturation'],
  [29.0, 'synthetic-flap'],
  [30.0, 'disk-usage'],
  [31.0, 'stripe-429'],
  [32.0, 'guest-checkout-typeerror'],
  [33.0, 'db-pool-timeout'],
  [34.0, 'catalog-memory'],
];

export interface PlannedAlert {
  atMin: number;
  template: AlertTemplate;
  body: AlertBody;
  resolvesAfterMin?: number;
}

function ctxFor(rng: Rng): Ctx {
  return {
    rng,
    host: (service) => `${service}-${hex(rng, 5)}`,
    n: (min, max) => int(rng, min, max),
    line: lineOf,
  };
}

/** Builds a run's alert schedule. Each run is the same class of incidents with fresh details and timing. */
export function buildShift(run: number): PlannedAlert[] {
  const rng = createRng(1000 + run * 7919);
  const shift = [...SHIFT];
  // From the second shift on, the checkout bug also shows up through a real (non-flapping) synthetic failure,
  // which tests that learned "hold flapping checks" rules don't hide genuine outages.
  if (run >= 2) shift.push([5.8, 'synthetic-real']);
  return shift
    .map(([at, id]) => {
      const template = TEMPLATE_BY_ID[id];
      return {
        atMin: Math.max(0.1, at + (rng() - 0.5) * 0.5),
        template,
        body: template.make(ctxFor(rng)),
        resolvesAfterMin: template.resolvesAfterMin?.(rng),
      };
    })
    .sort((a, b) => a.atMin - b.atMin);
}

export function instantiate(templateId: string, seed: number): PlannedAlert {
  const template = TEMPLATE_BY_ID[templateId];
  const rng = createRng(seed);
  return { atMin: 0, template, body: template.make(ctxFor(rng)), resolvesAfterMin: template.resolvesAfterMin?.(rng) };
}

export const INJECTABLES: Injectable[] = TEMPLATES.filter((t) => t.id !== 'synthetic-real').map((t) => ({ id: t.id, label: t.label, kind: t.kind }));
