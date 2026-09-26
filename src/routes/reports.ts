import express, { Request, Response } from 'express';
import { pool } from '../index.js';
import { adminAuth } from '../middleware/auth.js';

const router = express.Router();

/**
 * Daily sales report
 * GET /api/reports/sales?start_date=2026-09-01&end_date=2026-09-30
 */
router.get('/sales', async (req: Request, res: Response) => {
  try {
    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;

    const result = await pool.query(
      `SELECT 
        DATE(o.order_date) as date,
        COUNT(o.id) as total_orders,
        SUM(o.total) as total_revenue,
        AVG(o.total) as avg_order_value,
        COUNT(DISTINCT o.customer_id) as unique_customers
       FROM orders o
       WHERE o.order_date BETWEEN $1 AND $2 AND o.status IN ('delivered', 'to_deliver')
       GROUP BY DATE(o.order_date)
       ORDER BY DATE(o.order_date) DESC`,
      [startDate || '2026-01-01', endDate || new Date().toISOString().split('T')[0]]
    );

    res.json({
      period: { start: startDate, end: endDate },
      report: result.rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate sales report' });
  }
});

/**
 * Financial summary
 * GET /api/reports/financial?month=2026-09
 */
router.get('/financial', adminAuth, async (req: Request, res: Response) => {
  try {
    const month = req.query.month as string || new Date().toISOString().slice(0, 7);

    const revenueResult = await pool.query(
      `SELECT COALESCE(SUM(total), 0) as total FROM orders 
       WHERE order_date LIKE $1 AND status IN ('delivered', 'to_deliver')`,
      [`${month}%`]
    );

    const expensesResult = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM expenses 
       WHERE expense_date LIKE $1`,
      [`${month}%`]
    );

    const investmentsResult = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM investments 
       WHERE investment_date LIKE $1`,
      [`${month}%`]
    );

    const revenue = parseFloat(revenueResult.rows[0].total);
    const expenses = parseFloat(expensesResult.rows[0].total);
    const investments = parseFloat(investmentsResult.rows[0].total);
    const netProfit = revenue - expenses;

    res.json({
      period: month,
      revenue,
      expenses,
      investments,
      net_profit: netProfit,
      profit_margin_percent: revenue > 0 ? ((netProfit / revenue) * 100).toFixed(2) : 0,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate financial report' });
  }
});

/**
 * Recipe costing report
 * GET /api/reports/costing
 */
router.get('/costing', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.name, rc.ingredient_cost, rc.packaging_cost, rc.utilities_cost, 
              rc.labor_cost, rc.total_cost, rc.base_price, rc.profit, rc.margin_percent
       FROM recipe_costs rc
       JOIN products p ON rc.product_id = p.id
       ORDER BY p.name`
    );

    res.json({
      products: result.rows,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate costing report' });
  }
});

/**
 * Inventory report
 * GET /api/reports/inventory
 */
router.get('/inventory', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT i.*, ing.name, ing.unit, ing.unit_cost,
              CASE 
                WHEN i.quantity <= i.reorder_level THEN 'low'
                WHEN i.quantity > i.reorder_level * 2 THEN 'high'
                ELSE 'normal'
              END as status
       FROM inventory i
       JOIN ingredients ing ON i.ingredient_id = ing.id
       ORDER BY status DESC, ing.name`
    );

    res.json({
      items: result.rows,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate inventory report' });
  }
});

/**
 * Losses/Waste report
 * GET /api/reports/losses?start_date=2026-09-01&end_date=2026-09-30
 */
router.get('/losses', async (req: Request, res: Response) => {
  try {
    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;

    const result = await pool.query(
      `SELECT l.*, p.name as product_name, i.name as ingredient_name
       FROM losses l
       LEFT JOIN products p ON l.product_id = p.id
       LEFT JOIN ingredients i ON l.ingredient_id = i.id
       WHERE l.loss_date BETWEEN $1 AND $2
       ORDER BY l.loss_date DESC`,
      [startDate || '2026-01-01', endDate || new Date().toISOString().split('T')[0]]
    );

    const totalLossValue = result.rows.reduce((sum: number, row: any) => sum + (parseFloat(row.loss_value) || 0), 0);

    res.json({
      period: { start: startDate, end: endDate },
      total_loss_value: totalLossValue,
      items: result.rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate losses report' });
  }
});

export default router;

