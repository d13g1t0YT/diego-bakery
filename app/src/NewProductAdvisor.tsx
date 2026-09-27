import { useState } from 'react';
import type { BusinessState } from './types';
import { askNewProductAi, type NewProductAiResponse } from './api';
import { uid, calculateRecipeCost } from './types';

type Message = { role: 'user' | 'assistant'; content: string };

export function NewProductAdvisor({
  state,
  onChange
}: {
  state: BusinessState;
  onChange: (mutator: (current: BusinessState) => BusinessState) => void;
}) {
  const [conversation, setConversation] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [response, setResponse] = useState<NewProductAiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [readyDraft, setReadyDraft] = useState<NewProductAiResponse['productDraft'] | null>(null);
  const [message, setMessage] = useState('');

  async function send() {
    const value = input.trim();
    if (!value) return;

    const nextConversation = [...conversation, { role: 'user' as const, content: value }];
    setConversation(nextConversation);
    setInput('');
    setLoading(true);
    setMessage('');

    try {
      const result = await askNewProductAi(state.admin?.token || '', state, nextConversation);
      setResponse(result);
      setConversation(current => [...current, { role: 'assistant' as const, content: result.message }]);
      if (result.productDraft) setReadyDraft(result.productDraft);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo consultar al asesor.');
    } finally {
      setLoading(false);
    }
  }

  function startOver() {
    setConversation([]);
    setResponse(null);
    setReadyDraft(null);
    setMessage('');
  }

  function createDraftProduct() {
    const draft = readyDraft;
    if (!draft?.name?.trim()) {
      setMessage('La IA todavía no tiene suficiente información para crear el producto.');
      return;
    }

    const productId = uid('prd');
    const recipeId = uid('rec');
    const knownIngredients = state.ingredients;
    const newIngredients = [...knownIngredients];
    const recipeLines = (draft.ingredients || []).map(item => {
      const normalized = item.name.toLowerCase().trim();
      let ingredient = newIngredients.find(x => x.name.toLowerCase().trim() === normalized);
      if (!ingredient) {
        ingredient = {
          id: uid('ing'),
          name: item.name.trim(),
          unit: item.unit.trim() || 'und',
          unitCost: Math.max(0, Number(item.unitCost) || 0),
          stock: 0,
          minStock: 0,
          supplier: ''
        };
        newIngredients.push(ingredient);
      }
      return {
        ingredientId: ingredient.id,
        quantity: Math.max(0, Number(item.quantity) || 0),
        unit: item.unit.trim() || ingredient.unit
      };
    }).filter(item => item.quantity > 0);

    onChange(current => {
      const product = {
        id: productId,
        name: draft.name!.trim(),
        description: draft.description?.trim() || 'Producto creado con el asesor IA',
        category: draft.category?.trim() || 'Nuevos',
        categories: [draft.category?.trim() || 'Nuevos'],
        price: Math.max(0, Number(draft.pricePerUnit) || 0),
        cost: 0,
        manualCost: 0,
        stock: 0,
        active: true,
        seasonal: false,
        tags: ['propuesta-ia'],
        flavors: [],
        sizes: [],
        presentation: draft.presentation?.trim() || 'Por definir',
        customizable: false,
        specifications: {
          weight: 0, weightUnit: 'g', height: 0, heightUnit: 'cm',
          width: 0, widthUnit: 'cm', length: 0, lengthUnit: 'cm',
          diameter: 0, diameterUnit: 'cm', shape: '',
          moldType: '', packagingType: draft.presentation?.trim() || '',
          temperature: 0, temperatureUnit: '°C', bakingTimeMinutes: 0,
          finalAppearance: '',
          ...(draft.specifications || {})
        }
      };

      const recipe = calculateRecipeCost({
        id: recipeId,
        productId,
        name: draft.name!.trim(),
        yieldUnits: Math.max(1, Number(draft.yieldUnits) || Number(response?.estimate?.yieldUnits) || 1),
        ingredients: recipeLines,
        procedure: draft.procedure || [],
        notes: [],
        serviceLines: [],
        useDefaultPackagingCost: draft.packagingCost == null,
        useDefaultUtilityCost: draft.utilityCost == null,
        useDefaultLaborRate: draft.laborRate == null,
        packagingCost: Math.max(0, Number(draft.packagingCost) || 0),
        utilityCost: Math.max(0, Number(draft.utilityCost) || 0),
        serviceCost: Math.max(0, Number(draft.serviceCost) || 0),
        laborHours: Math.max(0, Number(draft.laborHours) || 0),
        laborRate: Math.max(0, Number(draft.laborRate) || 0),
        otherCost: Math.max(0, Number(draft.otherCost) || 0),
        totalCost: 0,
        salePrice: Math.max(0, Number(draft.pricePerUnit) || 0),
        margin: 0
      }, newIngredients, current.services, current.settings);

      return {
        ...current,
        products: [product, ...current.products],
        ingredients: newIngredients,
        recipes: [recipe, ...current.recipes]
      };
    });

    setMessage('Borrador creado y conectado al motor de costos. Revisa y edita todo desde el editor profundo.');
  }

  return (
    <section className="panel new-product-advisor">
      <div className="panel-head">
        <div>
          <p className="eyebrow">ASESOR DE LANZAMIENTO</p>
          <h3>Crear producto nuevo con IA</h3>
        </div>
        <span className="status">Costo · Porción · Molde · Precio</span>
      </div>

      <p className="muted">
        Dile tu idea. La IA te hará las preguntas que falten una por una y usará el catálogo actual
        de ingredientes, servicios, gastos e inversión para construir el cálculo.
      </p>

      <div className="new-product-chat">
        {conversation.map((item, index) => (
          <div className={item.role === 'assistant' ? 'chat-bubble assistant' : 'chat-bubble user'} key={index}>
            <b>{item.role === 'assistant' ? 'IA' : 'Tú'}</b>
            <span>{item.content}</span>
          </div>
        ))}
        {!conversation.length ? (
          <div className="info-box">Ejemplo: “Quiero crear un cheesecake de Oreo que se venda por porciones y entero.”</div>
        ) : null}
      </div>

      <div className="form-grid">
        <label>
          Tu respuesta
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Escribe la idea o responde la última pregunta de la IA…"
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
        </label>
      </div>

      <div className="button-row">
        <button className="primary" onClick={() => void send()} disabled={loading || !input.trim()}>
          {loading ? 'Analizando…' : 'Enviar a la IA'}
        </button>
        <button className="secondary" onClick={startOver}>Empezar de nuevo</button>
      </div>

      {response?.question && !response.ready ? (
        <div className="info-box"><strong>Siguiente dato:</strong> {response.question}</div>
      ) : null}

      {response?.estimate ? (
        <>
          <div className="metric-grid">
            <div className="metric-card"><span>Costo completo por unidad</span><b>{Number(response.estimate.unitCost || 0).toFixed(2)}</b></div>
            <div className="metric-card"><span>Costo del lote</span><b>{Number(response.estimate.totalBatchCost || 0).toFixed(2)}</b></div>
            <div className="metric-card"><span>Precio recomendado</span><b>{Number(response.estimate.suggestedPrice || 0).toFixed(2)}</b></div>
            <div className="metric-card"><span>Confianza</span><b>{Math.round(Number(response.estimate.confidence || 0) * 100)}%</b></div>
          </div>
          {response.estimate.scenarios?.length ? (
            <div className="deep-section">
              <h4>Escenarios de venta</h4>
              <div className="metric-grid">
                {response.estimate.scenarios.map((scenario, index) => (
                  <div className="metric-card" key={index}>
                    <span>{scenario.label}</span>
                    <b>{Number(scenario.price || 0).toFixed(2)}</b>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {readyDraft ? (
        <div className="deep-section">
          <h4>Propuesta lista para convertir en producto</h4>
          <div className="form-grid">
            <label>Nombre<input value={readyDraft.name || ''} onChange={e => setReadyDraft(current => current ? ({ ...current, name: e.target.value }) : current)} /></label>
            <label>Presentación<input value={readyDraft.presentation || ''} onChange={e => setReadyDraft(current => current ? ({ ...current, presentation: e.target.value }) : current)} /></label>
            <label>Rendimiento<input type="number" min="1" step="0.01" value={readyDraft.yieldUnits ?? ''} onChange={e => setReadyDraft(current => current ? ({ ...current, yieldUnits: Number(e.target.value) }) : current)} /></label>
            <label>Empaque<input type="number" step="0.01" value={readyDraft.packagingCost ?? ''} onChange={e => setReadyDraft(current => current ? ({ ...current, packagingCost: Number(e.target.value) }) : current)} /></label>
            <label>Utilidad/energía<input type="number" step="0.01" value={readyDraft.utilityCost ?? ''} onChange={e => setReadyDraft(current => current ? ({ ...current, utilityCost: Number(e.target.value) }) : current)} /></label>
            <label>Servicio<input type="number" step="0.01" value={readyDraft.serviceCost ?? ''} onChange={e => setReadyDraft(current => current ? ({ ...current, serviceCost: Number(e.target.value) }) : current)} /></label>
            <label>Horas de trabajo<input type="number" step="0.01" value={readyDraft.laborHours ?? ''} onChange={e => setReadyDraft(current => current ? ({ ...current, laborHours: Number(e.target.value) }) : current)} /></label>
            <label>Otros costos<input type="number" step="0.01" value={readyDraft.otherCost ?? ''} onChange={e => setReadyDraft(current => current ? ({ ...current, otherCost: Number(e.target.value) }) : current)} /></label>
            <label>Precio por unidad<input type="number" step="0.01" value={readyDraft.pricePerUnit ?? ''} onChange={e => setReadyDraft(current => current ? ({ ...current, pricePerUnit: Number(e.target.value) }) : current)} /></label>
            <label>Precio por lote<input type="number" step="0.01" value={readyDraft.pricePerBatch ?? ''} onChange={e => setReadyDraft(current => current ? ({ ...current, pricePerBatch: Number(e.target.value) }) : current)} /></label>
          </div>
          <div className="button-row">
            <button className="primary" onClick={createDraftProduct}>Crear producto y receta</button>
          </div>
        </div>
      ) : null}

      {message ? <div className="info-box">{message}</div> : null}
    </section>
  );
}
