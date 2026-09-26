import type { BusinessState, Order, Product } from './types';

const configured = (import.meta.env.VITE_API_URL || '').trim();
const fallbackOrigin = typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol)
  ? window.location.origin
  : '';
const API_BASE = (configured || fallbackOrigin).replace(/\/$/, '');
const REQUEST_TIMEOUT_MS = 12000;

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  if (!API_BASE) throw new Error('Servidor no configurado');

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', 'Bearer ' + token);

  try {
    const response = await fetch(API_BASE + path, { ...options, headers, signal: controller.signal });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      let message = body;
      try {
        const parsed = JSON.parse(body);
        message = parsed?.error || parsed?.message || body;
      } catch {
        // Plain text response.
      }
      throw new Error(message || 'HTTP ' + response.status);
    }

    if (response.status === 204) return undefined as T;
    const text = await response.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function pingHealth(): Promise<{ status: string; timestamp?: string }> {
  return request('/health', { method: 'GET' });
}

export async function login(
  telefono: string,
  pin: string
): Promise<{ token: string; usuario: { id: string; nombre: string; apellido: string } }> {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ telefono, pin })
  });
}

export async function getProducts(token: string): Promise<Product[]> {
  return request('/api/productos', {}, token);
}

export async function getOrders(token: string): Promise<Order[]> {
  return request('/api/ordenes', {}, token);
}

export async function getCloudState(token: string): Promise<BusinessState> {
  const result = await request<{ contenido: BusinessState }>('/api/estado', {}, token);
  return result?.contenido || ({} as BusinessState);
}

function cloudSafeState(state: BusinessState): BusinessState {
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

export async function putCloudState(token: string, state: BusinessState): Promise<void> {
  await request('/api/estado', {
    method: 'PUT',
    body: JSON.stringify({ state: cloudSafeState(state) })
  }, token);
}

export async function uploadBackup(token: string, state: BusinessState): Promise<void> {
  await request('/api/backup', {
    method: 'POST',
    body: JSON.stringify({ state: cloudSafeState(state) })
  }, token);
}

export async function submitPublicOrder(order: {
  id: string;
  customerName: string;
  customerPhone: string;
  address?: string;
  notes?: string;
  items: Order['items'];
  subtotal: number;
  discount: number;
  total: number;
}): Promise<{ id: string }> {
  return request<{ id: string }>('/api/pedidos-publicos', {
    method: 'POST',
    body: JSON.stringify({
      cliente_ref: order.id,
      cliente_nombre: order.customerName,
      telefono: order.customerPhone,
      direccion: order.address || null,
      notas: order.notes || null,
      items: order.items,
      subtotal: order.subtotal,
      descuento: order.discount,
      total: order.total
    })
  });
}

export async function updatePublicOrderStatus(token: string, id: string, estado: string): Promise<void> {
  await request('/api/pedidos-publicos/' + encodeURIComponent(id), {
    method: 'PUT',
    body: JSON.stringify({ estado })
  }, token);
}

export async function getPublicOrders(token: string): Promise<any[]> {
  return request('/api/pedidos-publicos', {}, token);
}

export function apiConfigured(): boolean {
  return Boolean(API_BASE);
}

export const apiBaseUrl = API_BASE;
