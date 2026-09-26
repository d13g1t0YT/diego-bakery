import { useEffect, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { LocalNotifications } from '@capacitor/local-notifications';
import { apiConfigured, getCloudState, getOrders, getProducts, getPublicOrders, login, putCloudState, submitPublicOrder, uploadBackup } from './api';
import { BusinessState, Debt, Ingredient, LocalAdmin, MoneyMove, MoneyMoveType, Order, OrderItem, OrderStatus, Product, defaultState, money, uid } from './types';
import { CashRegisterView, CombosView, CustomersView, LoyaltyView, NotificationsView, PromotionsView, RecipesView, ServicesView, SuppliersView } from './BusinessFeatures';
import { csvDownload, downloadBackup, loadState, restoreBackup, saveState } from './storage';

type Mode = 'admin' | 'cliente';
type Section = 'inicio' | 'pedidos' | 'productos' | 'ingredientes' | 'recetas' | 'proveedores' | 'clientes' | 'finanzas' | 'caja' | 'deudas' | 'perdidas' | 'promociones' | 'combinaciones' | 'lealtad' | 'notificaciones' | 'servicios' | 'reportes' | 'ajustes';

const STATUS_LABELS: Record<OrderStatus, string> = {
  pendiente: 'Pendiente',
  esperando_confirmacion: 'Esperando confirmación',
  comprando_ingredientes: 'Comprando ingredientes',
  preparando: 'Preparando',
  lista: 'Lista',
  por_entregar: 'Por entregar',
  entregada: 'Entregada',
  no_entregada: 'No entregada',
  cancelada: 'Cancelada',
  archivada: 'Archivada'
};

const MOVE_LABELS: Record<MoneyMoveType, string> = {
  venta: 'Venta',
  gasto: 'Gasto',
  inversion: 'Inversión',
  retiro: 'Retiro',
  cobro_deuda: 'Cobro de deuda',
  pago_deuda: 'Pago de deuda',
  ajuste: 'Ajuste'
};

async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(pin);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(v => v.toString(16).padStart(2, '0')).join('');
}

async function readNativeToken(): Promise<string | undefined> {
  try {
    if (Capacitor.isNativePlatform()) {
      return (await Preferences.get({ key: 'diego-bakery-token' })).value ?? undefined;
    }
  } catch { /* native storage can be unavailable in browser tests */ }
  return localStorage.getItem('diego-bakery-token') ?? undefined;
}

async function writeToken(token: string): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) await Preferences.set({ key: 'diego-bakery-token', value: token });
    else localStorage.setItem('diego-bakery-token', token);
  } catch {
    localStorage.setItem('diego-bakery-token', token);
  }
}

async function notifyNative(title: string, body: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const permission = await LocalNotifications.checkPermissions();
    if (permission.display !== 'granted') {
      const requested = await LocalNotifications.requestPermissions();
      if (requested.display !== 'granted') return;
    }
    await LocalNotifications.schedule({
      notifications: [{
        id: Math.floor(Date.now() % 2147483000),
        title,
        body,
        schedule: { at: new Date(Date.now() + 1000), allowWhileIdle: false },
        autoCancel: true,
        ongoing: false,
        isExactNotification: false
      }]
    });
  } catch {
    // Notifications are optional and must never block business operations.
  }
}

async function clearToken(): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) await Preferences.remove({ key: 'diego-bakery-token' });
  } finally {
    localStorage.removeItem('diego-bakery-token');
  }
}

