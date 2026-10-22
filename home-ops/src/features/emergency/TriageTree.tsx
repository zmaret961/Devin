import { useState } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { ArrowLeft, Check, CloudLightning, Droplets, Flame, Phone, ZapOff, type LucideIcon } from 'lucide-react';
import { DISASTERS, TRIAGE, type Disaster, type TriageGuide } from '../../data/triage';
import { ContactsLedger } from './ContactsLedger';

const ICONS: Record<Disaster['id'], LucideIcon> = { water: Droplets, gas: Flame, power: ZapOff, storm: CloudLightning };

/** Disaster picker -> yes/no questions -> numbered guide with the relevant contacts beside it. */
export function TriageTree() {
  const [path, setPath] = useState<string[]>([]);
  const currentId = path[path.length - 1];
  const node = currentId ? TRIAGE[currentId] : null;
  const disaster = path.length ? DISASTERS.find((d) => d.root === path[0]) : null;

  const go = (id: string) => setPath((p) => [...p, id]);
  const back = () => setPath((p) => p.slice(0, -1));

  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.div
        key={currentId ?? 'pick'}
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -24 }}
        transition={{ duration: 0.2 }}
      >
        {!node ? (
          <>
            <h2 className="mb-4 text-2xl font-bold text-white">What&rsquo;s happening?</h2>
            <ul className="grid grid-cols-2 gap-3">
              {DISASTERS.map((d) => {
                const Icon = ICONS[d.id];
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => go(d.root)}
                      className="interactive flex h-full min-h-36 w-full flex-col justify-between rounded-[1.25rem] border-2 border-signal/70 bg-night-2 p-4 text-left hover:bg-night-3"
                    >
                      <Icon className="size-8 text-signal" strokeWidth={2} aria-hidden />
                      <span>
                        <span className="block text-lg leading-snug font-bold text-white">{d.title}</span>
                        <span className="mt-1 block text-sm text-stone-300">{d.summary}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={back}
              className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-full pr-3 font-semibold text-signal"
            >
              <ArrowLeft className="size-5" aria-hidden /> {path.length === 1 ? 'All emergencies' : 'Back'}
            </button>
            <p className="text-sm font-semibold tracking-wide text-stone-400 uppercase">{disaster?.title}</p>
            {node.kind === 'question' ? (
              <div>
                <h2 className="mt-1 text-2xl leading-snug font-bold text-white">{node.prompt}</h2>
                {node.help && <p className="mt-2 text-stone-300">{node.help}</p>}
                <div className="mt-6 space-y-3">
                  {node.options.map((o) => (
                    <button
                      key={o.next}
                      type="button"
                      onClick={() => go(o.next)}
                      className="interactive flex min-h-16 w-full items-center rounded-2xl border-2 border-stone-600 bg-night-2 px-5 text-left text-lg font-semibold text-white hover:border-signal"
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <Guide guide={node} />
            )}
          </>
        )}
      </m.div>
    </AnimatePresence>
  );
}

function Guide({ guide }: { guide: TriageGuide }) {
  const [done, setDone] = useState<Set<number>>(new Set());
  const toggle = (i: number) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  const lifeSafety = guide.urgency === 'life-safety';

  return (
    <div className="lg:grid lg:grid-cols-[1fr_20rem] lg:gap-8">
      <div>
        <h2 className="mt-1 text-[1.75rem] leading-tight font-bold text-white">{guide.title}</h2>
        {guide.callout && (
          <p role="alert" className="mt-4 rounded-2xl bg-siren-deep px-4 py-3 text-lg leading-snug font-bold text-white">
            {guide.callout}
          </p>
        )}
        {lifeSafety && (
          <a
            href="tel:911"
            className="interactive mt-3 flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 border-siren text-lg font-bold text-siren"
          >
            <Phone className="size-5" aria-hidden /> Call 911
          </a>
        )}
        <ol className="mt-6 space-y-3" aria-label="Steps">
          {guide.steps.map((step, i) => {
            const checked = done.has(i);
            return (
              <li key={step.title}>
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  aria-pressed={checked}
                  className={`flex w-full gap-4 rounded-2xl p-4 text-left transition-colors ${
                    checked ? 'bg-night-2/60' : 'bg-night-2'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`grid size-10 shrink-0 place-items-center rounded-full text-lg font-bold tabular-nums ${
                      checked ? 'bg-stone-600 text-stone-300' : 'bg-signal text-night'
                    }`}
                  >
                    {checked ? <Check className="size-5" strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-lg leading-snug font-bold ${checked ? 'text-stone-400 line-through' : 'text-white'}`}>
                      {step.title}
                    </span>
                    {step.detail && (
                      <span className={`mt-1 block leading-relaxed ${checked ? 'text-stone-500' : 'text-stone-300'}`}>{step.detail}</span>
                    )}
                    <span className="sr-only">{checked ? ' (done)' : ''}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-sm text-stone-400">Tap a step to check it off. This is general guidance, not a substitute for 911 or a licensed professional.</p>
      </div>
      <aside className="mt-8 lg:mt-14">
        <ContactsLedger loud only={guide.contacts} title="Who to call" />
      </aside>
    </div>
  );
}
