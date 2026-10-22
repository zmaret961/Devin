import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import type { Property } from '../../types';
import { Sheet } from '../../components/Sheet';
import { PrimaryButton, SecondaryButton, SelectField, TextField } from '../../components/Fields';
import { useData } from '../../state/data';
import { useSettings } from '../../state/settings';
import { useSession } from '../../state/session';
import { signOut, toServiceError } from '../../services';

export function HomeSettingsSheet({ open, onClose, property }: { open: boolean; onClose: () => void; property: Property | null }) {
  return (
    <Sheet open={open} onClose={onClose} title="Home & settings">
      {open && <Body onClose={onClose} property={property} />}
    </Sheet>
  );
}

function Body({ onClose, property }: { onClose: () => void; property: Property | null }) {
  const saveProperty = useData((s) => s.saveProperty);
  const email = useSession((s) => s.user?.email);
  const { reducedMotionOverride, systemReducedMotion, setReducedMotionOverride } = useSettings();
  const navigate = useNavigate();
  const [nickname, setNickname] = useState(property?.nickname ?? 'My home');
  const [address, setAddress] = useState(property?.address ?? '');
  const [zipCode, setZip] = useState(property?.zipCode ?? '');
  const [yearBuilt, setYear] = useState(property?.yearBuilt ? String(property.yearBuilt) : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (zipCode && !/^\d{5}(-\d{4})?$/.test(zipCode.trim())) return setError('Enter a 5-digit ZIP code.');
    const year = yearBuilt ? Number(yearBuilt) : null;
    if (year !== null && (!Number.isInteger(year) || year < 1600 || year > new Date().getFullYear() + 2)) {
      return setError('Enter a 4-digit year, like 1987.');
    }
    setBusy(true);
    setError(null);
    try {
      await saveProperty({ id: property?.id, nickname, address, zipCode: zipCode.trim(), yearBuilt: year });
      onClose();
    } catch (err) {
      setError(toServiceError(err).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <TextField label="Name for this home" value={nickname} onChange={(e) => setNickname(e.target.value)} />
        <TextField label="Street address" autoComplete="street-address" value={address} onChange={(e) => setAddress(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="ZIP code" inputMode="numeric" autoComplete="postal-code" value={zipCode} onChange={(e) => setZip(e.target.value)} />
          <TextField label="Year built" inputMode="numeric" value={yearBuilt} onChange={(e) => setYear(e.target.value)} />
        </div>
        {error && (
          <p role="alert" className="text-sm text-brick">
            {error}
          </p>
        )}
        <PrimaryButton type="submit" disabled={busy} className="w-full">
          {busy ? 'Saving…' : 'Save home details'}
        </PrimaryButton>
      </form>

      <div className="space-y-4 border-t border-line pt-6">
        <SelectField
          label="Animations"
          value={reducedMotionOverride === null ? 'system' : reducedMotionOverride ? 'reduce' : 'full'}
          onChange={(e) => setReducedMotionOverride(e.target.value === 'system' ? null : e.target.value === 'reduce')}
          hint={`Your device is set to ${systemReducedMotion ? 'reduce motion' : 'allow motion'}.`}
        >
          <option value="system">Match my device</option>
          <option value="reduce">Reduce motion</option>
          <option value="full">Full motion</option>
        </SelectField>
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-sm text-muted">Signed in as {email}</p>
          <SecondaryButton
            type="button"
            onClick={async () => {
              await signOut();
              navigate('/login', { replace: true });
            }}
          >
            Sign out
          </SecondaryButton>
        </div>
      </div>
    </div>
  );
}
