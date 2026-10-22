import { useMemo, useState } from 'react';
import { ChevronRight, Paperclip, Plus } from 'lucide-react';
import type { Asset } from '../../types';
import { useData } from '../../state/data';
import { toISODate } from '../../lib/dates';
import { warrantyLabel, warrantyState } from '../../lib/warranty';
import { PageHeader, SectionTitle } from '../../components/PageHeader';
import { Sheet } from '../../components/Sheet';
import { AddInfoButton, EmptyState, ErrorState, LoadingState } from '../../components/States';
import { PrimaryButton } from '../../components/Fields';
import { AssetForm, type AssetField } from './AssetForm';
import { DocumentVault } from './DocumentVault';

const WARRANTY_TONE = {
  none: 'text-muted',
  active: 'text-pine',
  expiring: 'text-ochre font-semibold',
  expired: 'text-muted',
} as const;

export function AssetsPage() {
  const { assets, load } = useData();
  const [editing, setEditing] = useState<{ asset: Asset | null; focus: AssetField } | null>(null);
  const today = toISODate(new Date());
  const sorted = useMemo(
    () => [...assets.items].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
    [assets.items],
  );

  return (
    <>
      <PageHeader
        title="Assets"
        subtitle="Appliances and systems, with the details a repair tech will ask for."
        action={
          <PrimaryButton type="button" onClick={() => setEditing({ asset: null, focus: null })} aria-label="Add an appliance">
            <Plus className="size-5" aria-hidden /> Add
          </PrimaryButton>
        }
      />

      {assets.status === 'error' ? (
        <ErrorState message={assets.error ?? 'Couldn\u2019t load appliances.'} onRetry={() => load('assets')} />
      ) : assets.status !== 'ready' ? (
        <LoadingState rows={4} label="Loading appliances" />
      ) : sorted.length === 0 ? (
        <EmptyState
          title="Start with the big three"
          body="Water heater, HVAC and refrigerator. Their model numbers and manuals are what you'll need most in a breakdown."
          action={
            <PrimaryButton type="button" onClick={() => setEditing({ asset: null, focus: null })}>
              Add an appliance
            </PrimaryButton>
          }
        />
      ) : (
        <ul className="card divide-y divide-line/80">
          {sorted.map((a) => {
            const state = warrantyState(a.warrantyExpiration, today);
            return (
              <li key={a.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setEditing({ asset: a, focus: null })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setEditing({ asset: a, focus: null });
                    }
                  }}
                  aria-label={`${a.name}, ${a.category}. Open details`}
                  className="flex cursor-pointer items-center gap-3 px-4 py-3.5 hover:bg-black/[0.02]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold tracking-wide text-muted uppercase">{a.category}</p>
                    <p className="truncate text-[1.0625rem] font-semibold">{a.name || a.category}</p>
                    <p className="flex flex-wrap items-center gap-x-2 text-sm text-ink-2">
                      {a.brand && <span>{a.brand}</span>}
                      {a.modelNumber ? (
                        <span className="tabular-nums">Model {a.modelNumber}</span>
                      ) : (
                        <AddInfoButton label={`Add model number for ${a.name}`} onClick={() => setEditing({ asset: a, focus: 'modelNumber' })} />
                      )}
                      {a.locationInHouse && <span className="text-muted">· {a.locationInHouse}</span>}
                    </p>
                    <p className={`mt-0.5 text-sm ${WARRANTY_TONE[state]}`}>{warrantyLabel(a.warrantyExpiration, today)}</p>
                  </div>
                  {a.documentIds.length > 0 && (
                    <span className="flex items-center gap-1 text-sm text-muted" aria-label={`${a.documentIds.length} files`}>
                      <Paperclip className="size-4" aria-hidden />
                      {a.documentIds.length}
                    </span>
                  )}
                  <ChevronRight className="size-5 text-line-strong" aria-hidden />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <section aria-labelledby="home-docs" className="mt-10">
        <SectionTitle>
          <span id="home-docs">Home documents</span>
        </SectionTitle>
        <p className="mb-4 text-sm text-ink-2">Insurance policy, home warranty, inspection report: files that aren&rsquo;t tied to one appliance.</p>
        <div className="card p-4">
          <DocumentVault assetId={null} defaultType="insurance" />
        </div>
      </section>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing?.asset ? editing.asset.name || 'Appliance' : 'Add appliance'}>
        {editing && <AssetForm key={editing.asset?.id ?? 'new'} asset={editing.asset} focusField={editing.focus} onDone={() => setEditing(null)} onCreated={(a) => setEditing({ asset: a, focus: null })} />}
      </Sheet>
    </>
  );
}
