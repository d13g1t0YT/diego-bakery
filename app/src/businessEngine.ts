import type { BusinessState, Product, Recipe, ProductPricing } from './types';
import { calculateRecipeCost } from './types';

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

const round = (v: number, digits = 2) => Number(n(v).toFixed(digits));

function financeTotals(state: BusinessState) {
  const by = (type: string) => state.money.filter(m => m.type === type).reduce((s, m) => s + n(m.amount), 0);
  const sales = by('venta');
  const expenses = by('gasto');
  const investments = by('inversion');
  const withdrawals = by('retiro');
  const debtCollected = by('cobro_deuda');
  const debtPaid = by('pago_deuda');

  const cash = state.money.reduce((sum, m) => {
    const amount = n(m.amount);
    if (['venta', 'inversion', 'cobro_deuda'].includes(m.type)) return sum + amount;
    if (['gasto', 'retiro', 'pago_deuda'].includes(m.type)) return sum - amount;
    if (m.type === 'ajuste') return sum + amount;
    return sum;
  }, 0);

  const expenseByCategory = new Map<string, number>();
  for (const move of state.money.filter(m => m.type === 'gasto')) {
    const key = String(move.category || 'General');
    expenseByCategory.set(key, (expenseByCategory.get(key) || 0) + n(move.amount));
  }

  return {
    sales, expenses, investments, withdrawals, debtCollected, debtPaid, cash,
    expenseByCategory: [...expenseByCategory.entries()].map(([category, amount]) => ({ category, amount: round(amount) }))
  };
}

function cleanReferences(state: BusinessState): BusinessState {
  const productIds = new Set(state.products.map(p => p.id));
  const ingredientIds = new Set(state.ingredients.map(i => i.id));
  const supplierNames = new Set(state.suppliers.map(s => s.name.trim().toLowerCase()));
  const customerIds = new Set(state.customers.map(c => c.id));

  // References that point to deleted records are removed immediately.
  // Historical orders keep their product snapshot so accounting history is not destroyed.
  const recipes = state.recipes
    .filter(r => productIds.has(r.productId))
    .map(r => ({
      ...r,
      ingredients: r.ingredients.filter(line => ingredientIds.has(line.ingredientId))
    }));

  return {
    ...state,
    recipes,
    promotions: state.promotions.map(p => ({
      ...p,
      productIds: p.productIds.filter(id => productIds.has(id))
    })),
    combos: state.combos.map(c => ({
      ...c,
      productIds: c.productIds.filter(id => productIds.has(id))
    })),
    reviews: state.reviews.map(r => customerIds.has(r.customerId || '') ? r : { ...r, customerId: undefined }),
    ingredients: state.ingredients.map(i => {
      const supplier = String(i.supplier || '').trim().toLowerCase();
      return supplier && !supplierNames.has(supplier) ? { ...i, supplier: '' } : i;
    }),
    customers: state.customers.map(c => ({
      ...c,
      favorites: Array.isArray(c.favorites) ? c.favorites.filter(id => productIds.has(id)) : []
    }))
  };
}

function productDirectCost(recipe: Recipe | undefined, product: Product, ingredients: BusinessState['ingredients']): number {
  if (recipe) return n(recipe.totalCost);
  return n(product.manualCost ?? product.cost);
}

