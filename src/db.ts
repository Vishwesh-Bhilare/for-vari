import { openDB } from 'idb';
import { isSupabaseConfigured, supabase } from './supabase';
import type { OutboxEntry, QueuePriority } from './types';

const dbPromise = openDB('vari-companion', 1, {
  upgrade(db) {
    db.createObjectStore('nodes', { keyPath: 'id' });
    db.createObjectStore('crowd_reports', { keyPath: 'id', autoIncrement: true });
    db.createObjectStore('item_requests', { keyPath: 'id', autoIncrement: true });
    db.createObjectStore('sightings', { keyPath: 'id', autoIncrement: true });
    db.createObjectStore('sos_alerts', { keyPath: 'id', autoIncrement: true });
    db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
  }
});

export async function cacheRows<T extends { id?: string | number }>(store: string, rows: T[]) {
  const db = await dbPromise;
  const tx = db.transaction(store, 'readwrite');
  await Promise.all(rows.map((row) => tx.store.put(row)));
  await tx.done;
}

export async function getRows<T>(store: string): Promise<T[]> {
  return (await dbPromise).getAll(store);
}

export async function queueWrite(table: string, payload: Record<string, unknown>, priority: QueuePriority = 'normal') {
  const localPayload = { ...payload, pending: true, created_at: new Date().toISOString() };
  await (await dbPromise).add(table, localPayload);

  if (!navigator.onLine || !isSupabaseConfigured) {
    await (await dbPromise).add('outbox', { table, payload, priority, createdAt: Date.now() });
    return { queued: true };
  }

  const { error } = await supabase.from(table).insert(payload);
  if (error) {
    await (await dbPromise).add('outbox', { table, payload, priority, createdAt: Date.now() });
    return { queued: true, error };
  }
  return { queued: false };
}

export async function drainOutbox() {
  if (!navigator.onLine || !isSupabaseConfigured) return;
  const db = await dbPromise;
  const entries = (await db.getAll('outbox')) as OutboxEntry[];
  entries.sort((a, b) => (a.priority === b.priority ? a.createdAt - b.createdAt : a.priority === 'sos' ? -1 : 1));

  for (const entry of entries) {
    const { error } = await supabase.from(entry.table).insert(entry.payload);
    if (!error && entry.id) await db.delete('outbox', entry.id);
  }
}

window.addEventListener('online', () => void drainOutbox());
