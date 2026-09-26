import { Router, Response } from 'express';
import { pool } from '../db/connection.js';
import { autenticar, AuthRequest } from '../middleware/auth.js';

const router = Router();

const estadosValidos = [
  'pendiente',
  'esperando_confirmacion',
  'comprando_ingredientes',
  'preparando',
  'lista',
  'por_entregar',
  'entregada',
  'no_entregada',
  'cancelada',
  'archivada'
] as const;

router.get('/', autenticar, async (_req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT o.*, c.nombre as cliente_nombre, c.apellido as cliente_apellido
      FROM ordenes o
      LEFT JOIN clientes c ON o.cliente_id = c.id
      ORDER BY o.fecha_pedido DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener órdenes:', err);
    res.status(500).json({ error: 'Error al obtener órdenes' });
  }
});

router.post('/', autenticar, async (req: AuthRequest, res: Response) => {
  try {
    const clienteId = req.body?.cliente_id || null;
    const notas = typeof req.body?.notas === 'string' ? req.body.notas.trim() : null;

    if (clienteId !== null && typeof clienteId !== 'string') {
      res.status(400).json({ error: 'cliente_id inválido' });
      return;
    }

    const result = await pool.query(
      'INSERT INTO ordenes (cliente_id, estado, notas) VALUES ($1, $2, $3) RETURNING *',
      [clienteId, 'pendiente', notas || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error al crear orden:', err);
    res.status(500).json({ error: 'Error al crear orden' });
  }
});

router.put('/:id', autenticar, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const estado = typeof req.body?.estado === 'string' ? req.body.estado : '';

    if (!estadosValidos.includes(estado as typeof estadosValidos[number])) {
      res.status(400).json({ error: 'Estado inválido' });
      return;
    }

    const result = await pool.query(
      'UPDATE ordenes SET estado = $1, actualizado_en = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [estado, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Orden no encontrada' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error al actualizar orden:', err);
    res.status(500).json({ error: 'Error al actualizar orden' });
  }
});

export default router;
