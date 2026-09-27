import type { BusinessState, Product, Recipe, ProductPricing } from './types';
import { calculateRecipeCost } from './types';

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const round = (v:number,digits=2) => Number(n(v).toFixed(digits));
const terminal = (status:string) => ['entregada','cancelada','archivada'].includes(status);

function financeTotals(state: BusinessState) {
  const by=(type:string)=>state.money.filter(m=>m.type===type).reduce((s,m)=>s+n(m.amount),0);
  const sales=by('venta'), expenses=by('gasto'), investments=by('inversion');
  const withdrawals=by('retiro'), debtCollected=by('cobro_deuda'), debtPaid=by('pago_deuda');
  const cash=state.money.reduce((sum,m)=>{
    if(['venta','inversion','cobro_deuda'].includes(m.type)) return sum+n(m.amount);
    if(['gasto','retiro','pago_deuda'].includes(m.type)) return sum-n(m.amount);
    if(m.type==='ajuste') return sum+n(m.amount);
    return sum;
  },0);
  const expenseByCategory=new Map<string,number>();
  for(const m of state.money.filter(x=>x.type==='gasto')){
    const key=String(m.category||'General');
    expenseByCategory.set(key,(expenseByCategory.get(key)||0)+n(m.amount));
  }
  return {sales,expenses,investments,withdrawals,debtCollected,debtPaid,cash,
    expenseByCategory:[...expenseByCategory.entries()].map(([category,amount])=>({category,amount:round(amount)}))};
}

function cleanReferences(input:BusinessState):BusinessState {
  const productIds=new Set(input.products.map(p=>p.id));
  const ingredientIds=new Set(input.ingredients.map(i=>i.id));
  const supplierNames=new Set(input.suppliers.map(s=>s.name.trim().toLowerCase()));
  const customerIds=new Set(input.customers.map(c=>c.id));

  const recipes=input.recipes
    .filter(r=>productIds.has(r.productId))
    .map(r=>({...r,ingredients:r.ingredients.filter(line=>ingredientIds.has(line.ingredientId))}));

  return {
    ...input,
    recipes,
    promotions:input.promotions.map(p=>({...p,productIds:p.productIds.filter(id=>productIds.has(id))})),
    combos:input.combos.map(c=>({...c,productIds:c.productIds.filter(id=>productIds.has(id))})),
    reviews:input.reviews.map(r=>({
      ...r,
      productId:productIds.has(r.productId)?r.productId:'',
      customerId:r.customerId&&customerIds.has(r.customerId)?r.customerId:undefined
    })).filter(r=>!r.productId || productIds.has(r.productId)),
    ingredients:input.ingredients.map(i=>{
      const supplier=String(i.supplier||'').trim().toLowerCase();
      return supplier&&!supplierNames.has(supplier)?{...i,supplier:''}:i;
    }),
    customers:input.customers.map(c=>({...c,favorites:Array.isArray(c.favorites)?c.favorites.filter(id=>productIds.has(id)):[]})),
  };
}

function directCost(recipe:Recipe|undefined,product:Product):number {
  return recipe ? n(recipe.totalCost) : n(product.manualCost ?? product.cost);
}

