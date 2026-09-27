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

export interface PhysicalSpecifications {
  weight?: number;
  weightUnit?: string;
  height?: number;
  heightUnit?: string;
  width?: number;
  widthUnit?: string;
  length?: number;
  lengthUnit?: string;
  diameter?: number;
  diameterUnit?: string;
  shape?: string;
  moldType?: string;
  packagingType?: string;
  temperature?: number;
  temperatureUnit?: string;
  bakingTimeMinutes?: number;
  finalAppearance?: string;
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
  manualCost?: number;
  recommendedPrice?: number;
  priceBreakdown?: {
    ingredientCost: number;
    productionCost: number;
    allocatedExpenses: number;
    allocatedInvestment: number;
    allocatedLosses: number;
    targetProfit: number;
    recommendedPrice: number;
  };
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
  specifications?: PhysicalSpecifications;
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
  unit?: string;
}

export interface ServiceLine {
  serviceId: string;
  quantity: number;
}

export interface Recipe {
  id: string;
  productId: string;
  name: string;
  yieldUnits: number;
  ingredients: RecipeLine[];
  procedure?: string[];
  notes?: string[];
  sourceFile?: string;
  serviceLines?: ServiceLine[];
  packagingCost: number;
  utilityCost: number;
  serviceCost: number;
  laborHours: number;
  laborRate: number;
  useDefaultPackagingCost?: boolean;
  useDefaultUtilityCost?: boolean;
  useDefaultLaborRate?: boolean;
  otherCost: number;
  totalCost: number;
  salePrice: number;
  margin: number;
  specifications?: PhysicalSpecifications;
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
  customerId?: string;
  deliveryAt?: string;
  customerName: string;
  customerPhone: string;
  address?: string;
  reference?: string;
  notes?: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  deliveryFee?: number;
  total: number;
  inventoryConsumption?: Record<string, number>;
  status: OrderStatus;
  paymentMethod?: PaymentMethod;
  paid: number;
  paidAt?: string;
  proofUrl?: string;
  discountCode?: string;
  promotionId?: string;
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
  origin?: 'order' | 'debt';
  relatedId?: string;
}

export interface Debt {
  id: string;
  type: 'cobrar' | 'pagar';
  person: string;
  amount: number;
  dueDate?: string;
  description: string;
  paid: boolean;
  paidAt?: string;
  paymentMethod?: PaymentMethod;
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
  pricingTargetProfitPercent: number;
  pricingExpectedMonthlyUnits: number;
  pricingInvestmentRecoveryMonths: number;
  pricingIncludeExpenses: boolean;
  pricingIncludeLosses: boolean;
}

export interface LocalAdmin {
  name: string;
  phone: string;
  pinHash: string;
  token?: string;
}

export interface BusinessAction {
  collection: 'products' | 'ingredients' | 'recipes' | 'suppliers' | 'customers' | 'promotions' | 'combos' | 'loyaltyRewards' | 'services' | 'orders' | 'money' | 'debts' | 'losses' | 'notifications' | 'reviews' | 'settings' | 'cashRegister';
  action: 'add' | 'update' | 'delete';
  id?: string;
  value?: Record<string, unknown>;
  reason?: string;
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
  __calculations?: BusinessCalculations;
}

export interface BusinessCalculations {
  sales: number;
  expenses: number;
  investments: number;
  withdrawals: number;
  debtCollected: number;
  debtPaid: number;
  losses: number;
  cash: number;
  inventoryValue: number;
  accountsReceivable: number;
  accountsPayable: number;
  deliveredRevenue: number;
  deliveredCost: number;
  grossProfit: number;
  netProfit: number;
  capitalContributed: number;
  capitalRecovered: number;
  workingCapital: number;
  averageTicket: number;
  monthlyFixedCost: number;
  monthlyInvestmentRecovery: number;
  monthlyLossAllowance: number;
  targetProfitAmount: number;
  breakEvenRevenue: number;
  recommendedRevenue: number;
  registerExpectedCash: number;
  registerDifference: number;
  productPricing: ProductPricing[];
  totalRecommendedRevenue: number;
  formulas: Array<{ name: string; formula: string; value: number }>;
}

