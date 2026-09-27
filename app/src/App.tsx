import { Component, type Dispatch, type ErrorInfo, type ReactNode, type SetStateAction, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { apiConfigured, askBusinessAi, getCloudState, getPublicOrders, login, pingHealth, putCloudState, submitPublicOrder, updatePublicOrderStatus, uploadBackup } from './api';
import { calculateRecipeCost, type BusinessState, type Customer, type Debt, type Ingredient, type LocalAdmin, type MoneyMove, type MoneyMoveType, type NotificationItem, type Order, type OrderItem, type OrderStatus, type Product, type Recipe, defaultState, money, uid } from './types';
import { CashRegisterView, CombosView, CustomersView, LoyaltyView, NotificationsView, PromotionsView, RecipesView, ServicesView, SuppliersView } from './BusinessFeatures';
import { csvDownload, downloadBackup, loadState, restoreBackup, saveState } from './storage';
import { applyBusinessChange, recalculateBusinessState, type ProductPricing } from './businessEngine';

type Mode = 'admin' | 'cliente';
type Section =
  | 'inicio' | 'pedidos' | 'productos' | 'ingredientes' | 'recetas' | 'proveedores' | 'clientes'
  | 'finanzas' | 'caja' | 'deudas' | 'perdidas' | 'promociones' | 'combinaciones' | 'lealtad'
  | 'notificaciones' | 'servicios' | 'reportes' | 'ajustes' | 'asistente' | 'editar';

const STATUS_LABELS: Record<OrderStatus, string> = {
  pendiente: 'Pendiente',
  esperando_confirmacion: 'Confirmación',
  comprando_ingredientes: 'Comprando',
  preparando: 'Preparando',
  lista: 'Lista',
  por_entregar: 'Por entregar',
  entregada: 'Entregada',
  no_entregada: 'No entregada',
  cancelada: 'Cancelada',
  archivada: 'Archivada'
};

const STATUS_FLOW: OrderStatus[] = [
  'pendiente',
  'esperando_confirmacion',
  'comprando_ingredientes',
  'preparando',
  'lista',
  'por_entregar',
  'entregada'
];

const MOVE_LABELS: Record<MoneyMoveType, string> = {
  venta: 'Venta',
  gasto: 'Gasto',
  inversion: 'Inversión',
  retiro: 'Retiro',
  cobro_deuda: 'Cobro de deuda',
  pago_deuda: 'Pago de deuda',
  ajuste: 'Ajuste'
};

const NAV: Array<{ id: Section; label: string; icon: string; badge?: boolean }> = [
  { id: 'inicio', label: 'Inicio', icon: '⌂' },
  { id: 'pedidos', label: 'Pedidos', icon: '✓', badge: true },
  { id: 'productos', label: 'Productos', icon: '▣' },
  { id: 'ingredientes', label: 'Inventario', icon: '◫' },
  { id: 'recetas', label: 'Recetas', icon: '✦' },
  { id: 'clientes', label: 'Clientes', icon: '◉' },
  { id: 'proveedores', label: 'Proveedores', icon: '⇄' },
  { id: 'finanzas', label: 'Finanzas', icon: 'S/' },
  { id: 'caja', label: 'Caja', icon: '▤' },
  { id: 'deudas', label: 'Deudas', icon: '!' },
  { id: 'perdidas', label: 'Pérdidas', icon: '△' },
  { id: 'promociones', label: 'Promos', icon: '%' },
  { id: 'combinaciones', label: 'Combos', icon: '+' },
  { id: 'lealtad', label: 'Lealtad', icon: '★' },
  { id: 'notificaciones', label: 'Avisos', icon: '●' },
  { id: 'servicios', label: 'Servicios', icon: '⚙' },
  { id: 'reportes', label: 'Reportes', icon: '▥' },
  { id: 'asistente', label: 'Asistente IA', icon: '✦' },
  { id: 'editar', label: 'Editar todo', icon: '✎' },
  { id: 'ajustes', label: 'Ajustes', icon: '☰' }
];

const sectionTitle = (section: Section): string => ({
  inicio: 'Resumen del negocio',
  pedidos: 'Pedidos',
  productos: 'Productos',
  ingredientes: 'Inventario',
  recetas: 'Recetas y costos',
  proveedores: 'Proveedores',
  clientes: 'Clientes',
  finanzas: 'Finanzas',
  caja: 'Caja',
  deudas: 'Cuentas pendientes',
  perdidas: 'Pérdidas y desperdicios',
  promociones: 'Promociones',
  combinaciones: 'Combos',
  lealtad: 'Lealtad',
  notificaciones: 'Avisos',
  servicios: 'Servicios',
  reportes: 'Reportes',
  asistente: 'Asistente IA',
  editar: 'Editar todo',
  ajustes: 'Ajustes'
}[section]);

const number = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const dateKey = (value = new Date()): string => value.toISOString().slice(0, 10);

const formatDate = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
};

const completed = (status: OrderStatus): boolean => ['entregada', 'cancelada', 'archivada'].includes(status);

const nextStatus = (status: OrderStatus): OrderStatus | null => {
  if (status === 'no_entregada' || status === 'cancelada' || status === 'archivada') return null;
  const idx = STATUS_FLOW.indexOf(status);
  return idx >= 0 && idx < STATUS_FLOW.length - 1 ? STATUS_FLOW[idx + 1] : null;
};

const normalizePhone = (value: string): string => value.replace(/\D/g, '');

async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(pin);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(v => v.toString(16).padStart(2, '0')).join('');
}

async function readSessionToken(): Promise<string | undefined> {
  try {
    if (Capacitor.isNativePlatform()) {
      return (await Preferences.get({ key: 'diego-bakery-token' })).value ?? undefined;
    }
  } catch {
    // Fall through to web storage.
  }
  return localStorage.getItem('diego-bakery-token') ?? undefined;
}

async function writeSessionToken(token: string): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) await Preferences.set({ key: 'diego-bakery-token', value: token });
    else localStorage.setItem('diego-bakery-token', token);
  } catch {
    localStorage.setItem('diego-bakery-token', token);
  }
}

async function clearSessionToken(): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) await Preferences.remove({ key: 'diego-bakery-token' });
  } catch {
    // Local storage is still cleared below.
  }
  localStorage.removeItem('diego-bakery-token');
}

function ErrorFallback({ error }: { error: Error }) {
  return (
    <div className="fatal-screen">
      <div className="fatal-card">
        <div className="brand-mark">DB</div>
        <p className="eyebrow">DIEGO BAKERY</p>
        <h1>La pantalla encontró un error recuperable.</h1>
        <p className="muted">Los datos locales no se borraron. Recarga la aplicación para continuar.</p>
        <div className="fatal-actions">
          <button className="primary" onClick={() => window.location.reload()}>Recargar</button>
          <details><summary>Ver detalle técnico</summary><pre>{error.message}</pre></details>
        </div>
      </div>
    </div>
  );
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Diego Bakery render error', error, info);
  }

  render() {
    return this.state.error ? <ErrorFallback error={this.state.error} /> : this.props.children;
  }
}

export function App() {
  return <AppErrorBoundary><AppInner /></AppErrorBoundary>;
}

