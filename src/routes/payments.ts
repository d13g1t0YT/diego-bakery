import express, { Request, Response } from 'express';
import { pool } from '../index.js';
import { adminAuth } from '../middleware/auth.js';

const router = express.Router();

// GET payments
router.get('/', async (req: Request, res: Response) => {
  try {
    const orderId = req.query.order_id as string;
    let query = 'SELECT * FROM payments';
    const params: any[] = [];

    if (orderId) {
      query += ' WHERE order_id = $1';
      params.push(orderId);
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// POST new payment (Yape, Plin, or cash)
router.post('/', adminAuth, async (req: Request, res: Response) => {
  try {
    const {
      order_id,
      amount,
      payment_method, // 'yape', 'plin', 'cash'
      yape_reference,
      plin_reference,
      cash_proof_url,
    } = req.body;

    if (!['yape', 'plin', 'cash'].includes(payment_method)) {
      return res.status(400).json({ error: 'Invalid payment method' });
    }

    const result = await pool.query(
      `INSERT INTO payments (order_id, amount, payment_method, yape_reference, plin_reference, cash_proof_url)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [order_id, amount, payment_method, yape_reference, plin_reference, cash_proof_url]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

// PUT confirm cash payment (admin verifies proof)
router.put('/:id/confirm', adminAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `UPDATE payments 
       SET admin_confirmed = true, sync_version = sync_version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to confirm payment' });
  }
});

export default router;

