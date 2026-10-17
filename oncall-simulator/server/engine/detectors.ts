import type { Finding } from '../../shared/types.ts';

/**
 * Static bug-pattern detectors. Child agents run these against the files they read, the way an
 * engineer pattern-matches code against a symptom. They inspect real source text (nothing is keyed
 * on alert IDs), so they also work after code changes — e.g. a merged fix makes the finding vanish.
 */
export interface Detector {
  bugId: string;
  title: string;
  /** Words in an alert that make this class of defect a plausible root cause. */
  signals: string[];
  detect(path: string, content: string): Finding[];
  fix(content: string): string | null;
  fixSummary: string;
  regressionTest: { path: string; content: string };
}

const lines = (content: string) => content.split('\n');

function finding(d: Pick<Detector, 'bugId' | 'title' | 'signals'>, path: string, line: number, src: string[], explanation: string, confidence: number): Finding {
  const start = Math.max(0, line - 3);
  const snippet = src
    .slice(start, Math.min(src.length, line + 2))
    .map((l, i) => `${String(start + i + 1).padStart(3)} | ${l}`)
    .join('\n');
  return { bugId: d.bugId, title: d.title, file: path, line, snippet, explanation, confidence, signals: d.signals };
}

const connectionLeak: Detector = {
  bugId: 'connection-leak',
  title: 'Pooled connection is not released when the callback throws',
  signals: ['pool', 'connection', 'acquir', 'saturation', 'exhaust', 'waiting='],
  detect(path, content) {
    const src = lines(content);
    const out: Finding[] = [];
    src.forEach((l, i) => {
      const m = /const (\w+) = await (\w+)\.acquire\(\)/.exec(l);
      if (!m) return;
      const window = src.slice(i + 1, i + 8);
      const rel = window.findIndex((w) => w.includes(`${m[2]}.release(${m[1]})`));
      if (rel === -1) return;
      if (window.slice(0, rel + 1).some((w) => /finally|catch/.test(w))) return;
      out.push(
        finding(this, path, i + 2 + rel, src,
          `\`${m[2]}.release(${m[1]})\` only runs on the happy path. If the callback throws (query error, Stripe failure), the connection is never returned, so every failure permanently shrinks the pool until requests queue and time out.`,
          0.93),
      );
    });
    return out;
  },
  fix(content) {
    const re = /const (\w+) = await (\w+)\.acquire\(\);\n(\s*)const (\w+) = await (\w+)\(\1\);\n\s*\2\.release\(\1\);\n\s*return \4;/;
    if (!re.test(content)) return null;
    return content.replace(re, (_m, conn, pool, ind, _res, fn) =>
      `const ${conn} = await ${pool}.acquire();\n${ind}try {\n${ind}  return await ${fn}(${conn});\n${ind}} finally {\n${ind}  ${pool}.release(${conn});\n${ind}}`);
  },
  fixSummary: 'Wrap the callback in `try/finally` so the connection is always released, even when the callback throws.',
  regressionTest: {
    path: 'tests/regression-connection-leak.test.ts',
    content: `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConnectionPool, withConnection } from '../packages/db/src/pool.ts';
import { createMemoryDriver } from '../packages/db/src/driver.ts';

test('withConnection releases the connection when the callback throws', async () => {
  const pool = new ConnectionPool(createMemoryDriver(), { max: 1, acquireTimeoutMs: 50 });
  await assert.rejects(withConnection(pool, async () => { throw new Error('stripe /charges failed with 402'); }));
  assert.equal(pool.stats.inUse, 0, 'connection leaked after callback error');
  // The single connection must still be usable afterwards.
  await withConnection(pool, async () => 'ok');
});
`,
  },
};

