import { Router, Response } from 'express';
import { pool } from '../db/connection.js';
import { autenticar, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.post('/', autenticar, async (req: AuthRequest, res: Response) => {
  try {
    const state = req.body?.state;
    if (!state || typeof state !== 'object' || !Array.isArray(state.products)) {
      res.status(400).json({ error: 'Respaldo inválido' });
      return;
    }

    await pool.query(
      'INSERT INTO copias_seguridad (usuario_id, contenido) VALUES ($1, $2::jsonb)',
      [req.usuario!.id, JSON.stringify(state)]
    );

    await pool.query(
      'DELETE FROM copias_seguridad WHERE usuario_id = $1 AND id NOT IN (SELECT id FROM copias_seguridad WHERE usuario_id = $1 ORDER BY creado_en DESC LIMIT 30)',
      [req.usuario!.id]
    );

    res.status(201).json({ ok: true, creado_en: new Date().toISOString() });
  } catch (err) {
    console.error('Error al crear respaldo:', err);
    res.status(500).json({ error: 'Error al crear respaldo' });
  }
});

router.get('/latest', autenticar, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT contenido, creado_en FROM copias_seguridad WHERE usuario_id = $1 ORDER BY creado_en DESC LIMIT 1',
      [req.usuario!.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'No existe un respaldo' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error al obtener respaldo:', err);
    res.status(500).json({ error: 'Error al obtener respaldo' });
  }
});

export default router;
