import type {
  Asset,
  AssetInput,
  DocumentUpload,
  EmergencyContact,
  EmergencyContactInput,
  MaintenanceTask,
  MaintenanceTaskInput,
  Profile,
  Property,
  PropertyInput,
  StoredDocument,
  TaskStatus,
  UUID,
  User,
} from '../types';

export interface AuthSession {
  user: User;
}

export type OAuthProvider = 'apple';

/**
 * Everything the app needs from a backend. `supabase/supabaseBackend.ts`
 * implements it against Supabase; `local/localBackend.ts` implements it in the
 * browser for Demo Mode and tests. UI code never sees either directly.
 */
export interface HomeBackend {
  readonly kind: 'supabase' | 'local';

  getSession(): Promise<AuthSession | null>;
  onAuthChange(listener: (session: AuthSession | null) => void): () => void;
  signUp(email: string, password: string): Promise<{ session: AuthSession | null; needsConfirmation: boolean }>;
  signIn(email: string, password: string): Promise<AuthSession>;
  signInWithOAuth(provider: OAuthProvider): Promise<void>;
  signOut(): Promise<void>;

  getProfile(): Promise<Profile | null>;
  markSeeded(): Promise<void>;

  listProperties(): Promise<Property[]>;
  upsertProperty(input: PropertyInput): Promise<Property>;

  listAssets(): Promise<Asset[]>;
  upsertAsset(input: AssetInput): Promise<Asset>;
  deleteAsset(id: UUID): Promise<void>;

  listTasks(): Promise<MaintenanceTask[]>;
  upsertTask(input: MaintenanceTaskInput): Promise<MaintenanceTask>;
  insertSeedTasks(tasks: (MaintenanceTaskInput & { seedKey: string })[]): Promise<void>;
  setTaskStatus(id: UUID, status: TaskStatus): Promise<MaintenanceTask>;
  deleteTask(id: UUID): Promise<void>;

  listContacts(): Promise<EmergencyContact[]>;
  upsertContact(input: EmergencyContactInput): Promise<EmergencyContact>;
  insertSeedContacts(contacts: (EmergencyContactInput & { seedKey: string })[]): Promise<void>;
  deleteContact(id: UUID): Promise<void>;

  listDocuments(): Promise<StoredDocument[]>;
  uploadDocument(upload: DocumentUpload): Promise<StoredDocument>;
  getDocumentUrl(doc: StoredDocument): Promise<string>;
  deleteDocument(doc: StoredDocument): Promise<void>;
}
