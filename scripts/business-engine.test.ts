import { recalculateBusinessState, applyBusinessChange } from '../app/src/businessEngine';
import {
  type BusinessState,
  type Ingredient,
  type Product,
  type Recipe,
  type Order,
  type Promotion,
  type Combo,
  type Customer,
  type MoneyMove
} from '../app/src/types';

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error('FAIL: ' + message);
};

function base(): BusinessState {
  const ingredientA: Ingredient = {
    id: 'ing_a',
    name: 'Harina',
    unit: 'g',
    unitCost: 0.01,
    stock: 1000,
    minStock: 100,
    supplier: 'Proveedor A'
  };

  const productA: Product = {
    id: 'prd_a',
    name: 'Queque',
    description: '',
    category: 'Queques',
    categories: ['Queques'],
    price: 10,
    cost: 0,
    stock: 10,
    active: true,
    seasonal: false,
    tags: [],
    flavors: [],
    sizes: [],
    presentation: 'Caja'
  };

  const recipeA: Recipe = {
    id: 'rec_a',
    productId: 'prd_a',
    name: 'Receta Queque',
    yieldUnits: 1,
    ingredients: [{ ingredientId: 'ing_a', quantity: 200 }],
    serviceLines: [],
    useDefaultPackagingCost: false,
    useDefaultUtilityCost: false,
    useDefaultLaborRate: false,
    packagingCost: 1,
    utilityCost: 1,
    serviceCost: 0,
    laborHours: 1,
    laborRate: 5,
    otherCost: 0,
    totalCost: 0,
    salePrice: 10,
    margin: 0
  };

  const delivered: Order = {
    id: 'ord_done',
    createdAt: '2026-09-01T10:00:00Z',
    customerName: 'Ana',
    customerPhone: '1',
    items: [{ productId: 'prd_a', productName: 'Queque', quantity: 1, unitPrice: 10, cost: 9, subtotal: 10 }],
    subtotal: 10,
    discount: 0,
    total: 10,
    status: 'entregada',
    paid: 10,
    source: 'admin'
  };

  const open: Order = {
    id: 'ord_open',
    createdAt: '2026-09-02T10:00:00Z',
    customerName: 'Luis',
    customerPhone: '2',
    items: [{ productId: 'prd_a', productName: 'Queque', quantity: 2, unitPrice: 10, cost: 9, subtotal: 20 }],
    subtotal: 20,
    discount: 0,
    deliveryFee: 3,
    total: 23,
    status: 'pendiente',
    paid: 0,
    source: 'admin'
  };

  const promo: Promotion = {
    id: 'promo_a',
    name: 'Promo',
    type: 'percent',
    value: 10,
    productIds: ['prd_a'],
    active: true
  };

  const combo: Combo = {
    id: 'combo_a',
    name: 'Combo',
    productIds: ['prd_a'],
    price: 9,
    active: true
  };

  const customer: Customer = {
    id: 'cus_a',
    name: 'Ana',
    phone: '1',
    addresses: [],
    points: 0,
    level: 'Nuevo',
    favorites: ['prd_a'],
    createdAt: '2026-09-01T00:00:00Z'
  };

  const moneyMove: MoneyMove = {
    id: 'mov_g',
    date: '2026-09-01T00:00:00Z',
    type: 'gasto',
    amount: 100,
    description: 'Gasto',
    category: 'Operación',
    method: 'efectivo'
  };

  return {
    products: [productA],
    ingredients: [ingredientA],
    recipes: [recipeA],
    suppliers: [{ id: 'sup_a', name: 'Proveedor A', active: true }],
    customers: [customer],
    promotions: [promo],
    combos: [combo],
    loyaltyRewards: [],
    services: [],
    orders: [delivered, open],
    money: [moneyMove],
    debts: [],
    losses: [],
    notifications: [],
    reviews: [],
    cashRegister: { openingCash: 0 },
    settings: {
      businessName: 'Test Bakery',
      currency: 'PEN',
      theme: 'light',
      schoolSales: false,
      schoolWindows: [],
      deliveryEnabled: false,
      autoBackup: false,
      biometrics: false,
      laborRatePerHour: 5,
      defaultUtilityCost: 0,
      defaultPackagingCost: 0,
      deliveryFee: 0,
      loyaltyPointsPerSol: 1,
      notificationEnabled: false,
      pricingTargetProfitPercent: 25,
      pricingExpectedMonthlyUnits: 100,
      pricingInvestmentRecoveryMonths: 10,
      pricingIncludeExpenses: true,
      pricingIncludeLosses: true
    }
  };
}

const s0 = recalculateBusinessState(base());
const p0 = s0.products[0];
const r0 = s0.recipes[0];

