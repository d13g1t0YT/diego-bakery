import { Router, Response } from 'express';
import { pool } from '../db/connection.js';
import { autenticar, AuthRequest } from '../middleware/auth.js';

const router = Router();

function nonEmptyString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v.length > 0 && v.length <= max ? v : null;
}

function isItems(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value) && value.length > 0 && value.every(item => typeof item === 'object' && item !== null);
}

router.post('/', async (req, res: Response) => {
  try {
    const clientRef = nonEmptyString(req.body?.cliente_ref, 120);
    const name = nonEmptyString(req.body?.cliente_nombre, 255);
    const phone = nonEmptyString(req.body?.telefono, 20);
    const address = typeof req.body?.direccion === 'string' ? req.body.direccion.trim().slice(0, 2000) : null;
    const notes = typeof req.body?.notas === 'string' ? req.body.notas.trim().slice(0, 4000) : null;
    const items = req.body?.items;
    const subtotal = Number(req.body?.subtotal);
    const discount = Number(req.body?.descuento || 0);
    const total = Number(req.body?.total);

    if (!name || !/^\d{6,20}$/.test(phone || '') || !isItems(items)) {
      res.status(400).json({ error: 'Datos del pedido inválidos' });
      return;
    }

    if (!Number.isFinite(subtotal) || subtotal < 0 || !Number.isFinite(discount) || discount < 0 || !Number.isFinite(total) || total < 0) {
      res.status(400).json({ error: 'Importes inválidos' });
      return;
    }

    const result = await pool.query(
      'INSERT INTO pedidos_publicos (cliente_ref, cliente_nombre, telefono, direccion, notas, items, subtotal, descuento, total) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9) ON CONFLICT (cliente_ref) DO UPDATE SET actualizado_en = CURRENT_TIMESTAMP RETURNING *',
      [clientRef, name, phone, address, notes, JSON.stringify(items), subtotal, discount, total]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error al crear pedido público:', err);
    res.status(500).json({ error: 'Error al crear pedido' });
  }
});

router.get('/', autenticar, async (_req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM pedidos_publicos ORDER BY creado_en DESC LIMIT 500');
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener pedidos públicos:', err);
    res.status(500).json({ error: 'Error al obtener pedidos' });
  }
});

router.put('/:id', autenticar, async (req: AuthRequest, res: Response) => {
  try {
    const estado = nonEmptyString(req.body?.estado, 50);
    if (!estado) {
      res.status(400).json({ error: 'Estado inválido' });
      return;
    }
    const result = await pool.query(
      'UPDATE pedidos_publicos SET estado = $1, actualizado_en = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [estado, req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Pedido no encontrado' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error al actualizar pedido público:', err);
    res.status(500).json({ error: 'Error al actualizar pedido' });
  }
});

export default router;