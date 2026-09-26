import express, { Request, Response } from 'express';
import { pool } from '../index.js';
import { adminAuth } from '../middleware/auth.js';

const router = express.Router();

// GET loyalty member
router.get('/:customerId', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT lm.*, c.name, c.phone FROM loyalty_members lm 
       JOIN customers c ON lm.customer_id = c.id 
       WHERE lm.customer_id = $1`,
      [req.params.customerId]
    );

    if (result.rows.length === 0) {
      // Create default loyalty member
      const createResult = await pool.query(
        `INSERT INTO loyalty_members (customer_id, points, tier, total_spent)
         VALUES ($1, 0, $2, 0) RETURNING *`,
        [req.params.customerId, 'bronze']
      );
      return res.json(createResult.rows[0]);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch loyalty member' });
  }
});

// POST add points
router.post('/:customerId/points', adminAuth, async (req: Request, res: Response) => {
  try {
    const { points, reason } = req.body;

    const result = await pool.query(
      `UPDATE loyalty_members 
       SET points = points + $1, sync_version = sync_version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE customer_id = $2 RETURNING *`,
      [points, req.params.customerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Loyalty member not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add points' });
  }
});

// PUT update tier or balance
router.put('/:customerId', adminAuth, async (req: Request, res: Response) => {
  try {
    const { tier, total_spent } = req.body;

    const result = await pool.query(
      `UPDATE loyalty_members 
       SET tier = COALESCE($1, tier), total_spent = COALESCE($2, total_spent),
           sync_version = sync_version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE customer_id = $3 RETURNING *`,
      [tier, total_spent, req.params.customerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Loyalty member not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update loyalty member' });
  }
});

export default router;