function buildProductPricing(state:BusinessState, finance:ReturnType<typeof financeTotals>, recipes:Recipe[]) {
  const units=Math.max(1,n(state.settings.pricingExpectedMonthlyUnits));
  const recoveryMonths=Math.max(1,n(state.settings.pricingInvestmentRecoveryMonths));
  const targetPct=Math.max(0,n(state.settings.pricingTargetProfitPercent));
  const expenses=state.settings.pricingIncludeExpenses?finance.expenses:0;
  const losses=state.settings.pricingIncludeLosses?state.losses.reduce((s,x)=>s+n(x.value),0):0;
  const investmentRecovery=finance.investments/recoveryMonths;

  const active=state.products.filter(p=>p.active);
  const totalDirect=active.reduce((sum,p)=>{
    const r=recipes.find(x=>x.productId===p.id);
    return sum+directCost(r,p);
  },0);
  const avgDirect=active.length?totalDirect/active.length:0;

  const productPricing:ProductPricing[]=state.products.map(product=>{
    const recipe=recipes.find(r=>r.productId===product.id);
    const ingredientCost=recipe
      ? recipe.ingredients.reduce((sum,line)=>{
          const ing=state.ingredients.find(i=>i.id===line.ingredientId);
          return sum+(ing?n(ing.unitCost)*n(line.quantity):0);
        },0)
      : n(product.manualCost??product.cost);
    const directProductionCost=directCost(recipe,product);
    const allocatedExpenses=expenses/units;
    const allocatedInvestment=investmentRecovery/units;
    const allocatedLosses=losses/units;
    const totalCost=directProductionCost+allocatedExpenses+allocatedInvestment+allocatedLosses;
    const targetProfit=totalCost*targetPct/100;
    const recommendedPrice=totalCost+targetProfit;
    const currentPrice=n(product.price);
    return {
      productId:product.id,productName:product.name,
      ingredientCost:round(ingredientCost),directProductionCost:round(directProductionCost),
      allocatedExpenses:round(allocatedExpenses),allocatedInvestment:round(allocatedInvestment),
      allocatedLosses:round(allocatedLosses),totalCost:round(totalCost),
      targetProfit:round(targetProfit),recommendedPrice:round(recommendedPrice),
      currentPrice:round(currentPrice),
      marginAtCurrentPrice:currentPrice>0?round((currentPrice-totalCost)/currentPrice*100):0
    };
  });

  const monthlyDirectCost=avgDirect*units;
  const monthlyFullCost=monthlyDirectCost+expenses+investmentRecovery+losses;
  const monthlyTargetProfit=monthlyFullCost*targetPct/100;
  return {productPricing,units,expenses,losses,investmentRecovery,monthlyDirectCost,monthlyFullCost,monthlyTargetProfit};
}

