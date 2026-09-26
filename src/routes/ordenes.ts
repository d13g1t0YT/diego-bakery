import { Router, Response } from 'express';
import { pool } from '../db/connection.js';
import { autenticar, AuthRequest } from '../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// GET /api/ordenes - Listar órdenes
router.get('/', autenticar, async (req: AuthRequest, res: Response) => {
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

// POST /api/ordenes - Crear orden
router.post('/', autenticar, async (req: AuthRequest, res: Response) => {
  try {
    const { cliente_id, notas } = req.body;
    const id = uuidv4();

    const result = await pool.query(
      'INSERT INTO ordenes (id, cliente_id, estado, notas) VALUES ($1, $2, $3, $4) RETURNING *',
      [id, cliente_id || null, 'pendiente', notas || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error al crear orden:', err);
    res.status(500).json({ error: 'Error al crear orden' });
  }
});

// PUT /api/ordenes/:id - Actualizar estado de orden
router.put('/:id', autenticar, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    const estadosValidos = ['pendiente', 'esperando_confirmacion', 'comprando_ingredientes', 'preparando', 'lista', 'por_entregar', 'entregada', 'no_entregada', 'cancelada'];

    if (!estadosValidos.includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    const result = await pool.query(
      'UPDATE ordenes SET estado = $1, actualizado_en = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [estado, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error al actualizar orden:', err);
    res.status(500).json({ error: 'Error al actualizar orden' });
  }
});

export default router;

