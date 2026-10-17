/**
 * Simulated clock. Agents "spend" simulated minutes on each tool call so the demo can compress a
 * realistic on-call shift (hours of human work) into a couple of minutes of wall-clock time.
 */
export class SimClock {
  private sim: number;
  private lastReal = 0;
  private timers: { at: number; resolve: () => void }[] = [];
  private listeners: ((now: number) => void)[] = [];
  private interval: NodeJS.Timeout;
  running = false;
  /** Simulated milliseconds per real millisecond (60 → one real second is one simulated minute). */
  speed: number;

  constructor(epoch: number, speed = 60) {
    this.sim = epoch;
    this.speed = speed;
    this.interval = setInterval(() => this.tick(), 40);
  }

  now(): number {
    return this.sim;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastReal = performance.now();
  }

  pause(): void {
    this.tick();
    this.running = false;
  }

  reset(epoch: number): void {
    this.sim = epoch;
    for (const t of this.timers) t.resolve();
    this.timers = [];
  }

  onTick(fn: (now: number) => void): void {
    this.listeners.push(fn);
  }

  sleep(simMs: number): Promise<void> {
    return new Promise((resolve) => {
      this.timers.push({ at: this.sim + simMs, resolve });
    });
  }

  dispose(): void {
    clearInterval(this.interval);
  }

  private tick(): void {
    if (!this.running) return;
    const real = performance.now();
    this.sim += (real - this.lastReal) * this.speed;
    this.lastReal = real;
    const due = this.timers.filter((t) => t.at <= this.sim);
    if (due.length) {
      this.timers = this.timers.filter((t) => t.at > this.sim);
      for (const t of due) t.resolve();
    }
    for (const l of this.listeners) l(this.sim);
  }
}

export const MIN = 60_000;
