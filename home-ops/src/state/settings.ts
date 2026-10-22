import { create } from 'zustand';

const KEY = 'homeops:settings';

interface Persisted {
  /** null = follow the OS "Reduce motion" setting. */
  reducedMotionOverride: boolean | null;
}

const prefersReduced = () =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

function load(): Persisted {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Persisted>;
    return { reducedMotionOverride: typeof raw.reducedMotionOverride === 'boolean' ? raw.reducedMotionOverride : null };
  } catch {
    return { reducedMotionOverride: null };
  }
}

function persist(p: Persisted) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Settings are a nicety; private browsing can block storage.
  }
}

interface SettingsState extends Persisted {
  systemReducedMotion: boolean;
  /** Effective value: user override, else the OS setting. */
  reducedMotion: boolean;
  emergencyMode: boolean;
  setReducedMotionOverride(value: boolean | null): void;
  setEmergencyMode(on: boolean): void;
}

const initial = load();
const system = prefersReduced();

export const useSettings = create<SettingsState>((set, get) => ({
  ...initial,
  systemReducedMotion: system,
  reducedMotion: initial.reducedMotionOverride ?? system,
  emergencyMode: false,
  setReducedMotionOverride(value) {
    persist({ reducedMotionOverride: value });
    set({ reducedMotionOverride: value, reducedMotion: value ?? get().systemReducedMotion });
  },
  setEmergencyMode(on) {
    set({ emergencyMode: on });
  },
}));

if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', (e) => {
    const { reducedMotionOverride } = useSettings.getState();
    useSettings.setState({ systemReducedMotion: e.matches, reducedMotion: reducedMotionOverride ?? e.matches });
  });
}
