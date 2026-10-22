import { SEED_CONTACTS, SEED_TASKS } from '../data/seedTasks';
import type { EmergencyContactInput, MaintenanceTaskInput, UUID } from '../types';
import { occurrenceInSeasonYear } from './dates';

export function buildSeedTasks(today: Date, propertyId: UUID | null): (MaintenanceTaskInput & { seedKey: string })[] {
  return SEED_TASKS.map((t) => ({
    seedKey: t.seedKey,
    propertyId,
    title: t.title,
    season: t.season,
    dueDate: occurrenceInSeasonYear(t.month, t.day, today),
    status: 'todo',
    description: t.description,
  }));
}

export function buildSeedContacts(): (EmergencyContactInput & { seedKey: string })[] {
  return SEED_CONTACTS.map((c, i) => ({
    seedKey: c.seedKey,
    type: c.type,
    name: c.name,
    phone: '',
    notes: c.notes,
    sortOrder: i,
  }));
}
