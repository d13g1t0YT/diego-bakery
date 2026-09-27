import type { BusinessState, Product, Recipe } from './types';
import { calculateRecipeCost } from './types';

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

const round = (v: number, digits = 2) => Number(v.toFixed(digits));

export interface ProductPricing {
  productId: string;
  productName: string;
  ingredientCost: number;
  productionCost: number;
  allocatedExpenses: number;
  allocatedInvestment: number;
  allocatedLosses: number;
  targetProfit: number;
  recommendedPrice: number;
  currentPrice: number;
  marginAtCurrentPrice: number;
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
  productPricing: ProductPricing[];
  totalRecommendedRevenue: number;
}

function financeTotals(state: BusinessState) {
  const sales = state.money.filter(m => m.type === 'venta').reduce((s, m) => s + n(m.amount), 0);
  const expenses = state.money.filter(m => m.type === 'gasto').reduce((s, m) => s + n(m.amount), 0);
  const investments = state.money.filter(m => m.type === 'inversion').reduce((s, m) => s + n(m.amount), 0);
  const withdrawals = state.money.filter(m => m.type === 'retiro').reduce((s, m) => s + n(m.amount), 0);
  const debtCollected = state.money.filter(m => m.type === 'cobro_deuda').reduce((s, m) => s + n(m.amount), 0);
  const debtPaid = state.money.filter(m => m.type === 'pago_deuda').reduce((s, m) => s + n(m.amount), 0);
  const cash = state.money.reduce((sum, m) => {
    const amount = n(m.amount);
    if (m.type === 'venta' || m.type === 'inversion' || m.type === 'cobro_deuda') return sum + amount;
    if (m.type === 'gasto' || m.type === 'retiro' || m.type === 'pago_deuda') return sum - amount;
    if (m.type === 'ajuste') return sum + amount;
    return sum;
  }, 0);
  return { sales, expenses, investments, withdrawals, debtCollected, debtPaid, cash };
}

function cleanReferences(state: BusinessState): BusinessState {
  const productIds = new Set(state.products.map(p => p.id));
  const ingredientIds = new Set(state.ingredients.map(i => i.id));
  const supplierNames = new Set(state.suppliers.map(s => s.name.trim().toLowerCase()));
  const customerIds = new Set(state.customers.map(c => c.id));

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
    })
  };
}

export function recalculateBusinessState(input: BusinessState): BusinessState {
  let state = cleanReferences(input);
  const finance = financeTotals(state);

  const monthlyUnits = Math.max(1, n(state.settings.pricingExpectedMonthlyUnits));
  const recoveryMonths = Math.max(1, n(state.settings.pricingInvestmentRecoveryMonths));
  const profitPct = Math.max(0, n(state.settings.pricingTargetProfitPercent));

  const allocatedExpenses = state.settings.pricingIncludeExpenses
    ? finance.expenses / monthlyUnits
    : 0;
  const allocatedLosses = state.settings.pricingIncludeLosses
    ? finance.losses / monthlyUnits
    : 0;
  const allocatedInvestment = finance.investments / recoveryMonths / monthlyUnits;

  const recalculatedRecipes = state.recipes.map(recipe =>
    calculateRecipeCost(recipe, state.ingredients)
  );

  const productPricing = new Map<string, ProductPricing>();
  for (const product of state.products) {
    const recipe = recalculatedRecipes.find(r => r.productId === product.id);
    const baseCost = recipe
      ? n(recipe.totalCost)
      : n(product.manualCost ?? product.cost);

    const costBeforeProfit = baseCost + allocatedExpenses + allocatedInvestment + allocatedLosses;
    const targetProfit = costBeforeProfit * profitPct / 100;
    const recommendedPrice = round(costBeforeProfit + targetProfit);
    const currentPrice = n(product.price);
    const marginAtCurrentPrice = currentPrice > 0
      ? round(((currentPrice - costBeforeProfit) / currentPrice) * 100)
      : 0;

    const breakdown = {
      ingredientCost: recipe
        ? round(recipe.ingredients.reduce((sum, line) => {
            const ingredient = state.ingredients.find(i => i.id === line.ingredientId);
            return sum + (ingredient ? n(ingredient.unitCost) * n(line.quantity) : 0);
          }, 0))
        : baseCost,
      productionCost: round(baseCost),
      allocatedExpenses: round(allocatedExpenses),
      allocatedInvestment: round(allocatedInvestment),
      allocatedLosses: round(allocatedLosses),
      targetProfit: round(targetProfit),
      recommendedPrice
    };

    productPricing.set(product.id, {
      productId: product.id,
      productName: product.name,
      ingredientCost: breakdown.ingredientCost,
      productionCost: breakdown.productionCost,
      allocatedExpenses: breakdown.allocatedExpenses,
      allocatedInvestment: breakdown.allocatedInvestment,
      allocatedLosses: breakdown.allocatedLosses,
      targetProfit: breakdown.targetProfit,
      recommendedPrice,
      currentPrice,
      marginAtCurrentPrice
    });
  }

  const products: Product[] = state.products.map(product => {
    const pricing = productPricing.get(product.id);
    const recipe = recalculatedRecipes.find(r => r.productId === product.id);
    if (!pricing) return product;
    return {
      ...product,
      cost: pricing.productionCost,
      recommendedPrice: pricing.recommendedPrice,
      priceBreakdown: {
        ingredientCost: pricing.ingredientCost,
        productionCost: pricing.productionCost,
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

  const delivered = state.orders.filter(o => o.status === 'entregada');
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
  const totalRecommendedRevenue = products.reduce((sum, p) => sum + n(p.recommendedPrice), 0);

  return {
    ...state,
    products,
    recipes,
    __calculations: {
      sales: finance.sales,
      expenses: finance.expenses,
      investments: finance.investments,
      withdrawals: finance.withdrawals,
      debtCollected: finance.debtCollected,
      debtPaid: finance.debtPaid,
      losses,
      cash: finance.cash,
      inventoryValue,
      accountsReceivable: receivable,
      accountsPayable: payable,
      deliveredRevenue,
      deliveredCost,
      grossProfit,
      netProfit,
      capitalContributed: finance.investments,
      capitalRecovered: finance.withdrawals,
      workingCapital,
      averageTicket: delivered.length ? round(deliveredRevenue / delivered.length) : 0,
      productPricing: [...productPricing.values()],
      totalRecommendedRevenue
    }
  } as BusinessState;
}

export function getProductPricing(state: BusinessState, productId: string): ProductPricing | undefined {
  return (state as any).__calculations?.productPricing?.find((p: ProductPricing) => p.productId === productId);
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
    nextCollection = current.map(item => item.id === change.id ? { ...item, ...change.value } : item);
  } else if (change.action === 'delete' && change.id) {
    nextCollection = current.filter(item => item.id !== change.id);
  }

  return recalculateBusinessState({
    ...state,
    [collection]: nextCollection
  });
}
