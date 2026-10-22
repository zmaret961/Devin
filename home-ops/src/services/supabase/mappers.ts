import type {
  Asset,
  AssetCategory,
  AssetInput,
  DocumentType,
  EmergencyContact,
  EmergencyContactInput,
  EmergencyContactType,
  MaintenanceTask,
  MaintenanceTaskInput,
  Profile,
  Property,
  PropertyInput,
  Season,
  StoredDocument,
  TaskStatus,
} from '../../types';

/* Row shapes as returned by PostgREST (snake_case). */
export interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
  seeded_at: string | null;
  created_at: string;
}
export interface PropertyRow {
  id: string;
  user_id: string;
  nickname: string;
  address: string;
  zip_code: string;
  year_built: number | null;
  created_at: string;
  updated_at: string;
}
export interface AssetRow {
  id: string;
  user_id: string;
  property_id: string | null;
  name: string;
  brand: string;
  model_number: string;
  serial_number: string;
  category: string;
  install_date: string | null;
  warranty_expiration: string | null;
  location_in_house: string;
  notes: string;
  created_at: string;
  updated_at: string;
  documents?: { id: string }[] | null;
}
export interface TaskRow {
  id: string;
  user_id: string;
  property_id: string | null;
  title: string;
  season: string;
  due_date: string;
  status: string;
  description: string;
  completed_at: string | null;
  seed_key: string | null;
  created_at: string;
  updated_at: string;
}
export interface ContactRow {
  id: string;
  user_id: string;
  type: string;
  name: string;
  phone: string;
  notes: string;
  sort_order: number;
  seed_key: string | null;
  created_at: string;
  updated_at: string;
}
export interface DocumentRow {
  id: string;
  user_id: string;
  asset_id: string | null;
  name: string;
  type: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

const str = (v: string | null | undefined) => v ?? '';
const date = (v: string | null | undefined) => (v ? v.slice(0, 10) : null);

export const profileFromRow = (r: ProfileRow): Profile => ({
  id: r.id,
  email: str(r.email),
  fullName: str(r.full_name),
  seededAt: r.seeded_at,
  createdAt: r.created_at,
});

export const propertyFromRow = (r: PropertyRow): Property => ({
  id: r.id,
  userId: r.user_id,
  nickname: str(r.nickname),
  address: str(r.address),
  zipCode: str(r.zip_code),
  yearBuilt: r.year_built,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const propertyToRow = (p: PropertyInput, userId: string) => ({
  ...(p.id ? { id: p.id } : {}),
  user_id: userId,
  nickname: p.nickname.trim() || 'My home',
  address: p.address.trim(),
  zip_code: p.zipCode.trim(),
  year_built: p.yearBuilt,
});

export const assetFromRow = (r: AssetRow): Asset => ({
  id: r.id,
  userId: r.user_id,
  propertyId: r.property_id,
  name: str(r.name),
  brand: str(r.brand),
  modelNumber: str(r.model_number),
  serialNumber: str(r.serial_number),
  category: r.category as AssetCategory,
  installDate: date(r.install_date),
  warrantyExpiration: date(r.warranty_expiration),
  locationInHouse: str(r.location_in_house),
  notes: str(r.notes),
  documentIds: (r.documents ?? []).map((d) => d.id),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const assetToRow = (a: AssetInput, userId: string) => ({
  ...(a.id ? { id: a.id } : {}),
  user_id: userId,
  property_id: a.propertyId,
  name: a.name.trim(),
  brand: a.brand.trim(),
  model_number: a.modelNumber.trim(),
  serial_number: a.serialNumber.trim(),
  category: a.category,
  install_date: a.installDate || null,
  warranty_expiration: a.warrantyExpiration || null,
  location_in_house: a.locationInHouse.trim(),
  notes: a.notes.trim(),
});

export const taskFromRow = (r: TaskRow): MaintenanceTask => ({
  id: r.id,
  userId: r.user_id,
  propertyId: r.property_id,
  title: r.title,
  season: r.season as Season,
  dueDate: r.due_date.slice(0, 10),
  status: r.status as TaskStatus,
  description: str(r.description),
  completedAt: r.completed_at,
  seedKey: r.seed_key,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const taskToRow = (t: MaintenanceTaskInput & { seedKey?: string }, userId: string) => ({
  ...(t.id ? { id: t.id } : {}),
  user_id: userId,
  property_id: t.propertyId,
  title: t.title.trim(),
  season: t.season,
  due_date: t.dueDate,
  status: t.status,
  description: t.description.trim(),
  completed_at: t.status === 'complete' ? new Date().toISOString() : null,
  ...(t.seedKey ? { seed_key: t.seedKey } : {}),
});

export const contactFromRow = (r: ContactRow): EmergencyContact => ({
  id: r.id,
  userId: r.user_id,
  type: r.type as EmergencyContactType,
  name: str(r.name),
  phone: str(r.phone),
  notes: str(r.notes),
  sortOrder: r.sort_order,
  seedKey: r.seed_key,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const contactToRow = (c: EmergencyContactInput & { seedKey?: string }, userId: string) => ({
  ...(c.id ? { id: c.id } : {}),
  user_id: userId,
  type: c.type,
  name: c.name.trim(),
  phone: c.phone.trim(),
  notes: c.notes.trim(),
  sort_order: c.sortOrder,
  ...(c.seedKey ? { seed_key: c.seedKey } : {}),
});

export const documentFromRow = (r: DocumentRow): StoredDocument => ({
  id: r.id,
  userId: r.user_id,
  assetId: r.asset_id,
  name: r.name,
  type: r.type as DocumentType,
  storagePath: r.storage_path,
  mimeType: str(r.mime_type),
  sizeBytes: Number(r.size_bytes ?? 0),
  createdAt: r.created_at,
});
