import express, { Request, Response } from 'express';
import { pool } from '../index.js';
import { adminAuth } from '../middleware/auth.js';

const router = express.Router();

// GET losses
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT l.*, p.name as product_name, i.name as ingredient_name 
       FROM losses l 
       LEFT JOIN products p ON l.product_id = p.id 
       LEFT JOIN ingredients i ON l.ingredient_id = i.id 
       ORDER BY l.loss_date DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch losses' });
  }
});

// POST new loss/waste
router.post('/', adminAuth, async (req: Request, res: Response) => {
  try {
    const { product_id, ingredient_id, quantity, reason, loss_value, loss_date } = req.body;
    const result = await pool.query(
      `INSERT INTO losses (product_id, ingredient_id, quantity, reason, loss_value, loss_date)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [product_id, ingredient_id, quantity, reason, loss_value, loss_date]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to record loss' });
  }
});

export default router;

