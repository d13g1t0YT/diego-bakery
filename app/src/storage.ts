import { BusinessState, defaultState } from './types';

const DB_NAME = 'diego-bakery-db';
const STORE_NAME = 'state';
const STATE_KEY = 'business';

function normalizeState(input: BusinessState): BusinessState {
  const base = defaultState();
  return {
    ...base,
    ...input,
    products: Array.isArray(input.products) ? input.products : base.products,
    ingredients: Array.isArray(input.ingredients) ? input.ingredients : [],
    recipes: Array.isArray(input.recipes) ? input.recipes : [],
    suppliers: Array.isArray(input.suppliers) ? input.suppliers : [],
    customers: Array.isArray(input.customers) ? input.customers : [],
    promotions: Array.isArray(input.promotions) ? input.promotions : [],
    combos: Array.isArray(input.combos) ? input.combos : [],
    loyaltyRewards: Array.isArray(input.loyaltyRewards) ? input.loyaltyRewards : [],
    services: Array.isArray(input.services) ? input.services : [],
    orders: Array.isArray(input.orders) ? input.orders : [],
    money: Array.isArray(input.money) ? input.money : [],
    debts: Array.isArray(input.debts) ? input.debts : [],
    losses: Array.isArray(input.losses) ? input.losses : [],
    notifications: Array.isArray(input.notifications) ? input.notifications : [],
    reviews: Array.isArray(input.reviews) ? input.reviews : [],
    cashRegister: input.cashRegister ?? base.cashRegister,
    settings: { ...base.settings, ...(input.settings ?? {}) }
  };
}

function sanitizeState(state: BusinessState): BusinessState {
  if (!state.admin) return state;
  return {
    ...state,
    admin: {
      name: state.admin.name,
      phone: state.admin.phone,
      pinHash: state.admin.pinHash
    }
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
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
      request.onsuccess = () => resolve(normalizeState(request.result ?? defaultState()));
      request.onerror = () => reject(request.error);
    });
  } catch {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      return raw ? normalizeState(JSON.parse(raw) as BusinessState) : defaultState();
    } catch {
      return defaultState();
    }
  }
}

export async function saveState(state: BusinessState): Promise<void> {
  const safe = sanitizeState(state);

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(safe, STATE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    localStorage.setItem(STATE_KEY, JSON.stringify(safe));
  }
}

export function downloadBackup(state: BusinessState): void {
  const safe = sanitizeState(state);
  const blob = new Blob([JSON.stringify(safe, null, 2)], { type: 'application/json' });
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

  const safe = sanitizeState(parsed);
  await saveState(safe);
  return safe;
}

export function csvDownload(
  filename: string,
  rows: Array<Record<string, string | number | boolean>>
): void {
  if (!rows.length) return;

  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const csv = [
    headers.join(','),
    ...rows.map(row => headers.map(h => escape(row[h])).join(','))
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
