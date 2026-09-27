import { useMemo, useState } from 'react';
import type { BusinessState } from './types';
import { recalculateBusinessState } from './businessEngine';
import { uid } from './types';

type CollectionKey =
  | 'products' | 'ingredients' | 'recipes' | 'suppliers' | 'customers'
  | 'promotions' | 'combos' | 'loyaltyRewards' | 'services' | 'orders'
  | 'money' | 'debts' | 'losses' | 'notifications' | 'reviews'
  | 'settings' | 'cashRegister';

const COLLECTIONS: Array<{ key: CollectionKey; label: string }> = [
  { key: 'products', label: 'Productos' }, { key: 'ingredients', label: 'Ingredientes / inventario' },
  { key: 'recipes', label: 'Recetas' }, { key: 'suppliers', label: 'Proveedores' },
  { key: 'customers', label: 'Clientes' }, { key: 'promotions', label: 'Promociones' },
  { key: 'combos', label: 'Combos' }, { key: 'loyaltyRewards', label: 'Premios de lealtad' },
  { key: 'services', label: 'Servicios / costos' }, { key: 'orders', label: 'Pedidos' },
  { key: 'money', label: 'Movimientos de dinero' }, { key: 'debts', label: 'Deudas' },
  { key: 'losses', label: 'Pérdidas / desperdicios' }, { key: 'notifications', label: 'Avisos' },
  { key: 'reviews', label: 'Reseñas' }, { key: 'settings', label: 'Configuración' },
  { key: 'cashRegister', label: 'Caja' }
];

const labels: Record<string,string> = {
  id:'ID interno', name:'Nombre', description:'Descripción', category:'Categoría', categories:'Categorías',
  price:'Precio de venta', cost:'Costo', manualCost:'Costo manual', recommendedPrice:'Precio recomendado',
  stock:'Stock', active:'Activo', seasonal:'De temporada', tags:'Etiquetas', flavors:'Sabores',
  sizes:'Tamaños', presentation:'Presentación', options:'Opciones', customizable:'Personalizable',
  customizationNote:'Nota de personalización', image:'Imagen', sku:'SKU', unit:'Unidad',
  unitCost:'Costo por unidad', minStock:'Stock mínimo', supplier:'Proveedor', expiration:'Vencimiento',
  productId:'Producto', productIds:'Productos', productName:'Nombre del producto', yieldUnits:'Rendimiento',
  ingredients:'Ingredientes', packagingCost:'Costo de empaque', utilityCost:'Servicios/energía',
  serviceCost:'Otros servicios', laborHours:'Horas de trabajo', laborRate:'Costo por hora',
  otherCost:'Otros costos', totalCost:'Costo calculado', salePrice:'Precio de venta',
  margin:'Margen %', phone:'Teléfono', notes:'Notas', addresses:'Direcciones', points:'Puntos',
  level:'Nivel', favorites:'Favoritos', createdAt:'Creado', code:'Código', type:'Tipo',
  value:'Valor', minQuantity:'Cantidad mínima', startAt:'Inicio', endAt:'Fin',
  discount:'Descuento', amount:'Monto', date:'Fecha', category:'Categoría', method:'Método',
  person:'Persona', dueDate:'Vencimiento', paid:'Pagado', item:'Elemento', quantity:'Cantidad',
  reason:'Motivo', title:'Título', message:'Mensaje', read:'Leído', rating:'Calificación',
  comment:'Comentario', customerId:'Cliente', customerName:'Cliente', customerPhone:'Teléfono del cliente',
  address:'Dirección', reference:'Referencia', items:'Productos del pedido', subtotal:'Subtotal',
  total:'Total', status:'Estado', paymentMethod:'Forma de pago', deliveryAt:'Entrega',
  discountCode:'Código de descuento', loyaltyPointsUsed:'Puntos usados', source:'Origen',
  inventoryDeducted:'Inventario descontado', loyaltyAwardedAt:'Puntos otorgados',
  businessName:'Nombre del negocio', currency:'Moneda', theme:'Tema', schoolSales:'Ventas escolares',
  schoolWindows:'Horarios escolares', deliveryEnabled:'Delivery activo', autoBackup:'Respaldo automático',
  biometrics:'Biometría', laborRatePerHour:'Mano de obra por hora', defaultUtilityCost:'Servicio/energía por defecto',
  defaultPackagingCost:'Empaque por defecto', deliveryFee:'Tarifa de delivery',
  loyaltyPointsPerSol:'Puntos por sol', whatsapp:'WhatsApp', businessAddress:'Dirección del negocio',
  socialInstagram:'Instagram', socialFacebook:'Facebook', notificationEnabled:'Notificaciones',
  pricingTargetProfitPercent:'Ganancia objetivo %', pricingExpectedMonthlyUnits:'Unidades mensuales estimadas',
  pricingInvestmentRecoveryMonths:'Meses para recuperar inversión', pricingIncludeExpenses:'Incluir gastos',
  pricingIncludeLosses:'Incluir pérdidas', openingCash:'Caja inicial', openedAt:'Apertura',
  closedAt:'Cierre', closingCash:'Caja al cierre'
};

