import { useState, type FormEvent } from 'react';
import { Phone, Plus, Pencil } from 'lucide-react';
import { CONTACT_TYPES, type EmergencyContact, type EmergencyContactType } from '../../types';
import { useData } from '../../state/data';
import { CONTACT_TYPE_LABEL, formatPhone, telHref } from '../../lib/labels';
import { Sheet } from '../../components/Sheet';
import { PrimaryButton, SecondaryButton, SelectField, TextAreaField, TextField } from '../../components/Fields';
import { AddInfoButton, EmptyState, ErrorState, LoadingState } from '../../components/States';
import { toServiceError } from '../../services';

interface LedgerProps {
  /** Emergency styling (dark, high contrast). */
  loud?: boolean;
  /** Show only these contact types, in this order (used beside a triage guide). */
  only?: EmergencyContactType[];
  title?: string;
}

export function ContactsLedger({ loud = false, only, title = 'Emergency contacts' }: LedgerProps) {
  const { contacts, load } = useData();
  const [editing, setEditing] = useState<EmergencyContact | 'new' | null>(null);
  const [newType, setNewType] = useState<EmergencyContactType>('other');

  let list = contacts.items;
  if (only) {
    list = only.flatMap((type) => contacts.items.filter((c) => c.type === type));
  }
  const missingTypes = only?.filter((type) => !contacts.items.some((c) => c.type === type)) ?? [];

  const heading = loud ? 'text-signal' : 'text-muted';
  return (
    <section aria-labelledby={`ledger-${title}`}>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id={`ledger-${title}`} className={`text-[0.8125rem] font-semibold tracking-[0.06em] uppercase ${heading}`}>
          {title}
        </h2>
        <button
          type="button"
          onClick={() => {
            setNewType(only?.[0] ?? 'other');
            setEditing('new');
          }}
          className={`inline-flex min-h-11 items-center gap-1 text-sm font-semibold ${loud ? 'text-signal' : 'text-pine'}`}
        >
          <Plus className="size-4" aria-hidden /> Add
        </button>
      </div>

      {contacts.status === 'error' ? (
        <ErrorState message={contacts.error ?? 'Couldn\u2019t load contacts.'} onRetry={() => load('contacts')} />
      ) : contacts.status !== 'ready' ? (
        <LoadingState rows={2} label="Loading contacts" />
      ) : list.length === 0 && missingTypes.length === 0 ? (
        <EmptyState title="No contacts yet" body="Add your plumber, electrician and utility emergency lines now, before you need them." />
      ) : (
        <ul className={loud ? 'space-y-2' : 'card divide-y divide-line/80'}>
          {list.map((c) => (
            <ContactRow key={c.id} contact={c} loud={loud} onEdit={() => setEditing(c)} />
          ))}
          {missingTypes.map((type) => (
            <li
              key={type}
              className={loud ? 'flex items-center justify-between rounded-2xl bg-night-2 px-4 py-3' : 'flex items-center justify-between px-4 py-3'}
            >
              <span className={loud ? 'font-semibold text-stone-200' : 'font-medium'}>{CONTACT_TYPE_LABEL[type]}</span>
              <AddInfoButton
                label={`Add a ${CONTACT_TYPE_LABEL[type]} contact`}
                className={loud ? 'text-stone-300' : ''}
                onClick={() => {
                  setNewType(type);
                  setEditing('new');
                }}
              />
            </li>
          ))}
        </ul>
      )}

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add contact' : 'Edit contact'}>
        {editing !== null && (
          <ContactForm
            contact={editing === 'new' ? null : editing}
            defaultType={newType}
            nextOrder={contacts.items.length}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </section>
  );
}

function ContactRow({ contact, loud, onEdit }: { contact: EmergencyContact; loud: boolean; onEdit: () => void }) {
  const hasPhone = contact.phone.trim().length > 0;
  return (
    <li className={loud ? 'flex items-center gap-3 rounded-2xl bg-night-2 p-3 pl-4' : 'flex items-center gap-3 py-2.5 pr-2 pl-4'}>
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-semibold tracking-wide uppercase ${loud ? 'text-stone-400' : 'text-muted'}`}>
          {CONTACT_TYPE_LABEL[contact.type]}
        </p>
        <p className={`truncate font-semibold ${loud ? 'text-lg text-white' : ''}`}>{contact.name || CONTACT_TYPE_LABEL[contact.type]}</p>
        {hasPhone ? (
          <p className={`tabular-nums ${loud ? 'text-stone-200' : 'text-ink-2'}`}>{formatPhone(contact.phone)}</p>
        ) : (
          <AddInfoButton label={`Add a phone number for ${contact.name}`} onClick={onEdit} className={loud ? 'text-stone-300' : ''} />
        )}
        {contact.notes && !loud && <p className="truncate text-sm text-muted">{contact.notes}</p>}
      </div>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${contact.name}`}
        className={`grid size-11 place-items-center rounded-full ${loud ? 'text-stone-300 hover:bg-white/10' : 'text-muted hover:bg-black/5'}`}
      >
        <Pencil className="size-4" aria-hidden />
      </button>
      {hasPhone && (
        <a
          href={telHref(contact.phone)}
          aria-label={`Call ${contact.name} at ${formatPhone(contact.phone)}`}
          className={`interactive inline-flex min-h-12 items-center gap-2 rounded-full px-4 font-bold ${
            loud ? 'bg-signal text-night' : 'bg-pine-soft text-pine-dark'
          }`}
        >
          <Phone className="size-4" aria-hidden /> Call
        </a>
      )}
    </li>
  );
}

function ContactForm({
  contact,
  defaultType,
  nextOrder,
  onDone,
}: {
  contact: EmergencyContact | null;
  defaultType: EmergencyContactType;
  nextOrder: number;
  onDone: () => void;
}) {
  const { saveContact, removeContact } = useData();
  const [type, setType] = useState<EmergencyContactType>(contact?.type ?? defaultType);
  const [name, setName] = useState(contact?.name ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [notes, setNotes] = useState(contact?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (phone.trim() && phone.replace(/\D/g, '').length < 3) return setError('That phone number looks too short.');
    setBusy(true);
    setError(null);
    try {
      await saveContact({
        id: contact?.id,
        type,
        name: name.trim() || CONTACT_TYPE_LABEL[type],
        phone,
        notes,
        sortOrder: contact?.sortOrder ?? nextOrder,
      });
      onDone();
    } catch (err) {
      setError(toServiceError(err).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <SelectField label="Type" value={type} onChange={(e) => setType(e.target.value as EmergencyContactType)}>
        {CONTACT_TYPES.map((t) => (
          <option key={t} value={t}>
            {CONTACT_TYPE_LABEL[t]}
          </option>
        ))}
      </SelectField>
      <TextField label="Name or company" value={name} onChange={(e) => setName(e.target.value)} placeholder={CONTACT_TYPE_LABEL[type]} />
      <TextField
        label="Phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        autoFocus={Boolean(contact && !contact.phone)}
        placeholder="(555) 123-4567"
      />
      <TextAreaField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Account number, after-hours line…" />
      {error && (
        <p role="alert" className="text-sm text-brick">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <PrimaryButton type="submit" disabled={busy} className="flex-1">
          {busy ? 'Saving…' : 'Save'}
        </PrimaryButton>
        {contact && (
          <SecondaryButton
            type="button"
            className="text-brick"
            onClick={async () => {
              if (!window.confirm(`Delete ${contact.name}?`)) return;
              await removeContact(contact.id).then(onDone, () => undefined);
            }}
          >
            Delete
          </SecondaryButton>
        )}
      </div>
    </form>
  );
}
