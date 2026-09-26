import express, { Request, Response } from 'express';
import { pool } from '../index.js';
import { adminAuth, AuthRequest } from '../middleware/auth.js';

const router = express.Router();

/**
 * Admin login - PIN or biometric
 * POST /api/admin/login
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { phone, pin, biometric_token } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Phone number required' });
    }

    // For now, simple PIN validation
    const adminPin = process.env.ADMIN_PIN || '1234';
    if (pin !== adminPin && !biometric_token) {
      return res.status(401).json({ error: 'Invalid PIN or biometric token' });
    }

    // TODO: Create/update session in admin_sessions table
    const token = Buffer.from(`${phone}:${Date.now()}`).toString('base64');

    res.json({
      success: true,
      token,
      phone,
      message: 'Login successful',
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * Admin dashboard summary
 * GET /api/admin/dashboard
 */
router.get('/dashboard', adminAuth, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM orders WHERE status != 'delivered' AND status != 'canceled') as pending_orders,
        (SELECT COUNT(*) FROM customers) as total_customers,
        (SELECT SUM(total) FROM orders WHERE order_date = CURRENT_DATE) as today_revenue,
        (SELECT COUNT(*) FROM products WHERE active = true) as active_products
    `);

    res.json({
      admin: req.adminId,
      dashboard: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Dashboard fetch failed' });
  }
});

/**
 * Admin settings
 * GET/POST /api/admin/settings
 */
router.get('/settings', adminAuth, async (req: AuthRequest, res: Response) => {
  res.json({
    admin_mode: true,
    offline_first: true,
    languages: ['es', 'en'],
    current_language: 'es',
    features: {
      yape_payments: true,
      plin_payments: true,
      cash_proof_upload: true,
      loyalty_program: true,
      costing_engine: true,
    },
  });
});

export default router;

