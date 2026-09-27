import { Router, Response } from 'express';
import { autenticar, AuthRequest } from '../middleware/auth.js';

const router = Router();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-sol';

function sanitizeState(state: any) {
  const source = state && typeof state === 'object' ? state : {};
  return {
    settings: source.settings || {},
    ingredients: Array.isArray(source.ingredients) ? source.ingredients.map((x: any) => ({
      id: x.id,
      name: x.name,
      unit: x.unit,
      unitCost: x.unitCost,
      stock: x.stock
    })).slice(0, 200) : [],
    services: Array.isArray(source.services) ? source.services.slice(0, 100) : [],
    products: Array.isArray(source.products) ? source.products.map((x: any) => ({
      id: x.id,
      name: x.name,
      price: x.price,
      cost: x.cost
    })).slice(0, 100) : [],
    calculations: source.__calculations || {}
  };
}

function calculateCostFromDraft(draft: any, state: any) {
  if (!draft || !Array.isArray(draft.ingredients) || draft.ingredients.length === 0) return undefined;

  const settings = state.settings || {};
  const yieldUnits = Math.max(1, Number(draft.yieldUnits || 1));
  let ingredientCost = 0;

  for (const item of draft.ingredients) {
    const quantity = Math.max(0, Number(item.quantity || 0));
    const normalized = String(item.name || '').toLowerCase().trim();
    const existing = state.ingredients.find((ingredient: any) =>
      String(ingredient.name || '').toLowerCase().trim() === normalized
    );
    const unitCost = existing ? Number(existing.unitCost || 0) : Number(item.unitCost || 0);
    ingredientCost += quantity * unitCost;
  }

  const packagingCost = Math.max(0, Number(draft.packagingCost || 0));
  const utilityCost = Math.max(0, Number(draft.utilityCost || 0));
  const serviceCost = Math.max(0, Number(draft.serviceCost || 0));
  const laborHours = Math.max(0, Number(draft.laborHours || 0));
  const laborRate = Math.max(0, Number(settings.laborRatePerHour || draft.laborRate || 0));
  const otherCost = Math.max(0, Number(draft.otherCost || 0));

  const directBatchCost = ingredientCost + packagingCost + utilityCost + serviceCost + laborHours * laborRate + otherCost;
  const directUnitCost = directBatchCost / yieldUnits;

  const monthlyUnits = Math.max(1, Number(settings.pricingExpectedMonthlyUnits || 1));
  const expenses = Boolean(settings.pricingIncludeExpenses)
    ? state.calculations?.expenses ? Number(state.calculations.expenses) : 0
    : 0;
  const investments = Number(state.calculations?.investments || 0);
  const losses = Boolean(settings.pricingIncludeLosses)
    ? Number(state.calculations?.losses || 0)
    : 0;
  const recoveryMonths = Math.max(1, Number(settings.pricingInvestmentRecoveryMonths || 1));
  const allocatedExpenses = expenses / monthlyUnits;
  const allocatedInvestment = investments / recoveryMonths / monthlyUnits;
  const allocatedLosses = losses / monthlyUnits;
  const fullUnitCost = directUnitCost + allocatedExpenses + allocatedInvestment + allocatedLosses;
  const targetPercent = Math.max(0, Number(settings.pricingTargetProfitPercent || 0));
  const targetProfit = fullUnitCost * targetPercent / 100;
  const recommendedPrice = fullUnitCost + targetProfit;

  const scenarios = [
    { label: '1 unidad / porción', quantity: 1, price: recommendedPrice },
    ...(yieldUnits >= 6 ? [{ label: '6 unidades', quantity: 6, price: recommendedPrice * 6 }] : []),
    ...(yieldUnits >= 12 ? [{ label: '12 unidades', quantity: 12, price: recommendedPrice * 12 }] : []),
    { label: 'Lote / molde completo', quantity: yieldUnits, price: recommendedPrice * yieldUnits }
  ].map(item => ({
    label: item.label,
    quantity: item.quantity,
    price: Number(item.price.toFixed(2))
  }));

  return {
    ingredientCost: Number(ingredientCost.toFixed(4)),
    directBatchCost: Number(directBatchCost.toFixed(4)),
    directUnitCost: Number(directUnitCost.toFixed(4)),
    allocatedExpenses: Number(allocatedExpenses.toFixed(4)),
    allocatedInvestment: Number(allocatedInvestment.toFixed(4)),
    allocatedLosses: Number(allocatedLosses.toFixed(4)),
    fullUnitCost: Number(fullUnitCost.toFixed(4)),
    targetProfit: Number(targetProfit.toFixed(4)),
    recommendedPrice: Number(recommendedPrice.toFixed(4)),
    yieldUnits,
    scenarios
  };
}

