import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
  BusinessState,
  CashRegister,
  Customer,
  LoyaltyReward,
  MoneyMove,
  Promotion,
  Product,
  Recipe,
  ServiceCost,
  Supplier,
  calculateRecipeCost,
  money,
  uid
} from './types';

export function RecipesView({ state, setState }: {
  state: BusinessState;
  setState: Dispatch<SetStateAction<BusinessState | null>>;
}) {
  type DraftLine = { ingredientId: string; quantity: string };
  const [productId, setProductId] = useState(state.products[0]?.id ?? '');
  const [name, setName] = useState('');
  const [yieldUnits, setYieldUnits] = useState('1');
  const [lines, setLines] = useState<DraftLine[]>([
    { ingredientId: state.ingredients[0]?.id ?? '', quantity: '' }
  ]);
  const [packaging, setPackaging] = useState(String(state.settings.defaultPackagingCost));
  const [utility, setUtility] = useState(String(state.settings.defaultUtilityCost));
  const [service, setService] = useState('0');
  const [laborHours, setLaborHours] = useState('0');
  const [other, setOther] = useState('0');

  const product = state.products.find(p => p.id === productId);
  const cleanLines = lines
    .filter(line => line.ingredientId && Number(line.quantity) > 0)
    .map(line => ({ ingredientId: line.ingredientId, quantity: Number(line.quantity) }));

  const preview = useMemo(() => calculateRecipeCost({
    id: 'preview',
    productId,
    name: name || 'Nueva receta',
    yieldUnits: Math.max(1, Number(yieldUnits) || 1),
    ingredients: cleanLines,
    packagingCost: Math.max(0, Number(packaging) || 0),
    utilityCost: Math.max(0, Number(utility) || 0),
    serviceCost: Math.max(0, Number(service) || 0),
    laborHours: Math.max(0, Number(laborHours) || 0),
    laborRate: state.settings.laborRatePerHour,
    otherCost: Math.max(0, Number(other) || 0),
    totalCost: 0,
    salePrice: product?.price ?? 0,
    margin: 0
  }, state.ingredients), [productId, name, yieldUnits, lines, packaging, utility, service, laborHours, other, state.ingredients, state.settings.laborRatePerHour, product]);

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines(current => current.map((line, i) => i === index ? { ...line, ...patch } : line));
  }

  function addLine() {
    setLines(current => current.concat([{ ingredientId: state.ingredients[0]?.id ?? '', quantity: '' }]));
  }

  function removeLine(index: number) {
    setLines(current => current.length === 1 ? current : current.filter((_, i) => i !== index));
  }

  function resetForm() {
    setName('');
    setYieldUnits('1');
    setLines([{ ingredientId: state.ingredients[0]?.id ?? '', quantity: '' }]);
    setPackaging(String(state.settings.defaultPackagingCost));
    setUtility(String(state.settings.defaultUtilityCost));
    setService('0');
    setLaborHours('0');
    setOther('0');
  }

  function create() {
    if (!productId || !name.trim() || cleanLines.length === 0 || Math.max(1, Number(yieldUnits) || 1) <= 0) return;
    const recipe: Recipe = {
      ...preview,
      id: uid('rec'),
      name: name.trim(),
      ingredients: cleanLines
    };

    setState(prev => prev ? {
      ...prev,
      recipes: [recipe, ...prev.recipes],
      products: prev.products.map(p => p.id === productId ? { ...p, cost: recipe.totalCost } : p)
    } : prev);
    resetForm();
  }

  return <div className="content">
    <section className="panel">
      <div className="panel-head">
        <div><p className="eyebrow">COSTEO REAL</p><h3>Nueva receta</h3></div>
        <span className="status">Cálculo automático</span>
      </div>

      <div className="form-grid">
        <label>Producto<select value={productId} onChange={e => setProductId(e.target.value)}>
          {state.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></label>
        <label>Nombre de receta<input value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Queque marmoleado completo" /></label>
        <label>Rendimiento<input type="number" min="1" step="1" value={yieldUnits} onChange={e => setYieldUnits(e.target.value)} /></label>
      </div>

      <div className="panel-subsection">
        <div className="panel-head"><div><p className="eyebrow">INGREDIENTES</p><h3>Composición</h3></div><button className="secondary" onClick={addLine} disabled={!state.ingredients.length}>＋ Agregar ingrediente</button></div>
        {lines.map((line, index) => <div className="form-grid" key={index}>
          <label>Ingrediente<select value={line.ingredientId} onChange={e => updateLine(index, { ingredientId: e.target.value })} disabled={!state.ingredients.length}>
            {state.ingredients.length ? state.ingredients.map(i => <option key={i.id} value={i.id}>{i.name} · {i.unit}</option>) : <option value="">Agrega ingredientes primero</option>}
          </select></label>
          <label>Cantidad<input type="number" min="0" step="0.001" value={line.quantity} onChange={e => updateLine(index, { quantity: e.target.value })} /></label>
          <button className="secondary" onClick={() => removeLine(index)} disabled={lines.length === 1}>Quitar</button>
        </div>)}
      </div>

      <div className="form-grid">
        <label>Empaque<input type="number" min="0" step="0.01" value={packaging} onChange={e => setPackaging(e.target.value)} /></label>
        <label>Utilidades<input type="number" min="0" step="0.01" value={utility} onChange={e => setUtility(e.target.value)} /></label>
        <label>Servicios<input type="number" min="0" step="0.01" value={service} onChange={e => setService(e.target.value)} /></label>
        <label>Horas de trabajo<input type="number" min="0" step="0.25" value={laborHours} onChange={e => setLaborHours(e.target.value)} /></label>
        <label>Otros costos<input type="number" min="0" step="0.01" value={other} onChange={e => setOther(e.target.value)} /></label>
      </div>

      <div className="detail-grid">
        <div><span>Costo por unidad</span><b>{money(preview.totalCost)}</b></div>
        <div><span>Precio de venta</span><b>{money(preview.salePrice)}</b></div>
        <div><span>Margen</span><b className={preview.margin < 30 ? 'warning-text' : 'success-text'}>{preview.margin.toFixed(1)}%</b></div>
        <div><span>Costo total producción</span><b>{money(preview.totalCost * Math.max(1, Number(yieldUnits) || 1))}</b></div>
      </div>

      {!state.ingredients.length ? <div className="notice">Primero agrega ingredientes en Inventario.</div> : null}
      <button className="primary" onClick={create} disabled={!state.ingredients.length || !name.trim() || cleanLines.length === 0}>Guardar receta y actualizar costo</button>
    </section>

    <section className="panel">
      <div className="panel-head"><div><p className="eyebrow">RECETAS GUARDADAS</p><h3>Costos calculados</h3></div><span className="status">{state.recipes.length} receta(s)</span></div>
      {state.recipes.length === 0 ? <div className="empty">Todavía no hay recetas.</div> : <div className="table-wrap"><table><thead><tr><th>Receta</th><th>Producto</th><th>Ingredientes</th><th>Costo/unidad</th><th>Venta</th><th>Margen</th></tr></thead><tbody>{state.recipes.map(r => {
        const productName = state.products.find(p => p.id === r.productId)?.name || '—';
        return <tr key={r.id}><td><strong>{r.name}</strong><span className="sub">Rinde {r.yieldUnits}</span></td><td>{productName}</td><td>{r.ingredients.length}</td><td>{money(r.totalCost)}</td><td>{money(r.salePrice)}</td><td className={r.margin < 30 ? 'warning-text' : 'success-text'}>{r.margin.toFixed(2)}%</td></tr>;
      })}</tbody></table></div>}
    </section>
  </div>;
}

