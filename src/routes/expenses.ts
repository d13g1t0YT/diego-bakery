import express, { Request, Response } from 'express';
import { pool } from '../index.js';
import { adminAuth } from '../middleware/auth.js';

const router = express.Router();

// GET expenses
router.get('/', async (req: Request, res: Response) => {
  try {
    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;

    let query = 'SELECT * FROM expenses';
    const params: any[] = [];

    if (startDate && endDate) {
      query += ` WHERE expense_date BETWEEN $1 AND $2`;
      params.push(startDate, endDate);
    }

    query += ` ORDER BY expense_date DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

// POST new expense
router.post('/', adminAuth, async (req: Request, res: Response) => {
  try {
    const { category, description, amount, expense_date } = req.body;
    const result = await pool.query(
      `INSERT INTO expenses (category, description, amount, expense_date)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [category, description, amount, expense_date]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create expense' });
  }
});

export default router;