export interface ProductPricing {
  productId: string;
  productName: string;
  ingredientCost: number;
  directProductionCost: number;
  allocatedExpenses: number;
  allocatedInvestment: number;
  allocatedLosses: number;
  totalCost: number;
  targetProfit: number;
  recommendedPrice: number;
  currentPrice: number;
  marginAtCurrentPrice: number;
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

type UnitDefinition = { dimension: 'mass' | 'volume' | 'length' | 'count' | 'time'; factor: number };
const UNIT_ALIASES: Record<string, string> = {
  g: 'g', gr: 'g', gramo: 'g', gramos: 'g',
  kg: 'kg', kilo: 'kg', kilos: 'kg', kilogramo: 'kg', kilogramos: 'kg',
  mg: 'mg', miligramo: 'mg', miligramos: 'mg',
  ml: 'ml', mililitro: 'ml', mililitros: 'ml',
  l: 'l', lt: 'l', litro: 'l', litros: 'l',
  cl: 'cl', centilitro: 'cl', centilitros: 'cl',
  cc: 'ml',
  cdta: 'tsp', cucharadita: 'tsp', cucharaditas: 'tsp',
  cdita: 'tsp',
  cda: 'tbsp', cucharada: 'tbsp', cucharadas: 'tbsp',
  taza: 'cup', tazas: 'cup',
  cup: 'cup', cups: 'cup',
  unidad: 'und', unidades: 'und', und: 'und', u: 'und',
  pieza: 'und', piezas: 'und',
  docena: 'dz', docenas: 'dz',
  mm: 'mm', milimetro: 'mm', milimetros: 'mm',
  cm: 'cm', centimetro: 'cm', centimetros: 'cm',
  m: 'm', metro: 'm', metros: 'm',
  min: 'min', minuto: 'min', minutos: 'min',
  h: 'h', hora: 'h', horas: 'h'
};

const UNIT_DEFINITIONS: Record<string, UnitDefinition> = {
  mg: { dimension: 'mass', factor: 0.001 },
  g: { dimension: 'mass', factor: 1 },
  kg: { dimension: 'mass', factor: 1000 },
  ml: { dimension: 'volume', factor: 1 },
  cl: { dimension: 'volume', factor: 10 },
  l: { dimension: 'volume', factor: 1000 },
  tsp: { dimension: 'volume', factor: 5 },
  tbsp: { dimension: 'volume', factor: 15 },
  cup: { dimension: 'volume', factor: 240 },
  mm: { dimension: 'length', factor: 1 },
  cm: { dimension: 'length', factor: 10 },
  m: { dimension: 'length', factor: 1000 },
  und: { dimension: 'count', factor: 1 },
  dz: { dimension: 'count', factor: 12 },
  min: { dimension: 'time', factor: 1 },
  h: { dimension: 'time', factor: 60 }
};

export function normalizeUnit(unit: string): string {
  const raw = String(unit || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return UNIT_ALIASES[raw] || raw;
}

export function convertQuantity(quantity: number, fromUnit?: string, toUnit?: string): number | null {
  const value = Number(quantity);
  if (!Number.isFinite(value)) return 0;
  const from = normalizeUnit(fromUnit || '');
  const to = normalizeUnit(toUnit || '');
  if (!from || !to || from === to) return value;
  const fromDef = UNIT_DEFINITIONS[from];
  const toDef = UNIT_DEFINITIONS[to];
  if (!fromDef || !toDef || fromDef.dimension !== toDef.dimension) return null;
  return value * fromDef.factor / toDef.factor;
}

export function unitOptions(): string[] {
  return ['g', 'kg', 'mg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'und', 'dz', 'mm', 'cm', 'm', 'min', 'h'];
}

export function calculateRecipeCost(
  recipe: Recipe,
  ingredients: Ingredient[],
  services: ServiceCost[] = [],
  settings?: BusinessSettings
): Recipe {
  const packagingCost = recipe.useDefaultPackagingCost === false
    ? recipe.packagingCost
    : Number(settings?.defaultPackagingCost ?? recipe.packagingCost ?? 0);
  const utilityCost = recipe.useDefaultUtilityCost === false
    ? recipe.utilityCost
    : Number(settings?.defaultUtilityCost ?? recipe.utilityCost ?? 0);
  const laborRate = recipe.useDefaultLaborRate === false
    ? recipe.laborRate
    : Number(settings?.laborRatePerHour ?? recipe.laborRate ?? 0);

  const ingredientCost = recipe.ingredients.reduce((sum, line) => {
    const ingredient = ingredients.find(i => i.id === line.ingredientId);
    if (!ingredient) return sum;
    const converted = convertQuantity(Number(line.quantity), line.unit, ingredient.unit);
    const quantityInIngredientUnit = converted == null ? Number(line.quantity) : converted;
    return sum + Number(ingredient.unitCost) * quantityInIngredientUnit;
  }, 0);

  const linkedServiceCost = (recipe.serviceLines || []).reduce((sum, line) => {
    const service = services.find(s => s.id === line.serviceId && s.active !== false);
    return sum + (service ? Number(service.amount) * Number(line.quantity) : 0);
  }, 0);

  const productionCost = ingredientCost
    + packagingCost
    + utilityCost
    + Number(recipe.serviceCost || 0)
    + linkedServiceCost
    + (Number(recipe.laborHours || 0) * laborRate)
    + Number(recipe.otherCost || 0);

  const totalCost = recipe.yieldUnits > 0 ? productionCost / recipe.yieldUnits : productionCost;
  const margin = recipe.salePrice > 0 ? ((recipe.salePrice - totalCost) / recipe.salePrice) * 100 : 0;

  return {
    ...recipe,
    packagingCost,
    utilityCost,
    laborRate,
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
        manualCost: 5,
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
        customizationNote: 'Puedes solicitar texto o color de decoración.',
        specifications: {
          weight: 0, weightUnit: 'g', height: 0, heightUnit: 'cm',
          width: 0, widthUnit: 'cm', length: 0, lengthUnit: 'cm',
          diameter: 0, diameterUnit: 'cm', shape: 'Por definir',
          moldType: 'Por definir', packagingType: 'Por definir',
          temperature: 180, temperatureUnit: '°C', bakingTimeMinutes: 0,
          finalAppearance: ''
        }
      },
      {
        id: alfajorId,
        name: 'Alfajores',
        description: 'Alfajores artesanales con relleno de manjar blanco.',
        category: 'Alfajores',
        categories: ['Alfajores', 'Más vendidos'],
        price: 4,
        cost: 1.5,
        manualCost: 1.5,
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
      notificationEnabled: true,
      pricingTargetProfitPercent: 30,
      pricingExpectedMonthlyUnits: 100,
      pricingInvestmentRecoveryMonths: 12,
      pricingIncludeExpenses: true,
      pricingIncludeLosses: true
    }
  };
}