export function SuppliersView({ suppliers, setSuppliers }: { suppliers: Supplier[]; setSuppliers: (items: Supplier[]) => void }) {
  const [name,setName]=useState(''); const [phone,setPhone]=useState(''); const [notes,setNotes]=useState('');
  function add(){if(!name.trim())return;setSuppliers([{id:uid('sup'),name:name.trim(),phone:phone.trim()||undefined,notes:notes.trim()||undefined,active:true} as Supplier, ...suppliers]);setName('');setPhone('');setNotes('');}
  return <div className="content"><section className="panel"><div className="form-grid"><input placeholder="Proveedor" value={name} onChange={function(e){setName(e.target.value)}}/><input placeholder="Teléfono" value={phone} onChange={function(e){setPhone(e.target.value)}}/><input placeholder="Notas" value={notes} onChange={function(e){setNotes(e.target.value)}}/><button className="primary" onClick={add}>Agregar</button></div></section><section className="panel">{suppliers.length===0?<div className="empty">Agrega tus proveedores.</div>:suppliers.map(function(s){return <div className="list-row" key={s.id}><div><strong>{s.name}</strong><span>{s.phone||'Sin teléfono'}{s.notes ? ' · '+s.notes : ''}</span></div><button className="small-button" onClick={function(){setSuppliers(suppliers.map(function(x){return x.id===s.id?{...x,active:!x.active}:x}))}}>{s.active?'Activo':'Inactivo'}</button></div>})}</section></div>;
}

