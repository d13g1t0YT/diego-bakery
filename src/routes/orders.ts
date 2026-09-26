import express, { Request, Response } from 'express';
import { pool } from '../index.js';
import { adminAuth } from '../middleware/auth.js';

const router = express.Router();

// GET all orders
router.get('/', async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string;
    let query = `SELECT o.*, c.name, c.phone FROM orders o 
                 LEFT JOIN customers c ON o.customer_id = c.id`;
    const params: any[] = [];

    if (status) {
      query += ` WHERE o.status = $1`;
      params.push(status);
    }

    query += ` ORDER BY o.order_date DESC, o.created_at DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// GET order by ID with items
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const orderResult = await pool.query(
      `SELECT o.*, c.name, c.phone, c.address FROM orders o 
       LEFT JOIN customers c ON o.customer_id = c.id 
       WHERE o.id = $1`,
      [req.params.id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const itemsResult = await pool.query(
      `SELECT oi.*, p.name, p.unit FROM order_items oi 
       JOIN products p ON oi.product_id = p.id 
       WHERE oi.order_id = $1`,
      [req.params.id]
    );

    const paymentsResult = await pool.query(
      'SELECT * FROM payments WHERE order_id = $1',
      [req.params.id]
    );

    res.json({
      ...orderResult.rows[0],
      items: itemsResult.rows,
      payments: paymentsResult.rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// POST new order
router.post('/', adminAuth, async (req: Request, res: Response) => {
  try {
    const { customer_id, order_date, required_date, items, notes } = req.body;

    // Create order
    const orderResult = await pool.query(
      `INSERT INTO orders (customer_id, order_date, required_date, status, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [customer_id, order_date, required_date, 'pending', notes]
    );

    const orderId = orderResult.rows[0].id;
    let total = 0;

    // Add items
    if (items && items.length > 0) {
      for (const item of items) {
        const subtotal = item.quantity * item.unit_price;
        total += subtotal;

        await pool.query(
          `INSERT INTO order_items (order_id, product_id, quantity, unit_price, subtotal)
           VALUES ($1, $2, $3, $4, $5)`,
          [orderId, item.product_id, item.quantity, item.unit_price, subtotal]
        );
      }
    }

    // Update order total
    await pool.query(
      'UPDATE orders SET total = $1 WHERE id = $2',
      [total, orderId]
    );

    res.status(201).json(orderResult.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// PUT update order status
router.put('/:id/status', adminAuth, async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const validStatuses = [
      'pending', 'awaiting_confirmation', 'buying_ingredients', 'preparing',
      'ready', 'to_deliver', 'delivered', 'not_delivered', 'canceled'
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await pool.query(
      `UPDATE orders 
       SET status = $1, sync_version = sync_version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

export default router;

