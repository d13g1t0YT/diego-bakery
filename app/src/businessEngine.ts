import type {
  BusinessState,
  Customer,
  MoneyMove,
  Order,
  Product,
  Recipe,
  ProductPricing
} from './types';
import { calculateRecipeCost, uid } from './types';

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const round = (v: number, digits = 2) => Number(n(v).toFixed(digits));
const terminal = (status: string) => ['entregada', 'cancelada', 'archivada'].includes(status);
const cashMethod = (method?: string) => !method || method === 'efectivo';

function propagateRenamedRelations(input: BusinessState, previous?: BusinessState): BusinessState {
  if (!previous) return input;

  const previousSuppliers = new Map(previous.suppliers.map(s => [s.id, s]));
  const currentSuppliers = new Map(input.suppliers.map(s => [s.id, s]));
  const supplierRenames = new Map<string, string>();

  for (const [id, oldSupplier] of previousSuppliers) {
    const nextSupplier = currentSuppliers.get(id);
    if (nextSupplier && oldSupplier.name.trim() !== nextSupplier.name.trim()) {
      supplierRenames.set(oldSupplier.name.trim().toLowerCase(), nextSupplier.name.trim());
      supplierRenames.set(id.toLowerCase(), nextSupplier.name.trim());
    }
  }

  let ingredients = input.ingredients;
  if (supplierRenames.size) {
    ingredients = ingredients.map(ingredient => {
      const raw = String(ingredient.supplier || '').trim();
      const replacement = supplierRenames.get(raw.toLowerCase());
      return replacement ? { ...ingredient, supplier: replacement } : ingredient;
    });
  }

  const previousCustomers = new Map(previous.customers.map(c => [c.id, c]));
  const currentCustomers = new Map(input.customers.map(c => [c.id, c]));
  const orders = input.orders.map(order => {
    if (terminal(order.status)) return order;

    let customer: Customer | undefined;
    if (order.customerId) customer = currentCustomers.get(order.customerId);

    if (!customer) {
      customer = [...currentCustomers.values()].find(c => c.phone === order.customerPhone);
    }

    if (!customer) {
      for (const oldCustomer of previousCustomers.values()) {
        const currentCustomer = currentCustomers.get(oldCustomer.id);
        if (!currentCustomer) continue;
        if (oldCustomer.phone === order.customerPhone) {
          customer = currentCustomer;
          break;
        }
      }
    }

    return customer
      ? {
          ...order,
          customerId: customer.id,
          customerName: customer.name,
          customerPhone: customer.phone
        }
      : order;
  });

  return { ...input, ingredients, orders };
}

function cleanReferences(input: BusinessState): BusinessState {
  const productIds = new Set(input.products.map(p => p.id));
  const ingredientIds = new Set(input.ingredients.map(i => i.id));
  const customerIds = new Set(input.customers.map(c => c.id));
  const supplierById = new Map(input.suppliers.map(s => [s.id, s]));
  const supplierByName = new Map(input.suppliers.map(s => [s.name.trim().toLowerCase(), s]));
  const serviceIds = new Set(input.services.map(s => s.id));

  const recipes = input.recipes
    .filter(r => productIds.has(r.productId))
    .map(r => ({
      ...r,
      ingredients: r.ingredients.filter(line => ingredientIds.has(line.ingredientId)),
      serviceLines: (r.serviceLines || []).filter(line => serviceIds.has(line.serviceId))
    }));

  const ingredients = input.ingredients.map(i => {
    const raw = String(i.supplier || '').trim();
    if (!raw) return i;
    const supplier = supplierById.get(raw) || supplierByName.get(raw.toLowerCase());
    return supplier ? { ...i, supplier: supplier.name } : { ...i, supplier: '' };
  });

  const promotions = input.promotions.map(p => ({
    ...p,
    productIds: p.productIds.filter(id => productIds.has(id))
  }));

  const combos = input.combos.map(c => ({
    ...c,
    productIds: c.productIds.filter(id => productIds.has(id))
  }));

  const reviews = input.reviews
    .map(r => ({
      ...r,
      productId: productIds.has(r.productId) ? r.productId : '',
      customerId: r.customerId && customerIds.has(r.customerId) ? r.customerId : undefined
    }));

  const customers = input.customers.map(c => ({
    ...c,
    favorites: Array.isArray(c.favorites) ? c.favorites.filter(id => productIds.has(id)) : []
  }));

  // An open order may reference a customer, but deleting that customer must
  // never leave a dangling customerId. Historical/terminal orders keep their
  // snapshot untouched.
  const orders = input.orders.map(order => {
    if (terminal(order.status)) return order;
    if (order.customerId && !customerIds.has(order.customerId)) {
      return { ...order, customerId: undefined };
    }
    return order;
  });

  return { ...input, recipes, ingredients, promotions, combos, reviews, customers, orders };
}

