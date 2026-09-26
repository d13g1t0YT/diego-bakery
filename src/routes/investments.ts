import express, { Request, Response } from 'express';
import { pool } from '../index.js';
import { adminAuth } from '../middleware/auth.js';

const router = express.Router();

// GET investments
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM investments ORDER BY investment_date DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch investments' });
  }
});

// POST new investment
router.post('/', adminAuth, async (req: Request, res: Response) => {
  try {
    const { description, amount, investment_date } = req.body;
    const result = await pool.query(
      `INSERT INTO investments (description, amount, investment_date)
       VALUES ($1, $2, $3) RETURNING *`,
      [description, amount, investment_date]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create investment' });
  }
});

export default router;

