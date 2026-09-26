import { BusinessState, defaultState } from './types';

const DB_NAME = 'diego-bakery-db';
const STORE_NAME = 'state';
const STATE_KEY = 'business';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir almacenamiento'));
  });
}

export async function loadState(): Promise<BusinessState> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(STATE_KEY);
      request.onsuccess = () => resolve(request.result ?? defaultState());
      request.onerror = () => reject(request.error);
    });
  } catch {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? JSON.parse(raw) as BusinessState : defaultState();
  }
}

export async function saveState(state: BusinessState): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(state, STATE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }
}

export function downloadBackup(state: BusinessState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `diego-bakery-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function restoreBackup(file: File): Promise<BusinessState> {
  const text = await file.text();
  const parsed = JSON.parse(text) as BusinessState;
  if (!parsed || !Array.isArray(parsed.products) || !parsed.settings) {
    throw new Error('Archivo de respaldo inválido');
  }
  await saveState(parsed);
  return parsed;
}

export function csvDownload(filename: string, rows: Array<Record<string, string | number | boolean>>): void {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const csv = [headers.join(','), ...rows.map(row => headers.map(h => escape(row[h])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