const friendly = (key: string) => labels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());

function template(collection: CollectionKey): any {
  const id = uid(collection.slice(0,4));
  const now = new Date().toISOString();
  const base: Record<string, any> = {
    products:{id,name:'Nuevo producto',description:'',category:'General',categories:['General'],price:0,cost:0,manualCost:0,stock:0,active:true,seasonal:false,tags:[],flavors:[],sizes:[],presentation:'',options:[],customizable:false},
    ingredients:{id,name:'Nuevo ingrediente',unit:'g',unitCost:0,stock:0,minStock:0,supplier:'',expiration:''},
    recipes:{id,productId:'',name:'Nueva receta',yieldUnits:1,ingredients:[],packagingCost:0,utilityCost:0,serviceCost:0,laborHours:0,laborRate:0,otherCost:0,totalCost:0,salePrice:0,margin:0},
    suppliers:{id,name:'Nuevo proveedor',phone:'',notes:'',active:true},
    customers:{id,name:'Nuevo cliente',phone:'',addresses:[],points:0,level:'Nuevo',favorites:[],notes:'',createdAt:now},
    promotions:{id,name:'Nueva promoción',code:'',description:'',type:'percent',value:0,minQuantity:1,productIds:[],startAt:'',endAt:'',active:true},
    combos:{id,name:'Nuevo combo',productIds:[],price:0,active:true},
    loyaltyRewards:{id,name:'Nuevo premio',points:0,discount:0,active:true},
    services:{id,name:'Nuevo servicio',amount:0,unit:'unidad',active:true},
    orders:{id,createdAt:now,customerName:'',customerPhone:'',items:[],subtotal:0,discount:0,total:0,status:'pendiente',paid:0,source:'admin'},
    money:{id,date:now,type:'gasto',amount:0,description:'',category:'General',method:'efectivo'},
    debts:{id,type:'cobrar',person:'',amount:0,description:'',paid:false},
    losses:{id,date:now,item:'',quantity:0,value:0,reason:''},
    notifications:{id,type:'sistema',title:'',message:'',read:false,createdAt:now},
    reviews:{id,productId:'',customerId:'',rating:5,comment:'',createdAt:now},
  };
  return base[collection];
}

function titleOf(item:any) {
  return String(item?.name || item?.customerName || item?.productName || item?.description || item?.item || item?.title || item?.id || 'Registro');
}

function parseScalar(value:string, original:any): any {
  if (typeof original === 'number') return value === '' ? 0 : Number(value);
  if (typeof original === 'boolean') return value === 'true';
  return value;
}

function RelationPicker({ field, value, state, onChange }:{
  field:string; value:any; state:BusinessState; onChange:(v:any)=>void;
}) {
  const relation = field === 'productId' ? state.products : field === 'customerId' ? state.customers : field === 'supplier' ? state.suppliers : [];
  if (!relation.length) return null;
  if (field === 'supplier') return <select value={String(value||'')} onChange={e=>onChange(e.target.value)}><option value="">Sin proveedor</option>{relation.map((x:any)=><option key={x.id||x.name} value={x.id||x.name}>{titleOf(x)}</option>)}</select>;
  return <select value={String(value||'')} onChange={e=>onChange(e.target.value)}><option value="">Sin asignar</option>{relation.map((x:any)=><option key={x.id} value={x.id}>{titleOf(x)}</option>)}</select>;
}