function AppInner() {
  const [state, setState] = useState<BusinessState | null>(null);
  const stateRef = useRef<BusinessState | null>(null);
  const syncTimer = useRef<number | undefined>(undefined);
  const publicSyncBusy = useRef(false);
  const saving = useRef(false);
  const [mode, setMode] = useState<Mode>('admin');
  const [section, setSection] = useState<Section>('inicio');
  const [ready, setReady] = useState(false);
  const [logged, setLogged] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [message, setMessage] = useState('');
  const [syncState, setSyncState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupName, setSetupName] = useState('Administrador');
  const [setupPhone, setSetupPhone] = useState('');
  const [setupPin, setSetupPin] = useState('');
  const [globalSearch, setGlobalSearch] = useState('');
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [customerDraft, setCustomerDraft] = useState({ name: '', phone: '', address: '', notes: '' });
  const [promoCode, setPromoCode] = useState('');

  useEffect(() => {
    void (async () => {
      const loaded = await loadState();
      const token = await readSessionToken();
      const restored = token && loaded.admin
        ? { ...loaded, admin: { ...loaded.admin, token } }
        : loaded;
      stateRef.current = restored;
      setState(restored);
      setLoginPhone(restored.admin?.phone ?? '');
      if (token && restored.admin) setLogged(true);
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!state || saving.current) return;
    stateRef.current = state;
    saving.current = true;
    void saveState(state)
      .then(() => setSyncState(prev => prev === 'error' ? prev : 'saved'))
      .catch(() => setSyncState('error'))
      .finally(() => { saving.current = false; });
  }, [state]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      setMessage('Conexión recuperada.');
    };
    const onOffline = () => {
      setOnline(false);
      setMessage('Sin conexión. Los datos siguen disponibles y se sincronizarán después.');
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      console.error('Diego Bakery runtime error', event.error || event.message);
      setMessage('La app detectó un error de ejecución. Los datos están protegidos; prueba recargando.');
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      console.error('Diego Bakery unhandled rejection', event.reason);
      setMessage('Una operación no terminó. El estado local sigue protegido.');
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  useEffect(() => {
    if (!state?.admin?.token || !online) return;
    void refreshFromServer();
    const interval = window.setInterval(() => {
      void refreshFromServer();
    }, 5000);
    return () => {
      window.clearInterval(interval);
      if (syncTimer.current) window.clearTimeout(syncTimer.current);
    };
  }, [state?.admin?.token, online]);

  useEffect(() => {
    if (!online) return;
    void syncPublicOrders();
    const interval = window.setInterval(() => { void syncPublicOrders(); }, 12000);
    return () => window.clearInterval(interval);
  }, [online]);

  useEffect(() => {
    if (!state) return;
    const low = state.ingredients.filter(i => i.stock <= i.minStock && i.minStock > 0);
    if (!low.length) return;

    setState(prev => {
      if (!prev) return prev;
      const today = dateKey();
      const existing = new Set(prev.notifications
        .filter(n => n.type === 'stock' && n.createdAt.slice(0, 10) === today)
        .map(n => n.message));
      const generated: NotificationItem[] = low
        .filter(i => !existing.has('Stock bajo: ' + i.name))
        .map(i => ({
          id: uid('not'),
          type: 'stock' as const,
          title: 'Stock bajo',
          message: 'Stock bajo: ' + i.name,
          read: false,
          createdAt: new Date().toISOString()
        }));
      return generated.length ? { ...prev, notifications: generated.concat(prev.notifications) } : prev;
    });
  }, [state?.ingredients]);

  const products = state?.products ?? [];
  const activeProducts = products.filter(p => p.active);
  const pendingOrders = state?.orders.filter(o => !completed(o.status)).length ?? 0;
  const unread = state?.notifications.filter(n => !n.read).length ?? 0;
  const today = dateKey();
  const monthPrefix = today.slice(0, 7);

  const derived = useMemo(() => {
    if (!state) {
      return {
        sales: 0, expenses: 0, investments: 0, cash: 0, todaySales: 0, monthSales: 0,
        todayOrders: 0, pending: 0, inventoryValue: 0, receivable: 0, payable: 0,
        completedRevenue: 0, completedCost: 0, lossesValue: 0, averageTicket: 0, estimatedProfit: 0, lowStock: [] as Ingredient[],
        topProducts: [] as Array<{ name: string; quantity: number; revenue: number }>
      };
    }

    const inflow = (m: MoneyMove) => ['venta', 'inversion', 'cobro_deuda'].includes(m.type);
    const outflow = (m: MoneyMove) => ['gasto', 'retiro', 'pago_deuda'].includes(m.type);

    const sales = state.money.filter(m => m.type === 'venta').reduce((s, m) => s + number(m.amount), 0);
    const expenses = state.money.filter(m => m.type === 'gasto').reduce((s, m) => s + number(m.amount), 0);
    const investments = state.money.filter(m => m.type === 'inversion').reduce((s, m) => s + number(m.amount), 0);
    const cash = state.money.reduce((s, m) => {
      if (!m.method || m.method === 'efectivo') {
        if (inflow(m)) return s + number(m.amount);
        if (outflow(m)) return s - number(m.amount);
      }
      return s;
    }, 0);

    const todaySales = state.money
      .filter(m => m.type === 'venta' && m.date.slice(0, 10) === today)
      .reduce((s, m) => s + number(m.amount), 0);
    const monthSales = state.money
      .filter(m => m.type === 'venta' && m.date.slice(0, 7) === monthPrefix)
      .reduce((s, m) => s + number(m.amount), 0);

    const completedOrders = state.orders.filter(o => o.status === 'entregada');
    const completedRevenue = completedOrders.reduce((s, o) => s + number(o.total), 0);
    const completedCost = completedOrders.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + number(item.cost) * Math.max(0, number(item.quantity)), 0), 0);
    const lossesValue = state.losses.reduce((s, loss) => s + number(loss.value), 0);
    const todayOrders = state.orders.filter(o => o.createdAt.slice(0, 10) === today).length;
    const inventoryValue = state.ingredients.reduce((s, i) => s + number(i.stock) * number(i.unitCost), 0);
    const receivable = state.debts.filter(d => d.type === 'cobrar' && !d.paid).reduce((s, d) => s + number(d.amount), 0);
    const payable = state.debts.filter(d => d.type === 'pagar' && !d.paid).reduce((s, d) => s + number(d.amount), 0);
    const averageTicket = completedOrders.length ? completedRevenue / completedOrders.length : 0;
    const estimatedProfit = completedRevenue - completedCost - expenses - lossesValue;

    const counts = new Map<string, { quantity: number; revenue: number }>();
    for (const order of state.orders) {
      if (order.status === 'cancelada') continue;
      for (const item of order.items) {
        const current = counts.get(item.productName) || { quantity: 0, revenue: 0 };
        current.quantity += number(item.quantity);
        current.revenue += number(item.subtotal || number(item.unitPrice) * number(item.quantity));
        counts.set(item.productName, current);
      }
    }

    return {
      sales, expenses, investments, cash, todaySales, monthSales, todayOrders, pending: pendingOrders,
      inventoryValue, receivable, payable, completedRevenue, completedCost, lossesValue, averageTicket, estimatedProfit,
      lowStock: state.ingredients.filter(i => i.stock <= i.minStock && i.minStock > 0),
      topProducts: Array.from(counts.entries())
        .map(([name, value]) => ({ name, ...value }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5)
    };
  }, [state, today, monthPrefix, pendingOrders]);

  function updateState(mutator: (current: BusinessState) => BusinessState) {
    const current = stateRef.current;
    if (!current) return;
    const changeAt = new Date().toISOString();
    const next = { ...mutator(current), lastLocalChangeAt: changeAt };
    const calculated = recalculateBusinessState(next);
    stateRef.current = calculated;
    setState(calculated);
    setSyncState('saving');
    if (calculated.admin?.token && online) scheduleCloudSync();
  }

  function scheduleCloudSync() {
    if (syncTimer.current) window.clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(() => { void flushCloudSync(); }, 1200);
  }

  function commitState(value: SetStateAction<BusinessState | null>) {
    const current = stateRef.current;
    const rawNext = typeof value === 'function' ? value(current) : value;
    const changeAt = new Date().toISOString();
    const next = rawNext ? { ...rawNext, lastLocalChangeAt: changeAt } : rawNext;
    const calculated = next ? recalculateBusinessState(next) : next;
    stateRef.current = calculated;
    setState(calculated);
    setSyncState('saving');
    if (calculated?.admin?.token && online) scheduleCloudSync();
  }

  async function flushCloudSync() {
    const snapshot = stateRef.current;
    const token = snapshot?.admin?.token;
    if (!snapshot || !token || !online || !apiConfigured()) return;

    setSyncState('saving');
    try {
      await putCloudState(token, snapshot);
      if (snapshot.settings.autoBackup) await uploadBackup(token, snapshot);
      setState(prev => prev ? { ...prev, lastSyncAt: new Date().toISOString() } : prev);
      setSyncState('saved');
      setMessage('Todo guardado y sincronizado.');
    } catch (error) {
      console.error(error);
      setSyncState('error');
      setMessage('No se pudo sincronizar ahora. Se reintentará automáticamente.');
    }
  }

  async function syncPublicOrders() {
    if (publicSyncBusy.current || !online || !apiConfigured()) return;
    const snapshot = stateRef.current;
    if (!snapshot) return;
    const pending = snapshot.orders.filter(o => o.source === 'cliente' && !o.remoteId);
    if (!pending.length) return;
    publicSyncBusy.current = true;
    try {
      for (const order of pending.slice(0, 5)) {
        try {
          const result = await submitPublicOrder(order);
          updateState(current => ({
            ...current,
            orders: current.orders.map(item => item.id === order.id ? { ...item, remoteId: result.id } : item)
          }));
        } catch {
          // Retry on the next cycle.
        }
      }
    } finally {
      publicSyncBusy.current = false;
    }
  }

  async function refreshFromServer() {
    const local = stateRef.current;
    const token = local?.admin?.token;
    if (!token || !online || !apiConfigured()) {
      setMessage(online ? 'Primero configura el acceso en línea.' : 'Estás sin conexión.');
      return;
    }

    setSyncState('saving');
    try {
      const localIsUnsynced = Boolean(local.lastLocalChangeAt && (!local.lastSyncAt || local.lastLocalChangeAt > local.lastSyncAt));
      if (localIsUnsynced) {
        await putCloudState(token, local);
        if (local.settings.autoBackup) await uploadBackup(token, local);
      }

      const [remoteState, publicOrders] = await Promise.all([
        getCloudState(token),
        getPublicOrders(token)
      ]);

      const mapped = publicOrders.map(mapPublicOrder);
      const byRemote = new Map(mapped.map(o => [o.remoteId || o.id, o]));
      const remoteOrders = remoteState.orders.map(order => {
        const publicOrder = order.remoteId ? byRemote.get(order.remoteId) : undefined;
        return publicOrder ? { ...order, ...publicOrder, id: order.id, remoteId: order.remoteId } : order;
      });
      const known = new Set(remoteOrders.map(o => o.remoteId).filter(Boolean));
      remoteOrders.push(...mapped.filter(o => !known.has(o.remoteId || o.id)));

      const next = recalculateBusinessState({
        ...remoteState,
        orders: remoteOrders,
        admin: local.admin,
        lastSyncAt: new Date().toISOString()
      });
      stateRef.current = next;
      setState(next);
      setSyncState('saved');
      setMessage(localIsUnsynced ? 'Cambios guardados y sincronizados en todos tus dispositivos.' : 'Datos actualizados automáticamente.');
    } catch (error) {
      console.error(error);
      setSyncState('error');
      setMessage('No se pudo actualizar la nube. Tus datos locales se conservaron y se reintentará automáticamente.');
    }
  }

  function mapPublicOrder(o: any): Order {
    const items: OrderItem[] = Array.isArray(o.items) ? o.items.map((item: any) => ({
      productId: String(item.productId ?? item.product_id ?? ''),
      productName: String(item.productName ?? item.product_name ?? 'Producto'),
      quantity: Math.max(1, number(item.quantity, 1)),
      unitPrice: Math.max(0, number(item.unitPrice ?? item.unit_price)),
      cost: Math.max(0, number(item.cost)),
      subtotal: Math.max(0, number(item.subtotal)),
      customizations: item.customizations && typeof item.customizations === 'object' ? item.customizations : undefined
    })) : [];

    return {
      id: String(o.id),
      remoteId: String(o.id),
      createdAt: new Date(o.creado_en ?? Date.now()).toISOString(),
      customerName: String(o.cliente_nombre ?? 'Cliente'),
      customerPhone: String(o.telefono ?? ''),
      address: o.direccion ? String(o.direccion) : undefined,
      notes: o.notas ? String(o.notas) : undefined,
      items,
      subtotal: number(o.subtotal),
      discount: number(o.descuento),
      total: number(o.total),
      status: STATUS_LABELS[o.estado as OrderStatus] ? o.estado as OrderStatus : 'pendiente',
      paid: 0,
      source: 'cliente'
    };
  }

  async function doLogin() {
    if (!state) return;
    const phone = normalizePhone(loginPhone);
    const pin = loginPin.replace(/\D/g, '');
    if (phone.length < 6 || pin.length < 4) {
      setMessage('Ingresa un teléfono válido y un PIN de al menos 4 dígitos.');
      return;
    }

    if (apiConfigured() && online) {
      try {
        const result = await login(phone, pin);
        const admin: LocalAdmin = {
          name: (result.usuario.nombre + ' ' + result.usuario.apellido).trim(),
          phone,
          pinHash: await hashPin(pin),
          token: result.token
        };
        updateState(current => ({ ...current, admin }));
        await writeSessionToken(result.token);
        setLogged(true);
        setMessage('Acceso correcto. Sincronizando…');
        window.setTimeout(() => { void refreshFromServer(); }, 0);
        return;
      } catch (error) {
        console.error(error);
        setMessage('No se pudo acceder en línea. Probando la cuenta guardada en este dispositivo.');
      }
    }

    const admin = state.admin;
    if (!admin || admin.phone !== phone || admin.pinHash !== await hashPin(pin)) {
      setMessage('Teléfono o PIN incorrectos. Puedes configurar este dispositivo.');
      return;
    }

    setLogged(true);
    setMessage('Acceso local correcto.');
  }

  function setupLocalAdmin() {
    void (async () => {
      const phone = normalizePhone(setupPhone);
      const pin = setupPin.replace(/\D/g, '');
      if (!setupName.trim() || phone.length < 6 || pin.length < 4) {
        setMessage('Completa nombre, teléfono y un PIN de 4 a 12 dígitos.');
        return;
      }
      const admin: LocalAdmin = {
        name: setupName.trim(),
        phone,
        pinHash: await hashPin(pin)
      };
      updateState(current => ({ ...current, admin }));
      setLoginPhone(phone);
      setSetupOpen(false);
      setLogged(true);
      setMessage('Dispositivo configurado. Tus datos ya se guardan automáticamente.');
    })();
  }


  function addMoney(move: Omit<MoneyMove, 'id' | 'date'>) {
    updateState(current => ({
      ...current,
      money: [{ ...move, id: uid('mov'), date: new Date().toISOString() }, ...current.money]
    }));
  }

  function createProduct(form: { name: string; category: string; price: number; cost: number; stock: number; description: string }) {
    updateState(current => ({
      ...current,
      products: [{
        id: uid('prd'),
        name: form.name.trim(),
        description: form.description.trim(),
        category: form.category.trim() || 'General',
        categories: [form.category.trim() || 'General'],
        price: Math.max(0, number(form.price)),
        cost: Math.max(0, number(form.cost)),
        stock: Math.max(0, number(form.stock)),
        active: true,
        seasonal: false,
        tags: [],
        flavors: [],
        sizes: [],
        presentation: ''
      }, ...current.products]
    }));
  }

  function updateProduct(id: string, patch: Partial<Product>) {
    updateState(current => ({
      ...current,
      products: current.products.map(product => product.id === id ? { ...product, ...patch } : product)
    }));
  }

  function addIngredient(form: Omit<Ingredient, 'id'>) {
    updateState(current => ({
      ...current,
      ingredients: [{ ...form, id: uid('ing'), unitCost: number(form.unitCost), stock: Math.max(0, number(form.stock)), minStock: Math.max(0, number(form.minStock)) }, ...current.ingredients]
    }));
  }

  function changeStock(id: string, delta: number) {
    updateState(current => ({
      ...current,
      ingredients: current.ingredients.map(item => item.id === id ? { ...item, stock: Math.max(0, Number((item.stock + delta).toFixed(4))) } : item)
    }));
  }

  function addOrder(order: Order) {
    updateState(current => ({
      ...current,
      orders: [order, ...current.orders],
      money: order.paid > 0 ? [{
        id: uid('mov'),
        date: new Date().toISOString(),
        type: 'venta',
        amount: order.paid,
        description: 'Pago del pedido ' + order.id.slice(-6),
        category: order.paymentMethod || 'venta',
        method: order.paymentMethod || 'efectivo'
      }, ...current.money] : current.money
    }));
  }

  function changeOrder(id: string, patch: Partial<Order>) {
    const before = stateRef.current?.orders.find(o => o.id === id);
    if (!before) return;

    if (patch.status === 'preparando' && !before.inventoryDeducted) {
      const shortages: string[] = [];
      for (const item of before.items) {
        const productIds = item.productId.startsWith('combo_')
          ? (stateRef.current?.combos.find(c => c.id === item.productId.slice(6))?.productIds || []).map(id => ({ productId: id, quantity: item.quantity }))
          : [{ productId: item.productId, quantity: item.quantity }];

        for (const entry of productIds) {
          const recipe = stateRef.current?.recipes.find(r => r.productId === entry.productId);
          if (!recipe) continue;
          for (const line of recipe.ingredients) {
            const ingredient = stateRef.current?.ingredients.find(i => i.id === line.ingredientId);
            const required = (line.quantity / Math.max(1, recipe.yieldUnits)) * entry.quantity;
            if (ingredient && ingredient.stock + 0.000001 < required) {
              shortages.push(ingredient.name + ': faltan ' + (required - ingredient.stock).toFixed(2) + ' ' + ingredient.unit);
            }
          }
        }
      }
      if (shortages.length) {
        setMessage('No se puede preparar: ' + shortages.join(', '));
        return;
      }
    }

    updateState(current => {
      const currentOrder = current.orders.find(o => o.id === id);
      if (!currentOrder) return current;
      const next = { ...currentOrder, ...patch };
      const paidDelta = number(next.paid) - number(currentOrder.paid);

      let money = current.money;
      if (paidDelta !== 0) {
        money = [{
          id: uid('mov'),
          date: new Date().toISOString(),
          type: paidDelta > 0 ? 'venta' : 'ajuste',
          amount: Math.abs(paidDelta),
          description: 'Pago pedido ' + currentOrder.id.slice(-6),
          category: next.paymentMethod || 'venta',
          method: next.paymentMethod || 'efectivo'
        }, ...money];
      }

      let ingredients = current.ingredients;
      let inventoryDeducted = currentOrder.inventoryDeducted;
      if (patch.status === 'preparando' && !currentOrder.inventoryDeducted) {
        ingredients = current.ingredients.map(ingredient => {
          let stock = ingredient.stock;
          for (const item of currentOrder.items) {
            const entries = item.productId.startsWith('combo_')
              ? (current.combos.find(c => c.id === item.productId.slice(6))?.productIds || []).map(productId => ({ productId, quantity: item.quantity }))
              : [{ productId: item.productId, quantity: item.quantity }];
            for (const entry of entries) {
              const recipe = current.recipes.find(r => r.productId === entry.productId);
              if (!recipe) continue;
              for (const line of recipe.ingredients) {
                if (line.ingredientId === ingredient.id) {
                  stock -= (line.quantity / Math.max(1, recipe.yieldUnits)) * entry.quantity;
                }
              }
            }
          }
          return { ...ingredient, stock: Math.max(0, Number(stock.toFixed(4))) };
        });
        inventoryDeducted = true;
      }

      let customers = current.customers;
      if (patch.status === 'entregada' && currentOrder.status !== 'entregada' && !currentOrder.loyaltyAwardedAt) {
        const found = customers.find(c => c.phone === currentOrder.customerPhone);
        if (found && current.settings.loyaltyPointsPerSol > 0) {
          const points = Math.floor(number(next.total) * current.settings.loyaltyPointsPerSol);
          customers = customers.map(c => c.id === found.id
            ? { ...c, points: c.points + points, level: c.points + points >= 500 ? 'Oro' : c.points + points >= 200 ? 'Plata' : 'Inicial' }
            : c);
        }
        next.loyaltyAwardedAt = new Date().toISOString();
      }

      const notifications = patch.status && patch.status !== currentOrder.status ? [{
        id: uid('not'),
        type: 'pedido' as const,
        title: 'Pedido actualizado',
        message: currentOrder.customerName + ': ' + STATUS_LABELS[patch.status],
        read: false,
        createdAt: new Date().toISOString()
      }, ...current.notifications] : current.notifications;

      return {
        ...current,
        orders: current.orders.map(o => o.id === id ? { ...next, inventoryDeducted } : o),
        money,
        ingredients,
        customers,
        notifications
      };
    });

    if (patch.status && before.source === 'cliente' && before.remoteId) {
      const token = stateRef.current?.admin?.token;
      if (token && online && apiConfigured()) {
        void updatePublicOrderStatus(token, before.remoteId, patch.status).catch(() => setMessage('Guardado localmente. El cambio en nube se reintentará.'));
      }
    }
  }

  function createCustomer(form: { name: string; phone: string; address: string; notes: string }) {
    const phone = normalizePhone(form.phone);
    if (!form.name.trim() || phone.length < 6) {
      setMessage('Nombre y teléfono son obligatorios.');
      return;
    }
    updateState(current => ({
      ...current,
      customers: [{
        id: uid('cus'),
        name: form.name.trim(),
        phone,
        addresses: form.address.trim() ? [{ label: 'Principal', address: form.address.trim() }] : [],
        points: 0,
        level: 'Inicial',
        favorites: [],
        notes: form.notes.trim(),
        createdAt: new Date().toISOString()
      }, ...current.customers]
    }));
  }

  function submitCustomerOrder() {
    if (!state) return;
    const name = customerDraft.name.trim();
    const phone = normalizePhone(customerDraft.phone);
    if (name.length < 2 || phone.length < 6 || !cart.length) {
      setMessage('Completa nombre, teléfono y agrega un producto.');
      return;
    }
    const subtotal = cart.reduce((sum, item) => sum + number(item.subtotal), 0);
    const quantity = cart.reduce((sum, item) => sum + number(item.quantity), 0);
    const now = new Date();
    const promo = state.promotions.find(p =>
      p.active &&
      (!p.code || p.code.toUpperCase() === promoCode.trim().toUpperCase()) &&
      (!p.startAt || new Date(p.startAt) <= now) &&
      (!p.endAt || new Date(p.endAt) >= now)
    );
    let discount = 0;
    if (promo?.type === 'percent') discount = subtotal * Math.min(100, number(promo.value)) / 100;
    if (promo?.type === 'fixed') discount = Math.min(subtotal, Math.max(0, number(promo.value)));
    if (promo?.type === 'quantity' && quantity >= Math.max(1, number(promo.minQuantity, 1))) discount = Math.min(subtotal, Math.max(0, number(promo.value)));
    if (promo?.type === 'date_price') discount = Math.max(0, subtotal - Math.max(0, number(promo.value)));

    const deliveryFee = state.settings.deliveryEnabled && customerDraft.address.trim()
      ? Math.max(0, number(state.settings.deliveryFee))
      : 0;
    const total = Math.max(0, Number((subtotal - discount + deliveryFee).toFixed(2)));

    const order: Order = {
      id: uid('ord'),
      createdAt: new Date().toISOString(),
      customerName: name,
      customerPhone: phone,
      address: customerDraft.address.trim(),
      notes: customerDraft.notes.trim(),
      items: cart,
      subtotal: Number(subtotal.toFixed(2)),
      discount: Number(discount.toFixed(2)),
      total,
      status: 'pendiente',
      paid: 0,
      discountCode: promo?.code,
      source: 'cliente'
    };

    addOrder(order);
    setCart([]);
    setCustomerDraft({ name: '', phone: '', address: '', notes: '' });
    setPromoCode('');
    setMessage('Pedido guardado. Se enviará automáticamente cuando haya conexión.');
  }

  function addToCart(product: Product) {
    setCart(current => {
      const found = current.find(item => item.productId === product.id);
      if (found) {
        const quantity = found.quantity + 1;
        return current.map(item => item.productId === product.id
          ? { ...item, quantity, subtotal: Number((quantity * item.unitPrice).toFixed(2)) }
          : item);
      }
      return current.concat([{
        productId: product.id,
        productName: product.name,
        quantity: 1,
        unitPrice: product.price,
        cost: product.cost,
        subtotal: product.price
      }]);
    });
  }

  function addComboToCart(combo: BusinessState['combos'][number]) {
    const cost = combo.productIds.reduce((sum, id) => sum + number(stateRef.current?.products.find(p => p.id === id)?.cost), 0);
    const productId = 'combo_' + combo.id;
    setCart(current => {
      const found = current.find(item => item.productId === productId);
      if (found) {
        const quantity = found.quantity + 1;
        return current.map(item => item.productId === productId
          ? { ...item, quantity, subtotal: Number((quantity * item.unitPrice).toFixed(2)) }
          : item);
      }
      return current.concat([{
        productId,
        productName: combo.name,
        quantity: 1,
        unitPrice: number(combo.price),
        cost,
        subtotal: number(combo.price)
      }]);
    });
  }

  function changeCartQuantity(productId: string, delta: number) {
    setCart(current => current.flatMap(item => {
      if (item.productId !== productId) return [item];
      const quantity = item.quantity + delta;
      return quantity > 0
        ? [{ ...item, quantity, subtotal: Number((quantity * item.unitPrice).toFixed(2)) }]
        : [];
    }));
  }

  if (!ready || !state) {
    return <div className="splash"><div className="brand-mark">DB</div><h1>Diego Bakery</h1><p>Preparando tu negocio…</p></div>;
  }

  const theme = state.settings.theme === 'dark' ? 'dark' : state.settings.theme === 'light' ? 'light' : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const isCustomer = mode === 'cliente';

  if (isCustomer) {
    return <CustomerView
      products={activeProducts}
      cart={cart}
      addToCart={addToCart}
      customer={customerDraft}
      setCustomer={setCustomerDraft}
      promoCode={promoCode}
      setPromoCode={setPromoCode}
      promotions={state.promotions}
      combos={state.combos}
      submit={submitCustomerOrder}
      onAdmin={() => setMode('admin')}
      theme={theme}
      message={message}
      settings={state.settings}
      addCombo={addComboToCart}
      changeCartQuantity={changeCartQuantity}
    />;
  }

  if (!logged) {
    return (
      <AuthScreen
        theme={theme}
        online={online}
        message={message}
        loginPhone={loginPhone}
        loginPin={loginPin}
        setLoginPhone={setLoginPhone}
        setLoginPin={setLoginPin}
        setupOpen={setupOpen}
        setSetupOpen={setSetupOpen}
        setupName={setupName}
        setupPhone={setupPhone}
        setupPin={setupPin}
        setSetupName={setSetupName}
        setSetupPhone={setSetupPhone}
        setSetupPin={setSetupPin}
        doLogin={doLogin}
        setupLocalAdmin={setupLocalAdmin}
        onCustomer={() => { setMode('cliente'); setMessage(''); }}
      />
    );
  }

  return (
    <div className={'app-shell ' + theme}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark small">DB</div>
          <div><strong>{state.settings.businessName}</strong><span>Gestión integral</span></div>
        </div>
        <div className="sidebar-search">
          <input aria-label="Buscar en el negocio" value={globalSearch} onChange={e => setGlobalSearch(e.target.value)} placeholder="Buscar..." />
        </div>
        <nav>
          {NAV.map(item => (
            <button
              key={item.id}
              className={'nav-item ' + (section === item.id ? 'active' : '')}
              onClick={() => setSection(item.id)}
            >
              <span><b className="nav-icon">{item.icon}</b>{item.label}</span>
              {item.badge && pendingOrders > 0 ? <b className="nav-count">{pendingOrders}</b> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="secondary wide" onClick={() => { setMode('cliente'); setMessage(''); }}>Vista de cliente</button>
          <button className="link-button" onClick={() => { setLogged(false); updateState(current => ({ ...current, admin: current.admin ? { ...current.admin, token: undefined } : undefined })); void clearSessionToken(); }}>Cerrar sesión</button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-main">
            <p className="eyebrow">{section === 'inicio' ? 'CONTROL DIARIO' : section.toUpperCase()}</p>
            <h2>{sectionTitle(section)}</h2>
          </div>
          <div className="top-actions">
            <span className={'sync-chip ' + syncState}>
              <span className="sync-dot"></span>
              {online ? (syncState === 'error' ? 'Pendiente de sincronizar' : syncState === 'saving' ? 'Guardando...' : 'En línea') : 'Sin conexión'}
            </span>
            <button className="icon-button" title="Actualizar datos" onClick={() => void refreshFromServer()}>↻</button>
          </div>
        </header>

        {message ? <div className="toast" role="status">{message}</div> : null}

        {globalSearch.trim() ? (
          <GlobalSearchOverlay state={state} query={globalSearch} onOpen={setSection} onClose={() => setGlobalSearch('')} />
        ) : null}

        {section === 'inicio' && <Dashboard state={state} derived={derived} openSection={setSection} />}
        {section === 'pedidos' && <OrdersView state={state} onUpdate={changeOrder} query={globalSearch} />}
        {section === 'productos' && <ProductsView products={products} onCreate={createProduct} onUpdate={updateProduct} query={globalSearch} />}
        {section === 'ingredientes' && <IngredientsView ingredients={state.ingredients} onAdd={addIngredient} onStock={changeStock} query={globalSearch} />}
        {section === 'recetas' && <RecipesView state={state} setState={commitState} />}
        {section === 'proveedores' && <SuppliersView suppliers={state.suppliers} setSuppliers={items => updateState(current => ({ ...current, suppliers: items }))} />}
        {section === 'clientes' && <CustomersView customers={state.customers} setCustomers={items => updateState(current => ({ ...current, customers: items }))} />}
        {section === 'finanzas' && <FinanceView moves={state.money} addMoney={addMoney} balance={derived.cash} />}
        {section === 'caja' && <CashRegisterView register={state.cashRegister} setRegister={register => updateState(current => ({ ...current, cashRegister: register }))} moneyMoves={state.money} />}
        {section === 'promociones' && <PromotionsView promotions={state.promotions} products={state.products} setPromotions={items => updateState(current => ({ ...current, promotions: items }))} />}
        {section === 'combinaciones' && <CombosView combos={state.combos} products={state.products} setCombos={items => updateState(current => ({ ...current, combos: items }))} />}
        {section === 'lealtad' && <LoyaltyView rewards={state.loyaltyRewards} setRewards={items => updateState(current => ({ ...current, loyaltyRewards: items }))} customers={state.customers} />}
        {section === 'notificaciones' && <NotificationsView items={state.notifications} setItems={items => updateState(current => ({ ...current, notifications: items }))} />}
        {section === 'servicios' && <ServicesView services={state.services} setServices={items => updateState(current => ({ ...current, services: items }))} />}
        {section === 'deudas' && <DebtsView debts={state.debts} setDebts={items => updateState(current => ({ ...current, debts: items }))} />}
        {section === 'perdidas' && <LossesView state={state} setState={commitState} />}
        {section === 'reportes' && <ReportsView state={state} derived={derived} />}
        {section === 'asistente' && <BusinessAiView state={state} derived={derived} token={state.admin?.token} />}
        {section === 'editar' && <UniversalEditor state={state} onChange={updateState} />}
        {section === 'ajustes' && <SettingsView state={state} update={patch => updateState(current => ({ ...current, settings: { ...current.settings, ...patch } }))} exportBackup={() => downloadBackup(state)} onRestore={async file => { const restored = await restoreBackup(file); stateRef.current = restored; commitState(restored); setMessage('Respaldo restaurado.'); }} healthCheck={async () => { try { await pingHealth(); setMessage('Servidor disponible.'); } catch { setMessage('No se pudo contactar al servidor.'); } }} />}
      </main>
    </div>
  );
}

function AuthScreen(props: {
  theme: string; online: boolean; message: string; loginPhone: string; loginPin: string;
  setLoginPhone: (v: string) => void; setLoginPin: (v: string) => void;
  setupOpen: boolean; setSetupOpen: (v: boolean) => void; setupName: string; setupPhone: string; setupPin: string;
  setSetupName: (v: string) => void; setSetupPhone: (v: string) => void; setSetupPin: (v: string) => void;
  doLogin: () => void; setupLocalAdmin: () => void; onCustomer: () => void;
}) {
  return (
    <div className={'auth-screen ' + props.theme}>
      <div className="auth-card">
        <div className="brand-mark">DB</div>
        <p className="eyebrow">GESTIÓN INTEGRAL</p>
        <h1>Diego Bakery</h1>
        <p className="muted">Pedidos, productos, inventario, dinero y reportes en un solo lugar.</p>
        <div className="mode-switch">
          <button className="active">Administrador</button>
          <button onClick={props.onCustomer}>Cliente</button>
        </div>
        <label>Teléfono<input value={props.loginPhone} onChange={e => props.setLoginPhone(e.target.value.replace(/\D/g, '').slice(0, 15))} inputMode="tel" placeholder="999999999" /></label>
        <label>PIN<input value={props.loginPin} onChange={e => props.setLoginPin(e.target.value.replace(/\D/g, '').slice(0, 12))} type="password" inputMode="numeric" placeholder="••••" /></label>
        <button className="primary wide" onClick={props.doLogin}>Entrar</button>
        <button className="secondary wide" onClick={() => props.setSetupOpen(true)}>Configurar este dispositivo</button>
        <button className="link-button wide" onClick={props.onCustomer}>Entrar al catálogo de cliente</button>
        <span className="offline-badge">{props.online ? '● En línea' : '○ Sin conexión'} · guardado local automático</span>
        {props.message ? <div className="notice">{props.message}</div> : null}
      </div>
      {props.setupOpen ? <Modal title="Configurar administrador" onClose={() => props.setSetupOpen(false)}>
        <label>Nombre<input value={props.setupName} onChange={e => props.setSetupName(e.target.value)} /></label>
        <label>Teléfono<input value={props.setupPhone} onChange={e => props.setSetupPhone(e.target.value.replace(/\D/g, '').slice(0, 15))} /></label>
        <label>PIN<input value={props.setupPin} onChange={e => props.setSetupPin(e.target.value.replace(/\D/g, '').slice(0, 12))} type="password" /></label>
        <button className="primary wide" onClick={props.setupLocalAdmin}>Guardar y entrar</button>
      </Modal> : null}
    </div>
  );
}

function Dashboard({ state, derived, openSection }: { state: BusinessState; derived: any; openSection: (section: Section) => void }) {
  const todayOrders = state.orders.filter(o => o.createdAt.slice(0, 10) === dateKey()).slice(0, 6);
  return (
    <div className="content">
      <div className="metrics">
        <Metric label="Ventas de hoy" value={money(derived.todaySales)} hint={money(derived.monthSales) + ' este mes'} onClick={() => openSection('finanzas')} />
        <Metric label="Caja" value={money(derived.cash)} hint="Solo efectivo" onClick={() => openSection('caja')} />
        <Metric label="Pedidos pendientes" value={String(derived.pending)} hint={derived.todayOrders + ' pedidos hoy'} onClick={() => openSection('pedidos')} />
        <Metric label="Valor de inventario" value={money(derived.inventoryValue)} hint={derived.lowStock.length + ' alertas'} onClick={() => openSection('ingredientes')} />
      </div>
      <div className="quick-actions">
        <button className="quick primary" onClick={() => openSection('pedidos')}><b>＋</b><span>Revisar pedidos</span></button>
        <button className="quick secondary" onClick={() => openSection('productos')}><b>▣</b><span>Gestionar productos</span></button>
        <button className="quick secondary" onClick={() => openSection('ingredientes')}><b>◫</b><span>Revisar stock</span></button>
        <button className="quick secondary" onClick={() => openSection('reportes')}><b>▥</b><span>Ver reportes</span></button>
      </div>
      <div className="grid-2">
        <section className="panel">
          <div className="panel-head"><div><p className="eyebrow">HOY</p><h3>Pedidos recientes</h3></div><button className="link-button" onClick={() => openSection('pedidos')}>Ver todos →</button></div>
          {todayOrders.length ? <div className="compact-list">{todayOrders.map(order => <button className="compact-row" key={order.id} onClick={() => openSection('pedidos')}><span><strong>{order.customerName}</strong><small>{order.items.length} producto(s) · {formatDate(order.createdAt)}</small></span><span className={'status status-' + order.status}>{STATUS_LABELS[order.status]}</span><b>{money(order.total)}</b></button>)}</div> : <Empty text="Todavía no hay pedidos hoy." />}
        </section>
        <section className="panel">
          <div className="panel-head"><div><p className="eyebrow">ATENCIÓN</p><h3>Alertas automáticas</h3></div><button className="link-button" onClick={() => openSection('notificaciones')}>Abrir avisos →</button></div>
          {derived.lowStock.length ? <div className="compact-list">{derived.lowStock.slice(0, 6).map((i: Ingredient) => <button className="compact-row" key={i.id} onClick={() => openSection('ingredientes')}><span><strong>{i.name}</strong><small>Proveedor: {i.supplier || 'Sin proveedor'}</small></span><b className="danger-text">{i.stock} {i.unit}</b></button>)}</div> : <Empty text="No hay alertas de stock." />}
        </section>
      </div>
      <div className="grid-3">
        <StatCard title="Cobrar" value={money(derived.receivable)} action={() => openSection('deudas')} />
        <StatCard title="Pagar" value={money(derived.payable)} action={() => openSection('deudas')} />
        <StatCard title="Ticket promedio" value={money(derived.averageTicket)} action={() => openSection('reportes')} />
      </div>
      <section className="panel">
        <div className="panel-head"><div><p className="eyebrow">AUTOMÁTICO</p><h3>Lo que la app calcula por ti</h3></div></div>
        <div className="check-grid">
          {[
            'Totales de ventas por día y mes',
            'Saldo de caja según movimientos',
            'Valor del inventario por stock × costo',
            'Descuento y total del carrito',
            'Costo y margen de recetas',
            'Alertas de stock bajo',
            'Puntos de fidelidad al entregar',
            'Sincronización y respaldo automático'
          ].map(item => <div className="check" key={item}><span>✓</span>{item}</div>)}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, hint, onClick }: { label: string; value: string; hint?: string; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div';
  return <Tag className="metric metric-button" onClick={onClick}><span>{label}</span><strong>{value}</strong>{hint ? <small>{hint}</small> : null}</Tag>;
}

function StatCard({ title, value, action }: { title: string; value: string; action: () => void }) {
  return <button className="stat-card" onClick={action}><span>{title}</span><strong>{value}</strong><b>Ver detalle →</b></button>;
}

function Empty({ text }: { text: string }) {
  return <div className="empty"><span>{text}</span></div>;
}

function OrdersView({ state, onUpdate, query }: { state: BusinessState; onUpdate: (id: string, patch: Partial<Order>) => void; query: string }) {
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'pendiente' | 'pagado'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const list = state.orders.filter(o => {
    const hay = (o.customerName + ' ' + o.customerPhone + ' ' + o.id + ' ' + o.items.map(i => i.productName).join(' ')).toLowerCase();
    const matchesSearch = !query.trim() || hay.includes(query.trim().toLowerCase());
    const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
    const matchesPayment = paymentFilter === 'all' || (paymentFilter === 'pagado' ? o.paid >= o.total : o.paid < o.total);
    return matchesSearch && matchesStatus && matchesPayment;
  });
  return <div className="content">
    <FilterBar title="Pedidos" count={list.length}>
      <input value={query} readOnly placeholder="Usa el buscador de la barra lateral" />
      <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'all' | OrderStatus)}>
        <option value="all">Todos los estados</option>
        {(Object.keys(STATUS_LABELS) as OrderStatus[]).map(k => <option key={k} value={k}>{STATUS_LABELS[k]}</option>)}
      </select>
      <select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value as 'all' | 'pendiente' | 'pagado')}><option value="all">Todo pago</option><option value="pendiente">Pendiente de pago</option><option value="pagado">Pagado</option></select>
    </FilterBar>
    <section className="panel">
      {list.length ? <div className="order-list">{list.map(o => {
        const remaining = Math.max(0, number(o.total) - number(o.paid));
        const next = nextStatus(o.status);
        return <article className="order-card" key={o.id}>
          <div className="order-main">
            <div><strong>{o.customerName}</strong><span>{o.customerPhone || 'Sin teléfono'} · {formatDate(o.createdAt)}</span>{o.address ? <span>{o.address}</span> : null}</div>
            <div className="order-total"><b>{money(o.total)}</b><span className={'status status-' + o.status}>{STATUS_LABELS[o.status]}</span></div>
          </div>
          <div className="order-items">{o.items.map((i, idx) => <span key={i.productId + '-' + idx}>{i.quantity}× {i.productName}</span>)}</div>
          {openId === o.id ? <div className="detail-drawer">
            <div className="detail-grid"><div><span>Subtotal</span><b>{money(o.subtotal)}</b></div><div><span>Descuento</span><b>{money(o.discount)}</b></div><div><span>Total</span><b>{money(o.total)}</b></div><div><span>Pendiente</span><b className={remaining > 0 ? 'danger-text' : ''}>{money(remaining)}</b></div></div>
            {o.notes ? <div className="notice">Nota: {o.notes}</div> : null}
          </div> : null}
          <div className="order-actions">
            {next ? <button className="primary" onClick={() => onUpdate(o.id, { status: next })}>Pasar a: {STATUS_LABELS[next]}</button> : <button className="secondary" disabled>Estado final</button>}
            <select value={o.status} onChange={e => onUpdate(o.id, { status: e.target.value as OrderStatus })}>{(Object.keys(STATUS_LABELS) as OrderStatus[]).map(k => <option key={k} value={k}>{STATUS_LABELS[k]}</option>)}</select>
            <select value={o.paymentMethod || ''} onChange={e => onUpdate(o.id, { paymentMethod: e.target.value as any || undefined })}><option value="">Forma de pago</option><option value="efectivo">Efectivo</option><option value="yape">Yape</option><option value="plin">Plin</option><option value="transferencia">Transferencia</option><option value="otro">Otro</option></select>
            <input type="number" min="0" max={o.total} step="0.01" value={o.paid} onChange={e => onUpdate(o.id, { paid: Math.min(number(o.total), Math.max(0, number(e.target.value))) })} aria-label="Pago recibido" />
            <button className="secondary" onClick={() => setOpenId(openId === o.id ? null : o.id)}>{openId === o.id ? 'Ocultar detalle' : 'Ver detalle'}</button>
          </div>
        </article>;
      })}</div> : <Empty text="No hay pedidos que coincidan con estos filtros." />}
    </section>
  </div>;
}

function FilterBar({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return <section className="filter-bar"><div><p className="eyebrow">LISTA</p><h3>{title}<span>{count}</span></h3></div><div className="filter-controls">{children}</div></section>;
}

function ProductsView({ products, onCreate, onUpdate, query }: { products: Product[]; onCreate: (form: { name: string; category: string; price: number; cost: number; stock: number; description: string }) => void; onUpdate: (id: string, patch: Partial<Product>) => void; query: string }) {
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [category, setCategory] = useState('all');
  const [open, setOpen] = useState(false);
  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean)));
  const [form, setForm] = useState({ name: '', category: '', price: '', cost: '', stock: '0', description: '' });
  const list = products.filter(p => (!query || (p.name + ' ' + p.category + ' ' + p.description).toLowerCase().includes(query.toLowerCase())) && (activeFilter === 'all' || (activeFilter === 'active' ? p.active : !p.active)) && (category === 'all' || p.category === category));
  function submit() {
    const price = number(form.price), cost = number(form.cost), stock = number(form.stock);
    if (!form.name.trim() || price <= 0 || cost < 0 || stock < 0) return;
    onCreate({ name: form.name, category: form.category, price, cost, stock, description: form.description });
    setForm({ name: '', category: '', price: '', cost: '', stock: '0', description: '' });
    setOpen(false);
  }
  return <div className="content">
    <FilterBar title="Productos" count={list.length}>
      <select value={activeFilter} onChange={e => setActiveFilter(e.target.value as 'all' | 'active' | 'inactive')}><option value="all">Todos</option><option value="active">Activos</option><option value="inactive">Ocultos</option></select>
      <select value={category} onChange={e => setCategory(e.target.value)}><option value="all">Todas las categorías</option>{categories.map(c => <option key={c}>{c}</option>)}</select>
      <button className="primary" onClick={() => setOpen(true)}>＋ Nuevo producto</button>
    </FilterBar>
    <section className="product-grid">{list.map(p => {
      const margin = p.price > 0 ? ((p.price - p.cost) / p.price) * 100 : 0;
      return <article className={'product-card ' + (!p.active ? 'inactive' : '')} key={p.id}>
        <div className="product-placeholder">{p.name.slice(0, 1).toUpperCase()}</div>
        <div className="product-card-body">
          <span className="eyebrow">{p.category}</span><h3>{p.name}</h3><p>{p.description || 'Sin descripción.'}</p>
          <div className="price-row"><strong>{money(p.price)}</strong><span className={margin < 30 ? 'warning-text' : 'success-text'}>{margin.toFixed(0)}% margen</span></div>
          <div className="mini-grid">
            <label>Precio<input type="number" min="0" step="0.01" value={p.price} onChange={e => onUpdate(p.id, { price: Math.max(0, number(e.target.value)) })} /></label>
            <label>Costo<input type="number" min="0" step="0.01" value={p.cost} onChange={e => onUpdate(p.id, { cost: Math.max(0, number(e.target.value)) })} /></label>
          </div>
          <div className="mini-grid"><label>Stock<input type="number" min="0" step="1" value={p.stock} onChange={e => onUpdate(p.id, { stock: Math.max(0, number(e.target.value)) })} /></label><label>Estado<select value={p.active ? 'active' : 'inactive'} onChange={e => onUpdate(p.id, { active: e.target.value === 'active' })}><option value="active">Activo</option><option value="inactive">Oculto</option></select></label></div>
        </div>
      </article>;
    })}</section>
    {open ? <Modal title="Nuevo producto" onClose={() => setOpen(false)}>
      <label>Nombre<input autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
      <label>Categoría<input list="category-list" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /><datalist id="category-list">{categories.map(c => <option key={c} value={c} />)}</datalist></label>
      <div className="form-grid"><label>Precio<input type="number" min="0" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} /></label><label>Costo<input type="number" min="0" step="0.01" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} /></label><label>Stock<input type="number" min="0" step="1" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} /></label></div>
      <label>Descripción<textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
      <button className="primary wide" onClick={submit}>Guardar producto</button>
    </Modal> : null}
  </div>;
}

