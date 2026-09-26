import { Router, Response } from 'express';
import { pool } from '../db/connection.js';
import { autenticar, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get('/', autenticar, async (_req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM productos ORDER BY nombre');
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener productos:', err);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

router.post('/', autenticar, async (req: AuthRequest, res: Response) => {
  try {
    const nombre = typeof req.body?.nombre === 'string' ? req.body.nombre.trim() : '';
    const descripcion = typeof req.body?.descripcion === 'string' ? req.body.descripcion.trim() : null;
    const precioVenta = Number(req.body?.precio_venta);

    if (!nombre || !Number.isFinite(precioVenta) || precioVenta <= 0) {
      res.status(400).json({ error: 'Nombre y precio válido requeridos' });
      return;
    }

    const result = await pool.query(
      'INSERT INTO productos (nombre, descripcion, precio_venta) VALUES ($1, $2, $3) RETURNING *',
      [nombre, descripcion || null, precioVenta]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error al crear producto:', err);
    res.status(500).json({ error: 'Error al crear producto' });
  }
});

router.put('/:id', autenticar, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const nombre = typeof req.body?.nombre === 'string' ? req.body.nombre.trim() : undefined;
    const descripcion = typeof req.body?.descripcion === 'string' ? req.body.descripcion.trim() : undefined;
    const precioVenta = req.body?.precio_venta === undefined ? undefined : Number(req.body.precio_venta);
    const activo = req.body?.activo === undefined ? undefined : Boolean(req.body.activo);

    if (precioVenta !== undefined && (!Number.isFinite(precioVenta) || precioVenta <= 0)) {
      res.status(400).json({ error: 'Precio inválido' });
      return;
    }

    const result = await pool.query(
      'UPDATE productos SET nombre = COALESCE($1, nombre), descripcion = COALESCE($2, descripcion), precio_venta = COALESCE($3, precio_venta), activo = COALESCE($4, activo), actualizado_en = CURRENT_TIMESTAMP WHERE id = $5 RETURNING *',
      [nombre || null, descripcion || null, precioVenta ?? null, activo ?? null, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Producto no encontrado' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error al actualizar producto:', err);
    res.status(500).json({ error: 'Error al actualizar producto' });
  }
});

router.delete('/:id', autenticar, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'UPDATE productos SET activo = false, actualizado_en = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Producto no encontrado' });
      return;
    }

    res.json({ mensaje: 'Producto archivado', producto: result.rows[0] });
  } catch (err) {
    console.error('Error al archivar producto:', err);
    res.status(500).json({ error: 'Error al archivar producto' });
  }
});

export default router;
