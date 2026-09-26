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

export interface ProductOption {
  label: string;
  values: string[];
}

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
  options?: ProductOption[];
  customizable?: boolean;
  customizationNote?: string;
  image?: string;
  sku?: string;
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

export interface RecipeLine {
  ingredientId: string;
  quantity: number;
}

export interface Recipe {
  id: string;
  productId: string;
  name: string;
  yieldUnits: number;
  ingredients: RecipeLine[];
  packagingCost: number;
  utilityCost: number;
  serviceCost: number;
  laborHours: number;
  laborRate: number;
  otherCost: number;
  totalCost: number;
  salePrice: number;
  margin: number;
}

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  notes?: string;
  active: boolean;
}

export interface CustomerAddress {
  label: string;
  address: string;
  reference?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  addresses: CustomerAddress[];
  points: number;
  level: string;
  favorites: string[];
  notes?: string;
  createdAt: string;
}

export type PromotionType = 'percent' | 'fixed' | 'quantity' | 'combo' | 'date_price';

export interface Promotion {
  id: string;
  name: string;
  code?: string;
  description?: string;
  type: PromotionType;
  value: number;
  minQuantity?: number;
  productIds: string[];
  startAt?: string;
  endAt?: string;
  active: boolean;
}

export interface Combo {
  id: string;
  name: string;
  productIds: string[];
  price: number;
  active: boolean;
}

export interface LoyaltyReward {
  id: string;
  name: string;
  points: number;
  discount: number;
  active: boolean;
}

export interface ServiceCost {
  id: string;
  name: string;
  amount: number;
  unit: string;
  active: boolean;
}

export interface CashRegister {
  openedAt?: string;
  openingCash: number;
  closedAt?: string;
  closingCash?: number;
}

export interface NotificationItem {
  id: string;
  type: 'pedido' | 'stock' | 'deuda' | 'sistema';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface Review {
  id: string;
  customerId?: string;
  productId: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  cost: number;
  subtotal: number;
  customizations?: Record<string, string>;
}

export interface Order {
  id: string;
  createdAt: string;
  deliveryAt?: string;
  customerName: string;
  customerPhone: string;
  address?: string;
  reference?: string;
  notes?: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  total: number;
  status: OrderStatus;
  paymentMethod?: PaymentMethod;
  paid: number;
  proofUrl?: string;
  discountCode?: string;
  loyaltyPointsUsed?: number;
  inventoryDeducted?: boolean;
  loyaltyAwardedAt?: string;
  source: 'admin' | 'cliente';
  remoteId?: string;
}

export interface MoneyMove {
  id: string;
  date: string;
  type: MoneyMoveType;
  amount: number;
  description: string;
  category: string;
  method?: PaymentMethod;
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
  autoBackup: boolean;
  biometrics: boolean;
  laborRatePerHour: number;
  defaultUtilityCost: number;
  defaultPackagingCost: number;
  deliveryFee: number;
  loyaltyPointsPerSol: number;
  whatsapp?: string;
  businessAddress?: string;
  socialInstagram?: string;
  socialFacebook?: string;
  notificationEnabled: boolean;
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
  recipes: Recipe[];
  suppliers: Supplier[];
  customers: Customer[];
  promotions: Promotion[];
  combos: Combo[];
  loyaltyRewards: LoyaltyReward[];
  services: ServiceCost[];
  orders: Order[];
  money: MoneyMove[];
  debts: Debt[];
  losses: Loss[];
  notifications: NotificationItem[];
  reviews: Review[];
  cashRegister: CashRegister;
  settings: BusinessSettings;
  admin?: LocalAdmin;
  lastSyncAt?: string;
  lastLocalChangeAt?: string;
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

export function calculateRecipeCost(recipe: Recipe, ingredients: Ingredient[]): Recipe {
  const ingredientCost = recipe.ingredients.reduce((sum, line) => {
    const ingredient = ingredients.find(i => i.id === line.ingredientId);
    return sum + (ingredient ? ingredient.unitCost * line.quantity : 0);
  }, 0);

  const productionCost = ingredientCost
    + recipe.packagingCost
    + recipe.utilityCost
    + recipe.serviceCost
    + (recipe.laborHours * recipe.laborRate)
    + recipe.otherCost;

  const totalCost = recipe.yieldUnits > 0 ? productionCost / recipe.yieldUnits : productionCost;
  const margin = recipe.salePrice > 0 ? ((recipe.salePrice - totalCost) / recipe.salePrice) * 100 : 0;

  return {
    ...recipe,
    totalCost: Number(totalCost.toFixed(4)),
    margin: Number(margin.toFixed(2))
  };
}

export function defaultState(): BusinessState {
  const quequeId = uid('prd');
  const alfajorId = uid('prd');

  return {
    products: [
      {
        id: quequeId,
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
        presentation: 'Empaque individual',
        options: [
          { label: 'Sabor', values: ['Vainilla', 'Chocolate'] },
          { label: 'Tamaño', values: ['Porción', 'Entero'] }
        ],
        customizable: true,
        customizationNote: 'Puedes solicitar texto o color de decoración.'
      },
      {
        id: alfajorId,
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
        presentation: 'Bolsa / caja',
        options: [
          { label: 'Presentación', values: ['Unidad', 'Caja'] }
        ],
        customizable: false
      }
    ],
    ingredients: [],
    recipes: [],
    suppliers: [],
    customers: [],
    promotions: [],
    combos: [],
    loyaltyRewards: [],
    services: [],
    orders: [],
    money: [],
    debts: [],
    losses: [],
    notifications: [],
    reviews: [],
    cashRegister: {
      openingCash: 0
    },
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
      biometrics: false,
      laborRatePerHour: 8,
      defaultUtilityCost: 1.5,
      defaultPackagingCost: 0.5,
      deliveryFee: 0,
      loyaltyPointsPerSol: 1,
      notificationEnabled: true
    }
  };
}
