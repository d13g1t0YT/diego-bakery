import { BusinessState, defaultState } from './types';
import { recalculateBusinessState } from './businessEngine';

const DB_NAME = 'diego-bakery-db';
const STORE_NAME = 'state';
const STATE_KEY = 'business';

function normalizeState(input: BusinessState): BusinessState {
  const base = defaultState();
  const safe = input && typeof input === 'object' ? input : ({} as BusinessState);
  const products = Array.isArray(safe.products) ? safe.products : base.products;
  const ingredients = Array.isArray(safe.ingredients) ? safe.ingredients : [];
  const orders = Array.isArray(safe.orders) ? safe.orders : [];
  return {
    ...base,
    ...safe,
    products: products.map(p => ({
      ...p,
      price: Number.isFinite(Number(p.price)) ? Number(p.price) : 0,
      cost: Number.isFinite(Number(p.cost)) ? Number(p.cost) : 0,
      stock: Number.isFinite(Number(p.stock)) ? Number(p.stock) : 0,
      categories: Array.isArray(p.categories) ? p.categories : [p.category || 'General'],
      tags: Array.isArray(p.tags) ? p.tags : [],
      flavors: Array.isArray(p.flavors) ? p.flavors : [],
      sizes: Array.isArray(p.sizes) ? p.sizes : []
    })),
    ingredients: ingredients.map(i => ({
      ...i,
      unitCost: Number.isFinite(Number(i.unitCost)) ? Number(i.unitCost) : 0,
      stock: Number.isFinite(Number(i.stock)) ? Number(i.stock) : 0,
      minStock: Number.isFinite(Number(i.minStock)) ? Number(i.minStock) : 0
    })),
    recipes: Array.isArray(safe.recipes) ? safe.recipes : [],
    suppliers: Array.isArray(safe.suppliers) ? safe.suppliers : [],
    customers: Array.isArray(safe.customers) ? safe.customers : [],
    promotions: Array.isArray(safe.promotions) ? safe.promotions : [],
    combos: Array.isArray(safe.combos) ? safe.combos : [],
    loyaltyRewards: Array.isArray(safe.loyaltyRewards) ? safe.loyaltyRewards : [],
    services: Array.isArray(safe.services) ? safe.services : [],
    orders: orders.map(o => ({
      ...o,
      items: Array.isArray(o.items) ? o.items : [],
      subtotal: Number.isFinite(Number(o.subtotal)) ? Number(o.subtotal) : 0,
      discount: Number.isFinite(Number(o.discount)) ? Number(o.discount) : 0,
      total: Number.isFinite(Number(o.total)) ? Number(o.total) : 0,
      paid: Number.isFinite(Number(o.paid)) ? Number(o.paid) : 0,
      loyaltyAwardedAt: o.loyaltyAwardedAt
    })),
    money: Array.isArray(safe.money) ? safe.money : [],
    debts: Array.isArray(safe.debts) ? safe.debts : [],
    losses: Array.isArray(safe.losses) ? safe.losses : [],
    notifications: Array.isArray(safe.notifications) ? safe.notifications : [],
    reviews: Array.isArray(safe.reviews) ? safe.reviews : [],
    cashRegister: { ...base.cashRegister, ...(safe.cashRegister ?? {}) },
    settings: { ...base.settings, ...(safe.settings ?? {}) }
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
      request.onsuccess = () => resolve(recalculateBusinessState(normalizeState(request.result ?? defaultState())));
      request.onerror = () => reject(request.error);
    });
  } catch {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      return raw ? recalculateBusinessState(normalizeState(JSON.parse(raw) as BusinessState)) : recalculateBusinessState(defaultState());
    } catch {
      return recalculateBusinessState(defaultState());
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

  const safe = recalculateBusinessState(sanitizeState(parsed));
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
