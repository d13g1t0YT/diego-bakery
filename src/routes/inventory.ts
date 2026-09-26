import express, { Request, Response } from 'express';
import { pool } from '../index.js';
import { adminAuth } from '../middleware/auth.js';

const router = express.Router();

// GET current inventory
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT i.*, ing.name, ing.unit, ing.unit_cost 
       FROM inventory i 
       JOIN ingredients ing ON i.ingredient_id = ing.id 
       ORDER BY ing.name`
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// GET inventory movements (audit trail)
router.get('/movements/:ingredientId', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM inventory_movements 
       WHERE ingredient_id = $1 
       ORDER BY created_at DESC`,
      [req.params.ingredientId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch movements' });
  }
});

// POST movement (purchase, usage, waste, adjustment)
router.post('/movement', adminAuth, async (req: Request, res: Response) => {
  try {
    const { ingredient_id, movement_type, quantity, reference_id, notes } = req.body;

    // Record movement
    const movementResult = await pool.query(
      `INSERT INTO inventory_movements (ingredient_id, movement_type, quantity, reference_id, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [ingredient_id, movement_type, quantity, reference_id, notes]
    );

    // Update inventory
    await pool.query(
      `INSERT INTO inventory (ingredient_id, quantity)
       VALUES ($1, $2)
       ON CONFLICT (ingredient_id) DO UPDATE SET
         quantity = inventory.quantity + $2, last_updated = CURRENT_TIMESTAMP`,
      [ingredient_id, movement_type === 'purchase' ? quantity : -quantity]
    );

    res.status(201).json(movementResult.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to record movement' });
  }
});

// PUT adjust inventory
router.put('/:ingredientId', adminAuth, async (req: Request, res: Response) => {
  try {
    const { quantity, reorder_level } = req.body;
    const result = await pool.query(
      `UPDATE inventory 
       SET quantity = $1, reorder_level = COALESCE($2, reorder_level), last_updated = CURRENT_TIMESTAMP
       WHERE ingredient_id = $3 RETURNING *`,
      [quantity, reorder_level, req.params.ingredientId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update inventory' });
  }
});

export default router;

