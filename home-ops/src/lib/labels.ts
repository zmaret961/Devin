import type { DocumentType, EmergencyContactType, TaskStatus } from '../types';

export const CONTACT_TYPE_LABEL: Record<EmergencyContactType, string> = {
  plumber: 'Plumber',
  electrician: 'Electrician',
  hvac: 'Heating & cooling',
  gas_utility: 'Gas utility',
  electric_utility: 'Electric utility',
  water_utility: 'Water utility',
  insurance: 'Insurance',
  roofer: 'Roofer',
  restoration: 'Water/fire restoration',
  neighbor: 'Neighbor',
  other: 'Other',
};

export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  manual: 'Manual',
  insurance: 'Insurance',
  warranty: 'Warranty',
  receipt: 'Receipt',
  other: 'Other',
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  complete: 'Done',
};

export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (local.length === 10) return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
  return raw.trim();
}

export function telHref(raw: string): string {
  const cleaned = raw.replace(/[^\d+]/g, '');
  return `tel:${cleaned}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