function IngredientsView({ ingredients, onAdd, onStock, query }: { ingredients: Ingredient[]; onAdd: (form: Omit<Ingredient, 'id'>) => void; onStock: (id: string, delta: number) => void; query: string }) {
  const [lowOnly, setLowOnly] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', unit: 'g', unitCost: '', stock: '', minStock: '', supplier: '', expiration: '' });
  const list = ingredients.filter(i => (!query || (i.name + ' ' + i.supplier).toLowerCase().includes(query.toLowerCase())) && (!lowOnly || (i.stock <= i.minStock && i.minStock > 0)));
  function submit() {
    if (!form.name.trim() || !form.unit || number(form.unitCost) < 0 || number(form.stock) < 0 || number(form.minStock) < 0) return;
    onAdd({ name: form.name.trim(), unit: form.unit.trim(), unitCost: number(form.unitCost), stock: number(form.stock), minStock: number(form.minStock), supplier: form.supplier.trim(), expiration: form.expiration || undefined });
    setForm({ name: '', unit: 'g', unitCost: '', stock: '', minStock: '', supplier: '', expiration: '' });
    setOpen(false);
  }
  return <div className="content">
    <FilterBar title="Inventario" count={list.length}>
      <label className="inline-check"><input type="checkbox" checked={lowOnly} onChange={e => setLowOnly(e.target.checked)} /> Solo stock bajo</label>
      <button className="primary" onClick={() => setOpen(true)}>＋ Nuevo ingrediente</button>
    </FilterBar>
    <section className="panel">
      {list.length ? <div className="table-wrap"><table><thead><tr><th>Ingrediente</th><th>Costo</th><th>Stock</th><th>Mínimo</th><th>Proveedor</th><th>Vence</th><th></th></tr></thead><tbody>{list.map(i => {
        const low = i.stock <= i.minStock && i.minStock > 0;
        return <tr key={i.id}><td><strong>{i.name}</strong><span className="sub">{i.unit}</span></td><td>{money(i.unitCost)}</td><td className={low ? 'danger-text' : ''}>{i.stock} {i.unit}</td><td>{i.minStock} {i.unit}</td><td>{i.supplier || '—'}</td><td>{i.expiration || '—'}</td><td className="nowrap"><button className="small-button" onClick={() => onStock(i.id, 1)}>＋</button><button className="small-button" onClick={() => onStock(i.id, -1)}>−</button></td></tr>;
      })}</tbody></table></div> : <Empty text="No hay ingredientes que coincidan." />}
    </section>
    {open ? <Modal title="Nuevo ingrediente" onClose={() => setOpen(false)}>
      <div className="form-grid"><label>Ingrediente<input autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label><label>Unidad<input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="g, kg, ml, und..." /></label><label>Costo unitario<input type="number" min="0" step="0.001" value={form.unitCost} onChange={e => setForm({ ...form, unitCost: e.target.value })} /></label><label>Stock inicial<input type="number" min="0" step="0.001" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} /></label><label>Stock mínimo<input type="number" min="0" step="0.001" value={form.minStock} onChange={e => setForm({ ...form, minStock: e.target.value })} /></label><label>Proveedor<input value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} /></label></div>
      <label>Fecha de vencimiento<input type="date" value={form.expiration} onChange={e => setForm({ ...form, expiration: e.target.value })} /></label>
      <button className="primary wide" onClick={submit}>Guardar ingrediente</button>
    </Modal> : null}
  </div>;
}