const optionalFieldNull: Detector = {
  bugId: 'optional-field-null',
  title: 'Optional field dereferenced without a guard',
  signals: ['undefined', 'typeerror', 'cannot read', '5xx', 'http 500', 'reading '],
  detect(path, content) {
    const src = lines(content);
    const optional = new Set<string>();
    for (const m of content.matchAll(/^\s*(\w+)\?:/gm)) optional.add(m[1]);
    const out: Finding[] = [];
    src.forEach((l, i) => {
      for (const field of optional) {
        const m = new RegExp(`([\\w.]+)\\.${field}\\.(\\w+)`).exec(l);
        if (!m) continue;
        const prefix = `${m[1]}.${field}`;
        const guarded = src.slice(Math.max(0, i - 6), i).some((p) => p.includes(`!${prefix}`) || p.includes(`${prefix} ?`));
        if (guarded) continue;
        out.push(
          finding(this, path, i + 1, src,
            `\`${field}\` is declared optional (\`${field}?:\`) but \`${prefix}.${m[2]}\` is read without a check. Requests where \`${field}\` is absent (e.g. guest checkout) throw \`TypeError: Cannot read properties of undefined (reading '${m[2]}')\` and surface as HTTP 500s.`,
            0.9),
        );
      }
    });
    return out;
  },
  fix(content) {
    const optional = [...content.matchAll(/^\s*(\w+)\?:/gm)].map((m) => m[1]);
    for (const field of optional) {
      const re = new RegExp(`^(\\s*)(.*?)([\\w.]+)\\.${field}\\.(\\w+)`, 'm');
      const m = re.exec(content);
      if (!m) continue;
      const ind = m[1];
      const prefix = `${m[3]}.${field}`;
      const guard = `${ind}if (!${prefix}) {\n${ind}  return { status: 400, body: { error: '${field}_required' } };\n${ind}}\n`;
      return content.slice(0, m.index) + guard + content.slice(m.index);
    }
    return null;
  },
  fixSummary: 'Validate the optional field up front and return `400 address_required` instead of crashing with a 500.',
  regressionTest: {
    path: 'tests/regression-optional-field-null.test.ts',
    content: `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleCheckout, type CheckoutDeps } from '../services/api/src/routes/checkout.ts';

const deps: CheckoutDeps = {
  carts: { get: async () => [{ sku: 'sku_1', qty: 1, unitCents: 1999 }] },
  taxRateForZip: () => 0.08,
  enqueueCharge: async () => 'job_1',
};

test('guest checkout without an address is rejected with 400, not a crash', async () => {
  const res = await handleCheckout({ cartId: 'c1', paymentMethodId: 'pm_1', customer: { email: 'guest@example.com', isGuest: true } }, deps);
  assert.equal(res.status, 400);
});
`,
  },
};

const retryNonRetryable: Detector = {
  bugId: 'retry-non-retryable',
  title: 'Client errors (4xx) are treated as retryable',
  signals: ['retry', 'retried', '429', 'rate limited', 'amplification', 'failed with 400'],
  detect(path, content) {
    const src = lines(content);
    const fnLine = src.findIndex((l) => /function (isRetryable|shouldRetry)/.test(l));
    if (fnLine === -1) return [];
    const idx = src.slice(fnLine, fnLine + 8).findIndex((l) => /status >= 400/.test(l));
    if (idx === -1) return [];
    return [
      finding(this, path, fnLine + idx + 1, src,
        '`status >= 400` marks every client error (400 invalid request, 402 card declined, 404) as retryable. Each permanently-failing charge is retried up to 8 times, multiplying outbound traffic until Stripe rate-limits us with 429s.',
        0.92),
    ];
  },
  fix(content) {
    const re = /(\w+)\.status >= 400/;
    if (!re.test(content)) return null;
    return content.replace(re, '$1.status === 429 || $1.status >= 500');
  },
  fixSummary: 'Only retry 429 and 5xx responses; fail fast on other 4xx errors.',
  regressionTest: {
    path: 'tests/regression-retry-non-retryable.test.ts',
    content: `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRetryable } from '../services/worker/src/lib/retry.ts';
import { HttpError } from '../packages/shared/src/errors.ts';

test('client errors are not retried, 429 and 5xx are', () => {
  assert.equal(isRetryable(new HttpError(400, 'invalid request')), false);
  assert.equal(isRetryable(new HttpError(402, 'card declined')), false);
  assert.equal(isRetryable(new HttpError(429, 'rate limited')), true);
  assert.equal(isRetryable(new HttpError(503, 'unavailable')), true);
});
`,
  },
};

const timeUnitMismatch: Detector = {
  bugId: 'time-unit-mismatch',
  title: 'Seconds compared with milliseconds in session expiry',
  signals: ['401', 'unauthorized', 'session', 'expired', 'logged out'],
  detect(path, content) {
    if (!/seconds/i.test(content)) return [];
    const src = lines(content);
    const out: Finding[] = [];
    src.forEach((l, i) => {
      if (/\.exp\s*[<>]=?\s*(now|Date\.now\(\))\s*;/.test(l) && !l.includes('1000')) {
        out.push(
          finding(this, path, i + 1, src,
            '`exp` is a JWT NumericDate in **seconds**, but it is compared with `now` in **milliseconds**. `exp` (~1.7e9) is always smaller than `Date.now()` (~1.7e12), so every session is treated as expired immediately → 401 for every signed-in user.',
            0.95),
        );
      }
    });
    return out;
  },
  fix(content) {
    const re = /(\.exp\s*<\s*)(now|Date\.now\(\))\s*;/;
    if (!re.test(content)) return null;
    return content.replace(re, '$1Math.floor($2 / 1000);');
  },
  fixSummary: 'Convert `now` to seconds before comparing with the JWT `exp` claim.',
  regressionTest: {
    path: 'tests/regression-time-unit-mismatch.test.ts',
    content: `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isExpired, issueSession } from '../services/auth/src/session.ts';

test('a freshly issued session is not expired', () => {
  const now = Date.now();
  assert.equal(isExpired(issueSession('user_1', ['checkout'], now), now + 60_000), false);
});

test('a session is expired after its TTL', () => {
  const now = Date.now();
  assert.equal(isExpired(issueSession('user_1', ['checkout'], now), now + 13 * 3600 * 1000), true);
});
`,
  },
};