assert(Math.abs(r0.totalCost - 9) < 0.0001, 'recipe direct cost = ingredients + packaging + utility + labor');
assert(p0.cost === 9, 'product direct cost follows recipe');
assert((p0.recommendedPrice ?? 0) > p0.cost, 'recommended price exceeds direct cost');
assert(s0.__calculations?.expenses === 100, 'expense is included in finance totals');
assert((s0.__calculations?.accountsPayable ?? -1) === 0, 'no payable without debts');
assert((s0.__calculations?.sales ?? -1) === 10, 'delivered order payment is represented exactly once in the ledger');
assert((s0.__calculations?.cash ?? -1) === -90, 'cash uses only the actual cash payment movements');

const changedIngredient = {
  ...s0,
  ingredients: s0.ingredients.map(i => i.id === 'ing_a' ? { ...i, unitCost: 0.02 } : i)
};
const s1 = recalculateBusinessState(changedIngredient, s0);
assert(s1.recipes[0].totalCost === 11, 'ingredient price change propagates to recipe');
assert(s1.products[0].cost === 11, 'ingredient price change propagates to product cost');
assert(s1.products[0].recommendedPrice !== p0.recommendedPrice, 'ingredient price change propagates to recommended price');

const renamedSupplier = applyBusinessChange(s1, {
  collection: 'suppliers',
  action: 'update',
  id: 'sup_a',
  value: { name: 'Proveedor Nuevo' }
});
assert(renamedSupplier.ingredients[0].supplier === 'Proveedor Nuevo', 'supplier rename propagates to ingredient relation');

const renamed = {
  ...renamedSupplier,
  products: renamedSupplier.products.map(p => p.id === 'prd_a' ? { ...p, name: 'Queque Especial', price: 12 } : p)
};
const s2 = recalculateBusinessState(renamed, renamedSupplier);
const done = s2.orders.find(o => o.id === 'ord_done')!;
const open = s2.orders.find(o => o.id === 'ord_open')!;
assert(done.items[0].productName === 'Queque', 'delivered order keeps historical product snapshot');
assert(done.items[0].unitPrice === 10, 'delivered order keeps historical price');
assert(open.items[0].productName === 'Queque Especial', 'open order follows current product name');
assert(open.items[0].unitPrice === 12, 'open order follows current product price');
assert(open.total === 27, 'open order total is recalculated from current product price and delivery');
assert(open.deliveryFee === 3, 'open order preserves delivery fee during recalculation');

const prepared = applyBusinessChange(s2, {
  collection: 'orders',
  action: 'update',
  id: 'ord_open',
  value: { status: 'preparando' }
});
assert(prepared.orders.find(o => o.id === 'ord_open')?.inventoryDeducted === true, 'preparing order marks inventory as deducted');
assert((prepared.orders.find(o => o.id === 'ord_open')?.inventoryConsumption?.ing_a ?? 0) === 0.4, 'preparing order records exact ingredient consumption');
assert(prepared.ingredients[0].stock === 999.6, 'preparing order deducts recipe ingredients exactly once');

const preparedChanged = applyBusinessChange(prepared, {
  collection: 'orders',
  action: 'update',
  id: 'ord_open',
  value: { items: [{ ...prepared.orders.find(o => o.id === 'ord_open')!.items[0], quantity: 3 }] }
});
assert(preparedChanged.ingredients[0].stock === 999.4, 'editing prepared order quantity adjusts inventory by the delta');
assert((preparedChanged.orders.find(o => o.id === 'ord_open')?.inventoryConsumption?.ing_a ?? 0) === 0.6, 'prepared order consumption snapshot updates with order item change');

const paid = applyBusinessChange(s2, {
  collection: 'orders',
  action: 'update',
  id: 'ord_open',
  value: { paid: 12, paymentMethod: 'yape' }
});
assert(paid.__calculations?.sales === 22, 'editing order payment updates sales');
assert(paid.money.filter(m => m.origin === 'order').length === 2, 'one generated ledger row exists per paid order');
assert(paid.money.some(m => m.origin === 'order' && m.relatedId === 'ord_open' && m.method === 'yape'), 'order payment method propagates to ledger');

const paidAgain = applyBusinessChange(paid, {
  collection: 'orders',
  action: 'update',
  id: 'ord_open',
  value: { paid: 20, paymentMethod: 'efectivo' }
});
assert(paidAgain.money.filter(m => m.origin === 'order').length === 2, 'editing payment never creates duplicate ledger rows');
assert(paidAgain.money.find(m => m.relatedId === 'ord_open')?.amount === 20, 'edited payment amount replaces the linked ledger row');

const debtState = applyBusinessChange(paidAgain, {
  collection: 'debts',
  action: 'add',
  value: { id: 'debt_1', type: 'cobrar', person: 'Ana', amount: 30, description: 'Pendiente', paid: false }
});
assert(debtState.__calculations?.accountsReceivable === 30, 'new receivable is calculated');

const debtPaid = applyBusinessChange(debtState, {
  collection: 'debts',
  action: 'update',
  id: 'debt_1',
  value: { paid: true, paymentMethod: 'efectivo' }
});
assert(debtPaid.__calculations?.accountsReceivable === 0, 'paid receivable leaves accounts receivable');
assert(debtPaid.__calculations?.debtCollected === 30, 'paid receivable creates a debt collection movement');
assert(debtPaid.money.filter(m => m.origin === 'debt').length === 1, 'debt payment creates exactly one linked ledger movement');