export function resolvePromotion(
  items: Array<{ productId: string; quantity: number; subtotal?: number; unitPrice?: number }>,
  promotions: BusinessState['promotions'],
  promotionId?: string,
  promotionCode?: string,
  now: Date = new Date()
): { promotion?: BusinessState['promotions'][number]; discount: number } {
  const normalizedCode = String(promotionCode || '').trim().toUpperCase();

  const candidate = promotionId
    ? promotions.find(p => p.id === promotionId)
    : normalizedCode
      ? promotions.find(p => p.active && String(p.code || '').trim().toUpperCase() === normalizedCode)
      : promotions.find(p => p.active && !String(p.code || '').trim());

  if (!candidate || !candidate.active) return { discount: 0 };

  if (candidate.startAt && new Date(candidate.startAt).getTime() > now.getTime()) return { discount: 0 };
  if (candidate.endAt && new Date(candidate.endAt).getTime() < now.getTime()) return { discount: 0 };

  const eligible = items.filter(item =>
    !candidate.productIds?.length || candidate.productIds.includes(String(item.productId))
  );
  if (!eligible.length) return { discount: 0 };

  const subtotal = eligible.reduce(
    (sum, item) => sum + Math.max(0, n(item.subtotal ?? (n(item.unitPrice) * n(item.quantity)))),
    0
  );
  const quantity = eligible.reduce((sum, item) => sum + Math.max(0, n(item.quantity)), 0);
  if (subtotal <= 0) return { promotion: candidate, discount: 0 };

  let discount = 0;
  if (candidate.type === 'percent') {
    discount = subtotal * Math.min(100, Math.max(0, n(candidate.value))) / 100;
  } else if (candidate.type === 'fixed' || candidate.type === 'combo') {
    discount = Math.min(subtotal, Math.max(0, n(candidate.value)));
  } else if (candidate.type === 'quantity') {
    if (quantity >= Math.max(1, n(candidate.minQuantity, 1))) {
      discount = Math.min(subtotal, Math.max(0, n(candidate.value)));
    }
  } else if (candidate.type === 'date_price') {
    discount = Math.max(0, subtotal - Math.max(0, n(candidate.value)));
  }

  return { promotion: candidate, discount: round(discount) };
}

function orderItemSignature(order: Order): string {
  return order.items
    .map(item => String(item.productId) + ':' + String(n(item.quantity)))
    .sort()
    .join('|');
}

function ingredientConsumption(order: Order, state: BusinessState): Record<string, number> {
  const consumption: Record<string, number> = {};
  for (const item of order.items) {
    const quantity = Math.max(0, n(item.quantity));
    const entries = String(item.productId).startsWith('combo_')
      ? (state.combos.find(c => c.id === String(item.productId).slice(6))?.productIds || [])
          .map(productId => ({ productId, quantity }))
      : [{ productId: String(item.productId), quantity }];

    for (const entry of entries) {
      const recipe = state.recipes.find(r => r.productId === entry.productId);
      if (!recipe) continue;
      const yieldUnits = Math.max(1, n(recipe.yieldUnits));
      for (const line of recipe.ingredients) {
        const amount = n(line.quantity) / yieldUnits * entry.quantity;
        consumption[line.ingredientId] = (consumption[line.ingredientId] || 0) + amount;
      }
    }
  }
  return consumption;
}

function adjustInventoryForOrder(
  ingredients: BusinessState['ingredients'],
  oldConsumption: Record<string, number>,
  newConsumption: Record<string, number>
) {
  const ids = new Set([...Object.keys(oldConsumption), ...Object.keys(newConsumption)]);
  return ingredients.map(ingredient => {
    if (!ids.has(ingredient.id)) return ingredient;
    const restored = n(oldConsumption[ingredient.id]);
    const required = n(newConsumption[ingredient.id]);
    return {
      ...ingredient,
      stock: Math.max(0, round(n(ingredient.stock) + restored - required, 4))
    };
  });
}