export function CustomersView({ customers, setCustomers }: { customers: Customer[]; setCustomers: (items: Customer[]) => void }) {
  const [name,setName]=useState(''); const [phone,setPhone]=useState(''); const [address,setAddress]=useState('');
  function add(){const p=phone.trim();if(!name.trim()||!/^\\d{6,20}$/.test(p))return;setCustomers([{id:uid('cus'),name:name.trim(),phone:p,addresses:address.trim()?[{label:'Principal',address:address.trim()}]:[],points:0,level:'Inicial',favorites:[],createdAt:new Date().toISOString()} as Customer, ...customers]);setName('');setPhone('');setAddress('');}
  return <div className="content"><section className="panel"><div className="form-grid"><input placeholder="Cliente" value={name} onChange={function(e){setName(e.target.value)}}/><input inputMode="tel" placeholder="Teléfono" value={phone} onChange={function(e){setPhone(e.target.value)}}/><input placeholder="Dirección" value={address} onChange={function(e){setAddress(e.target.value)}}/><button className="primary" onClick={add}>Guardar cliente</button></div></section><section className="panel">{customers.length===0?<div className="empty">Todavía no hay clientes.</div>:customers.map(function(c){return <div className="list-row" key={c.id}><div><strong>{c.name}</strong><span>{c.phone} · Nivel {c.level} · {c.points} puntos</span>{c.addresses[0]&&<span>{c.addresses[0].address}</span>}</div><button className="small-button" onClick={function(){setCustomers(customers.map(function(x){return x.id===c.id?{...x,points:x.points+1}:x}))}}>+1 punto</button></div>})}</section></div>;
}

export function PromotionsView({ promotions, products, setPromotions }: { promotions: Promotion[]; products: Product[]; setPromotions: (items: Promotion[]) => void }) {
  const [name,setName]=useState(''); const [code,setCode]=useState(''); const [type,setType]=useState<Promotion['type']>('percent'); const [value,setValue]=useState(''); const [minQty,setMinQty]=useState('2');
  function add(){const n=Number(value);if(!name.trim()||!Number.isFinite(n)||n<0)return;setPromotions([{id:uid('promo'),name:name.trim(),code:code.trim()||undefined,type:type,value:n,minQuantity:type==='quantity'?Math.max(1,Number(minQty||1)):undefined,productIds:products.map(function(p){return p.id}),active:true} as Promotion, ...promotions]);setName('');setCode('');setValue('');}
  return <div className="content"><section className="panel"><div className="form-grid"><input placeholder="Nombre" value={name} onChange={function(e){setName(e.target.value)}}/><input placeholder="Código (opcional)" value={code} onChange={function(e){setCode(e.target.value.toUpperCase())}}/><select value={type} onChange={function(e){setType(e.target.value as Promotion['type'])}}><option value="percent">% descuento</option><option value="fixed">Monto fijo</option><option value="quantity">Por cantidad</option><option value="date_price">Precio especial</option></select><input type="number" min="0" step="0.01" placeholder="Valor" value={value} onChange={function(e){setValue(e.target.value)}}/><button className="primary" onClick={add}>Crear</button></div></section><section className="panel">{promotions.length===0?<div className="empty">No hay promociones.</div>:promotions.map(function(p){return <div className="list-row" key={p.id}><div><strong>{p.name}</strong><span>{p.code||'Sin código'} · {p.type} · {p.value}{p.type==='percent'?'%':''}</span></div><button className="small-button" onClick={function(){setPromotions(promotions.map(function(x){return x.id===p.id?{...x,active:!x.active}:x}))}}>{p.active?'Activa':'Inactiva'}</button></div>})}</section></div>;
}