function FinanceView({ moves, addMoney, balance }: { moves: MoneyMove[]; addMoney: (m: Omit<MoneyMove, 'id' | 'date'>) => void; balance: number }) {
  const [type, setType] = useState<MoneyMoveType>('gasto');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [filter, setFilter] = useState<'all' | MoneyMoveType>('all');
  const list = moves.filter(m => filter === 'all' || m.type === filter);
  const submit = () => {
    const n = number(amount);
    if (n <= 0 || !description.trim()) return;
    addMoney({ type, amount: n, description: description.trim(), category: category.trim() || MOVE_LABELS[type], method: 'efectivo' });
    setAmount(''); setDescription(''); setCategory('');
  };
  return <div className="content">
    <div className="metrics"><Metric label="Saldo de caja" value={money(balance)} /><Metric label="Movimientos" value={String(moves.length)} /></div>
    <div className="grid-2">
      <section className="panel"><div className="panel-head"><div><p className="eyebrow">REGISTRAR</p><h3>Movimiento</h3></div></div>
        <div className="form-grid"><label>Tipo<select value={type} onChange={e => setType(e.target.value as MoneyMoveType)}>{(Object.keys(MOVE_LABELS) as MoneyMoveType[]).map(k => <option value={k} key={k}>{MOVE_LABELS[k]}</option>)}</select></label><label>Monto<input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></label></div>
        <label>Descripción<input value={description} onChange={e => setDescription(e.target.value)} placeholder="Ej. compra de harina" /></label>
        <label>Categoría<input value={category} onChange={e => setCategory(e.target.value)} placeholder="Se completa sola si queda vacía" /></label>
        <button className="primary wide" onClick={submit}>Registrar movimiento</button>
      </section>
      <section className="panel"><FilterBar title="Historial" count={list.length}><select value={filter} onChange={e => setFilter(e.target.value as 'all' | MoneyMoveType)}><option value="all">Todos</option>{(Object.keys(MOVE_LABELS) as MoneyMoveType[]).map(k => <option key={k}>{MOVE_LABELS[k]}</option>)}</select></FilterBar>
        <div className="compact-list">{list.slice(0, 20).map(m => <div className="compact-row" key={m.id}><span><strong>{m.description}</strong><small>{MOVE_LABELS[m.type]} · {formatDate(m.date)}</small></span><b className={['gasto','retiro','pago_deuda'].includes(m.type) ? 'danger-text' : 'success-text'}>{['gasto','retiro','pago_deuda'].includes(m.type) ? '-' : '+'}{money(m.amount)}</b></div>)}</div>
      </section>
    </div>
  </div>;
}

