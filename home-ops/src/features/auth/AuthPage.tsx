import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { canUseAppleSignIn, isDemoMode, signIn, signInWithProvider, signUp, toServiceError } from '../../services';
import { useSession } from '../../state/session';
import { PrimaryButton, TextField } from '../../components/Fields';
import { Splash } from './RequireAuth';

type Mode = 'signIn' | 'signUp';

export function AuthPage() {
  const status = useSession((s) => s.status);
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (status === 'loading') return <Splash />;
  if (status === 'signedIn') return <Navigate to={from} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Use at least 8 characters for your password.');
    setBusy(true);
    try {
      if (mode === 'signUp') {
        const res = await signUp(email, password);
        if (res.needsConfirmation) {
          setNotice('Check your email to confirm your account, then sign in.');
          setMode('signIn');
          return;
        }
      } else {
        await signIn(email, password);
      }
      navigate(from, { replace: true });
    } catch (err) {
      setError(toServiceError(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function apple() {
    setError(null);
    try {
      await signInWithProvider('apple');
    } catch (err) {
      setError(toServiceError(err).message);
    }
  }

  return (
    <main className="pt-safe mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-10">
      <div className="mt-[8vh] mb-10">
        <img src="/icons/icon-192.png" alt="" className="mb-6 size-14 rounded-2xl" />
        <h1 className="text-[2rem] leading-tight font-bold tracking-[-0.02em]">Home Ops</h1>
        <p className="mt-2 text-lg text-ink-2">Your house, kept in order. And clear steps for the day something breaks.</p>
      </div>

      <div role="tablist" aria-label="Account" className="mb-6 grid grid-cols-2 rounded-full bg-black/[0.05] p-1">
        {(['signIn', 'signUp'] as const).map((m) => (
          <button
            key={m}
            role="tab"
            type="button"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`min-h-11 rounded-full text-sm font-semibold transition-colors ${
              mode === m ? 'bg-white text-ink shadow-sm' : 'text-ink-2'
            }`}
          >
            {m === 'signIn' ? 'Sign in' : 'Create account'}
          </button>
        ))}
      </div>

      <form onSubmit={submit} noValidate className="space-y-4">
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <TextField
          label="Password"
          type="password"
          autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={mode === 'signUp' ? 'At least 8 characters.' : undefined}
          required
        />
        {error && (
          <p role="alert" className="rounded-xl bg-brick-soft px-4 py-3 text-sm text-brick">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-xl bg-pine-soft px-4 py-3 text-sm text-pine-dark">
            {notice}
          </p>
        )}
        <PrimaryButton type="submit" disabled={busy} className="w-full">
          {busy ? 'One moment…' : mode === 'signIn' ? 'Sign in' : 'Create account'}
        </PrimaryButton>
      </form>

      {canUseAppleSignIn() && (
        <button
          type="button"
          onClick={apple}
          className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-black font-semibold text-white"
        >
          <svg viewBox="0 0 24 24" className="size-5" aria-hidden fill="currentColor">
            <path d="M16.37 12.6c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.7-3.18-1.73-1.35-.14-2.64.8-3.33.8-.69 0-1.74-.78-2.87-.76-1.47.02-2.83.86-3.59 2.18-1.53 2.66-.39 6.59 1.1 8.75.73 1.05 1.6 2.24 2.73 2.2 1.1-.05 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.07 2.65-2.13.84-1.22 1.18-2.4 1.2-2.46-.03-.01-2.3-.88-2.32-3.5ZM14.2 6.13c.6-.73 1.01-1.75.9-2.76-.87.04-1.92.58-2.54 1.31-.56.65-1.05 1.68-.92 2.68.97.07 1.96-.5 2.56-1.23Z" />
          </svg>
          Sign in with Apple
        </button>
      )}

      {isDemoMode() && (
        <p className="mt-8 rounded-2xl border border-line bg-card px-4 py-3 text-sm text-ink-2">
          <strong className="font-semibold text-ink">Demo Mode.</strong> No Supabase project is connected, so your account and
          data stay in this browser. Create any account to try it.
        </p>
      )}
    </main>
  );
}