export function recalculateBusinessState(input: BusinessState): BusinessState {
  const state = cleanReferences(input);
  const finance = financeTotals(state);

  const monthlyUnits = Math.max(1, n(state.settings.pricingExpectedMonthlyUnits));
  const recoveryMonths = Math.max(1, n(state.settings.pricingInvestmentRecoveryMonths));
  const profitPct = Math.max(0, n(state.settings.pricingTargetProfitPercent));

  const lossesRecorded = state.losses.reduce((sum, loss) => sum + n(loss.value), 0);
  const monthlyFixedCost = state.settings.pricingIncludeExpenses ? finance.expenses : 0;
  const monthlyLossAllowance = state.settings.pricingIncludeLosses ? lossesRecorded : 0;
  const monthlyInvestmentRecovery = finance.investments / recoveryMonths;
  const burdenTotal = monthlyFixedCost + monthlyLossAllowance + monthlyInvestmentRecovery;
  const burdenPerUnit = burdenTotal / monthlyUnits;

  const recalculatedRecipes = state.recipes.map(recipe =>
    calculateRecipeCost(recipe, state.ingredients)
  );

  const productPricing: ProductPricing[] = [];

  for (const product of state.products) {
    const recipe = recalculatedRecipes.find(r => r.productId === product.id);
    const ingredientCost = recipe
      ? round(recipe.ingredients.reduce((sum, line) => {
          const ingredient = state.ingredients.find(i => i.id === line.ingredientId);
          return sum + (ingredient ? n(ingredient.unitCost) * n(line.quantity) : 0);
        }, 0))
      : round(n(product.manualCost ?? product.cost));

    const directProductionCost = round(productDirectCost(recipe, product, state.ingredients));
    const totalCost = round(directProductionCost + burdenPerUnit);
    const targetProfit = round(totalCost * profitPct / 100);
    const recommendedPrice = round(totalCost + targetProfit);
    const currentPrice = round(n(product.price));
    const marginAtCurrentPrice = currentPrice > 0
      ? round(((currentPrice - totalCost) / currentPrice) * 100)
      : 0;

    productPricing.push({
      productId: product.id,
      productName: product.name,
      ingredientCost,
      directProductionCost,
      allocatedExpenses: round(monthlyFixedCost / monthlyUnits),
      allocatedInvestment: round(monthlyInvestmentRecovery / monthlyUnits),
      allocatedLosses: round(monthlyLossAllowance / monthlyUnits),
      totalCost,
      targetProfit,
      recommendedPrice,
      currentPrice,
      marginAtCurrentPrice
    });
  }

  const pricingByProduct = new Map(productPricing.map(p => [p.productId, p]));
  const products: Product[] = state.products.map(product => {
    const pricing = pricingByProduct.get(product.id);
    if (!pricing) return product;

    return {
      ...product,
      cost: pricing.directProductionCost,
      recommendedPrice: pricing.recommendedPrice,
      priceBreakdown: {
        ingredientCost: pricing.ingredientCost,
        productionCost: pricing.directProductionCost,
        allocatedExpenses: pricing.allocatedExpenses,
        allocatedInvestment: pricing.allocatedInvestment,
        allocatedLosses: pricing.allocatedLosses,
        targetProfit: pricing.targetProfit,
        recommendedPrice: pricing.recommendedPrice
      }
    };
  });

  const recipes: Recipe[] = recalculatedRecipes.map(recipe => {
    const product = products.find(p => p.id === recipe.productId);
    const salePrice = product ? n(product.price) : n(recipe.salePrice);
    const cost = n(recipe.totalCost);
    return {
      ...recipe,
      salePrice,
      margin: salePrice > 0 ? round(((salePrice - cost) / salePrice) * 100) : 0
    };
  });

  // Open orders use the current product cost; delivered orders retain historical cost.
  const openOrders = new Set(state.orders.filter(o => !['entregada', 'cancelada', 'archivada'].includes(o.status)).map(o => o.id));
  const orders = state.orders.map(order => {
    if (!openOrders.has(order.id)) return order;
    return {
      ...order,
      items: order.items.map(item => {
        const product = products.find(p => p.id === item.productId);
        return product ? { ...item, cost: n(product.cost), unitPrice: n(item.unitPrice) } : item;
      }),
      subtotal: round(order.items.reduce((s, i) => s + n(i.unitPrice) * Math.max(0, n(i.quantity)), 0)),
      total: round(Math.max(0, order.items.reduce((s, i) => s + n(i.unitPrice) * Math.max(0, n(i.quantity)), 0) - n(order.discount)))
    };
  });

  const delivered = orders.filter(o => o.status === 'entregada');
  const deliveredRevenue = delivered.reduce((sum, order) => sum + n(order.total), 0);
  const deliveredCost = delivered.reduce(
    (sum, order) => sum + order.items.reduce((s, item) => s + n(item.cost) * Math.max(0, n(item.quantity)), 0),
    0
  );
  const inventoryValue = state.ingredients.reduce((sum, i) => sum + n(i.stock) * n(i.unitCost), 0);
  const losses = state.losses.reduce((sum, loss) => sum + n(loss.value), 0);
  const grossProfit = deliveredRevenue - deliveredCost;
  const netProfit = grossProfit - finance.expenses - losses;
  const receivable = state.debts.filter(d => d.type === 'cobrar' && !d.paid).reduce((s, d) => s + n(d.amount), 0);
  const payable = state.debts.filter(d => d.type === 'pagar' && !d.paid).reduce((s, d) => s + n(d.amount), 0);
  const workingCapital = finance.cash + inventoryValue + receivable - payable;
  const averageTicket = delivered.length ? round(deliveredRevenue / delivered.length) : 0;

  const totalRecommendedRevenue = productPricing.reduce((sum, p) => sum + p.recommendedPrice, 0);
  const targetProfitAmount = round((monthlyUnits * burdenPerUnit) * profitPct / 100);
  const breakEvenRevenue = round(monthlyUnits * burdenPerUnit);
  const recommendedRevenue = round(breakEvenRevenue + targetProfitAmount);

  const formulas = [
    { name: 'Costo directo', formula: 'ingredientes + empaque + utilidad + servicios + mano de obra + otros', value: round(productPricing.reduce((s, p) => s + p.directProductionCost, 0)) },
    { name: 'Costo por unidad', formula: 'costo directo + gastos asignados + inversión recuperada + pérdidas asignadas', value: round(breakEvenRevenue) },
    { name: 'Precio recomendado', formula: 'costo por unidad + ganancia objetivo', value: round(recommendedRevenue) },
    { name: 'Capital de trabajo', formula: 'caja + inventario + cuentas por cobrar - cuentas por pagar', value: round(workingCapital) },
    { name: 'Utilidad neta histórica', formula: 'ventas entregadas - costo entregado - gastos - pérdidas', value: round(netProfit) }
  ];

  return {
    ...state,
    products,
    recipes,
    orders,
    __calculations: {
      sales: round(finance.sales),
      expenses: round(finance.expenses),
      investments: round(finance.investments),
      withdrawals: round(finance.withdrawals),
      debtCollected: round(finance.debtCollected),
      debtPaid: round(finance.debtPaid),
      losses: round(losses),
      cash: round(finance.cash),
      inventoryValue: round(inventoryValue),
      accountsReceivable: round(receivable),
      accountsPayable: round(payable),
      deliveredRevenue: round(deliveredRevenue),
      deliveredCost: round(deliveredCost),
      grossProfit: round(grossProfit),
      netProfit: round(netProfit),
      capitalContributed: round(finance.investments),
      capitalRecovered: round(finance.withdrawals),
      workingCapital: round(workingCapital),
      averageTicket,
      monthlyFixedCost: round(monthlyFixedCost),
      monthlyInvestmentRecovery: round(monthlyInvestmentRecovery),
      monthlyLossAllowance: round(monthlyLossAllowance),
      targetProfitAmount,
      breakEvenRevenue,
      recommendedRevenue,
      productPricing,
      totalRecommendedRevenue: round(totalRecommendedRevenue),
      formulas
    }
  };
}

export function getProductPricing(state: BusinessState, productId: string): ProductPricing | undefined {
  return state.__calculations?.productPricing.find(p => p.productId === productId);
}

export function applyBusinessChange(
  state: BusinessState,
  change: { collection: keyof BusinessState; id?: string; action: 'add' | 'update' | 'delete'; value?: any }
): BusinessState {
  const collection = change.collection;
  if (!Array.isArray((state as any)[collection])) return state;

  const current = [...((state as any)[collection] as any[])];
  let nextCollection = current;

  if (change.action === 'add' && change.value) {
    nextCollection = [change.value, ...current];
  } else if (change.action === 'update' && change.id) {
    nextCollection = current.map(item => item.id === change.id ? { ...item, ...(change.value || {}), id: item.id } : item);
  } else if (change.action === 'delete' && change.id) {
    nextCollection = current.filter(item => item.id !== change.id);
  }

  return recalculateBusinessState({
    ...state,
    [collection]: nextCollection
  });
}
