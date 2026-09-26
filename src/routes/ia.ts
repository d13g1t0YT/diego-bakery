import { Router, Response } from 'express';
import { autenticar, AuthRequest } from '../middleware/auth.js';

const router = Router();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna';

function sanitizeState(input: any) {
  const state = input && typeof input === 'object' ? input : {};
  const admin = state.admin ? { name: state.admin.name, phone: state.admin.phone } : undefined;
  const strip = (item: any) => {
    if (!item || typeof item !== 'object') return item;
    const copy = { ...item };
    delete copy.token;
    delete copy.pinHash;
    if (copy.customerPhone) delete copy.customerPhone;
    if (copy.phone && copy.name && Array.isArray(copy.addresses)) delete copy.phone;
    return copy;
  };
  return {
    settings: state.settings,
    products: Array.isArray(state.products) ? state.products.map(strip) : [],
    ingredients: Array.isArray(state.ingredients) ? state.ingredients.map(strip) : [],
    recipes: Array.isArray(state.recipes) ? state.recipes.map(strip) : [],
    suppliers: Array.isArray(state.suppliers) ? state.suppliers.map(strip) : [],
    customers: Array.isArray(state.customers) ? state.customers.map(strip) : [],
    promotions: Array.isArray(state.promotions) ? state.promotions.map(strip) : [],
    combos: Array.isArray(state.combos) ? state.combos.map(strip) : [],
    loyaltyRewards: Array.isArray(state.loyaltyRewards) ? state.loyaltyRewards.map(strip) : [],
    services: Array.isArray(state.services) ? state.services.map(strip) : [],
    orders: Array.isArray(state.orders) ? state.orders.map(strip) : [],
    money: Array.isArray(state.money) ? state.money.map(strip) : [],
    debts: Array.isArray(state.debts) ? state.debts.map(strip) : [],
    losses: Array.isArray(state.losses) ? state.losses.map(strip) : [],
    notifications: Array.isArray(state.notifications) ? state.notifications.map(strip) : [],
    cashRegister: state.cashRegister,
    admin
  };
}

function buildContext(state: any): string {
  const safe = sanitizeState(state);
  const sales = safe.money.filter((m: any) => m.type === 'venta').reduce((s: number, m: any) => s + Number(m.amount || 0), 0);
  const expenses = safe.money.filter((m: any) => m.type === 'gasto').reduce((s: number, m: any) => s + Number(m.amount || 0), 0);
  const delivered = safe.orders.filter((o: any) => o.status === 'entregada');
  const deliveredRevenue = delivered.reduce((s: number, o: any) => s + Number(o.total || 0), 0);
  const deliveredCost = delivered.reduce((s: number, o: any) => s + (Array.isArray(o.items) ? o.items.reduce((a: number, i: any) => a + Number(i.cost || 0) * Number(i.quantity || 0), 0) : 0), 0);
  const losses = safe.losses.reduce((s: number, x: any) => s + Number(x.value || 0), 0);
  const lowStock = safe.ingredients.filter((i: any) => Number(i.minStock || 0) > 0 && Number(i.stock || 0) <= Number(i.minStock || 0));
  const summary = { sales, expenses, deliveredRevenue, deliveredCost, losses, estimatedProfit: deliveredRevenue - deliveredCost - expenses - losses, lowStockCount: lowStock.length, orderCount: safe.orders.length, productCount: safe.products.length, ingredientCount: safe.ingredients.length };
  return JSON.stringify({ summary, data: safe });
}

function outputTextFromResponse(payload: any): string {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  const pieces: string[] = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') pieces.push(content.text);
    }
  }
  return pieces.join('\n').trim();
}

router.post('/asesor', autenticar, async (req: AuthRequest, res: Response) => {
  if (!OPENAI_API_KEY) {
    res.status(503).json({ error: 'La IA todavía no está conectada. Falta configurar OPENAI_API_KEY en el servidor.' });
    return;
  }

  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
  const history = Array.isArray(req.body?.history) ? req.body.history.slice(-10) : [];
  if (!question) {
    res.status(400).json({ error: 'Escribe una pregunta para el asistente.' });
    return;
  }
  if (question.length > 4000) {
    res.status(400).json({ error: 'La pregunta es demasiado larga.' });
    return;
  }

  const context = buildContext(req.body?.state);
  const conversation = history.map((item: any) => ({ role: item?.role === 'assistant' ? 'assistant' : 'user', content: String(item?.content || '').slice(0, 4000) }));
  conversation.push({ role: 'user', content: question });

  const instructions = [
    'Eres el asesor de negocio de Diego Bakery.',
    'Hablas siempre en español sencillo, claro y apropiado para una persona de 16 años.',
    'Usa los datos reales del negocio que recibes. No inventes números.',
    'Cuando hagas cuentas, muestra la operación de forma corta y comprensible.',
    'Detecta errores, datos faltantes, costos extraños, stock bajo, deudas, pérdidas y posibles problemas.',
    'Explica qué significa cada resultado y qué acción concreta puede tomar el dueño.',
    'No cambies datos ni afirmes haber realizado una acción que no hiciste.',
    'Puedes ayudar con precios, costos, recetas, inventario, pedidos, clientes, promociones, caja, deudas, pérdidas y planificación.',
    'Si faltan datos, dilo claramente y pide solo el dato necesario.',
    'Prioriza exactitud y explicaciones fáciles.'
  ].join('\n');

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + OPENAI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        store: false,
        input: [
          { role: 'developer', content: [{ type: 'input_text', text: instructions }] },
          { role: 'user', content: [{ type: 'input_text', text: 'Datos actuales del negocio:\n' + context }] },
          ...conversation.map((item: any) => ({ role: item.role, content: [{ type: 'input_text', text: item.content }] }))
        ]
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('OpenAI error:', response.status, payload);
      res.status(502).json({ error: 'La IA no pudo responder ahora. Revisa la configuración de la IA.' });
      return;
    }
    const answer = outputTextFromResponse(payload);
    if (!answer) {
      res.status(502).json({ error: 'La IA respondió sin texto.' });
      return;
    }
    res.json({ answer });
  } catch (error) {
    console.error('Error en asesor IA:', error);
    res.status(502).json({ error: 'No se pudo conectar con la IA ahora.' });
  }
});

export default router;