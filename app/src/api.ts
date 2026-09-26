import { BusinessState, Order, Product } from './types';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  if (!API_BASE) throw new Error('API no configurada');

  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(body || `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
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
  return result.contenido;
}

function cloudSafeState(state: BusinessState): BusinessState {
  return state.admin ? {
    ...state,
    admin: {
      name: state.admin.name,
      phone: state.admin.phone,
      pinHash: state.admin.pinHash
    }
  } : state;
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
}): Promise<void> {
  await request('/api/pedidos-publicos', {
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

export async function getPublicOrders(token: string): Promise<any[]> {
  return request('/api/pedidos-publicos', {}, token);
}

export function apiConfigured(): boolean {
  return Boolean(API_BASE);
}