export function CashRegisterView({ register, setRegister, moneyMoves }: { register: CashRegister; setRegister: (r:CashRegister)=>void; moneyMoves:MoneyMove[] }) {
  const [opening,setOpening]=useState(String(register.openingCash||0)); const [closing,setClosing]=useState('');
  const openedAt=register.openedAt ? new Date(register.openedAt) : null;
  const cashSinceOpen=useMemo(function(){if(!openedAt)return 0;return moneyMoves.filter(function(m){return m.date>=openedAt.toISOString()}).reduce(function(sum,m){if(m.method&&m.method!=='efectivo')return sum;return ['gasto','retiro','pago_deuda'].includes(m.type)?sum-m.amount:sum+m.amount},0)},[moneyMoves,openedAt]);
  const expected=Number(register.openingCash||0)+cashSinceOpen;
  function open(){setRegister({openedAt:new Date().toISOString(),openingCash:Math.max(0,Number(opening||0))});}
  function close(){const n=Number(closing);if(!Number.isFinite(n)||n<0)return;setRegister({...register,closedAt:new Date().toISOString(),closingCash:n});}
  return <div className="content"><div className="metrics"><MetricBox label="Estado" value={register.openedAt&&!register.closedAt?'Caja abierta':'Caja cerrada'}/><MetricBox label="Saldo esperado" value={money(expected)}/><MetricBox label="Contado" value={register.closingCash===undefined?'—':money(register.closingCash)}/><MetricBox label="Diferencia" value={register.closingCash===undefined?'—':money(register.closingCash-expected)}/></div><section className="panel"><div className="form-grid"><label>Efectivo inicial<input type="number" min="0" step="0.01" value={opening} disabled={Boolean(register.openedAt&&!register.closedAt)} onChange={function(e){setOpening(e.target.value)}}/></label><label>Efectivo contado<input type="number" min="0" step="0.01" value={closing} disabled={!register.openedAt||Boolean(register.closedAt)} onChange={function(e){setClosing(e.target.value)}}/></label></div><div className="button-row">{(!register.openedAt||register.closedAt)&&<button className="primary" onClick={open}>Abrir caja</button>}{register.openedAt&&!register.closedAt&&<button className="primary" onClick={close}>Cerrar caja</button>}</div><p className="muted small">Yape, Plin y transferencias no se cuentan como efectivo físico.</p></section></div>;
}

function MetricBox({label,value}:{label:string;value:string}){return <div className="metric"><span>{label}</span><strong>{value}</strong></div>}

export function LoyaltyView({ rewards, setRewards, customers }: { rewards:LoyaltyReward[]; setRewards:(items:LoyaltyReward[])=>void; customers:Customer[] }) {
  const [name,setName]=useState(''); const [points,setPoints]=useState(''); const [discount,setDiscount]=useState('');
  function add(){const p=Number(points),d=Number(discount);if(!name.trim()||p<=0||d<0)return;setRewards([{id:uid('reward'),name:name.trim(),points:p,discount:d,active:true}].concat(rewards));setName('');setPoints('');setDiscount('');}
  return <div className="content"><section className="panel"><div className="form-grid"><input placeholder="Recompensa" value={name} onChange={function(e){setName(e.target.value)}}/><input type="number" min="1" placeholder="Puntos" value={points} onChange={function(e){setPoints(e.target.value)}}/><input type="number" min="0" step="0.01" placeholder="Descuento S/" value={discount} onChange={function(e){setDiscount(e.target.value)}}/><button className="primary" onClick={add}>Guardar</button></div></section><section className="grid-2"><div className="panel"><h3>Recompensas</h3>{rewards.length===0?<div className="empty">Sin recompensas.</div>:rewards.map(function(r){return <div className="list-row" key={r.id}><div><strong>{r.name}</strong><span>{r.points} puntos · {money(r.discount)}</span></div><button className="small-button" onClick={function(){setRewards(rewards.map(function(x){return x.id===r.id?{...x,active:!x.active}:x}))}}>{r.active?'Activa':'Inactiva'}</button></div>})}</div><div className="panel"><h3>Puntos de clientes</h3>{customers.slice(0,10).map(function(c){return <div className="list-row" key={c.id}><div><strong>{c.name}</strong><span>Nivel {c.level}</span></div><b>{c.points} pts</b></div>})}</div></section></div>;
}