function orderItemFromProduct(item: any, state: BusinessState): any | null {
  if (String(item.productId || '').startsWith('combo_')) {
    const comboId = String(item.productId).slice(6);
    const combo = state.combos.find(c => c.id === comboId);
    if (!combo) return null;
    const comboProducts = combo.productIds
      .map(id => state.products.find(p => p.id === id))
      .filter(Boolean) as Product[];
    const quantity = Math.max(0, n(item.quantity));
    const unitPrice = n(combo.price);
    const cost = comboProducts.reduce((sum, product) => sum + n(product.cost), 0);
    return {
      ...item,
      productName: combo.name,
      unitPrice,
      cost,
      quantity,
      subtotal: round(unitPrice * quantity)
    };
  }

  const product = state.products.find(p => p.id === item.productId);
  if (!product) return null;

  const quantity = Math.max(0, n(item.quantity));
  const unitPrice = n(product.price);
  return {
    ...item,
    productName: product.name,
    unitPrice,
    cost: n(product.cost),
    quantity,
    subtotal: round(unitPrice * quantity)
  };
}

function financeTotals(state: BusinessState) {
  const by = (type: string) => state.money.filter(m => m.type === type).reduce((s, m) => s + n(m.amount), 0);
  const sales = by('venta');
  const expenses = by('gasto');
  const investments = by('inversion');
  const withdrawals = by('retiro');
  const debtCollected = by('cobro_deuda');
  const debtPaid = by('pago_deuda');

  const cash = state.money.reduce((sum, m) => {
    if (!cashMethod(m.method)) return sum;
    if (['venta', 'inversion', 'cobro_deuda'].includes(m.type)) return sum + n(m.amount);
    if (['gasto', 'retiro', 'pago_deuda'].includes(m.type)) return sum - n(m.amount);
    if (m.type === 'ajuste') return sum + n(m.amount);
    return sum;
  }, 0);

  const expenseByCategory = new Map<string, number>();
  for (const m of state.money.filter(x => x.type === 'gasto')) {
    const key = String(m.category || 'General');
    expenseByCategory.set(key, (expenseByCategory.get(key) || 0) + n(m.amount));
  }

  return {
    sales,
    expenses,
    investments,
    withdrawals,
    debtCollected,
    debtPaid,
    cash,
    expenseByCategory: [...expenseByCategory.entries()].map(([category, amount]) => ({
      category,
      amount: round(amount)
    }))
  };
}

function reconcilePaymentTimestamps(state: BusinessState, previous?: BusinessState): BusinessState {
  const orders = state.orders.map(order => {
    const before = previous?.orders.find(o => o.id === order.id);
    if (n(order.paid) <= 0) return { ...order, paidAt: undefined };
    if (before && n(before.paid) === n(order.paid)) return order;
    return { ...order, paidAt: new Date().toISOString() };
  });
  const debts = state.debts.map(debt => {
    const before = previous?.debts.find(d => d.id === debt.id);
    if (!debt.paid) return { ...debt, paidAt: undefined };
    if (before?.paid) return debt;
    return { ...debt, paidAt: new Date().toISOString() };
  });
  return { ...state, orders, debts };
}