function DebtsView({ debts, setDebts }: { debts: Debt[]; setDebts: (items: Debt[]) => void }) {
  const [type, setType] = useState<'cobrar' | 'pagar'>('cobrar');
  const [person, setPerson] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'paid'>('pending');
  const list = debts.filter(d => filter === 'all' || (filter === 'pending' ? !d.paid : d.paid));
  const submit = () => {
    const n = number(amount);
    if (!person.trim() || n <= 0) return;
    setDebts([{ id: uid('debt'), type, person: person.trim(), amount: n, description: description.trim(), paid: false }, ...debts]);
    setPerson(''); setAmount(''); setDescription('');
  };
  return <div className="content">
    <section className="panel"><div className="form-grid five"><select value={type} onChange={e => setType(e.target.value as 'cobrar' | 'pagar')}><option value="cobrar">Por cobrar</option><option value="pagar">Por pagar</option></select><input placeholder="Persona / proveedor" value={person} onChange={e => setPerson(e.target.value)} /><input type="number" min="0" step="0.01" placeholder="Monto" value={amount} onChange={e => setAmount(e.target.value)} /><input placeholder="Descripción" value={description} onChange={e => setDescription(e.target.value)} /><button className="primary" onClick={submit}>Guardar</button></div></section>
    <section className="panel"><FilterBar title="Cuentas" count={list.length}><select value={filter} onChange={e => setFilter(e.target.value as 'all' | 'pending' | 'paid')}><option value="pending">Pendientes</option><option value="paid">Pagadas</option><option value="all">Todas</option></select></FilterBar>
      <div className="table-wrap"><table><thead><tr><th>Tipo</th><th>Persona</th><th>Monto</th><th>Descripción</th><th>Estado</th><th></th></tr></thead><tbody>{list.map(d => <tr key={d.id}><td><span className="pill">{d.type === 'cobrar' ? 'Cobrar' : 'Pagar'}</span></td><td>{d.person}</td><td>{money(d.amount)}</td><td>{d.description || '—'}</td><td>{d.paid ? 'Pagado' : 'Pendiente'}</td><td><button className="small-button" onClick={() => setDebts(debts.map(x => x.id === d.id ? { ...x, paid: !x.paid } : x))}>{d.paid ? 'Reabrir' : 'Marcar pagado'}</button></td></tr>)}</tbody></table></div>
    </section>
  </div>;
}

