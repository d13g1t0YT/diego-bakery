import { Router, Response } from 'express';
import { pool } from '../db/connection.js';
import { autenticar, AuthRequest } from '../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// GET /api/productos - Listar productos
router.get('/', autenticar, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM productos ORDER BY nombre');
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener productos:', err);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

// POST /api/productos - Crear producto
router.post('/', autenticar, async (req: AuthRequest, res: Response) => {
  try {
    const { nombre, descripcion, precio_venta } = req.body;

    if (!nombre || !precio_venta) {
      return res.status(400).json({ error: 'Nombre y precio requeridos' });
    }

    const id = uuidv4();
    const result = await pool.query(
      'INSERT INTO productos (id, nombre, descripcion, precio_venta) VALUES ($1, $2, $3, $4) RETURNING *',
      [id, nombre, descripcion || null, precio_venta]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error al crear producto:', err);
    res.status(500).json({ error: 'Error al crear producto' });
  }
});

// PUT /api/productos/:id - Actualizar producto
router.put('/:id', autenticar, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, precio_venta, activo } = req.body;

    const result = await pool.query(
      'UPDATE productos SET nombre = COALESCE($1, nombre), descripcion = COALESCE($2, descripcion), precio_venta = COALESCE($3, precio_venta), activo = COALESCE($4, activo), actualizado_en = CURRENT_TIMESTAMP WHERE id = $5 RETURNING *',
      [nombre, descripcion, precio_venta, activo, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error al actualizar producto:', err);
    res.status(500).json({ error: 'Error al actualizar producto' });
  }
});

// DELETE /api/productos/:id - Eliminar producto
router.delete('/:id', autenticar, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM productos WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.json({ mensaje: 'Producto eliminado' });
  } catch (err) {
    console.error('Error al eliminar producto:', err);
    res.status(500).json({ error: 'Error al eliminar producto' });
  }
});

export default router;

