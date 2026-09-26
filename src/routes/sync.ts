import express, { Request, Response } from 'express';
import { pool } from '../index.js';

const router = express.Router();

/**
 * Sync endpoint for offline-first clients
 * Returns all data since last sync version
 * POST /api/sync with { lastSync: timestamp, entities: ['products', 'orders', ...] }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { lastSync, entities } = req.body;
    const syncData: any = {};

    // Build dynamic query based on requested entities
    const supportedEntities: any = {
      products: 'SELECT * FROM products WHERE sync_version > $1 OR updated_at > $2',
      ingredients: 'SELECT * FROM ingredients WHERE sync_version > $1 OR updated_at > $2',
      recipes: 'SELECT * FROM recipes WHERE sync_version > $1 OR updated_at > $2',
      customers: 'SELECT * FROM customers WHERE sync_version > $1 OR updated_at > $2',
      orders: 'SELECT * FROM orders WHERE sync_version > $1 OR updated_at > $2',
      order_items: 'SELECT * FROM order_items WHERE sync_version > $1',
      payments: 'SELECT * FROM payments WHERE sync_version > $1 OR updated_at > $2',
      inventory: 'SELECT * FROM inventory WHERE last_updated > $2',
      inventory_movements: 'SELECT * FROM inventory_movements WHERE sync_version > $1 OR created_at > $2',
      expenses: 'SELECT * FROM expenses WHERE sync_version > $1 OR created_at > $2',
      investments: 'SELECT * FROM investments WHERE sync_version > $1 OR created_at > $2',
      debts: 'SELECT * FROM debts WHERE sync_version > $1 OR updated_at > $2',
      losses: 'SELECT * FROM losses WHERE sync_version > $1 OR created_at > $2',
      promotions: 'SELECT * FROM promotions WHERE sync_version > $1 OR updated_at > $2',
      loyalty_members: 'SELECT * FROM loyalty_members WHERE sync_version > $1 OR updated_at > $2',
    };

    const version = lastSync || 0;
    const timestamp = new Date(lastSync * 1000 || 0).toISOString();

    if (entities && Array.isArray(entities)) {
      for (const entity of entities) {
        if (supportedEntities[entity]) {
          const result = await pool.query(supportedEntities[entity], [version, timestamp]);
          syncData[entity] = result.rows;
        }
      }
    }

    res.json({
      success: true,
      syncVersion: Math.floor(Date.now() / 1000),
      data: syncData,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Sync failed' });
  }
});

/**
 * Get sync metadata
 * GET /api/sync/metadata
 */
router.get('/metadata', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM sync_metadata ORDER BY entity_type'
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch sync metadata' });
  }
});

export default router;

