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
                }
              },
              required: ['message', 'question', 'field', 'ready', 'estimate']
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
    res.json({
      message: String(parsed.message || ''),
      question: parsed.question == null ? undefined : String(parsed.question),
      field: parsed.field == null ? undefined : String(parsed.field),
      ready: Boolean(parsed.ready),
      estimate: parsed.estimate || undefined
    });
  } catch (error) {
    console.error('Error en asesor de nuevo producto:', error);
    res.status(502).json({ error: error instanceof Error ? error.message : 'No se pudo completar la asesoría.' });
  } finally {
    clearTimeout(timer);
  }
});

export default router;