export function recalculateBusinessState(input:BusinessState):BusinessState {
  const state=cleanReferences(input);
  const finance=financeTotals(state);
  const recalculatedRecipes=state.recipes.map(r=>calculateRecipeCost(r,state.ingredients));
  const pricing=buildProductPricing(state,finance,recalculatedRecipes);
  const byProduct=new Map(pricing.productPricing.map(p=>[p.productId,p]));

  const products=state.products.map(product=>{
    const p=byProduct.get(product.id);
    if(!p)return product;
    return {
      ...product,
      cost:p.directProductionCost,
      recommendedPrice:p.recommendedPrice,
      priceBreakdown:{
        ingredientCost:p.ingredientCost,
        productionCost:p.directProductionCost,
        allocatedExpenses:p.allocatedExpenses,
        allocatedInvestment:p.allocatedInvestment,
        allocatedLosses:p.allocatedLosses,
        targetProfit:p.targetProfit,
        recommendedPrice:p.recommendedPrice
      }
    };
  });

  const recipes=recalculatedRecipes.map(recipe=>{
    const product=products.find(p=>p.id===recipe.productId);
    const salePrice=product?n(product.price):n(recipe.salePrice);
    return {...recipe,salePrice,margin:salePrice>0?round((salePrice-recipe.totalCost)/salePrice*100):0};
  });

  // Draft/open orders always follow current product master data.
  // Historical delivered/cancelled/archived orders retain their snapshot.
  const orders=state.orders.map(order=>{
    if(terminal(order.status))return order;
    const items=order.items.map(item=>{
      const product=products.find(p=>p.id===item.productId);
      return product?{...item,productName:product.name,unitPrice:n(product.price),cost:n(product.cost),
        subtotal:round(n(product.price)*Math.max(0,n(item.quantity)))}:item;
    });
    const subtotal=round(items.reduce((s,i)=>s+n(i.subtotal),0));
    const total=round(Math.max(0,subtotal-n(order.discount)));
    return {...order,items,subtotal,total};
  });

  const delivered=orders.filter(o=>o.status==='entregada');
  const deliveredRevenue=delivered.reduce((s,o)=>s+n(o.total),0);
  const deliveredCost=delivered.reduce((s,o)=>s+o.items.reduce((x,i)=>x+n(i.cost)*Math.max(0,n(i.quantity)),0),0);
  const inventoryValue=state.ingredients.reduce((s,i)=>s+n(i.stock)*n(i.unitCost),0);
  const losses=state.losses.reduce((s,x)=>s+n(x.value),0);
  const grossProfit=deliveredRevenue-deliveredCost;
  const netProfit=grossProfit-finance.expenses-losses;
  const receivable=state.debts.filter(d=>d.type==='cobrar'&&!d.paid).reduce((s,d)=>s+n(d.amount),0);
  const payable=state.debts.filter(d=>d.type==='pagar'&&!d.paid).reduce((s,d)=>s+n(d.amount),0);
  const workingCapital=finance.cash+inventoryValue+receivable-payable;
  const averageTicket=delivered.length?deliveredRevenue/delivered.length:0;

  const breakEvenRevenue=pricing.monthlyFullCost;
  const recommendedRevenue=pricing.monthlyFullCost+pricing.monthlyTargetProfit;
  const targetProfitAmount=pricing.monthlyTargetProfit;

  const formulas=[
    {name:'Costo directo de cada producto',formula:'ingredientes + empaque + servicios + mano de obra + otros',value:round(pricing.productPricing.reduce((s,p)=>s+p.directProductionCost,0))},
    {name:'Gastos asignados por unidad',formula:'gastos del periodo ÷ unidades mensuales estimadas',value:round(pricing.expenses/pricing.units)},
    {name:'Inversión recuperada por unidad',formula:'inversión ÷ meses de recuperación ÷ unidades mensuales',value:round(pricing.investmentRecovery/pricing.units)},
    {name:'Pérdidas asignadas por unidad',formula:'pérdidas incluidas ÷ unidades mensuales estimadas',value:round(pricing.losses/pricing.units)},
    {name:'Costo completo',formula:'costo directo + gastos asignados + inversión recuperada + pérdidas asignadas',value:round(pricing.monthlyFullCost)},
    {name:'Ganancia objetivo',formula:'costo completo × ganancia objetivo %',value:round(targetProfitAmount)},
    {name:'Precio recomendado',formula:'costo completo unitario + ganancia objetivo',value:round(recommendedRevenue)},
    {name:'Capital de trabajo',formula:'caja + inventario + cuentas por cobrar − cuentas por pagar',value:round(workingCapital)},
    {name:'Utilidad neta histórica',formula:'ventas entregadas − costo entregado − gastos − pérdidas',value:round(netProfit)}
  ];

  return {
    ...state,products,recipes,orders,
    __calculations:{
      sales:round(finance.sales),expenses:round(finance.expenses),investments:round(finance.investments),
      withdrawals:round(finance.withdrawals),debtCollected:round(finance.debtCollected),debtPaid:round(finance.debtPaid),
      losses:round(losses),cash:round(finance.cash),inventoryValue:round(inventoryValue),
      accountsReceivable:round(receivable),accountsPayable:round(payable),
      deliveredRevenue:round(deliveredRevenue),deliveredCost:round(deliveredCost),
      grossProfit:round(grossProfit),netProfit:round(netProfit),
      capitalContributed:round(finance.investments),capitalRecovered:round(finance.withdrawals),
      workingCapital:round(workingCapital),averageTicket:round(averageTicket),
      monthlyFixedCost:round(pricing.expenses),monthlyInvestmentRecovery:round(pricing.investmentRecovery),
      monthlyLossAllowance:round(pricing.losses),targetProfitAmount:round(targetProfitAmount),
      breakEvenRevenue:round(breakEvenRevenue),recommendedRevenue:round(recommendedRevenue),
      productPricing:pricing.productPricing,totalRecommendedRevenue:round(pricing.productPricing.reduce((s,p)=>s+p.recommendedPrice,0)),
      formulas
    }
  };
}

export function getProductPricing(state:BusinessState,productId:string):ProductPricing|undefined {
  return state.__calculations?.productPricing.find(p=>p.productId===productId);
}

export function applyBusinessChange(state:BusinessState,change:{collection:keyof BusinessState;id?:string;action:'add'|'update'|'delete';value?:any}):BusinessState {
  const collection=change.collection;
  if(!Array.isArray((state as any)[collection]))return state;
  const current=[...((state as any)[collection] as any[])];
  let next=current;
  if(change.action==='add'&&change.value)next=[change.value,...current];
  else if(change.action==='update'&&change.id)next=current.map(x=>x.id===change.id?{...x,...(change.value||{}),id:x.id}:x);
  else if(change.action==='delete'&&change.id)next=current.filter(x=>x.id!==change.id);
  return recalculateBusinessState({...state,[collection]:next} as BusinessState);
}