function LossesView({ state, setState }: { state: BusinessState; setState: Dispatch<SetStateAction<BusinessState | null>> }) {
  const [item, setItem] = useState('');
  const [quantity, setQuantity] = useState('');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const submit = () => {
    const q = number(quantity), v = number(value);
    if (!item.trim() || q <= 0 || v < 0) return;
    setState(prev => prev ? { ...prev, losses: [{ id: uid('loss'), date: new Date().toISOString(), item: item.trim(), quantity: q, value: v, reason: reason.trim() }, ...prev.losses], lastLocalChangeAt: new Date().toISOString() } : prev);
    setItem(''); setQuantity(''); setValue(''); setReason('');
  };
  return <div className="content"><section className="panel"><div className="form-grid five"><input placeholder="Producto / ingrediente" value={item} onChange={e => setItem(e.target.value)} /><input type="number" min="0" step="0.001" placeholder="Cantidad" value={quantity} onChange={e => setQuantity(e.target.value)} /><input type="number" min="0" step="0.01" placeholder="Valor perdido" value={value} onChange={e => setValue(e.target.value)} /><input placeholder="Motivo" value={reason} onChange={e => setReason(e.target.value)} /><button className="primary" onClick={submit}>Registrar</button></div></section><section className="panel"><div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Elemento</th><th>Cantidad</th><th>Valor</th><th>Motivo</th></tr></thead><tbody>{state.losses.map(l => <tr key={l.id}><td>{formatDate(l.date)}</td><td>{l.item}</td><td>{l.quantity}</td><td>{money(l.value)}</td><td>{l.reason || '—'}</td></tr>)}</tbody></table></div></section></div>;
}

function ReportsView({ state, derived }: { state: BusinessState; derived: any }) {
  const exportRows = state.money.map(m => ({ fecha: m.date, tipo: MOVE_LABELS[m.type], monto: m.amount, descripcion: m.description, categoria: m.category, metodo: m.method || '' }));
  const low = state.ingredients.filter(i => i.stock <= i.minStock && i.minStock > 0);
  return <div className="content report-print">
    <div className="page-actions"><button className="secondary" onClick={() => window.print()}>Imprimir / PDF</button><button className="secondary" onClick={() => csvDownload('diego-bakery-movimientos.csv', exportRows)}>Exportar CSV</button></div>
    <div className="metrics"><Metric label="Ventas" value={money(derived.sales)} /><Metric label="Gastos" value={money(derived.expenses)} /><Metric label="Resultado estimado" value={money(derived.estimatedProfit)} /><Metric label="Inventario" value={money(derived.inventoryValue)} /></div>
    <div className="grid-2"><section className="panel"><div className="panel-head"><div><p className="eyebrow">VENTAS</p><h3>Productos más vendidos</h3></div></div>{derived.topProducts.length ? <div className="ranking-list">{derived.topProducts.map((p: any, idx: number) => <div className="ranking-row" key={p.name}><span className="rank">{idx + 1}</span><span><strong>{p.name}</strong><small>{p.quantity} unidad(es)</small></span><b>{money(p.revenue)}</b></div>)}</div> : <Empty text="Aún no hay ventas por producto." />}</section><section className="panel"><div className="panel-head"><div><p className="eyebrow">STOCK</p><h3>Ingredientes bajo mínimo</h3></div></div>{low.length ? low.map(i => <div className="list-row" key={i.id}><div><strong>{i.name}</strong><span>{i.supplier || 'Sin proveedor'}</span></div><b className="danger-text">{i.stock} {i.unit}</b></div>) : <Empty text="Inventario dentro de los mínimos." />}</section></div>
    <section className="panel"><h3>Resumen calculado</h3><div className="detail-grid"><div><span>Pedidos entregados</span><b>{state.orders.filter(o => o.status === 'entregada').length}</b></div><div><span>Ventas cobradas</span><b>{money(derived.sales)}</b></div><div><span>Ventas entregadas</span><b>{money(derived.completedRevenue)}</b></div><div><span>Costo de productos entregados</span><b>{money(derived.completedCost)}</b></div><div><span>Pérdidas registradas</span><b>{money(derived.lossesValue)}</b></div><div><span>Resultado estimado</span><b>{money(derived.estimatedProfit)}</b></div><div><span>Ticket promedio</span><b>{money(derived.averageTicket)}</b></div><div><span>Inventario actual</span><b>{money(derived.inventoryValue)}</b></div></div></section>
  </div>;
}

function SettingsView({ state, update, exportBackup, onRestore, healthCheck }: { state: BusinessState; update: (patch: Partial<BusinessState['settings']>) => void; exportBackup: () => void; onRestore: (file: File) => Promise<void>; healthCheck: () => Promise<void> }) {
  return <div className="content">
    <section className="panel"><div className="panel-head"><div><p className="eyebrow">NEGOCIO</p><h3>Configuración</h3></div></div>
      <div className="form-grid"><label>Nombre del negocio<input value={state.settings.businessName} onChange={e => update({ businessName: e.target.value })} /></label><label>Tema<select value={state.settings.theme} onChange={e => update({ theme: e.target.value as 'light' | 'dark' | 'system' })}><option value="system">Sistema</option><option value="light">Claro</option><option value="dark">Oscuro</option></select></label><label>WhatsApp<input value={state.settings.whatsapp || ''} onChange={e => update({ whatsapp: normalizePhone(e.target.value) })} /></label><label>Dirección<input value={state.settings.businessAddress || ''} onChange={e => update({ businessAddress: e.target.value })} /></label></div>
    </section>
    <section className="panel"><div className="panel-head"><div><p className="eyebrow">AUTOMATIZACIÓN</p><h3>Reglas del negocio</h3></div></div>
      <label className="toggle-row"><span><b>Respaldo automático</b><small>Guarda el estado en la nube cuando hay conexión.</small></span><input type="checkbox" checked={state.settings.autoBackup} onChange={e => update({ autoBackup: e.target.checked })} /></label>
      <label className="toggle-row"><span><b>Entregas habilitadas</b><small>Agrega el costo de delivery al carrito cuando hay dirección.</small></span><input type="checkbox" checked={state.settings.deliveryEnabled} onChange={e => update({ deliveryEnabled: e.target.checked })} /></label>
      <label className="toggle-row"><span><b>Notificaciones</b><small>Crea avisos por pedidos y stock bajo.</small></span><input type="checkbox" checked={state.settings.notificationEnabled} onChange={e => update({ notificationEnabled: e.target.checked })} /></label>
      <div className="form-grid"><label>Costo de mano de obra por hora<input type="number" min="0" step="0.01" value={state.settings.laborRatePerHour} onChange={e => update({ laborRatePerHour: Math.max(0, number(e.target.value)) })} /></label><label>Costo de utilidad por defecto<input type="number" min="0" step="0.01" value={state.settings.defaultUtilityCost} onChange={e => update({ defaultUtilityCost: Math.max(0, number(e.target.value)) })} /></label><label>Empaque por defecto<input type="number" min="0" step="0.01" value={state.settings.defaultPackagingCost} onChange={e => update({ defaultPackagingCost: Math.max(0, number(e.target.value)) })} /></label><label>Delivery<input type="number" min="0" step="0.01" value={state.settings.deliveryFee} onChange={e => update({ deliveryFee: Math.max(0, number(e.target.value)) })} /></label><label>Puntos por S/<input type="number" min="0" step="0.1" value={state.settings.loyaltyPointsPerSol} onChange={e => update({ loyaltyPointsPerSol: Math.max(0, number(e.target.value)) })} /></label></div>
    </section>
    <section className="panel"><div className="panel-head"><div><p className="eyebrow">SALUD DEL SISTEMA</p><h3>Conexión y respaldos</h3></div></div><div className="button-row"><button className="secondary" onClick={() => void healthCheck()}>Comprobar servidor</button><button className="secondary" onClick={exportBackup}>Descargar respaldo</button><label className="secondary file-button">Restaurar respaldo<input type="file" accept=".json,application/json" onChange={e => { const file = e.target.files?.[0]; if (file) void onRestore(file); }} /></label></div><p className="muted small">La aplicación guarda localmente primero y sincroniza después. Una falla de Internet no debe borrar tus datos.</p></section>
  </div>;
}

