import express, { Request, Response } from 'express';
import { pool } from '../index.js';
import { adminAuth } from '../middleware/auth.js';

const router = express.Router();

// GET all products
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM products WHERE active = true ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET product by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT p.*, rc.* FROM products p LEFT JOIN recipe_costs rc ON p.id = rc.product_id WHERE p.id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// POST new product
router.post('/', adminAuth, async (req: Request, res: Response) => {
  try {
    const { name, sku, unit, price, category } = req.body;
    const result = await pool.query(
      `INSERT INTO products (name, sku, unit, price, category) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, sku, unit, price, category]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// PUT update product
router.put('/:id', adminAuth, async (req: Request, res: Response) => {
  try {
    const { name, sku, unit, price, category, cost, active } = req.body;
    const result = await pool.query(
      `UPDATE products 
       SET name = COALESCE($2, name), sku = COALESCE($3, sku), unit = COALESCE($4, unit),
           price = COALESCE($5, price), cost = COALESCE($6, cost), category = COALESCE($7, category),
           active = COALESCE($8, active), sync_version = sync_version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [req.params.id, name, sku, unit, price, cost, category, active]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

export default router;

