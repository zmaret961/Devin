import { create } from 'zustand';
import type { User } from '../types';
import { getSession, onAuthChange } from '../services';

type Status = 'loading' | 'signedIn' | 'signedOut' | 'error';

interface SessionState {
  status: Status;
  user: User | null;
  error: string | null;
  init(): () => void;
}

export const useSession = create<SessionState>((set) => ({
  status: 'loading',
  user: null,
  error: null,
  init() {
    let active = true;
    getSession()
      .then((s) => active && set({ status: s ? 'signedIn' : 'signedOut', user: s?.user ?? null, error: null }))
      .catch((err: Error) => active && set({ status: 'error', user: null, error: err.message }));
    const unsubscribe = onAuthChange((s) => set({ status: s ? 'signedIn' : 'signedOut', user: s?.user ?? null, error: null }));
    return () => {
      active = false;
      unsubscribe();
    };
  },
}));