const unboundedCache: Detector = {
  bugId: 'unbounded-cache',
  title: 'Module-level cache grows without bound',
  signals: ['memory', 'oom', 'heap', 'rss'],
  detect(path, content) {
    const src = lines(content);
    const out: Finding[] = [];
    src.forEach((l, i) => {
      const m = /^const (\w+) = new Map/.exec(l);
      if (!m) return;
      const name = m[1];
      if (!content.includes(`${name}.set(`)) return;
      if (content.includes(`${name}.delete(`) || content.includes(`${name}.clear(`)) return;
      out.push(
        finding(this, path, i + 1, src,
          `\`${name}\` is a process-wide Map that is only ever written to: expired entries are skipped on read but never deleted, and there is no size cap. With per-region price keys the map grows forever until the container hits its memory limit and is OOMKilled.`,
          0.88),
      );
    });
    return out;
  },
  fix(content) {
    const m = /^const (\w+) = new Map.*$/m.exec(content);
    if (!m) return null;
    const name = m[1];
    let out = content.replace(m[0], `${m[0]}\n\nexport const MAX_ENTRIES = 10_000;`);
    out = out.replace(/^(\s*)(\w+)\.set\(/m, (_s, ind, n) =>
      `${ind}if (${n}.size >= MAX_ENTRIES) {\n${ind}  const oldest = ${n}.keys().next().value;\n${ind}  if (oldest !== undefined) ${n}.delete(oldest);\n${ind}}\n${ind}${n}.set(`);
    out = out.replace(/if \(entry\.expiresAt < now\) return undefined;/, `if (entry.expiresAt < now) {\n    ${name}.delete(key);\n    return undefined;\n  }`);
    return out === content ? null : out;
  },
  fixSummary: 'Delete expired entries on read and cap the cache at `MAX_ENTRIES` with oldest-first eviction.',
  regressionTest: {
    path: 'tests/regression-unbounded-cache.test.ts',
    content: `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cacheGet, cacheSet, cacheSize } from '../services/catalog/src/cache.ts';

test('cache size stays bounded under many distinct keys', () => {
  for (let i = 0; i < 12_000; i++) cacheSet(\`price:sku_\${i}:us\`, i);
  assert.ok(cacheSize() <= 10_000, \`cache grew to \${cacheSize()} entries\`);
});

test('expired entries are evicted on read', () => {
  cacheSet('k', 1, 10, 0);
  const before = cacheSize();
  cacheGet('k', 1000);
  assert.equal(cacheSize(), before - 1);
});
`,
  },
};

const moneyRounding: Detector = {
  bugId: 'money-rounding',
  title: 'Tax calculation truncates instead of rounding cents',
  signals: ['mismatch', 'cents', 'rounding', 'off by', 'reconcil'],
  detect(path, content) {
    if (!/cents/i.test(content)) return [];
    const src = lines(content);
    const out: Finding[] = [];
    src.forEach((l, i) => {
      if (/Math\.floor\(\w+ \* /.test(l)) {
        out.push(
          finding(this, path, i + 1, src,
            '`Math.floor` truncates fractional cents (1999 × 1.08 = 2158.92 → 2158) while the payment processor rounds half-up (2159). Orders whose tax lands on a fraction ≥ .5 are recorded one cent lower than what was charged.',
            0.9),
        );
      }
    });
    return out;
  },
  fix(content) {
    const re = /Math\.floor\((\w+ \* )/;
    if (!re.test(content)) return null;
    return content.replace(re, 'Math.round($1');
  },
  fixSummary: 'Round to the nearest cent (`Math.round`) to match the payment processor.',
  regressionTest: {
    path: 'tests/regression-money-rounding.test.ts',
    content: `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTax } from '../packages/shared/src/money.ts';

test('tax is rounded to the nearest cent like the processor', () => {
  assert.equal(applyTax(1999, 0.08), 2159);
  assert.equal(applyTax(1000, 0.0825), 1083);
});
`,
  },
};

export const DETECTORS: Detector[] = [connectionLeak, optionalFieldNull, retryNonRetryable, timeUnitMismatch, unboundedCache, moneyRounding];
export const DETECTOR_BY_ID: Record<string, Detector> = Object.fromEntries(DETECTORS.map((d) => [d.bugId, d]));

export function runDetectors(path: string, content: string): Finding[] {
  if (!path.endsWith('.ts') || path.startsWith('tests/')) return [];
  return DETECTORS.flatMap((d) => d.detect(path, content));
}

/** How strongly an alert's text supports a finding as *the* root cause (0 = unrelated). */
export function relevance(finding: Finding, alertText: string): number {
  return finding.signals.filter((s) => alertText.includes(s)).length;
}