function FieldEditor({keyName,value,state,onChange}:{
  keyName:string; value:any; state:BusinessState; onChange:(v:any)=>void;
}) {
  if (keyName === 'id') return <label><span>{friendly(keyName)}</span><input value={String(value)} readOnly /></label>;
  if (keyName === 'productId' || keyName === 'customerId' || keyName === 'supplier') {
    return <label><span>{friendly(keyName)}</span><RelationPicker field={keyName} value={value} state={state} onChange={onChange}/></label>;
  }
  if (typeof value === 'boolean') return <label className="toggle-row"><span>{friendly(keyName)}</span><input type="checkbox" checked={value} onChange={e=>onChange(e.target.checked)}/></label>;
  if (typeof value === 'number') return <label><span>{friendly(keyName)}</span><input type="number" step="any" value={value} onChange={e=>onChange(parseScalar(e.target.value,value))}/></label>;
  if (typeof value === 'string' && /At$|^date$|^expiration$|^dueDate$|^createdAt$/.test(keyName)) return <label><span>{friendly(keyName)}</span><input type="datetime-local" value={value ? new Date(value).toISOString().slice(0,16) : ''} onChange={e=>onChange(e.target.value ? new Date(e.target.value).toISOString() : '')}/></label>;
  if (typeof value === 'string' && (keyName === 'description' || keyName === 'notes' || keyName === 'message' || keyName === 'comment' || keyName === 'customizationNote' || keyName === 'businessAddress')) return <label><span>{friendly(keyName)}</span><textarea value={value} onChange={e=>onChange(e.target.value)}/></label>;
  return <label><span>{friendly(keyName)}</span><input value={value ?? ''} onChange={e=>onChange(e.target.value)}/></label>;
}

function DeepObjectEditor({value,state,onChange,path='root'}:{
  value:any; state:BusinessState; onChange:(v:any)=>void; path?:string;
}) {
  if (Array.isArray(value)) {
    return <div className="deep-array">
      {value.map((item,i)=><div className="deep-item" key={i}>
        <div className="deep-item-head"><b>{friendly(String(i+1))}</b><button className="danger-button small" onClick={()=>onChange(value.filter((_:any,j:number)=>j!==i))}>Eliminar</button></div>
        <DeepObjectEditor value={item} state={state} path={path+'.'+i} onChange={v=>{const next=[...value];next[i]=v;onChange(next)}}/>
      </div>)}
      <button className="secondary small" onClick={()=>{
        const key=path.split('.').pop() || '';
        let item:any='';
        if(key==='ingredients') item={ingredientId:'',quantity:0};
        else if(key==='addresses') item={label:'Nueva dirección',address:'',reference:''};
        else if(key==='options') item={label:'Nueva opción',values:[]};
        else if(key==='items') item={productId:'',productName:'',quantity:1,unitPrice:0,cost:0,subtotal:0};
        else if(key==='schoolWindows') item={label:'Horario',start:'08:00',end:'09:00'};
        else if(value[0] && typeof value[0]==='object') item=structuredClone(value[0]);
        onChange([...value,item]);
      }}>＋ Agregar elemento</button>
    </div>;
  }
  if (value && typeof value === 'object') {
    return <div className="deep-object">
      {Object.entries(value).map(([key,val])=><div className="deep-field" key={key}>
        <div className="deep-field-head"><b>{friendly(key)}</b><button className="danger-button tiny" onClick={()=>{const copy={...value};delete copy[key];onChange(copy)}}>×</button></div>
        {val !== null && typeof val === 'object'
          ? <DeepObjectEditor value={val} state={state} path={path+'.'+key} onChange={v=>onChange({...value,[key]:v})}/>
          : <FieldEditor keyName={key} value={val} state={state} onChange={v=>onChange({...value,[key]:v})}/>}
      </div>)}
      <button className="secondary small" onClick={()=>{
        const key=window.prompt('Nombre del nuevo campo');
        if (key && /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && !(key in value)) onChange({...value,[key]:''});
      }}>＋ Agregar campo</button>
    </div>;
  }
  return <input value={value ?? ''} onChange={e=>onChange(parseScalar(e.target.value,value))}/>;
}

