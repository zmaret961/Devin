import { useState, type FormEvent } from 'react';
import { ASSET_CATEGORIES, type Asset, type AssetCategory } from '../../types';
import { useData } from '../../state/data';
import { toServiceError } from '../../services';
import { PrimaryButton, SecondaryButton, SelectField, TextAreaField, TextField } from '../../components/Fields';
import { DocumentVault } from './DocumentVault';

export type AssetField = 'modelNumber' | null;

export function AssetForm({
  asset,
  focusField,
  onDone,
  onCreated,
}: {
  asset: Asset | null;
  focusField: AssetField;
  onDone: () => void;
  /** New asset saved: keep the sheet open on it so manuals can be attached right away. */
  onCreated: (asset: Asset) => void;
}) {
  const { saveAsset, removeAsset, properties } = useData();
  const current = asset;
  const [form, setForm] = useState({
    name: asset?.name ?? '',
    category: (asset?.category ?? 'HVAC') as AssetCategory,
    brand: asset?.brand ?? '',
    modelNumber: asset?.modelNumber ?? '',
    serialNumber: asset?.serialNumber ?? '',
    locationInHouse: asset?.locationInHouse ?? '',
    installDate: asset?.installDate ?? '',
    warrantyExpiration: asset?.warrantyExpiration ?? '',
    notes: asset?.notes ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (form.installDate && form.installDate > new Date().toISOString().slice(0, 10)) next.installDate = 'Install date can\u2019t be in the future.';
    if (form.installDate && form.warrantyExpiration && form.warrantyExpiration < form.installDate)
      next.warrantyExpiration = 'Warranty should end after the install date.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    setFormError(null);
    try {
      const saved = await saveAsset({
        id: current?.id,
        propertyId: current?.propertyId ?? properties.items[0]?.id ?? null,
        ...form,
        name: form.name.trim() || [form.brand.trim(), form.category].filter(Boolean).join(' '),
        installDate: form.installDate || null,
        warrantyExpiration: form.warrantyExpiration || null,
      });
      if (current) onDone();
      else onCreated(saved);
    } catch (err) {
      setFormError(toServiceError(err).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <SelectField label="Category" value={form.category} onChange={set('category')}>
          {ASSET_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </SelectField>
        <TextField label="Name" value={form.name} onChange={set('name')} placeholder="e.g. Basement water heater" hint="Optional. We'll use brand and category if blank." />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Brand" value={form.brand} onChange={set('brand')} placeholder="Rheem" />
          <TextField
            label="Model number"
            value={form.modelNumber}
            onChange={set('modelNumber')}
            autoFocus={focusField === 'modelNumber'}
            placeholder="On the rating plate"
          />
        </div>
        <TextField label="Serial number" value={form.serialNumber} onChange={set('serialNumber')} />
        <TextField label="Location in house" value={form.locationInHouse} onChange={set('locationInHouse')} placeholder="Basement, utility closet…" />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Install date" type="date" value={form.installDate} onChange={set('installDate')} error={errors.installDate} />
          <TextField label="Warranty ends" type="date" value={form.warrantyExpiration} onChange={set('warrantyExpiration')} error={errors.warrantyExpiration} />
        </div>
        <TextAreaField label="Notes" value={form.notes} onChange={set('notes')} placeholder="Filter size, last service, installer…" />
        {formError && (
          <p role="alert" className="rounded-xl bg-brick-soft px-4 py-3 text-sm text-brick">
            {formError}
          </p>
        )}
        <div className="flex gap-3">
          <PrimaryButton type="submit" disabled={busy} className="flex-1">
            {busy ? 'Saving…' : current ? 'Save changes' : 'Save appliance'}
          </PrimaryButton>
          {current && (
            <SecondaryButton
              type="button"
              className="text-brick"
              onClick={async () => {
                if (!window.confirm(`Delete ${current.name} and its files?`)) return;
                await removeAsset(current.id).then(onDone, () => undefined);
              }}
            >
              Delete
            </SecondaryButton>
          )}
        </div>
      </form>

      <section aria-labelledby="vault-title" className="border-t border-line pt-6">
        <h3 id="vault-title" className="mb-3 text-[0.8125rem] font-semibold tracking-[0.06em] text-muted uppercase">
          Manuals & documents
        </h3>
        {current ? (
          <DocumentVault assetId={current.id} />
        ) : (
          <p className="text-sm text-muted">Save the appliance first, then attach its manual, warranty or receipt.</p>
        )}
      </section>
    </div>
  );
}