function GlobalSearchOverlay({ state, query, onOpen, onClose }: { state: BusinessState; query: string; onOpen: (section: Section) => void; onClose: () => void }) {
  const q = query.toLowerCase().trim();
  const results: Array<{ section: Section; label: string; detail: string }> = [];
  state.products.filter(p => (p.name + ' ' + p.category).toLowerCase().includes(q)).slice(0, 5).forEach(p => results.push({ section: 'productos', label: p.name, detail: 'Producto · ' + money(p.price) }));
  state.ingredients.filter(i => (i.name + ' ' + i.supplier).toLowerCase().includes(q)).slice(0, 5).forEach(i => results.push({ section: 'ingredientes', label: i.name, detail: 'Ingrediente · ' + i.stock + ' ' + i.unit }));
  state.customers.filter(c => (c.name + ' ' + c.phone).toLowerCase().includes(q)).slice(0, 5).forEach(c => results.push({ section: 'clientes', label: c.name, detail: 'Cliente · ' + c.phone }));
  state.orders.filter(o => (o.customerName + ' ' + o.customerPhone + ' ' + o.id).toLowerCase().includes(q)).slice(0, 5).forEach(o => results.push({ section: 'pedidos', label: o.customerName, detail: 'Pedido · ' + money(o.total) }));
  return <div className="global-search-results"><div className="search-head"><strong>Resultados</strong><button className="icon-button" onClick={onClose}>×</button></div>{results.length ? results.slice(0, 12).map((r, i) => <button className="search-result" key={r.section + r.label + i} onClick={() => { onOpen(r.section); onClose(); }}><span><strong>{r.label}</strong><small>{r.detail}</small></span><span>→</span></button>) : <Empty text="No hay resultados." />}</div>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className="modal"><div className="modal-head"><h3>{title}</h3><button className="icon-button" onClick={onClose}>×</button></div><div className="modal-body">{children}</div></div></div>;
}

