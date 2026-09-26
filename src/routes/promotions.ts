import express, { Request, Response } from 'express';
import { pool } from '../index.js';
import { adminAuth } from '../middleware/auth.js';

const router = express.Router();

// GET active promotions
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM promotions 
       WHERE active = true AND (end_date IS NULL OR end_date >= CURRENT_DATE)
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch promotions' });
  }
});

// POST new promotion
router.post('/', adminAuth, async (req: Request, res: Response) => {
  try {
    const { name, code, discount_type, discount_value, start_date, end_date } = req.body;
    const result = await pool.query(
      `INSERT INTO promotions (name, code, discount_type, discount_value, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, code, discount_type, discount_value, start_date, end_date]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create promotion' });
  }
});

// PUT update promotion
router.put('/:id', adminAuth, async (req: Request, res: Response) => {
  try {
    const { name, code, discount_type, discount_value, start_date, end_date, active } = req.body;
    const result = await pool.query(
      `UPDATE promotions 
       SET name = COALESCE($2, name), code = COALESCE($3, code), discount_type = COALESCE($4, discount_type),
           discount_value = COALESCE($5, discount_value), start_date = COALESCE($6, start_date),
           end_date = COALESCE($7, end_date), active = COALESCE($8, active),
           sync_version = sync_version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [req.params.id, name, code, discount_type, discount_value, start_date, end_date, active]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Promotion not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update promotion' });
  }
});

export default router;

