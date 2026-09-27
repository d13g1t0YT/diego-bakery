import { recalculateBusinessState, applyBusinessChange } from '../app/src/businessEngine';
import { type BusinessState, type Ingredient, type Product, type Recipe, type Order, type Promotion, type Combo, type Customer, type MoneyMove } from '../app/src/types';

const assert=(condition:boolean,message:string)=>{
  if(!condition) throw new Error('FAIL: '+message);
};

function base():BusinessState{
  const ingredientA:Ingredient={id:'ing_a',name:'Harina',unit:'g',unitCost:0.01,stock:1000,minStock:100,supplier:'Proveedor A'};
  const productA:Product={id:'prd_a',name:'Queque',description:'',category:'Queques',categories:['Queques'],price:10,cost:0,stock:10,active:true,seasonal:false,tags:[],flavors:[],sizes:[],presentation:'Caja'};
  const recipeA:Recipe={id:'rec_a',productId:'prd_a',name:'Receta Queque',yieldUnits:1,ingredients:[{ingredientId:'ing_a',quantity:200}],packagingCost:1,utilityCost:1,serviceCost:0,laborHours:1,laborRate:5,otherCost:0,totalCost:0,salePrice:10,margin:0};
  const delivered:Order={id:'ord_done',createdAt:'2026-09-01T10:00:00Z',customerName:'Ana',customerPhone:'1',items:[{productId:'prd_a',productName:'Queque',quantity:1,unitPrice:10,cost:9,subtotal:10}],subtotal:10,discount:0,total:10,status:'entregada',paid:10,source:'admin'};
  const open:Order={id:'ord_open',createdAt:'2026-09-02T10:00:00Z',customerName:'Luis',customerPhone:'2',items:[{productId:'prd_a',productName:'Queque',quantity:2,unitPrice:10,cost:9,subtotal:20}],subtotal:20,discount:0,total:20,status:'pendiente',paid:0,source:'admin'};
  const promo:Promotion={id:'promo_a',name:'Promo',type:'percent',value:10,productIds:['prd_a'],active:true};
  const combo:Combo={id:'combo_a',name:'Combo',productIds:['prd_a'],price:9,active:true};
  const customer:Customer={id:'cus_a',name:'Ana',phone:'1',addresses:[],points:0,level:'Nuevo',favorites:['prd_a'],createdAt:'2026-09-01T00:00:00Z'};
  const money:MoneyMove={id:'mov_g',date:'2026-09-01T00:00:00Z',type:'gasto',amount:100,description:'Gasto',category:'Operación',method:'efectivo'};
  return {
    products:[productA],ingredients:[ingredientA],recipes:[recipeA],suppliers:[{id:'sup_a',name:'Proveedor A',active:true}],
    customers:[customer],promotions:[promo],combos:[combo],loyaltyRewards:[],services:[],orders:[delivered,open],
    money:[money],debts:[],losses:[],notifications:[],reviews:[],cashRegister:{openingCash:0},
    settings:{
      businessName:'Test Bakery',currency:'PEN',theme:'light',schoolSales:false,schoolWindows:[],deliveryEnabled:false,
      autoBackup:false,biometrics:false,laborRatePerHour:5,defaultUtilityCost:0,defaultPackagingCost:0,deliveryFee:0,
      loyaltyPointsPerSol:1,notificationEnabled:false,pricingTargetProfitPercent:25,pricingExpectedMonthlyUnits:100,
      pricingInvestmentRecoveryMonths:10,pricingIncludeExpenses:true,pricingIncludeLosses:true
    }
  };
}

const s0=recalculateBusinessState(base());
const p0=s0.products[0];
const r0=s0.recipes[0];
assert(Math.abs(r0.totalCost-9)<0.0001,'recipe direct cost = ingredients + packaging + utility + labor');
assert(p0.cost===9,'product direct cost follows recipe');
assert((p0.recommendedPrice??0)>p0.cost,'recommended price exceeds direct cost');
assert(s0.__calculations?.expenses===100,'expense is included in finance totals');
assert((s0.__calculations?.accountsPayable??-1)===0,'no payable without debts');

const changedIngredient={...s0,ingredients:s0.ingredients.map(i=>i.id==='ing_a'?{...i,unitCost:0.02}:i)};
const s1=recalculateBusinessState(changedIngredient);
assert(s1.recipes[0].totalCost===11,'ingredient price change propagates to recipe');
assert(s1.products[0].cost===11,'ingredient price change propagates to product cost');
assert(s1.products[0].recommendedPrice!==p0.recommendedPrice,'ingredient price change propagates to recommended price');

const renamed={...s1,products:s1.products.map(p=>p.id==='prd_a'?{...p,name:'Queque Especial',price:12}:p)};
const s2=recalculateBusinessState(renamed);
const done=s2.orders.find(o=>o.id==='ord_done')!;
const open=s2.orders.find(o=>o.id==='ord_open')!;
assert(done.items[0].productName==='Queque','delivered order keeps historical product snapshot');
assert(done.items[0].unitPrice===10,'delivered order keeps historical price');
assert(open.items[0].productName==='Queque Especial','open order follows current product name');
assert(open.items[0].unitPrice===12,'open order follows current product price');
assert(open.total===24,'open order total is recalculated from current product price');

const deleted=applyBusinessChange(s2,{collection:'ingredients',action:'delete',id:'ing_a'});
assert(deleted.recipes[0].ingredients.length===0,'deleting ingredient removes recipe reference');
assert(deleted.recipes[0].totalCost===7,'recipe recalculates after ingredient reference removal');
assert(deleted.products[0].cost===7,'product cost recalculates after ingredient deletion');

const deletedProduct=applyBusinessChange(deleted,{collection:'products',action:'delete',id:'prd_a'});
assert(deletedProduct.products.length===0,'product deletion removes product');
assert(deletedProduct.recipes.length===0,'product deletion removes dependent recipe');
assert(deletedProduct.promotions[0].productIds.length===0,'product deletion cleans promotion reference');
assert(deletedProduct.combos[0].productIds.length===0,'product deletion cleans combo reference');
assert(deletedProduct.customers[0].favorites.length===0,'product deletion cleans customer favorite');

const added=applyBusinessChange(deletedProduct,{collection:'ingredients',action:'add',value:{id:'ing_new',name:'Azúcar',unit:'g',unitCost:0.02,stock:500,minStock:50,supplier:'Proveedor A'}});
assert(added.ingredients.some(i=>i.id==='ing_new'),'add action inserts record');

console.log('PASS: business engine dependency, pricing, historical snapshots and CRUD propagation tests');
