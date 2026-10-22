/**
 * Domain model. Each interface mirrors a table in
 * supabase/migrations/20261022000000_init_home_ops.sql (snake_case columns
 * become camelCase fields). Ids are uuid strings; dates are ISO strings.
 */

export type UUID = string;
/** Calendar date, `YYYY-MM-DD`. */
export type ISODate = string;
/** Timestamp, ISO-8601. */
export type ISODateTime = string;

export interface User {
  id: UUID;
  email: string;
}

export interface Profile {
  id: UUID;
  email: string;
  fullName: string;
  /** When the starter maintenance checklist and contacts were created. */
  seededAt: ISODateTime | null;
  createdAt: ISODateTime;
}

export interface Property {
  id: UUID;
  userId: UUID;
  nickname: string;
  address: string;
  zipCode: string;
  yearBuilt: number | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export const ASSET_CATEGORIES = [
  'HVAC',
  'Furnace',
  'Water Heater',
  'Refrigerator',
  'Dishwasher',
  'Washer',
  'Dryer',
  'Oven/Range',
  'Microwave',
  'Sump Pump',
  'Water Softener',
  'Electrical Panel',
  'Generator',
  'Garage Door',
  'Roof',
  'Other',
] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export interface Asset {
  id: UUID;
  userId: UUID;
  propertyId: UUID | null;
  name: string;
  brand: string;
  modelNumber: string;
  serialNumber: string;
  category: AssetCategory;
  installDate: ISODate | null;
  warrantyExpiration: ISODate | null;
  locationInHouse: string;
  notes: string;
  /** Ids of rows in `documents` attached to this asset. */
  documentIds: UUID[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export const SEASONS = ['Fall', 'Winter', 'Spring', 'Summer'] as const;
export type Season = (typeof SEASONS)[number];

export const TASK_STATUSES = ['todo', 'in_progress', 'complete'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface MaintenanceTask {
  id: UUID;
  userId: UUID;
  propertyId: UUID | null;
  title: string;
  season: Season;
  dueDate: ISODate;
  status: TaskStatus;
  description: string;
  completedAt: ISODateTime | null;
  /** Set when the task came from the built-in seasonal checklist. */
  seedKey: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export const CONTACT_TYPES = [
  'plumber',
  'electrician',
  'hvac',
  'gas_utility',
  'electric_utility',
  'water_utility',
  'insurance',
  'roofer',
  'restoration',
  'neighbor',
  'other',
] as const;
export type EmergencyContactType = (typeof CONTACT_TYPES)[number];

export interface EmergencyContact {
  id: UUID;
  userId: UUID;
  type: EmergencyContactType;
  name: string;
  phone: string;
  notes: string;
  sortOrder: number;
  seedKey: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export const DOCUMENT_TYPES = ['manual', 'insurance', 'warranty', 'receipt', 'other'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export interface StoredDocument {
  id: UUID;
  userId: UUID;
  assetId: UUID | null;
  name: string;
  type: DocumentType;
  /** Object key inside the documents bucket: `<userId>/<assetId|general>/<uuid>-<file>`. */
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: ISODateTime;
}

/** Fields the user edits; the service layer fills in ids, owner and timestamps. */
export type PropertyInput = Pick<Property, 'nickname' | 'address' | 'zipCode' | 'yearBuilt'> & { id?: UUID };
export type AssetInput = Omit<Asset, 'id' | 'userId' | 'documentIds' | 'createdAt' | 'updatedAt'> & { id?: UUID };
export type MaintenanceTaskInput = Omit<
  MaintenanceTask,
  'id' | 'userId' | 'completedAt' | 'seedKey' | 'createdAt' | 'updatedAt'
> & { id?: UUID };
export type EmergencyContactInput = Omit<EmergencyContact, 'id' | 'userId' | 'seedKey' | 'createdAt' | 'updatedAt'> & {
  id?: UUID;
};
export interface DocumentUpload {
  file: File | Blob;
  name: string;
  type: DocumentType;
  assetId: UUID | null;
}