export function NotificationsView({ items, setItems }: { items:BusinessState['notifications']; setItems:(items:BusinessState['notifications'])=>void }) {
  return <div className="content"><section className="panel"><h3>Notificaciones internas</h3>{items.length===0?<div className="empty">No hay avisos.</div>:items.map(function(n){return <div className="list-row" key={n.id}><div><strong>{n.title}</strong><span>{n.message} · {new Date(n.createdAt).toLocaleString('es-PE')}</span></div><button className="small-button" onClick={function(){setItems(items.map(function(x){return x.id===n.id?{...x,read:true}:x}))}}>{n.read?'Leída':'Marcar leída'}</button></div>})}</section></div>;
}

export function ServicesView({ services, setServices }: { services:ServiceCost[]; setServices:(items:ServiceCost[])=>void }) {
  const [name,setName]=useState(''); const [amount,setAmount]=useState(''); const [unit,setUnit]=useState('por producción');
  function add(){const n=Number(amount);if(!name.trim()||n<0)return;setServices([{id:uid('svc'),name:name.trim(),amount:n,unit:unit.trim()||'por producción',active:true}].concat(services));setName('');setAmount('');}
  return <div className="content"><section className="panel"><div className="form-grid"><input placeholder="Servicio" value={name} onChange={function(e){setName(e.target.value)}}/><input type="number" min="0" step="0.01" placeholder="Costo" value={amount} onChange={function(e){setAmount(e.target.value)}}/><input placeholder="Unidad" value={unit} onChange={function(e){setUnit(e.target.value)}}/><button className="primary" onClick={add}>Agregar</button></div></section><section className="panel">{services.length===0?<div className="empty">Ejemplos: gas, agua, electricidad, decoración, delivery.</div>:services.map(function(s){return <div className="list-row" key={s.id}><div><strong>{s.name}</strong><span>{money(s.amount)} · {s.unit}</span></div><button className="small-button" onClick={function(){setServices(services.map(function(x){return x.id===s.id?{...x,active:!x.active}:x}))}}>{s.active?'Activo':'Inactivo'}</button></div>})}</section></div>;
}


export function CombosView({ combos, products, setCombos }: {
  combos: BusinessState['combos'];
  products: Product[];
  setCombos: (items: BusinessState['combos']) => void;
}) {
  const [name,setName]=useState('');
  const [price,setPrice]=useState('');
  const [selected,setSelected]=useState<string[]>(products.slice(0,2).map(p=>p.id));
  function toggle(id:string){setSelected(selected.includes(id)?selected.filter(x=>x!==id):selected.concat(id));}
  function add(){
    const n=Number(price);
    if(!name.trim()||!Number.isFinite(n)||n<=0||selected.length<2)return;
    setCombos([{id:uid('combo'),name:name.trim(),productIds:selected,price:n,active:true}].concat(combos));
    setName('');setPrice('');
  }
  return <div className="content">
    <section className="panel">
      <div className="form-grid">
        <input placeholder="Nombre del combo" value={name} onChange={function(e){setName(e.target.value)}} />
        <input type="number" min="0" step="0.01" placeholder="Precio del combo" value={price} onChange={function(e){setPrice(e.target.value)}} />
      </div>
      <div className="check-grid">{products.map(function(p){return <label className="check" key={p.id}><input type="checkbox" checked={selected.includes(p.id)} onChange={function(){toggle(p.id)}} />{p.name}</label>})}</div>
      <button className="primary" onClick={add}>Guardar combo</button>
    </section>
    <section className="panel">
      {combos.length===0?<div className="empty">No hay combos.</div>:combos.map(function(c){return <div className="list-row" key={c.id}><div><strong>{c.name}</strong><span>{c.productIds.map(function(id){return products.find(function(p){return p.id===id})?.name}).filter(Boolean).join(' + ')}</span></div><b>{money(c.price)}</b><button className="small-button" onClick={function(){setCombos(combos.map(function(x){return x.id===c.id?{...x,active:!x.active}:x}))}}>{c.active?'Activo':'Inactivo'}</button></div>})}
    </section>
  </div>;
}
