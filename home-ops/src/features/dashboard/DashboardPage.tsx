import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChevronRight, Settings2, Siren } from 'lucide-react';
import { useData } from '../../state/data';
import { useSettings } from '../../state/settings';
import { computeHealth, sortTasksChronologically } from '../../lib/health';
import { relativeDue, toISODate } from '../../lib/dates';
import { warrantyState } from '../../lib/warranty';
import { AddInfoButton, EmptyState, ErrorState, LoadingState } from '../../components/States';
import { SectionTitle } from '../../components/PageHeader';
import { HealthRing } from './HealthRing';
import { HomeSettingsSheet } from './HomeSettingsSheet';
import { TaskCheck } from '../maintenance/TaskCheck';

const dateLine = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

export function DashboardPage() {
  const { tasks, assets, properties, load } = useData();
  const setEmergencyMode = useSettings((s) => s.setEmergencyMode);
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const today = toISODate(new Date());
  const property = properties.items[0] ?? null;

  const health = useMemo(() => computeHealth(tasks.items, today), [tasks.items, today]);
  const upcoming = useMemo(
    () => sortTasksChronologically(tasks.items.filter((t) => t.status !== 'complete')).slice(0, 4),
    [tasks.items],
  );
  const assetStats = useMemo(() => {
    const list = assets.items;
    return {
      total: list.length,
      covered: list.filter((a) => ['active', 'expiring'].includes(warrantyState(a.warrantyExpiration, today))).length,
      expiring: list.filter((a) => warrantyState(a.warrantyExpiration, today) === 'expiring').length,
      missing: list.filter((a) => !a.modelNumber.trim()).length,
    };
  }, [assets.items, today]);

  return (
    <>
      <header className="mb-7 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted">{dateLine.format(new Date())}</p>
          <h1 className="truncate text-[2rem] leading-tight font-bold tracking-[-0.02em]">{property?.nickname || 'My home'}</h1>
          {properties.status === 'ready' &&
            (property?.address ? (
              <p className="truncate text-ink-2">
                {property.address}
                {property.zipCode ? `, ${property.zipCode}` : ''}
                {property.yearBuilt ? ` · Built ${property.yearBuilt}` : ''}
              </p>
            ) : (
              <AddInfoButton label="Add your home address" onClick={() => setSettingsOpen(true)} />
            ))}
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Home details and settings"
          className="interactive grid size-11 shrink-0 place-items-center rounded-full border border-line bg-card text-ink-2"
        >
          <Settings2 className="size-5" aria-hidden />
        </button>
      </header>

      {/* Health score */}
      <section aria-labelledby="health-title" className="card mb-4 p-5">
        {tasks.status === 'error' ? (
          <ErrorState message={tasks.error ?? 'Couldn\u2019t load your tasks.'} onRetry={() => load('tasks')} />
        ) : tasks.status !== 'ready' ? (
          <div className="flex items-center gap-5" role="status">
            <div className="skeleton size-28 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-4 w-24" />
              <div className="skeleton h-10 w-20" />
              <span className="sr-only">Loading health score…</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-5">
            <div className="shrink-0">
              <HealthRing score={health.score} size={104} />
            </div>
            <div className="min-w-0">
              <h2 id="health-title" className="text-sm font-medium text-muted">
                Maintenance Health Score
              </h2>
              <p className="text-[3rem] leading-none font-bold tracking-[-0.03em] tabular-nums">
                {health.score}
                <span className="ml-1 text-lg font-semibold text-muted">/100</span>
              </p>
              <p className={`mt-2 text-sm font-semibold ${health.score >= 70 ? 'text-pine' : health.score >= 40 ? 'text-ochre' : 'text-brick'}`}>
                {health.label}
              </p>
              <p className="text-sm text-ink-2">
                {health.dueOrComplete === 0
                  ? 'Nothing is due yet.'
                  : `${health.complete} of ${health.dueOrComplete} due tasks done`}
                {health.overdue > 0 && <span className="font-semibold text-brick"> · {health.overdue} overdue</span>}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Emergency entry */}
      <button
        type="button"
        onClick={() => {
          setEmergencyMode(true);
          navigate('/emergency');
        }}
        className="interactive mb-9 flex w-full items-center gap-4 rounded-[1.25rem] bg-night p-5 text-left text-white"
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-siren-deep">
          <Siren className="size-6" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-bold">Emergency Mode</span>
          <span className="block text-sm text-stone-300">Leak, gas smell, outage or storm? Get step-by-step help.</span>
        </span>
        <ChevronRight className="size-5 text-signal" aria-hidden />
      </button>

      {/* Upcoming */}
      <section aria-labelledby="upcoming-title" className="mb-9">
        <SectionTitle
          action={
            <Link to="/maintenance" className="text-sm font-semibold text-pine">
              See all
            </Link>
          }
        >
          <span id="upcoming-title">Coming up</span>
        </SectionTitle>
        {tasks.status === 'error' ? null : tasks.status !== 'ready' ? (
          <LoadingState rows={3} label="Loading tasks" />
        ) : upcoming.length === 0 ? (
          <EmptyState title="You're all caught up" body="Every task on your checklist is done." />
        ) : (
          <ul className="card divide-y divide-line/80">
            {upcoming.map((t) => {
              const overdue = t.dueDate < today;
              return (
                <li key={t.id} className="flex items-center gap-2 py-1.5 pr-4 pl-2">
                  <TaskCheck task={t} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{t.title}</p>
                    <p className={`text-sm ${overdue ? 'font-medium text-brick' : 'text-muted'}`}>
                      {relativeDue(t.dueDate, today)} · {t.season}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Appliances */}
      <section aria-labelledby="assets-title">
        <SectionTitle
          action={
            <Link to="/assets" className="text-sm font-semibold text-pine">
              Manage
            </Link>
          }
        >
          <span id="assets-title">Appliances</span>
        </SectionTitle>
        {assets.status === 'error' ? (
          <ErrorState message={assets.error ?? 'Couldn\u2019t load appliances.'} onRetry={() => load('assets')} />
        ) : assets.status !== 'ready' ? (
          <LoadingState rows={1} label="Loading appliances" />
        ) : assetStats.total === 0 ? (
          <EmptyState
            title="No appliances yet"
            body="Add your water heater, HVAC and fridge so model numbers and manuals are ready when you need a repair."
            action={
              <Link to="/assets" className="inline-flex min-h-11 items-center rounded-full bg-pine px-5 font-semibold text-white">
                Add an appliance
              </Link>
            }
          />
        ) : (
          <Link to="/assets" className="card interactive grid grid-cols-3 divide-x divide-line/80 py-4 text-center">
            <Stat value={assetStats.total} label="Registered" />
            <Stat value={assetStats.covered} label="Under warranty" note={assetStats.expiring ? `${assetStats.expiring} ending soon` : undefined} />
            <Stat value={assetStats.missing} label="Missing model #" tone={assetStats.missing ? 'warn' : undefined} />
          </Link>
        )}
      </section>

      <HomeSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} property={property} />
    </>
  );
}

function Stat({ value, label, note, tone }: { value: number; label: string; note?: string; tone?: 'warn' }) {
  return (
    <div className="px-2">
      <p className={`text-[1.75rem] leading-tight font-bold tabular-nums ${tone === 'warn' ? 'text-ochre' : ''}`}>{value}</p>
      <p className="text-xs font-medium text-muted">{label}</p>
      {note && <p className="mt-0.5 text-xs font-semibold text-ochre">{note}</p>}
    </div>
  );
}
