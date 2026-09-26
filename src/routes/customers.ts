import express, { Request, Response } from 'express';
import { pool } from '../index.js';
import { adminAuth } from '../middleware/auth.js';

const router = express.Router();

// GET all customers
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM customers WHERE active = true ORDER BY name'
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// GET customer by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM customers WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
});

// POST new customer
router.post('/', adminAuth, async (req: Request, res: Response) => {
  try {
    const { name, surname, phone, address, reference } = req.body;
    const result = await pool.query(
      `INSERT INTO customers (name, surname, phone, address, reference) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, surname, phone, address, reference]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// PUT update customer
router.put('/:id', adminAuth, async (req: Request, res: Response) => {
  try {
    const { name, surname, phone, address, reference, balance, active } = req.body;
    const result = await pool.query(
      `UPDATE customers 
       SET name = COALESCE($2, name), surname = COALESCE($3, surname), phone = COALESCE($4, phone),
           address = COALESCE($5, address), reference = COALESCE($6, reference), 
           balance = COALESCE($7, balance), active = COALESCE($8, active),
           sync_version = sync_version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [req.params.id, name, surname, phone, address, reference, balance, active]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

export default router;

