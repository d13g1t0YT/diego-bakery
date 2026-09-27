import { Router, Response } from 'express';
import { pool } from '../db/connection.js';
import { autenticar, AuthRequest } from '../middleware/auth.js';

const router = Router();

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const REQUIRED_ARRAYS = [
  'products', 'ingredients', 'recipes', 'suppliers', 'customers',
  'promotions', 'combos', 'loyaltyRewards', 'services', 'orders',
  'money', 'debts', 'losses', 'notifications', 'reviews'
];

function sanitizeState(input: Record<string, any>): Record<string, any> {
  const state = JSON.parse(JSON.stringify(input));
  if (state.admin && isObject(state.admin)) {
    delete state.admin.token;
  }
  delete state.token;
  return state;
}

router.get('/', autenticar, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT contenido, actualizado_en FROM estados_negocio WHERE usuario_id = $1',
      [req.usuario!.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'No existe estado en la nube' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error al obtener estado:', err);
    res.status(500).json({ error: 'Error al obtener estado' });
  }
});

router.put('/', autenticar, async (req: AuthRequest, res: Response) => {
  try {
    const state = req.body?.state;

    if (!isObject(state)) {
      res.status(400).json({ error: 'Estado inválido' });
      return;
    }

    for (const key of REQUIRED_ARRAYS) {
      if (!Array.isArray(state[key])) {
        res.status(400).json({ error: 'Estado inválido: falta la colección ' + key });
        return;
      }
    }

    if (!isObject(state.settings) || !isObject(state.cashRegister)) {
      res.status(400).json({ error: 'Estado inválido: configuración incompleta' });
      return;
    }

    const safeState = sanitizeState(state);
    const serialized = JSON.stringify(safeState);

    if (Buffer.byteLength(serialized, 'utf8') > 900_000) {
      res.status(413).json({ error: 'El estado del negocio es demasiado grande.' });
      return;
    }

    await pool.query(
      'INSERT INTO estados_negocio (usuario_id, contenido, actualizado_en) VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP) ON CONFLICT (usuario_id) DO UPDATE SET contenido = EXCLUDED.contenido, actualizado_en = CURRENT_TIMESTAMP',
      [req.usuario!.id, serialized]
    );

    res.json({ ok: true, actualizado_en: new Date().toISOString() });
  } catch (err) {
    console.error('Error al guardar estado:', err);
    res.status(500).json({ error: 'Error al guardar estado' });
  }
});

export default router;