import express, { Request, Response } from 'express';
import { pool } from '../index.js';
import { adminAuth } from '../middleware/auth.js';

const router = express.Router();

// GET all ingredients
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM ingredients WHERE active = true ORDER BY name'
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch ingredients' });
  }
});

// GET ingredient by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM ingredients WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ingredient not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch ingredient' });
  }
});

// POST new ingredient
router.post('/', adminAuth, async (req: Request, res: Response) => {
  try {
    const { name, unit, unit_cost, packaging_cost, supplier } = req.body;
    const result = await pool.query(
      `INSERT INTO ingredients (name, unit, unit_cost, packaging_cost, supplier) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, unit, unit_cost, packaging_cost, supplier]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create ingredient' });
  }
});

// PUT update ingredient
router.put('/:id', adminAuth, async (req: Request, res: Response) => {
  try {
    const { name, unit, unit_cost, packaging_cost, supplier, active } = req.body;
    const result = await pool.query(
      `UPDATE ingredients 
       SET name = COALESCE($2, name), unit = COALESCE($3, unit), unit_cost = COALESCE($4, unit_cost),
           packaging_cost = COALESCE($5, packaging_cost), supplier = COALESCE($6, supplier),
           active = COALESCE($7, active), sync_version = sync_version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [req.params.id, name, unit, unit_cost, packaging_cost, supplier, active]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ingredient not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update ingredient' });
  }
});

export default router;