export function DeepEditor({state,onChange}:{state:BusinessState;onChange:(mutator:(current:BusinessState)=>BusinessState)=>void}) {
  const [collection,setCollection]=useState<CollectionKey>('products');
  const [selectedId,setSelectedId]=useState('');
  const [draft,setDraft]=useState<any|null>(null);
  const [search,setSearch]=useState('');

  const singleton = collection === 'settings' || collection === 'cashRegister';
  const items:any[] = singleton ? [{id:collection,...structuredClone((state as any)[collection]||{})}] : (((state as any)[collection]||[]) as any[]);
  const filtered = useMemo(()=>items.filter(x=>!search.trim() || JSON.stringify(x).toLowerCase().includes(search.toLowerCase())),[items,search]);

  function select(id:string) {
    const item=items.find(x=>String(x.id)===id);
    setSelectedId(id);
    setDraft(item ? structuredClone(item) : null);
  }
  function add() {
    if (singleton) return;
    const item=template(collection);
    onChange(current=>recalculateBusinessState({...current,[collection]:[item,...((current as any)[collection]||[])]} as BusinessState));
    setSelectedId(item.id); setDraft(structuredClone(item));
  }
  function save() {
    if (!draft) return;
    const clean=structuredClone(draft);
    if (singleton) onChange(current=>recalculateBusinessState({...current,[collection]:clean} as BusinessState));
    else onChange(current=>recalculateBusinessState({...current,[collection]:((current as any)[collection]||[]).map((x:any)=>x.id===selectedId?{...clean,id:selectedId}:x)} as BusinessState));
  }
  function remove() {
    if (!draft || singleton) return;
    const label=titleOf(draft);
    if (!window.confirm('Eliminar "'+label+'"? Las relaciones dependientes se limpiarán y los cálculos se actualizarán.')) return;
    onChange(current=>recalculateBusinessState({...current,[collection]:((current as any)[collection]||[]).filter((x:any)=>x.id!==selectedId)} as BusinessState));
    setSelectedId(''); setDraft(null);
  }
  function duplicate() {
    if (!draft || singleton) return;
    const copy=structuredClone(draft); copy.id=uid('copy');
    if (typeof copy.name==='string') copy.name+=' (copia)';
    onChange(current=>recalculateBusinessState({...current,[collection]:[copy,...((current as any)[collection]||[])]} as BusinessState));
    setSelectedId(copy.id); setDraft(copy);
  }

  const primitive= draft ? Object.entries(draft).filter(([,v])=>v===null || typeof v!=='object') : [];

  return <div className="content">
    <section className="panel">
      <div className="panel-head"><div><p className="eyebrow">CONTROL TOTAL</p><h3>Editor profundo</h3></div><span className="status">{items.length} registros</span></div>
      <p className="muted">Todo se puede crear, modificar, duplicar o eliminar. Los objetos y listas también se editan desde controles individuales; no necesitas escribir JSON. Al guardar, el motor recalcula costos, precios, márgenes, inventario, referencias, pedidos abiertos y finanzas.</p>
      <div className="form-grid">
        <label>Área<select value={collection} onChange={e=>{setCollection(e.target.value as CollectionKey);setSelectedId('');setDraft(null);setSearch('')}}>{COLLECTIONS.map(x=><option key={x.key} value={x.key}>{x.label}</option>)}</select></label>
        <label>Buscar registro<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nombre, teléfono, ID, etc."/></label>
      </div>
      {!singleton && <div className="button-row"><button className="primary" onClick={add}>＋ Nuevo</button></div>}
      <div className="deep-record-list">{filtered.slice(0,100).map(item=><button key={item.id} className={String(item.id)===selectedId?'deep-record selected':'deep-record'} onClick={()=>select(String(item.id))}><strong>{titleOf(item)}</strong><small>{String(item.id)}</small></button>)}</div>
    </section>

    {draft && <section className="panel">
      <div className="panel-head"><div><p className="eyebrow">EDITANDO</p><h3>{titleOf(draft)}</h3></div><span className="status">Guardado solo al pulsar Guardar</span></div>
      <div className="form-grid">
        {primitive.map(([key,val])=><FieldEditor key={key} keyName={key} value={val} state={state} onChange={v=>setDraft((d:any)=>({...d,[key]:v}))}/>)}
      </div>
      <div className="deep-section"><h4>Relaciones, listas y detalles</h4><DeepObjectEditor value={Object.fromEntries(Object.entries(draft).filter(([,v])=>v!==null && typeof v==='object'))} state={state} onChange={v=>setDraft((d:any)=>({...d,...v}))}/></div>
      <div className="button-row"><button className="primary" onClick={save}>Guardar y recalcular todo</button>{!singleton&&<><button className="secondary" onClick={duplicate}>Duplicar</button><button className="danger-button" onClick={remove}>Eliminar y reajustar</button></>}</div>
    </section>}

    {state.__calculations && <section className="panel">
      <div className="panel-head"><div><p className="eyebrow">DEPENDENCIAS</p><h3>Lo que se recalcula automáticamente</h3></div></div>
      <div className="metric-grid">
        <div className="metric-card"><span>Costo directo</span><b>{state.__calculations.formulas[0]?.value?.toFixed(2)}</b></div>
        <div className="metric-card"><span>Punto de equilibrio</span><b>{state.__calculations.breakEvenRevenue.toFixed(2)}</b></div>
        <div className="metric-card"><span>Precio recomendado total</span><b>{state.__calculations.totalRecommendedRevenue.toFixed(2)}</b></div>
        <div className="metric-card"><span>Utilidad neta histórica</span><b>{state.__calculations.netProfit.toFixed(2)}</b></div>
      </div>
    </section>}
  </div>;
}