function CustomerView({ products, cart, addToCart, changeCartQuantity, customer, setCustomer, promoCode, setPromoCode, promotions, combos, submit, onAdmin, theme, message, settings, addCombo }: any) {
  const [catalogQuery, setCatalogQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Todas');
  const categories: string[] = Array.from(new Set((products as Product[]).map((p: Product) => p.category).filter(Boolean))) as string[];
  const visibleProducts = products.filter((p: Product) =>
    (categoryFilter === 'Todas' || p.category === categoryFilter) &&
    (!catalogQuery.trim() || (p.name + ' ' + p.description + ' ' + p.category).toLowerCase().includes(catalogQuery.toLowerCase()))
  );
  const subtotal = cart.reduce((s: number, i: OrderItem) => s + number(i.subtotal), 0);
  const quantity = cart.reduce((s: number, i: OrderItem) => s + number(i.quantity), 0);
  const promo = promotions.find((p: any) => p.active && p.code && p.code.toUpperCase() === promoCode.trim().toUpperCase());
  let discount = 0;
  if (promo?.type === 'percent') discount = subtotal * Math.min(100, number(promo.value)) / 100;
  if (promo?.type === 'fixed') discount = Math.min(subtotal, number(promo.value));
  if (promo?.type === 'quantity' && quantity >= number(promo.minQuantity, 1)) discount = Math.min(subtotal, number(promo.value));
  if (promo?.type === 'date_price') discount = Math.max(0, subtotal - number(promo.value));
  const deliveryFee = settings.deliveryEnabled && customer.address.trim() ? number(settings.deliveryFee) : 0;
  const total = Math.max(0, subtotal - discount + deliveryFee);
  return <div className={'customer-shell ' + theme}>
    <header className="customer-top"><div className="brand-line"><div className="brand-mark small">DB</div><div><strong>{settings.businessName}</strong><span>Postres artesanales</span></div></div><button className="link-button" onClick={onAdmin}>Administrar</button></header>
    <div className="customer-hero"><p className="eyebrow">CATÁLOGO</p><h1>Hecho en casa, pensado para ti.</h1><p>Elige tus productos y el total se calcula automáticamente.</p></div>
    <section className="customer-tools">
      <input value={catalogQuery} onChange={e => setCatalogQuery(e.target.value)} placeholder="Buscar producto..." />
      <div className="catalog-filters">
        <button className={'small-button ' + (categoryFilter === 'Todas' ? 'active-filter' : '')} onClick={() => setCategoryFilter('Todas')}>Todas</button>
        {categories.map(category => <button key={category} className={'small-button ' + (categoryFilter === category ? 'active-filter' : '')} onClick={() => setCategoryFilter(category)}>{category}</button>)}
      </div>
    </section>
    <section className="customer-products">{visibleProducts.map((p: Product) => <article className="shop-card" key={p.id}><div className="product-placeholder">{p.name.slice(0, 1)}</div><div className="shop-card-body"><span className="eyebrow">{p.category}</span><h3>{p.name}</h3><p>{p.description}</p><div className="price-row"><strong>{money(p.price)}</strong>{p.oldPrice ? <del>{money(p.oldPrice)}</del> : null}</div><button className="primary wide" onClick={() => addToCart(p)}>Agregar al carrito</button></div></article>)}</section>
    {combos.filter((c: any) => c.active).length ? <section className="customer-products">{combos.filter((c: any) => c.active).map((combo: any) => <article className="shop-card combo-card" key={combo.id}><div className="shop-card-body"><span className="eyebrow">COMBO</span><h3>{combo.name}</h3><p>{combo.productIds.map((id: string) => products.find((p: Product) => p.id === id)?.name).filter(Boolean).join(' + ')}</p><div className="price-row"><strong>{money(combo.price)}</strong></div><button className="primary wide" onClick={() => addCombo(combo)}>Agregar combo</button></div></article>)}</section> : null}
    <section className="cart-panel"><div><p className="eyebrow">PEDIDO</p><h2>Tu carrito</h2>{cart.length ? cart.map((i: OrderItem) => <div className="list-row cart-row" key={i.productId}><div><strong>{i.productName}</strong><span>{money(i.unitPrice)} × {i.quantity} = {money(i.subtotal)}</span></div><div className="cart-controls"><button className="small-button" onClick={() => changeCartQuantity(i.productId, -1)} aria-label={'Quitar una unidad de ' + i.productName}>−</button><b>{i.quantity}</b><button className="small-button" onClick={() => changeCartQuantity(i.productId, 1)} aria-label={'Agregar una unidad de ' + i.productName}>＋</button></div></div>) : <Empty text="Agrega productos para empezar." />}<div className="list-row"><span>Subtotal</span><b>{money(subtotal)}</b></div>{discount > 0 ? <div className="list-row"><span>Descuento</span><b>-{money(discount)}</b></div> : null}{deliveryFee > 0 ? <div className="list-row"><span>Delivery</span><b>{money(deliveryFee)}</b></div> : null}<div className="cart-total"><span>Total</span><strong>{money(total)}</strong></div></div><div className="customer-form"><input placeholder="Nombre" value={customer.name} onChange={e => setCustomer({ ...customer, name: e.target.value })} /><input placeholder="Teléfono" value={customer.phone} onChange={e => setCustomer({ ...customer, phone: e.target.value })} /><input placeholder="Dirección" value={customer.address} onChange={e => setCustomer({ ...customer, address: e.target.value })} /><input placeholder="Código promocional" value={promoCode} onChange={e => setPromoCode(e.target.value.toUpperCase())} /><textarea placeholder="Notas o personalización" value={customer.notes} onChange={e => setCustomer({ ...customer, notes: e.target.value })} /><button className="primary wide" disabled={!cart.length} onClick={submit}>Enviar pedido</button>{settings.whatsapp ? <button className="secondary wide" onClick={() => window.open('https://wa.me/' + normalizePhone(settings.whatsapp), '_blank', 'noopener,noreferrer')}>WhatsApp</button> : null}{message ? <div className="notice">{message}</div> : null}</div></section>
  </div>;
}

export default App;


type AssistantMessage = { role: 'user' | 'assistant'; content: string };

function BusinessAiView({ state, derived, token }: { state: BusinessState; derived: any; token?: string }) {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const quick = [
    'Revisa todo mi negocio y dime qué debo corregir primero.',
    'Haz todas las cuentas importantes y explícame si los números tienen sentido.',
    'Revisa inventario, stock bajo, costos y pérdidas.',
    'Revisa precios, márgenes y dime qué datos están mal o incompletos.',
    'Analiza mis pedidos, pagos y deudas.',
  ];

  async function send(text?: string) {
    const content = (text ?? question).trim();
    if (!content || loading) return;
    if (!token) {
      setMessages(current => current.concat([{ role: 'assistant', content: 'Primero entra como administrador para conectar la IA con los datos del negocio.' }]));
      return;
    }
    const nextMessages = messages.concat([{ role: 'user', content }]);
    setMessages(nextMessages);
    setQuestion('');
    setLoading(true);
    try {
      const result = await askBusinessAi(token, content, state, messages);
      setMessages(current => current.concat([{ role: 'assistant', content: result.answer }]));
    } catch (error) {
      console.error(error);
      setMessages(current => current.concat([{ role: 'assistant', content: 'No pude consultar la IA ahora. La aplicación sigue funcionando y tus datos no se modificaron.' }]));
    } finally {
      setLoading(false);
    }
  }

  return <div className="content">
    <section className="panel ai-hero">
      <div>
        <p className="eyebrow">ASESOR DEL NEGOCIO</p>
        <h3>IA de Diego Bakery</h3>
        <p className="muted">Lee tus datos actuales, hace cuentas, encuentra problemas y te explica qué significan con palabras sencillas.</p>
      </div>
      <div className="ai-stats">
        <div><span>Ventas</span><b>{money(derived.sales)}</b></div>
        <div><span>Ganancia estimada</span><b>{money(derived.estimatedProfit)}</b></div>
        <div><span>Stock bajo</span><b>{derived.lowStock.length}</b></div>
        <div><span>Pedidos</span><b>{state.orders.length}</b></div>
      </div>
    </section>

    <section className="panel">
      <div className="panel-head"><div><p className="eyebrow">ACCIONES RÁPIDAS</p><h3>Pídele una revisión completa</h3></div><span className="status">{token ? 'IA conectable' : 'Falta iniciar sesión'}</span></div>
      <div className="ai-quick-grid">{quick.map(item => <button key={item} className="secondary" onClick={() => void send(item)} disabled={loading}>{item}</button>)}</div>
    </section>

    <section className="panel ai-chat">
      <div className="ai-messages">
        {messages.length === 0 ? <div className="empty">Empieza preguntando algo como: “¿Cuánto estoy ganando?” o “¿Qué debería revisar hoy?”.</div> :
          messages.map((item, index) => <div className={'ai-message ' + item.role} key={index}><span>{item.role === 'user' ? 'Tú' : 'IA'}</span><p>{item.content}</p></div>)}
        {loading ? <div className="ai-message assistant"><span>IA</span><p>Estoy revisando tus datos…</p></div> : null}
      </div>
      <div className="ai-input-row">
        <textarea value={question} onChange={e => setQuestion(e.target.value)} placeholder="Escribe tu pregunta..." onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') void send(); }} />
        <button className="primary" onClick={() => void send()} disabled={loading || !question.trim()}>Preguntar</button>
      </div>
    </section>
  </div>;
}

const EDITABLE_COLLECTIONS = [
  { key: 'products', label: 'Productos' },
  { key: 'ingredients', label: 'Inventario' },
  { key: 'recipes', label: 'Recetas' },
  { key: 'suppliers', label: 'Proveedores' },
  { key: 'customers', label: 'Clientes' },
  { key: 'promotions', label: 'Promociones' },
  { key: 'combos', label: 'Combos' },
  { key: 'loyaltyRewards', label: 'Premios de lealtad' },
  { key: 'services', label: 'Servicios' },
  { key: 'orders', label: 'Pedidos' },
  { key: 'money', label: 'Movimientos de dinero' },
  { key: 'debts', label: 'Deudas' },
  { key: 'losses', label: 'Pérdidas' },
  { key: 'notifications', label: 'Avisos' },
  { key: 'reviews', label: 'Reseñas' }
] as const;

type EditableCollectionKey = typeof EDITABLE_COLLECTIONS[number]['key'];

function createEditableRecord(collection: EditableCollectionKey): any {
  const now = new Date().toISOString();
  const id = uid(collection.slice(0, 4));
  const templates: Record<EditableCollectionKey, any> = {
    products: { id, name: 'Nuevo producto', description: '', category: 'General', categories: ['General'], price: 0, cost: 0, manualCost: 0, stock: 0, active: true, seasonal: false, tags: [], flavors: [], sizes: [], presentation: '', options: [], customizable: false },
    ingredients: { id, name: 'Nuevo ingrediente', unit: 'unidad', unitCost: 0, stock: 0, minStock: 0, supplier: '', expiration: '' },
    recipes: { id, productId: '', name: 'Nueva receta', yieldUnits: 1, ingredients: [], packagingCost: 0, utilityCost: 0, serviceCost: 0, laborHours: 0, laborRate: 0, otherCost: 0, totalCost: 0, salePrice: 0, margin: 0 },
    suppliers: { id, name: 'Nuevo proveedor', phone: '', notes: '', active: true },
    customers: { id, name: 'Nuevo cliente', phone: '', addresses: [], points: 0, level: 'Nuevo', favorites: [], notes: '', createdAt: now },
    promotions: { id, name: 'Nueva promoción', code: '', description: '', type: 'percent', value: 0, minQuantity: 1, productIds: [], startAt: '', endAt: '', active: true },
    combos: { id, name: 'Nuevo combo', productIds: [], price: 0, active: true },
    loyaltyRewards: { id, name: 'Nuevo premio', points: 0, discount: 0, active: true },
    services: { id, name: 'Nuevo servicio', amount: 0, unit: 'unidad', active: true },
    orders: { id, createdAt: now, customerName: '', customerPhone: '', items: [], subtotal: 0, discount: 0, total: 0, status: 'pendiente', paid: 0, source: 'admin' },
    money: { id, date: now, type: 'gasto', amount: 0, description: '', category: 'General', method: 'efectivo' },
    debts: { id, type: 'cobrar', person: '', amount: 0, description: '', paid: false },
    losses: { id, date: now, item: '', quantity: 0, value: 0, reason: '' },
    notifications: { id, type: 'sistema', title: '', message: '', read: false, createdAt: now },
    reviews: { id, productId: '', customerId: undefined, rating: 5, comment: '', createdAt: now }
  };
  return templates[collection];
}

function UniversalEditor({ state, onChange }: { state: BusinessState; onChange: (mutator: (current: BusinessState) => BusinessState) => void }) {
  const [collection, setCollection] = useState<EditableCollectionKey>('products');
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<Record<string, any> | null>(null);
  const [advanced, setAdvanced] = useState('');
  const items = (state[collection] as any[]) || [];

  useEffect(() => {
    const current = items.find(item => item?.id === selectedId) || items[0];
    if (current) {
      setSelectedId(String(current.id));
      const copy = structuredClone(current);
      delete copy.token;
      delete copy.pinHash;
      setDraft(copy);
      setAdvanced(JSON.stringify(
        Object.fromEntries(Object.entries(copy).filter(([, value]) => value !== null && typeof value === 'object')),
        null,
        2
      ));
    } else {
      setSelectedId('');
      setDraft(null);
      setAdvanced('{}');
    }
  }, [collection, state[collection], selectedId]);

  function add() {
    const record = createEditableRecord(collection);
    onChange(current => ({
      ...current,
      [collection]: [record, ...(((current[collection] as any[]) || []))]
    }));
    setSelectedId(record.id);
    setDraft(record);
    setAdvanced(JSON.stringify(
      Object.fromEntries(Object.entries(record).filter(([, value]) => value !== null && typeof value === 'object')),
      null,
      2
    ));
  }

  function save() {
    if (!draft || !selectedId) return;
    let complex: Record<string, unknown> = {};
    try {
      complex = JSON.parse(advanced || '{}');
      if (!complex || Array.isArray(complex) || typeof complex !== 'object') throw new Error();
    } catch {
      window.alert('Revisa los detalles avanzados: deben ser un objeto JSON válido.');
      return;
    }
    const nextItem = { ...draft, ...complex, id: selectedId };
    onChange(current => ({
      ...current,
      [collection]: ((current[collection] as any[]) || []).map(item => item.id === selectedId ? nextItem : item)
    }));
  }

  function remove() {
    if (!draft || !selectedId) return;
    if (!window.confirm('¿Eliminar este elemento? Los datos relacionados se reajustarán automáticamente.')) return;
    onChange(current => ({
      ...current,
      [collection]: ((current[collection] as any[]) || []).filter(item => item.id !== selectedId)
    }));
    setSelectedId('');
    setDraft(null);
  }

  function duplicate() {
    if (!draft) return;
    const copy: any = structuredClone(draft);
    copy.id = uid('copy');
    if (typeof copy.name === 'string') copy.name += ' (copia)';
    if ('createdAt' in copy) copy.createdAt = new Date().toISOString();
    if ('date' in copy) copy.date = new Date().toISOString();
    onChange(current => ({
      ...current,
      [collection]: [copy, ...(((current[collection] as any[]) || []))]
    }));
    setSelectedId(copy.id);
  }

  const primitiveEntries = draft ? Object.entries(draft).filter(([key, value]) =>
    key !== 'id' && key !== 'token' && key !== 'pinHash' &&
    (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
  ) : [];

  function updatePrimitive(key: string, value: unknown) {
    setDraft(current => current ? { ...current, [key]: value } : current);
  }

  return <div className="content">
    <section className="panel">
      <div className="panel-head">
        <div><p className="eyebrow">CONTROL TOTAL</p><h3>Editor profundo</h3></div>
        <span className="status">{items.length} registros</span>
      </div>
      <p className="muted">Puedes crear, modificar, duplicar y eliminar registros. Los objetos y listas también son editables. Al guardar, el motor recalcula costos, precios, referencias y cuentas relacionadas.</p>
      <div className="form-grid">
        <label>Qué quieres editar<select value={collection} onChange={e => { setCollection(e.target.value as EditableCollectionKey); setSelectedId(''); }}>{EDITABLE_COLLECTIONS.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
        <label>Registro<select value={selectedId} onChange={e => setSelectedId(e.target.value)}>{items.length ? items.map(item => { const row = item as any; return <option key={row.id} value={row.id}>{String(row.name || row.customerName || row.description || row.item || row.id)}</option>; }) : <option value="">No hay registros</option>}</select></label>
      </div>
      <div className="button-row">
        <button className="primary" onClick={add}>＋ Nuevo registro</button>
        {draft ? <button className="secondary" onClick={duplicate}>Duplicar</button> : null}
      </div>
    </section>

    {draft ? <section className="panel">
      <div className="panel-head"><div><p className="eyebrow">CAMPOS EDITABLES</p><h3>{String(draft.name || draft.customerName || draft.description || 'Registro')}</h3></div></div>
      <div className="form-grid">
        {primitiveEntries.map(([key, value]) => {
          const label = friendlyFieldName(key);
          if (typeof value === 'boolean') return <label className="toggle-row" key={key}><span><b>{label}</b></span><input type="checkbox" checked={value} onChange={e => updatePrimitive(key, e.target.checked)} /></label>;
          return <label key={key}>{label}<input type={typeof value === 'number' ? 'number' : 'text'} value={value === null ? '' : String(value)} onChange={e => updatePrimitive(key, typeof value === 'number' ? Number(e.target.value) : e.target.value)} /></label>;
        })}
      </div>
      <label>Objetos y listas — edición profunda
        <textarea className="advanced-editor" value={advanced} onChange={e => setAdvanced(e.target.value)} spellCheck={false} />
      </label>
      <div className="button-row">
        <button className="primary" onClick={save}>Guardar cambios y recalcular todo</button>
        <button className="danger-button" onClick={remove}>Eliminar y reajustar dependencias</button>
      </div>
      <p className="muted small">El ID interno permanece fijo para no romper referencias. El resto de los datos puede modificarse.</p>
    </section> : <section className="panel"><Empty text="Crea un registro nuevo o selecciona uno existente." /></section>}
  </div>;
}
function friendlyFieldName(key: string): string {
  const labels: Record<string, string> = {
    name: 'Nombre', phone: 'Teléfono', address: 'Dirección', customerName: 'Cliente', customerPhone: 'Teléfono del cliente',
    description: 'Descripción', category: 'Categoría', price: 'Precio', cost: 'Costo', stock: 'Stock', minStock: 'Stock mínimo',
    unit: 'Unidad', unitCost: 'Costo por unidad', supplier: 'Proveedor', expiration: 'Vencimiento', active: 'Activo',
    seasonal: 'De temporada', oldPrice: 'Precio anterior', presentation: 'Presentación', quantity: 'Cantidad', amount: 'Monto',
    paid: 'Pagado', status: 'Estado', paymentMethod: 'Forma de pago', notes: 'Notas', person: 'Persona', value: 'Valor',
    reason: 'Motivo', title: 'Título', read: 'Leída', points: 'Puntos', discount: 'Descuento', code: 'Código',
    minQuantity: 'Cantidad mínima', yieldUnits: 'Rendimiento', totalCost: 'Costo total', salePrice: 'Precio de venta',
    margin: 'Margen', laborHours: 'Horas de trabajo', laborRate: 'Costo por hora', packagingCost: 'Costo de empaque',
    utilityCost: 'Costo de utilidad', serviceCost: 'Costo de servicio', otherCost: 'Otros costos', createdAt: 'Fecha de creación',
    date: 'Fecha', id: 'ID'
  };
  return labels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
}
