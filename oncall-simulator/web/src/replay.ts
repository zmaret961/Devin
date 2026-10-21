// Browser-only stand-in for the engine API: plays back a recording of real engine runs.
import { applyFrame, type Recording } from '../../shared/recording.ts';
import type { Snapshot } from '../../shared/types.ts';

const LIVE_ONLY = 'only works in the live version. This online copy replays a recorded run of the engine; run it on your computer (npm run demo) for the live version.';

export class Player {
  private seg = -1;
  private idx = 0;
  private simT = 0;
  private playing = false;
  private speed = 60;
  private state: Snapshot;
  constructor(private rec: Recording) {
    this.state = rec.initial;
  }

  tick(dtMs: number) {
    if (!this.playing || this.seg < 0) return;
    const frames = this.rec.segments[this.seg].frames;
    this.simT += dtMs * this.speed;
    while (this.idx < frames.length && frames[this.idx].t <= this.simT) this.state = applyFrame(this.state, frames[this.idx++]);
    if (this.idx >= frames.length) this.playing = false;
  }

  snapshot(): Snapshot {
    const s = this.state;
    const seg = this.rec.segments[this.seg];
    const status = (s.run.status === 'running' || s.run.status === 'draining') && !this.playing ? 'paused' : s.run.status;
    return {
      ...s,
      now: seg ? seg.startNow + Math.min(this.simT, seg.frames.at(-1)?.t ?? 0) : s.now,
      clock: { running: this.playing, speed: this.speed },
      run: { ...s.run, status },
    };
  }

  playbookMarkdown(version: number) {
    return this.rec.playbooks[version] ?? 'not found';
  }

  private startNext() {
    if (this.seg + 1 >= this.rec.segments.length) {
      window.alert(`This online replay includes ${this.rec.segments.length} recorded shifts. Press Reset to watch it again from playbook v1.`);
      return;
    }
    this.seg++;
    this.idx = 0;
    this.simT = 0;
    this.playing = true;
    this.tick(0);
  }

  private finishSegment() {
    const frames = this.rec.segments[this.seg].frames;
    while (this.idx < frames.length) this.state = applyFrame(this.state, frames[this.idx++]);
    this.simT = frames.at(-1)?.t ?? 0;
    this.playing = false;
  }

  control(body: Record<string, unknown>) {
    const atSegmentEnd = this.seg < 0 || this.idx >= this.rec.segments[this.seg].frames.length;
    switch (body.action) {
      case 'start':
        if (atSegmentEnd) this.startNext();
        else this.playing = true;
        break;
      case 'pause':
        this.playing = false;
        break;
      case 'replay':
        if (this.seg >= 0) this.finishSegment();
        this.startNext();
        break;
      case 'speed':
        this.speed = Number(body.speed) || 60;
        break;
      case 'reset':
        this.seg = -1;
        this.idx = 0;
        this.simT = 0;
        this.playing = false;
        this.state = this.rec.initial;
        break;
      case 'inject':
        window.alert(`Injecting alerts ${LIVE_ONLY}`);
        break;
      case 'merge':
        window.alert(`Merging PRs ${LIVE_ONLY}`);
        break;
      default:
        window.alert(`This control ${LIVE_ONLY}`);
    }
    return { ok: true };
  }
}

let player: Promise<Player> | undefined;
export function getPlayer() {
  player ??= fetch('/recording.json').then(async (r) => {
    if (!r.ok) throw new Error(`recording.json returned ${r.status}`);
    return new Player((await r.json()) as Recording);
  });
  player.catch(() => (player = undefined));
  return player;
}
