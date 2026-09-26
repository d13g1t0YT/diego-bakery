import { Router, Response } from 'express';
import { pool } from '../db/connection.js';
import { autenticar, AuthRequest } from '../middleware/auth.js';

const router = Router();

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

    if (!isObject(state) || !Array.isArray(state.products) || !Array.isArray(state.orders)) {
      res.status(400).json({ error: 'Estado inválido' });
      return;
    }

    await pool.query(
      'INSERT INTO estados_negocio (usuario_id, contenido, actualizado_en) VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP) ON CONFLICT (usuario_id) DO UPDATE SET contenido = EXCLUDED.contenido, actualizado_en = CURRENT_TIMESTAMP',
      [req.usuario!.id, JSON.stringify(state)]
    );

    res.json({ ok: true, actualizado_en: new Date().toISOString() });
  } catch (err) {
    console.error('Error al guardar estado:', err);
    res.status(500).json({ error: 'Error al guardar estado' });
  }
});

export default router;