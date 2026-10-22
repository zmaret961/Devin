import { AnimatePresence, m } from 'framer-motion';
import { useSettings } from '../../state/settings';
import { PageHeader } from '../../components/PageHeader';
import { ContactsLedger } from './ContactsLedger';
import { TriageTree } from './TriageTree';

function EmergencySwitch() {
  const { emergencyMode, setEmergencyMode } = useSettings();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={emergencyMode}
      onClick={() => setEmergencyMode(!emergencyMode)}
      className={`interactive flex w-full items-center gap-4 rounded-[1.25rem] p-5 text-left ${
        emergencyMode ? 'bg-siren-deep text-white' : 'border-2 border-siren-deep bg-card'
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className={`block text-xl font-bold ${emergencyMode ? '' : 'text-siren-deep'}`}>Emergency Mode</span>
        <span className={`block text-sm ${emergencyMode ? 'text-white/85' : 'text-ink-2'}`}>
          {emergencyMode ? 'On. Tap to return to normal.' : 'Turn on for big, high-contrast, step-by-step help.'}
        </span>
      </span>
      <span
        aria-hidden
        className={`relative h-9 w-16 shrink-0 rounded-full transition-colors ${emergencyMode ? 'bg-white/30' : 'bg-line-strong'}`}
      >
        <m.span
          className="absolute top-1 left-1 size-7 rounded-full bg-white shadow"
          animate={{ x: emergencyMode ? 28 : 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        />
      </span>
    </button>
  );
}

export function EmergencyPage() {
  const emergencyMode = useSettings((s) => s.emergencyMode);
  return (
    <AnimatePresence mode="wait" initial={false}>
      {emergencyMode ? (
        <m.div key="on" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          <header className="mb-5 flex items-center gap-3">
            <span className="relative flex size-3" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-siren opacity-75" />
              <span className="relative inline-flex size-3 rounded-full bg-siren" />
            </span>
            <h1 className="text-sm font-bold tracking-[0.14em] text-signal uppercase">Emergency Mode</h1>
          </header>
          <div className="mb-8">
            <EmergencySwitch />
          </div>
          <TriageTree />
        </m.div>
      ) : (
        <m.div key="off" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          <PageHeader title="Emergency" subtitle="Get ready now, so you know exactly what to do if it happens." />
          <div className="mb-9">
            <EmergencySwitch />
          </div>
          <ContactsLedger />
          <p className="mt-6 text-sm text-muted">
            Fill in these numbers while things are calm. In Emergency Mode, the right ones appear next to each guide with a one-tap Call
            button.
          </p>
        </m.div>
      )}
    </AnimatePresence>
  );
}