function reconcileLedger(state: BusinessState): BusinessState {
  const orderIds = new Set(state.orders.map(o => o.id));
  const legacyDescriptions = new Set(
    state.orders.flatMap(o => [
      'Pago del pedido ' + o.id.slice(-6),
      'Pago pedido ' + o.id.slice(-6)
    ])
  );

  const manual = state.money.filter(move => {
    if (move.origin === 'order' || move.origin === 'debt') return false;
    return !legacyDescriptions.has(move.description);
  });

  const orderMoves: MoneyMove[] = state.orders
    .filter(order => n(order.paid) > 0)
    .map(order => ({
      id: 'mov_order_' + order.id,
      date: order.paidAt || order.createdAt || new Date().toISOString(),
      type: 'venta',
      amount: round(n(order.paid)),
      description: 'Pago del pedido ' + order.id.slice(-6),
      category: order.paymentMethod || 'venta',
      method: order.paymentMethod || 'efectivo',
      origin: 'order',
      relatedId: order.id
    }));

  const debtMoves: MoneyMove[] = state.debts
    .filter(debt => debt.paid && n(debt.amount) > 0)
    .map(debt => ({
      id: 'mov_debt_' + debt.id,
      date: debt.paidAt || debt.dueDate || new Date().toISOString(),
      type: debt.type === 'cobrar' ? 'cobro_deuda' : 'pago_deuda',
      amount: round(n(debt.amount)),
      description: (debt.type === 'cobrar' ? 'Cobro de deuda ' : 'Pago de deuda ') + debt.id.slice(-6),
      category: debt.person || 'Deuda',
      method: debt.paymentMethod || 'efectivo',
      origin: 'debt',
      relatedId: debt.id
    }));

  // Prevent unused local warnings while retaining a cheap consistency invariant.
  void orderIds;

  return {
    ...state,
    money: [...orderMoves, ...debtMoves, ...manual]
  };
}

function directCost(recipe: Recipe | undefined, product: Product): number {
  return recipe ? n(recipe.totalCost) : n(product.manualCost ?? product.cost);
}

function buildProductPricing(
  state: BusinessState,
  finance: ReturnType<typeof financeTotals>,
  recipes: Recipe[]
) {
  const units = Math.max(1, n(state.settings.pricingExpectedMonthlyUnits));
  const recoveryMonths = Math.max(1, n(state.settings.pricingInvestmentRecoveryMonths));
  const targetPct = Math.max(0, n(state.settings.pricingTargetProfitPercent));
  const expenses = state.settings.pricingIncludeExpenses ? finance.expenses : 0;
  const losses = state.settings.pricingIncludeLosses
    ? state.losses.reduce((s, x) => s + n(x.value), 0)
    : 0;
  const investmentRecovery = finance.investments / recoveryMonths;

  const active = state.products.filter(p => p.active);
  const totalDirect = active.reduce((sum, p) => {
    const recipe = recipes.find(x => x.productId === p.id);
    return sum + directCost(recipe, p);
  }, 0);
  const avgDirect = active.length ? totalDirect / active.length : 0;

  const productPricing: ProductPricing[] = state.products.map(product => {
    const recipe = recipes.find(r => r.productId === product.id);
    const ingredientCost = recipe
      ? recipe.ingredients.reduce((sum, line) => {
          const ingredient = state.ingredients.find(i => i.id === line.ingredientId);
          return sum + (ingredient ? n(ingredient.unitCost) * n(line.quantity) : 0);
        }, 0)
      : n(product.manualCost ?? product.cost);

    const directProductionCost = directCost(recipe, product);
    const allocatedExpenses = expenses / units;
    const allocatedInvestment = investmentRecovery / units;
    const allocatedLosses = losses / units;
    const totalCost = directProductionCost + allocatedExpenses + allocatedInvestment + allocatedLosses;
    const targetProfit = totalCost * targetPct / 100;
    const recommendedPrice = totalCost + targetProfit;
    const currentPrice = n(product.price);

    return {
      productId: product.id,
      productName: product.name,
      ingredientCost: round(ingredientCost),
      directProductionCost: round(directProductionCost),
      allocatedExpenses: round(allocatedExpenses),
      allocatedInvestment: round(allocatedInvestment),
      allocatedLosses: round(allocatedLosses),
      totalCost: round(totalCost),
      targetProfit: round(targetProfit),
      recommendedPrice: round(recommendedPrice),
      currentPrice: round(currentPrice),
      marginAtCurrentPrice: currentPrice > 0 ? round((currentPrice - totalCost) / currentPrice * 100) : 0
    };
  });

  const monthlyDirectCost = avgDirect * units;
  const monthlyFullCost = monthlyDirectCost + expenses + investmentRecovery + losses;
  const monthlyTargetProfit = monthlyFullCost * targetPct / 100;

  return {
    productPricing,
    units,
    expenses,
    losses,
    investmentRecovery,
    monthlyDirectCost,
    monthlyFullCost,
    monthlyTargetProfit
  };
}