router.post('/nuevo-producto', autenticar, async (req: AuthRequest, res: Response) => {
  if (!OPENAI_API_KEY) {
    res.status(503).json({ error: 'La IA no está configurada en el servidor.' });
    return;
  }

  const conversation = Array.isArray(req.body?.conversation)
    ? req.body.conversation
        .filter((item: any) => item && typeof item.content === 'string')
        .slice(-16)
        .map((item: any) => ({
          role: item.role === 'assistant' ? 'assistant' : 'user',
          content: item.content.slice(0, 3000)
        }))
    : [];

  const state = sanitizeState(req.body?.state);

  const instructions = [
    'Eres el asesor de costeo y lanzamiento de productos de Diego Bakery.',
    'Debes ayudar a convertir una idea de producto en una ficha comercial y financiera calculable.',
    'Haz una pregunta a la vez. No hagas una lista de 10 preguntas en un solo mensaje.',
    'Pregunta solo por información que todavía falte. Reutiliza datos ya dados por el usuario.',
    'Como mínimo determina: nombre/idea, presentación, rendimiento (porciones/unidades o tamaño de molde), ingredientes y cantidades, empaque, servicios/energía, mano de obra, otros costos, unidades mensuales estimadas, inversión a recuperar y ganancia objetivo.',
    'Cuando el usuario mencione un ingrediente existente, usa su costo actual del catálogo. Si no existe, pregunta por su precio de compra y unidad.',
    'Si la receta no tiene cantidades exactas, no inventes cantidades: pregunta.',
    'Cuando tengas datos suficientes, calcula: costo por lote, costo por unidad/porción, gastos asignados, recuperación de inversión, pérdidas si están configuradas, costo completo, ganancia objetivo, margen y precio recomendado.',
    'Ofrece escenarios por unidad, porción, media docena/docena o molde cuando tengan sentido.',
    'Explica cualquier supuesto de forma explícita.',
    'Nunca ejecutes cambios en la base de datos: solo asesora y devuelve una propuesta estructurada.',
    'Cuando haya datos suficientes, incluye productDraft completo. Solo incluye información que esté sustentada por la conversación o por el estado del negocio.',
    'Devuelve exclusivamente el objeto JSON del esquema.'
  ].join('\n');

  const input = JSON.stringify({
    negocio: state,
    conversacion: conversation
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + OPENAI_API_KEY,
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: OPENAI_MODEL,
        store: false,
        max_output_tokens: 1800,
        instructions,
        input,
        text: {
          format: {
            type: 'json_schema',
            name: 'new_product_advisor',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                message: { type: 'string' },
                question: { type: ['string', 'null'] },
                field: { type: ['string', 'null'] },
                ready: { type: 'boolean' },
                estimate: {
                  type: ['object', 'null'],
                  additionalProperties: false,
                  properties: {
                    yieldUnits: { type: ['number', 'null'] },
                    unitCost: { type: ['number', 'null'] },
                    totalBatchCost: { type: ['number', 'null'] },
                    suggestedPrice: { type: ['number', 'null'] },
                    confidence: { type: ['number', 'null'] }
                  },
                  required: ['yieldUnits', 'unitCost', 'totalBatchCost', 'suggestedPrice', 'confidence']
                },
                productDraft: {
                  type: ['object', 'null'],
                  additionalProperties: false,
                  properties: {
                    name: { type: ['string', 'null'] },
                    description: { type: ['string', 'null'] },
                    category: { type: ['string', 'null'] },
                    presentation: { type: ['string', 'null'] },
                    yieldUnits: { type: ['number', 'null'] },
                    packagingCost: { type: ['number', 'null'] },
                    utilityCost: { type: ['number', 'null'] },
                    serviceCost: { type: ['number', 'null'] },
                    laborHours: { type: ['number', 'null'] },
                    laborRate: { type: ['number', 'null'] },
                    otherCost: { type: ['number', 'null'] },
                    ingredients: {
                      type: ['array', 'null'],
                      items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                          name: { type: 'string' },
                          quantity: { type: 'number' },
                          unit: { type: 'string' },
                          unitCost: { type: ['number', 'null'] }
                        },
                        required: ['name', 'quantity', 'unit', 'unitCost']
                      }
                    },
                    procedure: {
                      type: ['array', 'null'],
                      items: { type: 'string' }
                    },
                    pricePerUnit: { type: ['number', 'null'] },
                    pricePerBatch: { type: ['number', 'null'] },
                    targetMarginPercent: { type: ['number', 'null'] }
                  },
                  required: ['name', 'description', 'category', 'presentation', 'yieldUnits', 'packagingCost', 'utilityCost', 'serviceCost', 'laborHours', 'laborRate', 'otherCost', 'ingredients', 'procedure', 'pricePerUnit', 'pricePerBatch', 'targetMarginPercent']
                }
              },
              required: ['message', 'question', 'field', 'ready', 'estimate', 'productDraft']
            }
          }
        }
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      res.status(502).json({ error: body || 'La IA no pudo procesar el asesoramiento.' });
      return;
    }

    const payload = await response.json();
    const raw = typeof payload?.output_text === 'string'
      ? payload.output_text
      : Array.isArray(payload?.output)
        ? payload.output.flatMap((item: any) => item?.content || [])
            .filter((part: any) => part?.type === 'output_text')
            .map((part: any) => part.text)
            .join('\n')
        : '';

    if (!raw) {
      res.status(502).json({ error: 'La IA devolvió una respuesta vacía.' });
      return;
    }

    const parsed = JSON.parse(raw);
    const productDraft = parsed.productDraft || undefined;
    const deterministic = calculateCostFromDraft(productDraft, state);

    res.json({
      message: String(parsed.message || ''),
      question: parsed.question == null ? undefined : String(parsed.question),
      field: parsed.field == null ? undefined : String(parsed.field),
      ready: Boolean(parsed.ready),
      estimate: deterministic
        ? {
            yieldUnits: deterministic.yieldUnits,
            unitCost: deterministic.fullUnitCost,
            totalBatchCost: deterministic.directBatchCost,
            suggestedPrice: deterministic.recommendedPrice,
            confidence: 1,
            scenarios: deterministic.scenarios
          }
        : parsed.estimate || undefined,
      productDraft: productDraft
        ? {
            ...productDraft,
            yieldUnits: productDraft.yieldUnits ?? deterministic?.yieldUnits ?? undefined,
            packagingCost: productDraft.packagingCost ?? 0,
            utilityCost: productDraft.utilityCost ?? 0,
            serviceCost: productDraft.serviceCost ?? 0,
            laborHours: productDraft.laborHours ?? 0,
            laborRate: productDraft.laborRate ?? undefined,
            otherCost: productDraft.otherCost ?? 0,
            ...(deterministic ? {
              pricePerUnit: deterministic.recommendedPrice,
              pricePerBatch: deterministic.recommendedPrice * deterministic.yieldUnits,
              targetMarginPercent: Number(state.settings?.pricingTargetProfitPercent || 0)
            } : {})
          }
        : undefined
    });
  } catch (error) {
    console.error('Error en asesor de nuevo producto:', error);
    res.status(502).json({ error: error instanceof Error ? error.message : 'No se pudo completar la asesoría.' });
  } finally {
    clearTimeout(timer);
  }
});

export default router;
