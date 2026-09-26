export type OrderStatus =
  | 'pendiente'
  | 'esperando_confirmacion'
  | 'comprando_ingredientes'
  | 'preparando'
  | 'lista'
  | 'por_entregar'
  | 'entregada'
  | 'no_entregada'
  | 'cancelada'
  | 'archivada';

export type PaymentMethod = 'efectivo' | 'yape' | 'plin' | 'transferencia' | 'otro';
export type MoneyMoveType = 'venta' | 'gasto' | 'inversion' | 'retiro' | 'cobro_deuda' | 'pago_deuda' | 'ajuste';

export interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  categories: string[];
  price: number;
  oldPrice?: number;
  cost: number;
  stock: number;
  active: boolean;
  seasonal: boolean;
  tags: string[];
  flavors: string[];
  sizes: string[];
  presentation: string;
  image?: string;
}

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  unitCost: number;
  stock: number;
  minStock: number;
  supplier: string;
  expiration?: string;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  cost: number;
  subtotal: number;
}

export interface Order {
  id: string;
  createdAt: string;
  deliveryAt?: string;
  customerName: string;
  customerPhone: string;
  address?: string;
  notes?: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  total: number;
  status: OrderStatus;
  paymentMethod?: PaymentMethod;
  paid: number;
  proofUrl?: string;
  source: 'admin' | 'cliente';
}

export interface MoneyMove {
  id: string;
  date: string;
  type: MoneyMoveType;
  amount: number;
  description: string;
  category: string;
}

export interface Debt {
  id: string;
  type: 'cobrar' | 'pagar';
  person: string;
  amount: number;
  dueDate?: string;
  description: string;
  paid: boolean;
}

export interface Loss {
  id: string;
  date: string;
  item: string;
  quantity: number;
  value: number;
  reason: string;
}

export interface BusinessSettings {
  businessName: string;
  currency: string;
  theme: 'light' | 'dark' | 'system';
  schoolSales: boolean;
  schoolWindows: { label: string; start: string; end: string }[];
  deliveryEnabled: boolean;
  whatsapp?: string;
  businessAddress?: string;
  autoBackup: boolean;
  biometrics: boolean;
}

export interface LocalAdmin {
  name: string;
  phone: string;
  pinHash: string;
  token?: string;
}

export interface BusinessState {
  products: Product[];
  ingredients: Ingredient[];
  orders: Order[];
  money: MoneyMove[];
  debts: Debt[];
  losses: Loss[];
  settings: BusinessSettings;
  admin?: LocalAdmin;
  lastSyncAt?: string;
}

export const uid = (prefix: string): string =>
  `${prefix}_${crypto.randomUUID()}`;

export function money(value: number): string {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2
  }).format(Number.isFinite(value) ? value : 0);
}

export function defaultState(): BusinessState {
  return {
    products: [
      {
        id: uid('prd'),
        name: 'Queque Marmoleado',
        description: 'Queque alto, húmedo y con vainilla y chocolate.',
        category: 'Queques',
        categories: ['Queques', 'Más vendidos'],
        price: 12,
        cost: 5,
        stock: 0,
        active: true,
        seasonal: false,
        tags: ['nuevo'],
        flavors: ['Vainilla', 'Chocolate'],
        sizes: ['Porción', 'Entero'],
        presentation: 'Empaque individual'
      },
      {
        id: uid('prd'),
        name: 'Alfajores',
        description: 'Alfajores artesanales con relleno de manjar blanco.',
        category: 'Alfajores',
        categories: ['Alfajores', 'Más vendidos'],
        price: 4,
        cost: 1.5,
        stock: 0,
        active: true,
        seasonal: false,
        tags: ['favorito'],
        flavors: ['Clásico'],
        sizes: ['Unidad', 'Caja'],
        presentation: 'Bolsa / caja'
      }
    ],
    ingredients: [],
    orders: [],
    money: [],
    debts: [],
    losses: [],
    settings: {
      businessName: 'Diego Bakery',
      currency: 'PEN',
      theme: 'system',
      schoolSales: true,
      schoolWindows: [
        { label: 'Recreo', start: '11:00', end: '11:20' },
        { label: 'Almuerzo', start: '12:40', end: '13:00' }
      ],
      deliveryEnabled: true,
      autoBackup: true,
      biometrics: false
    }
  };
}