function calculateRegister(state: BusinessState) {
  const register = state.cashRegister;
  if (!register.openedAt) {
    return {
      expected: 0,
      difference: register.closingCash === undefined ? 0 : round(n(register.closingCash))
    };
  }

  const afterOpen = state.money
    .filter(m => cashMethod(m.method) && m.date >= register.openedAt!)
    .reduce((sum, m) => {
      if (['gasto', 'retiro', 'pago_deuda'].includes(m.type)) return sum - n(m.amount);
      return ['venta', 'inversion', 'cobro_deuda', 'ajuste'].includes(m.type) ? sum + n(m.amount) : sum;
    }, 0);

  const expected = round(n(register.openingCash) + afterOpen);
  const difference = register.closingCash === undefined ? 0 : round(n(register.closingCash) - expected);
  return { expected, difference };
}

export function recalculateBusinessState(input: BusinessState, previous?: BusinessState): BusinessState {
  let state = propagateRenamedRelations(input, previous);
  state = cleanReferences(state);
  state = reconcilePaymentTimestamps(state, previous);
  state = reconcileLedger(state);

  const recalculatedRecipes = state.recipes.map(recipe =>
    calculateRecipeCost(recipe, state.ingredients, state.services, state.settings)
  );

  const finance = financeTotals(state);
  const pricing = buildProductPricing(state, finance, recalculatedRecipes);
  const byProduct = new Map(pricing.productPricing.map(p => [p.productId, p]));

  const products = state.products.map(product => {
    const p = byProduct.get(product.id);
    if (!p) return product;

    return {
      ...product,
      cost: p.directProductionCost,
      recommendedPrice: p.recommendedPrice,
      priceBreakdown: {
        ingredientCost: p.ingredientCost,
        productionCost: p.directProductionCost,
        allocatedExpenses: p.allocatedExpenses,
        allocatedInvestment: p.allocatedInvestment,
        allocatedLosses: p.allocatedLosses,
        targetProfit: p.targetProfit,
        recommendedPrice: p.recommendedPrice
      }
    };
  });

  const recipes = recalculatedRecipes.map(recipe => {
    const product = products.find(p => p.id === recipe.productId);
    const salePrice = product ? n(product.price) : n(recipe.salePrice);
    return {
      ...recipe,
      salePrice,
      margin: salePrice > 0 ? round((salePrice - recipe.totalCost) / salePrice * 100) : 0
    };
  });

  const ordersAndIngredients = state.orders.map(order => {
    const previousOrder = previous?.orders.find(o => o.id === order.id);
    let normalizedOrder = order;

    if (!terminal(order.status)) {
      const items = order.items
        .map(item => orderItemFromProduct(item, { ...state, products }))
        .filter(Boolean);

      normalizedOrder = {
        ...order,
        items,
        subtotal: round(items.reduce((s, i) => s + n(i.subtotal), 0))
      };

      // A promotion tied to an open order is part of that order's live
      // dependency graph. Changes to scope, dates, type or value therefore
      // recalculate the discount and final total automatically.
      if (normalizedOrder.promotionId || normalizedOrder.discountCode) {
        const resolvedPromotion = resolvePromotion(
          items,
          state.promotions,
          normalizedOrder.promotionId,
          normalizedOrder.discountCode
        );
        normalizedOrder = {
          ...normalizedOrder,
          discount: resolvedPromotion.promotion ? resolvedPromotion.discount : 0
        };
      }

      normalizedOrder.total = round(
        Math.max(
          0,
          n(normalizedOrder.subtotal) -
            Math.max(0, n(normalizedOrder.discount)) +
            Math.max(0, n(normalizedOrder.deliveryFee))
        )
      );

      const customer = order.customerId
        ? state.customers.find(c => c.id === order.customerId)
        : state.customers.find(c => c.phone === order.customerPhone);

      if (customer) {
        normalizedOrder = {
          ...normalizedOrder,
          customerId: customer.id,
          customerName: customer.name,
          customerPhone: customer.phone
        };
      }
    }

    if (!normalizedOrder.inventoryDeducted) {
      if (normalizedOrder.status === 'preparando') {
        const consumption = ingredientConsumption(normalizedOrder, { ...state, products });
        normalizedOrder = {
          ...normalizedOrder,
          inventoryDeducted: true,
          inventoryConsumption: consumption
        };
        return { order: normalizedOrder, consumptionDelta: consumption };
      }
      return { order: normalizedOrder, consumptionDelta: {} };
    }

    const existingConsumption = normalizedOrder.inventoryConsumption
      ? { ...normalizedOrder.inventoryConsumption }
      : ingredientConsumption(normalizedOrder, { ...state, products });

    if (!normalizedOrder.inventoryConsumption) {
      normalizedOrder = {
        ...normalizedOrder,
        inventoryConsumption: existingConsumption
      };
      return { order: normalizedOrder, consumptionDelta: {} };
    }

    const previousConsumption = previousOrder?.inventoryConsumption || existingConsumption;
    const itemsChanged = previousOrder
      ? orderItemSignature(previousOrder) !== orderItemSignature(order)
      : false;

    if (itemsChanged && !terminal(normalizedOrder.status)) {
      const nextConsumption = ingredientConsumption(normalizedOrder, { ...state, products });
      normalizedOrder = {
        ...normalizedOrder,
        inventoryConsumption: nextConsumption
      };
      const delta: Record<string, number> = {};
      const keys = new Set([...Object.keys(previousConsumption), ...Object.keys(nextConsumption)]);
      for (const key of keys) delta[key] = n(nextConsumption[key]) - n(previousConsumption[key]);
      return { order: normalizedOrder, consumptionDelta: delta };
    }

    return { order: normalizedOrder, consumptionDelta: {} };
  });

  let adjustedIngredients = state.ingredients;
  for (const entry of ordersAndIngredients) {
    const delta = entry.consumptionDelta;
    if (!Object.keys(delta).length) continue;
    const keys = Object.keys(delta);
    adjustedIngredients = adjustedIngredients.map(ingredient => {
      if (!keys.includes(ingredient.id)) return ingredient;
      return {
        ...ingredient,
        stock: Math.max(0, round(n(ingredient.stock) - n(delta[ingredient.id]), 4))
      };
    });
  }

  const orders = ordersAndIngredients.map(entry => entry.order);

  const normalizedState = {
    ...state,
    products,
    recipes,
    orders,
    ingredients: adjustedIngredients
  } as BusinessState;

  const normalizedLedgerState = reconcileLedger(normalizedState);
  const finalFinance = financeTotals(normalizedLedgerState);

  const delivered = normalizedState.orders.filter(o => o.status === 'entregada');
  const deliveredRevenue = delivered.reduce((s, o) => s + n(o.total), 0);
  const deliveredCost = delivered.reduce(
    (s, o) => s + o.items.reduce((x, i) => x + n(i.cost) * Math.max(0, n(i.quantity)), 0),
    0
  );
  const inventoryValue = normalizedState.ingredients.reduce((s, i) => s + n(i.stock) * n(i.unitCost), 0);
  const losses = normalizedState.losses.reduce((s, x) => s + n(x.value), 0);
  const grossProfit = deliveredRevenue - deliveredCost;
  const netProfit = grossProfit - finalFinance.expenses - losses;
  const receivable = normalizedState.debts
    .filter(d => d.type === 'cobrar' && !d.paid)
    .reduce((s, d) => s + n(d.amount), 0);
  const payable = normalizedState.debts
    .filter(d => d.type === 'pagar' && !d.paid)
    .reduce((s, d) => s + n(d.amount), 0);
  const workingCapital = finalFinance.cash + inventoryValue + receivable - payable;
  const averageTicket = delivered.length ? deliveredRevenue / delivered.length : 0;

  const breakEvenRevenue = pricing.monthlyFullCost;
  const recommendedRevenue = pricing.monthlyFullCost + pricing.monthlyTargetProfit;
  const targetProfitAmount = pricing.monthlyTargetProfit;
  const averageRecommendedPrice = pricing.productPricing.length
    ? pricing.productPricing.reduce((s, p) => s + p.recommendedPrice, 0) / pricing.productPricing.length
    : 0;

  const register = calculateRegister({
    ...normalizedLedgerState,
    money: normalizedLedgerState.money
  });

  const formulas = [
    {
      name: 'Costo directo de cada producto',
      formula: 'ingredientes + empaque + servicios + mano de obra + otros',
      value: round(pricing.productPricing.reduce((s, p) => s + p.directProductionCost, 0))
    },
    {
      name: 'Gastos asignados por unidad',
      formula: 'gastos del periodo ÷ unidades mensuales estimadas',
      value: round(pricing.expenses / pricing.units)
    },
    {
      name: 'Inversión recuperada por unidad',
      formula: 'inversión ÷ meses de recuperación ÷ unidades mensuales',
      value: round(pricing.investmentRecovery / pricing.units)
    },
    {
      name: 'Pérdidas asignadas por unidad',
      formula: 'pérdidas incluidas ÷ unidades mensuales estimadas',
      value: round(pricing.losses / pricing.units)
    },
    {
      name: 'Costo completo mensual',
      formula: 'costo directo mensual + gastos + recuperación de inversión + pérdidas',
      value: round(pricing.monthlyFullCost)
    },
    {
      name: 'Ganancia objetivo mensual',
      formula: 'costo completo mensual × ganancia objetivo %',
      value: round(targetProfitAmount)
    },
    {
      name: 'Precio recomendado unitario promedio',
      formula: 'costo completo unitario + ganancia objetivo',
      value: round(averageRecommendedPrice)
    },
    {
      name: 'Capital de trabajo',
      formula: 'caja + inventario + cuentas por cobrar − cuentas por pagar',
      value: round(workingCapital)
    },
    {
      name: 'Utilidad neta histórica',
      formula: 'ventas entregadas − costo entregado − gastos − pérdidas',
      value: round(netProfit)
    }
  ];

  return {
    ...normalizedLedgerState,
    __calculations: {
      sales: round(finalFinance.sales),
      expenses: round(finalFinance.expenses),
      investments: round(finalFinance.investments),
      withdrawals: round(finalFinance.withdrawals),
      debtCollected: round(finalFinance.debtCollected),
      debtPaid: round(finalFinance.debtPaid),
      losses: round(losses),
      cash: round(finalFinance.cash),
      inventoryValue: round(inventoryValue),
      accountsReceivable: round(receivable),
      accountsPayable: round(payable),
      deliveredRevenue: round(deliveredRevenue),
      deliveredCost: round(deliveredCost),
      grossProfit: round(grossProfit),
      netProfit: round(netProfit),
      capitalContributed: round(finalFinance.investments),
      capitalRecovered: round(finalFinance.withdrawals),
      workingCapital: round(workingCapital),
      averageTicket: round(averageTicket),
      monthlyFixedCost: round(pricing.expenses),
      monthlyInvestmentRecovery: round(pricing.investmentRecovery),
      monthlyLossAllowance: round(pricing.losses),
      targetProfitAmount: round(targetProfitAmount),
      breakEvenRevenue: round(breakEvenRevenue),
      recommendedRevenue: round(recommendedRevenue),
      registerExpectedCash: round(register.expected),
      registerDifference: round(register.difference),
      productPricing: pricing.productPricing,
      totalRecommendedRevenue: round(pricing.productPricing.reduce((s, p) => s + p.recommendedPrice, 0)),
      formulas
    }
  };
}

