import { AnimatePresence, m } from 'framer-motion';
import { useToasts } from '../state/toasts';

export function Toasts() {
  const { toasts, dismiss } = useToasts();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+6rem)] z-50 flex flex-col items-center gap-2 px-4"
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <m.button
            key={t.id}
            type="button"
            onClick={() => dismiss(t.id)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className={`pointer-events-auto max-w-md rounded-2xl px-4 py-3 text-left text-sm font-medium shadow-lg ${
              t.tone === 'error' ? 'bg-brick text-white' : 'bg-ink text-white'
            }`}
          >
            {t.message}
          </m.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