const debtReopened = applyBusinessChange(debtPaid, {
  collection: 'debts',
  action: 'update',
  id: 'debt_1',
  value: { paid: false }
});
assert(debtReopened.__calculations?.debtCollected === 0, 'reopening debt removes generated debt movement');

const serviceAdded = applyBusinessChange(debtReopened, {
  collection: 'services',
  action: 'add',
  value: { id: 'svc_1', name: 'Decoración', amount: 2, unit: 'por producción', active: true }
});
const withService = applyBusinessChange(serviceAdded, {
  collection: 'recipes',
  action: 'update',
  id: 'rec_a',
  value: { serviceLines: [{ serviceId: 'svc_1', quantity: 2 }] }
});
assert(withService.recipes[0].totalCost === 15, 'linked service cost is included in recipe cost');

const serviceChanged = applyBusinessChange(serviceAdded, {
  collection: 'services',
  action: 'update',
  id: 'svc_1',
  value: { amount: 4 }
});
assert(serviceChanged.recipes[0].totalCost === 11, 'service without recipe link does not affect unrelated recipes');

const serviceChangedLinked = applyBusinessChange(withService, {
  collection: 'services',
  action: 'update',
  id: 'svc_1',
  value: { amount: 4 }
});
assert(serviceChangedLinked.recipes[0].totalCost === 19, 'service amount change propagates to linked recipe and product cost');

const defaultsState = applyBusinessChange(serviceChangedLinked, {
  collection: 'recipes',
  action: 'add',
  value: {
    id: 'rec_default',
    productId: 'prd_a',
    name: 'Receta con defaults',
    yieldUnits: 1,
    ingredients: [{ ingredientId: 'ing_a', quantity: 100 }],
    serviceLines: [],
    useDefaultPackagingCost: true,
    useDefaultUtilityCost: true,
    useDefaultLaborRate: true,
    packagingCost: 0,
    utilityCost: 0,
    serviceCost: 0,
    laborHours: 1,
    laborRate: 0,
    otherCost: 0,
    salePrice: 10,
    totalCost: 0,
    margin: 0
  }
});
const defaultsChanged = applyBusinessChange(defaultsState, {
  collection: 'settings',
  action: 'update',
  value: { defaultPackagingCost: 2, defaultUtilityCost: 3, laborRatePerHour: 7 }
});
const defaultRecipe = defaultsChanged.recipes.find(r => r.id === 'rec_default')!;
assert(defaultRecipe.packagingCost === 2 && defaultRecipe.utilityCost === 3 && defaultRecipe.laborRate === 7, 'global defaults propagate to recipes that use defaults');

const cashTest = applyBusinessChange(defaultsChanged, {
  collection: 'cashRegister',
  action: 'update',
  value: { openingCash: 100, openedAt: '2026-09-01T00:00:00Z' }
});
assert((cashTest.__calculations?.registerExpectedCash ?? 0) === cashTest.cashRegister.openingCash + (cashTest.__calculations?.cash ?? 0), 'cash register expected amount is derived from opening cash and cash ledger movements');

const deleted = applyBusinessChange(cashTest, { collection: 'ingredients', action: 'delete', id: 'ing_a' });
assert(deleted.recipes.find(r => r.id === 'rec_a')?.ingredients.length === 0, 'deleting ingredient removes recipe reference');

const deletedProduct = applyBusinessChange(deleted, { collection: 'products', action: 'delete', id: 'prd_a' });
assert(deletedProduct.products.length === 0, 'product deletion removes product');
assert(deletedProduct.recipes.length === 0, 'product deletion removes dependent recipe');
assert(deletedProduct.promotions[0].productIds.length === 0, 'product deletion cleans promotion reference');
assert(deletedProduct.combos[0].productIds.length === 0, 'product deletion cleans combo reference');
assert(deletedProduct.customers[0].favorites.length === 0, 'product deletion cleans customer favorite');
assert(deletedProduct.orders.find(o => o.id === 'ord_open')?.items.length === 0, 'product deletion cleans open order line references');

const settingsUpdated = applyBusinessChange(deletedProduct, {
  collection: 'settings',
  action: 'update',
  value: { businessName: 'Diego Bakery 2' }
});
assert(settingsUpdated.settings.businessName === 'Diego Bakery 2', 'singleton settings can be updated through the same business change system');

const added = applyBusinessChange(settingsUpdated, {
  collection: 'ingredients',
  action: 'add',
  value: { id: 'ing_new', name: 'Azúcar', unit: 'g', unitCost: 0.02, stock: 500, minStock: 50, supplier: 'Proveedor Nuevo' }
});
assert(added.ingredients.some(i => i.id === 'ing_new'), 'add action inserts record');

console.log('PASS: full dependency, ledger, services, defaults, relations, pricing and singleton tests');