export function getProductPricing(state: BusinessState, productId: string): ProductPricing | undefined {
  return state.__calculations?.productPricing.find(p => p.productId === productId);
}

export function applyBusinessChange(
  state: BusinessState,
  change: {
    collection: keyof BusinessState;
    id?: string;
    action: 'add' | 'update' | 'delete';
    value?: any;
  }
): BusinessState {
  const collection = change.collection;

  if (collection === 'settings' && (change.action === 'update' || change.action === 'add')) {
    return recalculateBusinessState(
      { ...state, settings: { ...state.settings, ...(change.value || {}) } },
      state
    );
  }

  if (collection === 'cashRegister' && (change.action === 'update' || change.action === 'add')) {
    return recalculateBusinessState(
      { ...state, cashRegister: { ...state.cashRegister, ...(change.value || {}) } },
      state
    );
  }

  if (!Array.isArray((state as any)[collection])) return state;

  const current = [...((state as any)[collection] as any[])];
  let next = current;

  if (change.action === 'add' && change.value) {
    const value = { ...change.value };
    if (!value.id) value.id = uid(String(collection).slice(0, 4));
    next = [value, ...current];
  } else if (change.action === 'update' && change.id) {
    next = current.map(x =>
      x.id === change.id
        ? { ...x, ...(change.value || {}), id: x.id }
        : x
    );
  } else if (change.action === 'delete' && change.id) {
    next = current.filter(x => x.id !== change.id);
  }

  return recalculateBusinessState({ ...state, [collection]: next } as BusinessState, state);
}
