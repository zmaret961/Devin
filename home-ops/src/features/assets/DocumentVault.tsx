import { useRef, useState } from 'react';
import { FileText, Image as ImageIcon, Trash2, Upload } from 'lucide-react';
import { DOCUMENT_TYPES, type DocumentType, type StoredDocument, type UUID } from '../../types';
import { useData } from '../../state/data';
import { DOCUMENT_TYPE_LABEL, formatBytes } from '../../lib/labels';
import { formatDate } from '../../lib/dates';
import { ACCEPTED_UPLOAD_TYPES, getDocumentUrl, toServiceError } from '../../services';
import { SelectField } from '../../components/Fields';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';

/** Upload and list manuals, warranties and insurance files for one asset (or for the home when assetId is null). */
export function DocumentVault({ assetId, defaultType = 'manual' }: { assetId: UUID | null; defaultType?: DocumentType }) {
  const { documents, upload, removeDocument, load } = useData();
  const input = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<DocumentType>(defaultType);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const docs = documents.items.filter((d) => d.assetId === assetId);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        await upload({ file, name: file.name, type, assetId });
      }
    } catch (err) {
      setError(toServiceError(err).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function open(doc: StoredDocument) {
    // Open the tab synchronously so Safari's popup blocker allows it, then point it at the signed URL.
    const tab = window.open('', '_blank');
    try {
      const url = await getDocumentUrl(doc);
      if (tab) tab.location.href = url;
      else window.location.assign(url);
    } catch (err) {
      tab?.close();
      setError(toServiceError(err).message);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <SelectField label="File type" value={type} onChange={(e) => setType(e.target.value as DocumentType)}>
            {DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {DOCUMENT_TYPE_LABEL[t]}
              </option>
            ))}
          </SelectField>
        </div>
        <label className="interactive inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full bg-pine px-5 font-semibold text-white focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-pine">
          <Upload className="size-4" aria-hidden />
          {busy ? 'Uploading…' : 'Upload'}
          <input
            ref={input}
            type="file"
            className="sr-only"
            accept={ACCEPTED_UPLOAD_TYPES.join(',')}
            multiple
            disabled={busy}
            onChange={(e) => onFiles(e.target.files)}
          />
        </label>
      </div>
      <p className="text-sm text-muted">PDF or photo, up to 25 MB. Files are private to your account.</p>
      {error && (
        <p role="alert" className="rounded-xl bg-brick-soft px-4 py-3 text-sm text-brick">
          {error}
        </p>
      )}

      {documents.status === 'error' ? (
        <ErrorState message={documents.error ?? 'Couldn\u2019t load files.'} onRetry={() => load('documents')} />
      ) : documents.status !== 'ready' ? (
        <LoadingState rows={1} label="Loading files" />
      ) : docs.length === 0 ? (
        <EmptyState title="No files yet" body="Add the owner's manual or a photo of the rating plate." />
      ) : (
        <ul className="divide-y divide-line/80 rounded-2xl border border-line">
          {docs.map((d) => {
            const Icon = d.mimeType.startsWith('image/') ? ImageIcon : FileText;
            return (
              <li key={d.id} className="flex items-center gap-3 py-2 pr-1 pl-3">
                <Icon className="size-5 shrink-0 text-ink-2" aria-hidden />
                <button type="button" onClick={() => open(d)} className="min-h-11 min-w-0 flex-1 text-left">
                  <span className="block truncate font-medium underline-offset-4 hover:underline">{d.name}</span>
                  <span className="block text-xs text-muted">
                    {DOCUMENT_TYPE_LABEL[d.type]} · {formatBytes(d.sizeBytes)} · {formatDate(d.createdAt.slice(0, 10), { withYear: true })}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${d.name}`}
                  onClick={async () => {
                    if (window.confirm(`Delete ${d.name}?`)) await removeDocument(d).catch(() => undefined);
                  }}
                  className="grid size-11 place-items-center rounded-full text-muted hover:bg-black/5 hover:text-brick"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
