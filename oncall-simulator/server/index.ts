import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { Engine } from './engine/engine.ts';
import { PLAYBOOK_DIR, WEB_DIST } from './engine/paths.ts';

const PORT = Number(process.env.PORT ?? 4100);
const engine = new Engine({ speed: Number(process.env.SPEED ?? 60) });

const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon' };

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size <= 1_000_000) chunks.push(c as Buffer);
  }
  if (size > 1_000_000) throw new Error('request body too large');
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

async function control(body: any) {
  switch (body.action) {
    case 'start':
      if (!engine.orch || ['complete', 'learned', 'learning'].includes(engine.runStatus)) await engine.startRun();
      else engine.resume();
      return { ok: true };
    case 'pause':
      engine.pause();
      return { ok: true };
    case 'replay':
      await engine.startRun();
      return { ok: true };
    case 'inject':
      return { ok: true, alertId: engine.inject(body.templateId, body.custom) };
    case 'speed':
      engine.setSpeed(Number(body.speed));
      return { ok: true };
    case 'retro':
      return { ok: true, report: engine.learn() };
    case 'merge':
      await engine.merge(Number(body.prId));
      return { ok: true };
    case 'config':
      if (body.maxParallel) engine.config.maxParallel = Math.max(1, Math.min(12, Number(body.maxParallel)));
      if (typeof body.autoLearn === 'boolean') engine.config.autoLearn = body.autoLearn;
      return { ok: true };
    case 'reset':
      await engine.reset();
      return { ok: true };
    default:
      throw new Error(`Unknown action ${body.action}`);
  }
}

function serveStatic(req: IncomingMessage, res: ServerResponse) {
  if (!existsSync(WEB_DIST)) {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<h1>Dashboard not built</h1><p>Run <code>npm run demo</code> (builds the UI and starts the engine) or <code>npm run dev</code>.</p>');
    return;
  }
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = normalize(join(WEB_DIST, url));
  if (!file.startsWith(WEB_DIST + sep) || !existsSync(file) || statSync(file).isDirectory()) file = join(WEB_DIST, 'index.html');
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}

const server = createServer(async (req, res) => {
  try {
    if (req.url?.startsWith('/api/state')) return send(res, 200, engine.snapshot());
    if (req.url?.startsWith('/api/control') && req.method === 'POST') return send(res, 200, await control(await readBody(req)));
    if (req.url?.startsWith('/api/playbook.md')) {
      res.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8' });
      return res.end(engine.snapshot().playbookMarkdown);
    }
    const pv = /^\/api\/playbook\/v(\d+)\.md/.exec(req.url ?? '');
    if (pv) {
      const f = join(PLAYBOOK_DIR, `v${Number(pv[1])}.md`);
      res.writeHead(existsSync(f) ? 200 : 404, { 'content-type': 'text/markdown; charset=utf-8' });
      return res.end(existsSync(f) ? readFileSync(f) : 'not found');
    }
    if (req.url?.startsWith('/api/scratchpad.md')) {
      res.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8' });
      return res.end(engine.scratchpadMarkdown());
    }
    if (req.url?.startsWith('/api/')) return send(res, 404, { error: 'not found' });
    serveStatic(req, res);
  } catch (err) {
    console.error(`  ${req.method} ${req.url} failed: ${(err as Error).message}`);
    send(res, 400, { error: (err as Error).message });
  }
});

server.listen(PORT, () => {
  console.log(`\n  \x1b[35mDevin Oncall Simulator\x1b[0m engine listening on \x1b[36mhttp://localhost:${PORT}\x1b[0m`);
  console.log(`  Playbook v${engine.playbook.version} loaded. Press Start in the dashboard to begin a shift.\n`);
});

const stop = async () => {
  await engine.shutdown();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
