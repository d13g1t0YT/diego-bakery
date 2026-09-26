import express, { Request, Response } from 'express';
import { pool } from '../index.js';
import { adminAuth } from '../middleware/auth.js';

const router = express.Router();

// GET debts
router.get('/', async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string;
    let query = 'SELECT * FROM debts';
    const params: any[] = [];

    if (status) {
      query += ` WHERE status = $1`;
      params.push(status);
    }

    query += ` ORDER BY due_date ASC, debt_date DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch debts' });
  }
});

// POST new debt
router.post('/', adminAuth, async (req: Request, res: Response) => {
  try {
    const { debtor_type, debtor_id, amount, description, due_date, debt_date } = req.body;
    const result = await pool.query(
      `INSERT INTO debts (debtor_type, debtor_id, amount, description, due_date, debt_date)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [debtor_type, debtor_id, amount, description, due_date, debt_date]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create debt' });
  }
});

// PUT update debt status
router.put('/:id', adminAuth, async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const result = await pool.query(
      `UPDATE debts 
       SET status = $1, sync_version = sync_version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Debt not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update debt' });
  }
});

export default router;