export function App() {
  const [state, setState] = useState<BusinessState | null>(null);
  const [mode, setMode] = useState<Mode>('admin');
  const [section, setSection] = useState<Section>('inicio');
  const [logged, setLogged] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [biometryAvailable, setBiometryAvailable] = useState(false);
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupName, setSetupName] = useState('');
  const [setupPhone, setSetupPhone] = useState('');
  const [setupPin, setSetupPin] = useState('');
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [customer, setCustomer] = useState({ name: '', phone: '', address: '', notes: '' });
  const [promoCode, setPromoCode] = useState('');

  useEffect(() => {
    void (async () => {
      const loaded = await loadState();
      const token = await readNativeToken();
      const restored = token && loaded.admin
        ? { ...loaded, admin: { ...loaded.admin, token } }
        : loaded;

      setState(restored);
      if (token && restored.admin) {
        setLogged(true);
        setBiometryAvailable(true);
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    if (!state) return;
    void saveState(state);
  }, [state]);

  useEffect(() => {
    if (!state?.settings.autoBackup || !logged || !online || !state.admin?.token) return;
    const timer = window.setTimeout(() => {
      void Promise.all([
        putCloudState(state.admin!.token!, state),
        uploadBackup(state.admin!.token!, state)
      ]).catch(() => undefined);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [state, logged, online]);

  const products = state?.products ?? [];
  const activeProducts = products.filter(p => p.active);
  const cashBalance = useMemo(() => {
    if (!state) return 0;
    return state.money.reduce((sum, m) => {
      if (m.method && m.method !== 'efectivo') return sum;
      if (m.type === 'venta' || m.type === 'inversion' || m.type === 'cobro_deuda') return sum + m.amount;
      return sum - m.amount;
    }, 0);
  }, [state]);

  const totalSales = useMemo(() => state?.money.filter(m => m.type === 'venta').reduce((s, m) => s + m.amount, 0) ?? 0, [state]);
  const totalExpenses = useMemo(() => state?.money.filter(m => m.type === 'gasto').reduce((s, m) => s + m.amount, 0) ?? 0, [state]);
  const pendingOrders = state?.orders.filter(o => !['entregada', 'cancelada', 'archivada'].includes(o.status)).length ?? 0;
  const unreadNotifications = state?.notifications.filter(n => !n.read).length ?? 0;

  async function refreshFromServer(tokenOverride?: string) {
    const token = tokenOverride ?? state?.admin?.token;
    if (!token || !online) return;

    try {
      const [remoteStateResult, remotePublicOrders] = await Promise.allSettled([
        getCloudState(token),
        getPublicOrders(token)
      ]);

      setState(prev => {
        if (!prev) return prev;

        let next = prev;

        if (remoteStateResult.status === 'fulfilled') {
          next = {
            ...remoteStateResult.value,
            admin: prev.admin,
            lastSyncAt: new Date().toISOString()
          };
        } else {
          next = { ...next, lastSyncAt: new Date().toISOString() };
        }

        if (remotePublicOrders.status === 'fulfilled') {
          const mapped = remotePublicOrders.value.map(mapPublicOrder);
          const existingIds = new Set(next.orders.map(o => o.id));

          next = {
            ...next,
            orders: next.orders.concat(mapped.filter(o => !existingIds.has(o.id)))
          };
        }

        return next;
      });

      setMessage('Sincronización completada');
    } catch {
      setMessage('No se pudo sincronizar; los datos locales siguen disponibles.');
    }
  }

  function mapRemoteProduct(p: any): Product {
    return {
      id: String(p.id),
      name: String(p.nombre ?? ''),
      description: String(p.descripcion ?? ''),
      category: 'Sin categoría',
      categories: [],
      price: Number(p.precio_venta ?? 0),
      cost: 0,
      stock: 0,
      active: Boolean(p.activo ?? true),
      seasonal: false,
      tags: [],
      flavors: [],
      sizes: [],
      presentation: ''
    };
  }

  function mapPublicOrder(o: any): Order {
    const rawItems = Array.isArray(o.items) ? o.items : [];
    const items: OrderItem[] = rawItems.map((item: any) => ({
      productId: String(item.productId ?? item.product_id ?? ''),
      productName: String(item.productName ?? item.product_name ?? 'Producto'),
      quantity: Math.max(1, Number(item.quantity ?? 1)),
      unitPrice: Math.max(0, Number(item.unitPrice ?? item.unit_price ?? 0)),
      cost: Math.max(0, Number(item.cost ?? 0)),
      subtotal: Math.max(0, Number(item.subtotal ?? 0)),
      customizations: typeof item.customizations === 'object' && item.customizations ? item.customizations : undefined
    }));
    return {
      id: String(o.cliente_ref || o.id),
      createdAt: new Date(o.creado_en ?? Date.now()).toISOString(),
      customerName: String(o.cliente_nombre ?? 'Cliente'),
      customerPhone: String(o.telefono ?? ''),
      address: o.direccion ? String(o.direccion) : undefined,
      notes: o.notas ? String(o.notas) : undefined,
      items,
      subtotal: Number(o.subtotal ?? 0),
      discount: Number(o.descuento ?? 0),
      total: Number(o.total ?? 0),
      status: STATUS_LABELS[o.estado as OrderStatus] ? o.estado as OrderStatus : 'pendiente',
      paid: 0,
      source: 'cliente'
    };
  }

  function mapRemoteOrder(o: any): Order {
    return {
      id: String(o.id),
      createdAt: new Date(o.fecha_pedido ?? Date.now()).toISOString(),
      customerName: [o.cliente_nombre, o.cliente_apellido].filter(Boolean).join(' ') || 'Cliente',
      customerPhone: '',
      items: [],
      subtotal: 0,
      discount: 0,
      total: 0,
      status: (STATUS_LABELS[o.estado as OrderStatus] ? o.estado : 'pendiente') as OrderStatus,
      paid: 0,
      source: 'admin'
    };
  }

  async function doLogin() {
    if (!state) return;
    setMessage('');
    if (apiConfigured() && loginPhone && loginPin && online) {
      try {
        const result = await login(loginPhone, loginPin);
        const admin: LocalAdmin = {
          name: `${result.usuario.nombre} ${result.usuario.apellido}`.trim(),
          phone: loginPhone,
          pinHash: await hashPin(loginPin),
          token: result.token
        };
        setState(prev => prev ? { ...prev, admin } : prev);
        await writeToken(result.token);
        setLogged(true);
        await refreshFromServer(result.token);
        return;
      } catch {
        setMessage('Inicio en línea no disponible. Intentando acceso local…');
      }
    }

    if (!state.admin) {
      setMessage('Este dispositivo aún no tiene un administrador local configurado.');
      setSetupOpen(true);
      return;
    }

    const valid = state.admin.phone === loginPhone && state.admin.pinHash === await hashPin(loginPin);
    if (!valid) {
      setMessage('Teléfono o PIN incorrectos.');
      return;
    }
    setLogged(true);
  }

  async function setupLocalAdmin() {
    if (!state || !setupName.trim() || !setupPhone.trim() || !/^\d{4,12}$/.test(setupPin)) {
      setMessage('Completa nombre, teléfono y un PIN de 4 a 12 dígitos.');
      return;
    }
    const admin: LocalAdmin = {
      name: setupName.trim(),
      phone: setupPhone.trim(),
      pinHash: await hashPin(setupPin)
    };
    setState({ ...state, admin });
    setLoginPhone(admin.phone);
    setSetupOpen(false);
    setLogged(true);
    setMessage('Administrador local configurado.');
  }

  async function biometricLogin() {
    if (!state?.admin) return;
    try {
      const result = await BiometricAuth.checkBiometry();
      if (!result.isAvailable && !result.deviceIsSecure) {
        setMessage('Este dispositivo no tiene una biometría o credencial disponible.');
        return;
      }
      await BiometricAuth.authenticate({
        reason: 'Desbloquear Diego Bakery',
        allowDeviceCredential: true,
        androidTitle: 'Diego Bakery',
        androidSubtitle: 'Confirma tu identidad para entrar',
        androidConfirmationRequired: false
      });
      setLogged(true);
      setMessage('Acceso mediante biometría.');
    } catch {
      setMessage('La autenticación biométrica fue cancelada o no estuvo disponible.');
    }
  }

  function logout() {
    setLogged(false);
    void clearToken();
  }

  function updateSettings(patch: Partial<BusinessState['settings']>) {
    setState(prev => prev ? { ...prev, settings: { ...prev.settings, ...patch } } : prev);
  }

  function addMoney(move: Omit<MoneyMove, 'id' | 'date'>) {
    setState(prev => prev ? { ...prev, money: [{ ...move, id: uid('mov'), date: new Date().toISOString() }, ...prev.money] } : prev);
  }

  function createProduct(form: { name: string; category: string; price: number; cost: number; stock: number; description: string }) {
    const product: Product = {
      id: uid('prd'),
      name: form.name.trim(),
      description: form.description.trim(),
      category: form.category.trim() || 'General',
      categories: [form.category.trim() || 'General'],
      price: form.price,
      cost: form.cost,
      stock: form.stock,
      active: true,
      seasonal: false,
      tags: [],
      flavors: [],
      sizes: [],
      presentation: ''
    };
    setState(prev => prev ? { ...prev, products: [product, ...prev.products] } : prev);
  }

  function updateProduct(id: string, patch: Partial<Product>) {
    setState(prev => prev ? {
      ...prev,
      products: prev.products.map(p => p.id === id ? { ...p, ...patch } : p)
    } : prev);
  }

  function addIngredient(form: Omit<Ingredient, 'id'>) {
    setState(prev => prev ? { ...prev, ingredients: [{ ...form, id: uid('ing') }, ...prev.ingredients] } : prev);
  }

  function changeStock(id: string, delta: number) {
    setState(prev => prev ? {
      ...prev,
      ingredients: prev.ingredients.map(i => i.id === id ? { ...i, stock: Math.max(0, i.stock + delta) } : i)
    } : prev);
  }

  function addOrder(order: Order) {
    setState(prev => {
      if (!prev) return prev;
      const saleMove: MoneyMove | null = order.paid > 0 ? {
        id: uid('mov'),
        date: new Date().toISOString(),
        type: 'venta',
        amount: order.paid,
        description: `Pago del pedido ${order.id.slice(-6)}`,
        category: order.paymentMethod || 'venta'
      } : null;
      return {
        ...prev,
        orders: [order, ...prev.orders],
        money: saleMove ? [saleMove, ...prev.money] : prev.money
      };
    });
  }

  function addCombo(combo: BusinessState['combos'][number]) {
    if (!state) return;
    const chosenProducts = combo.productIds
      .map(id => state.products.find(p => p.id === id))
      .filter((p): p is Product => Boolean(p));
    const cost = chosenProducts.reduce((sum, product) => sum + product.cost, 0);
    setCart(prev => {
      const productId = 'combo_' + combo.id;
      const found = prev.find(i => i.productId === productId);
      if (found) {
        const quantity = found.quantity + 1;
        return prev.map(i => i.productId === productId
          ? { ...i, quantity, subtotal: quantity * i.unitPrice }
          : i
        );
      }
      return prev.concat([{
        productId,
        productName: combo.name,
        quantity: 1,
        unitPrice: combo.price,
        cost,
        subtotal: combo.price
      }]);
    });
  }

  function addToCart(product: Product) {
    setCart(prev => {
      const found = prev.find(i => i.productId === product.id);
      if (found) return prev.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * i.unitPrice } : i);
      return [...prev, {
        productId: product.id,
        productName: product.name,
        quantity: 1,
        unitPrice: product.price,
        cost: product.cost,
        subtotal: product.price
      }];
    });
  }

  function submitCustomerOrder() {
    if (!state) return;
    if (!customer.name.trim() || !/^\\d{6,20}$/.test(customer.phone.trim()) || cart.length === 0) {
      setMessage('Completa un nombre, un teléfono válido y agrega al menos un producto.');
      return;
    }
    const subtotal = cart.reduce((s, i) => s + i.subtotal, 0);
    const now = new Date();
    const promo = state.promotions.find(p =>
      p.active &&
      (!p.code || p.code.toUpperCase() === promoCode.trim().toUpperCase()) &&
      (!p.startAt || new Date(p.startAt) <= now) &&
      (!p.endAt || new Date(p.endAt) >= now)
    );
    const quantity = cart.reduce((s, i) => s + i.quantity, 0);
    let discount = 0;
    if (promo) {
      if (promo.type === 'percent') discount = subtotal * Math.min(100, promo.value) / 100;
      if (promo.type === 'fixed') discount = Math.min(subtotal, promo.value);
      if (promo.type === 'quantity' && quantity >= (promo.minQuantity || 1)) discount = Math.min(subtotal, promo.value);
      if (promo.type === 'date_price') discount = Math.max(0, subtotal - promo.value);
    }
    const deliveryFee = state.settings.deliveryEnabled && customer.address.trim()
      ? Math.max(0, state.settings.deliveryFee)
      : 0;
    const total = Math.max(0, Number((subtotal - discount + deliveryFee).toFixed(2)));
    const order: Order = {
      id: uid('ord'),
      createdAt: new Date().toISOString(),
      customerName: customer.name.trim(),
      customerPhone: customer.phone.trim(),
      address: customer.address.trim(),
      notes: customer.notes.trim(),
      items: cart,
      subtotal,
      discount: Number(discount.toFixed(2)),
      total,
      status: 'pendiente',
      paid: 0,
      discountCode: promo?.code,
      source: 'cliente'
    };
    addOrder(order);
    if (online && apiConfigured()) {
      void submitPublicOrder(order).then(
        () => setMessage('Pedido enviado y guardado en línea.'),
        () => setMessage('Pedido guardado sin conexión; se conservará en este dispositivo.')
      );
    } else {
      setMessage('Pedido guardado sin conexión; se conservará en este dispositivo.');
    }
    setCart([]);
    setPromoCode('');
    setCustomer({ name: '', phone: '', address: '', notes: '' });
  }

  function updateOrder(id: string, patch: Partial<Order>) {
    if (!state) return;
    const current = state.orders.find(o => o.id === id);
    if (!current) return;

    if (patch.status === 'preparando' && !current.inventoryDeducted) {
      const shortages: string[] = [];
      for (const item of current.items) {
        const recipe = state.recipes.find(r => r.productId === item.productId);
        if (!recipe) continue;
        for (const line of recipe.ingredients) {
          const ingredient = state.ingredients.find(i => i.id === line.ingredientId);
          const required = (line.quantity / Math.max(1, recipe.yieldUnits)) * item.quantity;
          if (ingredient && ingredient.stock + 1e-9 < required) {
            shortages.push(ingredient.name + ' (faltan ' + (required - ingredient.stock).toFixed(2) + ' ' + ingredient.unit + ')');
          }
        }
      }
      if (shortages.length) {
        setMessage('No se puede preparar todavía: ' + shortages.join(', '));
        return;
      }
    }

    setState(prev => {
      if (!prev) return prev;
      const nextOrder = { ...current, ...patch };
      const paidDelta = Number(nextOrder.paid || 0) - Number(current.paid || 0);
      let nextMoney = prev.money;
      if (paidDelta !== 0) {
        nextMoney = [{
          id: uid('mov'),
          date: new Date().toISOString(),
          type: paidDelta > 0 ? 'venta' : 'ajuste',
          amount: Math.abs(paidDelta),
          description: 'Pago del pedido ' + current.id.slice(-6),
          category: nextOrder.paymentMethod || 'venta',
          method: nextOrder.paymentMethod || 'efectivo'
        }, ...prev.money];
      }

      let ingredients = prev.ingredients;
      let inventoryDeducted = current.inventoryDeducted;
      if (patch.status === 'preparando' && !current.inventoryDeducted) {
        ingredients = prev.ingredients.map(ingredient => {
          let stock = ingredient.stock;
          for (const item of current.items) {
            const expanded = item.productId.startsWith('combo_')
              ? (prev.combos.find(c => c.id === item.productId.slice('combo_'.length))?.productIds || []).map(productId => ({
                  productId,
                  quantity: item.quantity
                }))
              : [{ productId: item.productId, quantity: item.quantity }];

            for (const entry of expanded) {
              const recipe = prev.recipes.find(r => r.productId === entry.productId);
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

      let customers = prev.customers;
      if (patch.status === 'entregada' && current.status !== 'entregada' && current.customerPhone) {
        const points = Math.max(0, Math.floor(nextOrder.total * prev.settings.loyaltyPointsPerSol));
        customers = prev.customers.map(customer =>
          customer.phone === current.customerPhone
            ? {
                ...customer,
                points: customer.points + points,
                level: customer.points + points >= 500 ? 'Oro' : customer.points + points >= 200 ? 'Plata' : 'Inicial'
              }
            : customer
        );
      }

      const notifications = nextOrder.status !== current.status
        ? [{
            id: uid('not'),
            type: 'pedido' as const,
            title: 'Pedido actualizado',
            message: current.customerName + ': ' + STATUS_LABELS[nextOrder.status],
            read: false,
            createdAt: new Date().toISOString()
          }, ...prev.notifications]
        : prev.notifications;

      return {
        ...prev,
        orders: prev.orders.map(o => o.id === id ? { ...nextOrder, inventoryDeducted } : o),
        money: nextMoney,
        ingredients,
        customers,
        notifications
      };
    });
  }

  if (loading || !state) {
    return <div className="splash"><div className="brand-mark">DB</div><h1>Diego Bakery</h1><p>Cargando tu negocio…</p></div>;
  }

  const theme = state.settings.theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : state.settings.theme;

  if (mode === 'cliente') {
    return <CustomerView products={activeProducts} cart={cart} addToCart={addToCart} addCombo={addCombo} customer={customer} setCustomer={setCustomer} promoCode={promoCode} setPromoCode={setPromoCode} promotions={state.promotions} combos={state.combos} submit={submitCustomerOrder} onAdmin={() => setMode('admin')} theme={theme} message={message} settings={state.settings} />;
  }

  if (!logged) {
    return (
      <div className={`auth-screen ${theme}`}>
        <div className="auth-card">
          <div className="brand-mark">DB</div>
          <p className="eyebrow">GESTIÓN INTEGRAL</p>
          <h1>Diego Bakery</h1>
          <p className="muted">Administra dinero, pedidos, productos, ingredientes y ganancias desde un solo lugar.</p>
          <div className="mode-switch"><button className="active" onClick={() => setMode('admin')}>Administrador</button><button onClick={() => setMode('cliente')}>Clientes</button></div>
          <label>Teléfono<input value={loginPhone} onChange={e => setLoginPhone(e.target.value)} inputMode="tel" placeholder="Tu teléfono" /></label>
          <label>PIN<input value={loginPin} onChange={e => setLoginPin(e.target.value.replace(/\D/g, '').slice(0, 12))} inputMode="numeric" type="password" placeholder="••••" /></label>
          <button className="primary wide" onClick={() => void doLogin()}>Entrar</button>
          {biometryAvailable && <button className="secondary wide" onClick={() => void biometricLogin()}>Entrar con biometría</button>}
          <button className="link-button" onClick={() => setSetupOpen(true)}>Configurar este dispositivo</button>
          <div className="offline-badge">{online ? 'En línea' : 'Modo sin conexión'} · tus datos locales están disponibles</div>
          {message && <div className="notice">{message}</div>}
        </div>
        {setupOpen && <Modal title="Configurar administrador" onClose={() => setSetupOpen(false)}>
          <label>Nombre completo<input value={setupName} onChange={e => setSetupName(e.target.value)} /></label>
          <label>Teléfono<input value={setupPhone} onChange={e => setSetupPhone(e.target.value)} inputMode="tel" /></label>
          <label>PIN de acceso<input value={setupPin} onChange={e => setSetupPin(e.target.value.replace(/\D/g, '').slice(0, 12))} inputMode="numeric" type="password" /></label>
          <button className="primary wide" onClick={() => void setupLocalAdmin()}>Guardar y entrar</button>
        </Modal>}
      </div>
    );
  }

  return (
    <div className={`app-shell ${theme}`}>
      <aside className="sidebar">
        <div className="sidebar-brand"><div className="brand-mark small">DB</div><div><strong>Diego Bakery</strong><span>Control del negocio</span></div></div>
        <nav>
          {([
            ['inicio', 'Inicio'], ['pedidos', 'Pedidos'], ['productos', 'Productos'], ['ingredientes', 'Ingredientes'],
            ['recetas', 'Recetas'], ['proveedores', 'Proveedores'], ['clientes', 'Clientes'], ['finanzas', 'Finanzas'],
            ['caja', 'Caja'], ['deudas', 'Deudas'], ['perdidas', 'Pérdidas'], ['promociones', 'Promociones'], ['combinaciones', 'Combos'], ['lealtad', 'Lealtad'],
            ['notificaciones', 'Avisos'], ['servicios', 'Servicios'], ['reportes', 'Reportes'], ['ajustes', 'Ajustes']
          ] as [Section,string][]).map(([id,label]) => <button key={id} className={section === id ? 'nav-item active' : 'nav-item'} onClick={() => setSection(id)}><span>{label}</span>{id === 'pedidos' && pendingOrders > 0 && <b>{pendingOrders}</b>}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <button className="secondary wide" onClick={() => { setMode('cliente'); setMessage(''); }}>Vista de cliente</button>
          <button className="link-button" onClick={logout}>Cerrar sesión</button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div><p className="eyebrow">{section === 'inicio' ? 'RESUMEN' : section.toUpperCase()}</p><h2>{sectionTitle(section)}</h2></div>
          <div className="top-actions"><span className={online ? 'status online' : 'status'}>{online ? 'Sincronizable' : 'Offline'}</span><button className="icon-button" onClick={() => void refreshFromServer()}>↻</button></div>
        </header>

        {message && <div className="toast">{message}</div>}

        {section === 'inicio' && <Dashboard cash={cashBalance} sales={totalSales} expenses={totalExpenses} pendingOrders={pendingOrders} state={state} />}
        {section === 'pedidos' && <OrdersView state={state} onUpdate={updateOrder} />}
        {section === 'productos' && <ProductsView products={products} onCreate={createProduct} onUpdate={updateProduct} />}
        {section === 'ingredientes' && <IngredientsView ingredients={state.ingredients} onAdd={addIngredient} onStock={changeStock} />}
        {section === 'recetas' && <RecipesView state={state} setState={setState} />}
        {section === 'proveedores' && <SuppliersView suppliers={state.suppliers} setSuppliers={items => setState(prev => prev ? { ...prev, suppliers: items } : prev)} />}
        {section === 'clientes' && <CustomersView customers={state.customers} setCustomers={items => setState(prev => prev ? { ...prev, customers: items } : prev)} />}
        {section === 'finanzas' && <FinanceView moves={state.money} addMoney={addMoney} balance={cashBalance} />}
        {section === 'caja' && <CashRegisterView register={state.cashRegister} setRegister={register => setState(prev => prev ? { ...prev, cashRegister: register } : prev)} moneyMoves={state.money} />}
        {section === 'promociones' && <PromotionsView promotions={state.promotions} products={state.products} setPromotions={items => setState(prev => prev ? { ...prev, promotions: items } : prev)} />}
        {section === 'combinaciones' && <CombosView combos={state.combos} products={state.products} setCombos={items => setState(prev => prev ? { ...prev, combos: items } : prev)} />}
        {section === 'lealtad' && <LoyaltyView rewards={state.loyaltyRewards} setRewards={items => setState(prev => prev ? { ...prev, loyaltyRewards: items } : prev)} customers={state.customers} />}
        {section === 'notificaciones' && <NotificationsView items={state.notifications} setItems={items => setState(prev => prev ? { ...prev, notifications: items } : prev)} />}
        {section === 'servicios' && <ServicesView services={state.services} setServices={items => setState(prev => prev ? { ...prev, services: items } : prev)} />}
        {section === 'deudas' && <DebtsView debts={state.debts} setDebts={debts => setState(prev => prev ? { ...prev, debts } : prev)} />}
        {section === 'perdidas' && <LossesView state={state} setState={setState} />}
        {section === 'reportes' && <ReportsView state={state} />}
        {section === 'ajustes' && <SettingsView state={state} update={updateSettings} exportBackup={() => downloadBackup(state)} onRestore={async file => { const restored = await restoreBackup(file); setState(restored); setMessage('Respaldo restaurado correctamente.'); }} />}
      </main>
    </div>
  );
}

function sectionTitle(section: Section): string {
  return {
    inicio: 'Hola, administra tu negocio.',
    pedidos: 'Pedidos',
    productos: 'Productos',
    ingredientes: 'Ingredientes',
    finanzas: 'Finanzas y caja',
    deudas: 'Cuentas por cobrar y pagar',
    perdidas: 'Pérdidas y desperdicios',
    recetas: 'Recetas y costos reales',
    proveedores: 'Proveedores',
    clientes: 'Clientes',
    caja: 'Caja',
    promociones: 'Promociones y descuentos',
    combinaciones: 'Combos',
    lealtad: 'Programa de lealtad',
    notificaciones: 'Avisos y notificaciones',
    servicios: 'Servicios y utilidades',
    reportes: 'Reportes',
    ajustes: 'Configuración'
  }[section];
}

function Dashboard({ cash, sales, expenses, pendingOrders, state }: { cash: number; sales: number; expenses: number; pendingOrders: number; state: BusinessState }) {
  const recent = state.orders.slice(0, 6);
  const lowStock = state.ingredients.filter(i => i.stock <= i.minStock).slice(0, 5);
  return <div className="content">
    <div className="metrics">
      <Metric label="Caja del negocio" value={money(cash)} />
      <Metric label="Ventas registradas" value={money(sales)} />
      <Metric label="Gastos" value={money(expenses)} />
      <Metric label="Pedidos pendientes" value={String(pendingOrders)} />
    </div>
    <div className="grid-2">
      <section className="panel"><div className="panel-head"><div><p className="eyebrow">PEDIDOS</p><h3>Actividad reciente</h3></div></div>
        {recent.length === 0 ? <Empty text="Todavía no hay pedidos." /> : <div className="table-wrap"><table><thead><tr><th>Cliente</th><th>Total</th><th>Estado</th></tr></thead><tbody>{recent.map(o => <tr key={o.id}><td>{o.customerName}</td><td>{money(o.total)}</td><td><span className="pill">{STATUS_LABELS[o.status]}</span></td></tr>)}</tbody></table></div>}
      </section>
      <section className="panel"><div className="panel-head"><div><p className="eyebrow">INVENTARIO</p><h3>Atención necesaria</h3></div></div>
        {lowStock.length === 0 ? <Empty text="No hay ingredientes con stock bajo." /> : lowStock.map(i => <div className="list-row" key={i.id}><div><strong>{i.name}</strong><span>{i.supplier || 'Sin proveedor'}</span></div><b>{i.stock} {i.unit}</b></div>)}
      </section>
    </div>
    <section className="panel"><div className="panel-head"><div><p className="eyebrow">MODELO</p><h3>Control económico</h3></div></div><div className="check-grid">
      {['Dinero personal separado del negocio','Inversiones registradas como capital','Costos y precios editables por producto','Cuentas por cobrar y pagar','Pérdidas separadas del gasto normal','Respaldo manual y automático'].map(x => <div className="check" key={x}><span>✓</span>{x}</div>)}
    </div></section>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function OrdersView({ state, onUpdate }: { state: BusinessState; onUpdate: (id: string, patch: Partial<Order>) => void }) {
  return <div className="content"><section className="panel"><div className="panel-head"><div><p className="eyebrow">GESTIÓN</p><h3>Todos los pedidos</h3></div></div>
    {state.orders.length === 0 ? <Empty text="Los pedidos nuevos aparecerán aquí." /> : <div className="order-list">{state.orders.map(o => <div className="order-card" key={o.id}><div className="order-main"><div><strong>{o.customerName}</strong><span>{o.customerPhone || 'Sin teléfono'} · {new Date(o.createdAt).toLocaleString('es-PE')}</span>{o.address && <span>{o.address}</span>}</div><b>{money(o.total)}</b></div><div className="order-items">{o.items.map(i => <span key={i.productId}>{i.quantity}× {i.productName}</span>)}</div><div className="order-actions"><select value={o.status} onChange={e => onUpdate(o.id, { status: e.target.value as OrderStatus })}>{(Object.keys(STATUS_LABELS) as OrderStatus[]).map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select><select value={o.paymentMethod ?? ''} onChange={e => onUpdate(o.id, { paymentMethod: e.target.value as any || undefined })}><option value="">Forma de pago</option><option value="efectivo">Efectivo</option><option value="yape">Yape</option><option value="plin">Plin</option><option value="transferencia">Transferencia</option></select><input type="number" min="0" max={o.total} step="0.01" value={o.paid} onChange={e => onUpdate(o.id, { paid: Number(e.target.value) })} /></div></div>)}</div>}
  </section></div>;
}

function ProductsView({ products, onCreate, onUpdate }: { products: Product[]; onCreate: (form: any) => void; onUpdate: (id: string, patch: Partial<Product>) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', category: '', price: '', cost: '', stock: '0', description: '' });
  const submit = () => {
    const price = Number(form.price), cost = Number(form.cost || 0), stock = Number(form.stock || 0);
    if (!form.name.trim() || !Number.isFinite(price) || price <= 0 || cost < 0) return;
    onCreate({ ...form, price, cost, stock }); setForm({ name: '', category: '', price: '', cost: '', stock: '0', description: '' }); setOpen(false);
  };
  return <div className="content"><div className="page-actions"><button className="primary" onClick={() => setOpen(true)}>+ Nuevo producto</button></div><section className="product-grid">{products.map(p => <article className={p.active ? 'product-card' : 'product-card inactive'} key={p.id}><div className="product-placeholder">{p.name.slice(0,1)}</div><div className="product-card-body"><span className="eyebrow">{p.category}</span><h3>{p.name}</h3><p>{p.description || 'Sin descripción.'}</p><div className="price-row"><strong>{money(p.price)}</strong>{p.oldPrice && <del>{money(p.oldPrice)}</del>}</div><div className="mini-grid"><label>Costo<input type="number" min="0" step="0.01" value={p.cost} onChange={e => onUpdate(p.id, { cost: Math.max(0, Number(e.target.value)) })}/></label><label>Stock<input type="number" min="0" step="1" value={p.stock} onChange={e => onUpdate(p.id, { stock: Math.max(0, Number(e.target.value)) })}/></label></div><button className="link-button" onClick={() => onUpdate(p.id, { active: !p.active })}>{p.active ? 'Ocultar producto' : 'Volver a mostrar'}</button></div></article>)}</section>
    {open && <Modal title="Nuevo producto" onClose={() => setOpen(false)}><label>Nombre<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></label><label>Categoría<input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}/></label><div className="form-grid"><label>Precio de venta<input type="number" min="0" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })}/></label><label>Costo real<input type="number" min="0" step="0.01" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })}/></label></div><label>Stock<input type="number" min="0" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })}/></label><label>Descripción<textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}/></label><button className="primary wide" onClick={submit}>Guardar producto</button></Modal>}
  </div>;
}

function IngredientsView({ ingredients, onAdd, onStock }: { ingredients: Ingredient[]; onAdd: (f: Omit<Ingredient, 'id'>) => void; onStock: (id: string, d: number) => void }) {
  const [form, setForm] = useState({ name: '', unit: 'g', unitCost: '', stock: '', minStock: '', supplier: '', expiration: '' });
  const submit = () => {
    if (!form.name.trim() || !form.unit) return;
    onAdd({ ...form, unitCost: Number(form.unitCost || 0), stock: Number(form.stock || 0), minStock: Number(form.minStock || 0), supplier: form.supplier.trim(), expiration: form.expiration || undefined });
    setForm({ name: '', unit: 'g', unitCost: '', stock: '', minStock: '', supplier: '', expiration: '' });
  };
  return <div className="content"><section className="panel"><div className="panel-head"><div><p className="eyebrow">NUEVO INGREDIENTE</p><h3>Inventario</h3></div></div><div className="form-grid five"><input placeholder="Ingrediente" value={form.name} onChange={e => setForm({...form,name:e.target.value})}/><input placeholder="Unidad" value={form.unit} onChange={e => setForm({...form,unit:e.target.value})}/><input placeholder="Costo unitario" type="number" value={form.unitCost} onChange={e => setForm({...form,unitCost:e.target.value})}/><input placeholder="Stock inicial" type="number" value={form.stock} onChange={e => setForm({...form,stock:e.target.value})}/><button className="primary" onClick={submit}>Agregar</button></div></section><section className="panel"><div className="table-wrap"><table><thead><tr><th>Ingrediente</th><th>Costo</th><th>Stock</th><th>Mínimo</th><th>Proveedor</th><th>Vence</th><th></th></tr></thead><tbody>{ingredients.map(i => <tr key={i.id}><td><strong>{i.name}</strong><span className="sub">{i.unit}</span></td><td>{money(i.unitCost)}</td><td className={i.stock <= i.minStock ? 'danger-text' : ''}>{i.stock} {i.unit}</td><td>{i.minStock}</td><td>{i.supplier || '—'}</td><td>{i.expiration || '—'}</td><td><button className="small-button" onClick={() => onStock(i.id, 1)}>+1</button><button className="small-button" onClick={() => onStock(i.id, -1)}>-1</button></td></tr>)}</tbody></table></div></section></div>;
}

function FinanceView({ moves, addMoney, balance }: { moves: MoneyMove[]; addMoney: (m: Omit<MoneyMove, 'id' | 'date'>) => void; balance: number }) {
  const [type, setType] = useState<MoneyMoveType>('gasto');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const submit = () => { const n=Number(amount); if(!Number.isFinite(n)||n<=0||!description.trim()) return; addMoney({type,amount:n,description:description.trim(),category:category.trim()||MOVE_LABELS[type]}); setAmount('');setDescription('');setCategory(''); };
  return <div className="content"><div className="metrics"><Metric label="Saldo de caja" value={money(balance)} /><Metric label="Movimientos" value={String(moves.length)} /></div><div className="grid-2"><section className="panel"><div className="panel-head"><div><p className="eyebrow">REGISTRAR</p><h3>Movimiento de dinero</h3></div></div><div className="form-grid"><select value={type} onChange={e=>setType(e.target.value as MoneyMoveType)}>{(Object.keys(MOVE_LABELS) as MoneyMoveType[]).map(k=><option value={k} key={k}>{MOVE_LABELS[k]}</option>)}</select><input type="number" min="0" step="0.01" placeholder="Monto" value={amount} onChange={e=>setAmount(e.target.value)}/></div><input placeholder="Descripción" value={description} onChange={e=>setDescription(e.target.value)}/><input placeholder="Categoría" value={category} onChange={e=>setCategory(e.target.value)}/><button className="primary wide" onClick={submit}>Registrar movimiento</button></section><section className="panel"><div className="panel-head"><div><p className="eyebrow">HISTORIAL</p><h3>Últimos movimientos</h3></div></div>{moves.slice(0,12).map(m=><div className="list-row" key={m.id}><div><strong>{m.description}</strong><span>{MOVE_LABELS[m.type]} · {new Date(m.date).toLocaleDateString('es-PE')}</span></div><b className={['gasto','retiro','pago_deuda'].includes(m.type)?'danger-text':''}>{['gasto','retiro','pago_deuda'].includes(m.type)?'-':''}{money(m.amount)}</b></div>)}</section></div></div>;
}

function DebtsView({ debts, setDebts }: { debts: Debt[]; setDebts: (d: Debt[]) => void }) {
  const [type,setType]=useState<'cobrar'|'pagar'>('cobrar');
  const [person,setPerson]=useState('');const [amount,setAmount]=useState('');const [desc,setDesc]=useState('');
  const submit=()=>{const n=Number(amount);if(!person.trim()||!Number.isFinite(n)||n<=0)return;setDebts([{id:uid('debt'),type,person:person.trim(),amount:n,description:desc.trim(),paid:false},...debts]);setPerson('');setAmount('');setDesc('');};
  return <div className="content"><section className="panel"><div className="form-grid five"><select value={type} onChange={e=>setType(e.target.value as any)}><option value="cobrar">Por cobrar</option><option value="pagar">Por pagar</option></select><input placeholder="Persona / proveedor" value={person} onChange={e=>setPerson(e.target.value)}/><input type="number" placeholder="Monto" value={amount} onChange={e=>setAmount(e.target.value)}/><input placeholder="Descripción" value={desc} onChange={e=>setDesc(e.target.value)}/><button className="primary" onClick={submit}>Guardar</button></div></section><section className="panel"><div className="table-wrap"><table><thead><tr><th>Tipo</th><th>Persona</th><th>Monto</th><th>Descripción</th><th>Estado</th><th></th></tr></thead><tbody>{debts.map(d=><tr key={d.id}><td><span className="pill">{d.type==='cobrar'?'Por cobrar':'Por pagar'}</span></td><td>{d.person}</td><td>{money(d.amount)}</td><td>{d.description||'—'}</td><td>{d.paid?'Pagado':'Pendiente'}</td><td><button className="small-button" onClick={()=>setDebts(debts.map(x=>x.id===d.id?{...x,paid:!x.paid}:x))}>{d.paid?'Reabrir':'Marcar pagado'}</button></td></tr>)}</tbody></table></div></section></div>;
}

function LossesView({ state, setState }: { state: BusinessState; setState: React.Dispatch<React.SetStateAction<BusinessState | null>> }) {
  const [item,setItem]=useState('');const [quantity,setQuantity]=useState('');const [value,setValue]=useState('');const [reason,setReason]=useState('');
  const submit=()=>{const q=Number(quantity),v=Number(value);if(!item.trim()||q<=0||v<0)return;setState(prev=>prev?{...prev,losses:[{id:uid('loss'),date:new Date().toISOString(),item:item.trim(),quantity:q,value:v,reason:reason.trim()},...prev.losses]}:prev);setItem('');setQuantity('');setValue('');setReason('');};
  return <div className="content"><section className="panel"><div className="form-grid five"><input placeholder="Producto / ingrediente" value={item} onChange={e=>setItem(e.target.value)}/><input type="number" placeholder="Cantidad" value={quantity} onChange={e=>setQuantity(e.target.value)}/><input type="number" step="0.01" placeholder="Valor perdido" value={value} onChange={e=>setValue(e.target.value)}/><input placeholder="Motivo" value={reason} onChange={e=>setReason(e.target.value)}/><button className="primary" onClick={submit}>Registrar</button></div></section><section className="panel"><div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Elemento</th><th>Cantidad</th><th>Valor</th><th>Motivo</th></tr></thead><tbody>{state.losses.map(l=><tr key={l.id}><td>{new Date(l.date).toLocaleDateString('es-PE')}</td><td>{l.item}</td><td>{l.quantity}</td><td>{money(l.value)}</td><td>{l.reason||'—'}</td></tr>)}</tbody></table></div></section></div>;
}

function ReportsView({ state }: { state: BusinessState }) {
  const sales=state.money.filter(m=>m.type==='venta').reduce((s,m)=>s+m.amount,0);
  const expenses=state.money.filter(m=>m.type==='gasto').reduce((s,m)=>s+m.amount,0);
  const investments=state.money.filter(m=>m.type==='inversion').reduce((s,m)=>s+m.amount,0);
  const profit=state.products.reduce((s,p)=>s+(p.price-p.cost)*p.stock,0)+sales-expenses;
  return <div className="content report-print"><div className="page-actions"><button className="secondary" onClick={()=>window.print()}>Imprimir / Guardar PDF</button><button className="secondary" onClick={()=>csvDownload('diego-bakery-movimientos.csv',state.money.map(m=>({fecha:m.date,tipo:m.type,monto:m.amount,descripcion:m.description,categoria:m.category})))}>Exportar Excel/CSV</button></div><section className="panel"><div className="report-header"><div><p className="eyebrow">{state.settings.businessName}</p><h3>Resumen financiero</h3><span>{new Date().toLocaleDateString('es-PE')}</span></div></div><div className="metrics"><Metric label="Ventas" value={money(sales)}/><Metric label="Gastos" value={money(expenses)}/><Metric label="Inversiones" value={money(investments)}/><Metric label="Resultado estimado" value={money(profit)}/></div></section><section className="panel"><h3>Inventario</h3><div className="table-wrap"><table><thead><tr><th>Ingrediente</th><th>Stock</th><th>Costo unitario</th><th>Proveedor</th></tr></thead><tbody>{state.ingredients.map(i=><tr key={i.id}><td>{i.name}</td><td>{i.stock} {i.unit}</td><td>{money(i.unitCost)}</td><td>{i.supplier||'—'}</td></tr>)}</tbody></table></div></section></div>;
}

function SettingsView({ state, update, exportBackup, onRestore }: { state: BusinessState; update: (p: Partial<BusinessState['settings']>) => void; exportBackup: () => void; onRestore: (file: File) => Promise<void> }) {
  return <div className="content"><section className="panel"><div className="panel-head"><div><p className="eyebrow">NEGOCIO</p><h3>Configuración general</h3></div></div><div className="form-grid"><label>Nombre del negocio<input value={state.settings.businessName} onChange={e=>update({businessName:e.target.value})}/></label><label>Tema<select value={state.settings.theme} onChange={e=>update({theme:e.target.value as any})}><option value="system">Sistema</option><option value="light">Claro</option><option value="dark">Oscuro</option></select></label><label>WhatsApp<input value={state.settings.whatsapp||''} onChange={e=>update({whatsapp:e.target.value})}/></label><label>Dirección<input value={state.settings.businessAddress||''} onChange={e=>update({businessAddress:e.target.value})}/></label></div></section><section className="panel"><div className="panel-head"><div><p className="eyebrow">VENTAS</p><h3>Horarios y entrega</h3></div></div><label className="toggle-row"><span>Ventas escolares</span><input type="checkbox" checked={state.settings.schoolSales} onChange={e=>update({schoolSales:e.target.checked})}/></label>{state.settings.schoolWindows.map((w,idx)=><div className="form-grid" key={w.label}><input value={w.label} onChange={e=>update({schoolWindows:state.settings.schoolWindows.map((x,i)=>i===idx?{...x,label:e.target.value}:x)})}/><input type="time" value={w.start} onChange={e=>update({schoolWindows:state.settings.schoolWindows.map((x,i)=>i===idx?{...x,start:e.target.value}:x)})}/><input type="time" value={w.end} onChange={e=>update({schoolWindows:state.settings.schoolWindows.map((x,i)=>i===idx?{...x,end:e.target.value}:x)})}/></div>)}<label className="toggle-row"><span>Entregas habilitadas</span><input type="checkbox" checked={state.settings.deliveryEnabled} onChange={e=>update({deliveryEnabled:e.target.checked})}/></label><label className="toggle-row"><span>Respaldo automático en la nube</span><input type="checkbox" checked={state.settings.autoBackup} onChange={e=>update({autoBackup:e.target.checked})}/></label></section><section className="panel"><div className="panel-head"><div><p className="eyebrow">RESPALDOS</p><h3>Protege tus datos</h3></div></div><div className="button-row"><button className="secondary" onClick={exportBackup}>Descargar respaldo JSON</button><label className="secondary file-button">Restaurar respaldo<input type="file" accept=".json,application/json" onChange={e=>{const file=e.target.files?.[0];if(file)void onRestore(file)}}/></label></div><p className="muted small">El respaldo local incluye productos, pedidos, caja, deudas, pérdidas y configuración. El respaldo en nube se intenta automáticamente cuando hay conexión.</p></section></div>;
}

function CustomerView({ products, cart, addToCart, addCombo, customer, setCustomer, promoCode, setPromoCode, promotions, combos, submit, onAdmin, theme, message, settings }: { products: Product[]; cart: OrderItem[]; addToCart: (p: Product) => void; addCombo: (c: BusinessState['combos'][number]) => void; customer: any; setCustomer: (v:any)=>void; promoCode: string; setPromoCode: (v:string)=>void; promotions: BusinessState['promotions']; combos: BusinessState['combos']; submit:()=>void; onAdmin:()=>void; theme:string; message:string; settings: BusinessState['settings'] }) {
  const subtotal=cart.reduce((s,i)=>s+i.subtotal,0);
  const activePromo=promotions.find(p=>p.active && p.code && p.code.toUpperCase()===promoCode.trim().toUpperCase());
  const quantity=cart.reduce((s,i)=>s+i.quantity,0);
  let discount=0;
  if(activePromo?.type==='percent') discount=subtotal*Math.min(100,activePromo.value)/100;
  if(activePromo?.type==='fixed') discount=Math.min(subtotal,activePromo.value);
  if(activePromo?.type==='quantity' && quantity >= (activePromo.minQuantity||1)) discount=Math.min(subtotal,activePromo.value);
  if(activePromo?.type==='date_price') discount=Math.max(0,subtotal-activePromo.value);
  const deliveryFee=settings.deliveryEnabled && customer.address.trim()?Math.max(0,settings.deliveryFee):0;
  const total=Math.max(0,subtotal-discount+deliveryFee);
  const visibleCombos=combos.filter(c=>c.active);
  return <div className={`customer-shell ${theme}`}><header className="customer-top"><div className="brand-line"><div className="brand-mark small">DB</div><div><strong>Diego Bakery</strong><span>Postres artesanales</span></div></div><button className="link-button" onClick={onAdmin}>Administrar</button></header><div className="customer-hero"><p className="eyebrow">CATÁLOGO</p><h1>Hecho en casa, pensado para ti.</h1><p>Elige tus productos. El pedido se guarda incluso sin conexión.</p></div><section className="customer-products">{products.map(p=><article className="shop-card" key={p.id}><div className="product-placeholder">{p.name.slice(0,1)}</div><div className="shop-card-body"><span className="eyebrow">{p.category}</span><h3>{p.name}</h3><p>{p.description}</p><div className="price-row"><strong>{money(p.price)}</strong>{p.oldPrice&&<del>{money(p.oldPrice)}</del>}</div>{p.flavors.length>0&&<span className="sub">Sabores: {p.flavors.join(', ')}</span>}{p.sizes.length>0&&<span className="sub">Tamaños: {p.sizes.join(', ')}</span>}<button className="primary wide" onClick={()=>addToCart(p)}>Agregar</button></div></article>)}</section>{visibleCombos.length>0&&<section className="customer-products">{visibleCombos.map(combo=><article className="shop-card" key={combo.id}><div className="shop-card-body"><span className="eyebrow">COMBO</span><h3>{combo.name}</h3><p>{combo.productIds.map(id=>products.find(p=>p.id===id)?.name).filter(Boolean).join(' + ')}</p><strong>{money(combo.price)}</strong><button className="primary wide" onClick={()=>addCombo(combo)}>Agregar combo</button></div></article>)}</section>}<section className="cart-panel"><div><p className="eyebrow">PEDIDO</p><h2>Tu carrito</h2>{cart.length===0?<Empty text="Agrega un producto para comenzar."/>:cart.map(i=><div className="list-row" key={i.productId}><div><strong>{i.productName}</strong><span>{i.quantity} unidad(es)</span></div><b>{money(i.subtotal)}</b></div>)}{discount>0&&<div className="list-row"><span>Descuento</span><b>-{money(discount)}</b></div>}{deliveryFee>0&&<div className="list-row"><span>Entrega</span><b>{money(deliveryFee)}</b></div>}<div className="cart-total"><span>Total</span><strong>{money(total)}</strong></div></div><div className="customer-form"><input placeholder="Nombre" value={customer.name} onChange={e=>setCustomer({...customer,name:e.target.value})}/><input placeholder="Teléfono" value={customer.phone} onChange={e=>setCustomer({...customer,phone:e.target.value})}/><input placeholder="Dirección (opcional)" value={customer.address} onChange={e=>setCustomer({...customer,address:e.target.value})}/><input placeholder="Código promocional" value={promoCode} onChange={e=>setPromoCode(e.target.value.toUpperCase())}/><textarea placeholder="Notas o personalización" value={customer.notes} onChange={e=>setCustomer({...customer,notes:e.target.value})}/><button className="primary wide" onClick={submit}>Enviar pedido</button>{settings.whatsapp&&<button className="secondary wide" onClick={()=>window.open('https://wa.me/'+settings.whatsapp!.replace(/\\D/g,''),'_blank','noopener,noreferrer')}>Contactar por WhatsApp</button>}{customer.address.trim()&&<button className="secondary wide" onClick={()=>window.open('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(customer.address),'_blank','noopener,noreferrer')}>Abrir dirección en mapa</button>}{message&&<div className="notice">{message}</div>}</div></section></div>;
}

function Modal({ title, onClose, children }: { title:string; onClose:()=>void; children:React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="modal"><div className="modal-head"><h3>{title}</h3><button className="icon-button" onClick={onClose}>×</button></div><div className="modal-body">{children}</div></div></div>;
}

function Empty({ text }: { text:string }) {
  return <div className="empty"><span>{text}</span></div>;
}
