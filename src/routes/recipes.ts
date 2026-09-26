import express, { Request, Response } from 'express';
import { pool } from '../index.js';
import { adminAuth } from '../middleware/auth.js';

const router = express.Router();

// GET recipe for product (ingredients + costing)
router.get('/:productId', async (req: Request, res: Response) => {
  try {
    const ingredients = await pool.query(
      `SELECT r.*, i.name, i.unit, i.unit_cost, i.packaging_cost 
       FROM recipes r 
       JOIN ingredients i ON r.ingredient_id = i.id 
       WHERE r.product_id = $1`,
      [req.params.productId]
    );

    const costs = await pool.query(
      'SELECT * FROM recipe_costs WHERE product_id = $1',
      [req.params.productId]
    );

    res.json({
      product_id: req.params.productId,
      ingredients: ingredients.rows,
      costs: costs.rows[0] || null,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch recipe' });
  }
});

// POST add ingredient to recipe
router.post('/:productId', adminAuth, async (req: Request, res: Response) => {
  try {
    const { ingredient_id, quantity, unit } = req.body;
    const result = await pool.query(
      `INSERT INTO recipes (product_id, ingredient_id, quantity, unit) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.productId, ingredient_id, quantity, unit]
    );
    
    // Recalculate recipe costs
    await recalculateCosts(req.params.productId);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add recipe ingredient' });
  }
});

// PUT update recipe item
router.put('/:productId/:ingredientId', adminAuth, async (req: Request, res: Response) => {
  try {
    const { quantity, unit } = req.body;
    const result = await pool.query(
      `UPDATE recipes 
       SET quantity = $1, unit = COALESCE($2, unit), sync_version = sync_version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE product_id = $3 AND ingredient_id = $4 RETURNING *`,
      [quantity, unit, req.params.productId, req.params.ingredientId]
    );
    
    await recalculateCosts(req.params.productId);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update recipe' });
  }
});

// DELETE recipe item
router.delete('/:productId/:ingredientId', adminAuth, async (req: Request, res: Response) => {
  try {
    await pool.query(
      'DELETE FROM recipes WHERE product_id = $1 AND ingredient_id = $2',
      [req.params.productId, req.params.ingredientId]
    );
    
    await recalculateCosts(req.params.productId);
    
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete recipe item' });
  }
});

// Helper: Recalculate costs for a product based on recipe
async function recalculateCosts(productId: string) {
  try {
    const recipeResult = await pool.query(
      `SELECT r.quantity, i.unit_cost, i.packaging_cost 
       FROM recipes r 
       JOIN ingredients i ON r.ingredient_id = i.id 
       WHERE r.product_id = $1`,
      [productId]
    );

    let ingredientCost = 0;
    let packagingCost = 0;
    
    recipeResult.rows.forEach((row: any) => {
      ingredientCost += parseFloat(row.unit_cost) * parseFloat(row.quantity);
      packagingCost += parseFloat(row.packaging_cost || 0) * parseFloat(row.quantity);
    });

    // Fixed estimates (can be configured per bakery)
    const utilitiesCost = ingredientCost * 0.1; // 10% of ingredient cost
    const laborCost = ingredientCost * 0.15; // 15% of ingredient cost
    const totalCost = ingredientCost + packagingCost + utilitiesCost + laborCost;

    // Get product price
    const productResult = await pool.query(
      'SELECT price FROM products WHERE id = $1',
      [productId]
    );

    if (productResult.rows.length > 0) {
      const price = parseFloat(productResult.rows[0].price);
      const profit = price - totalCost;
      const marginPercent = totalCost > 0 ? ((profit / price) * 100).toFixed(2) : 0;

      // Upsert recipe_costs
      await pool.query(
        `INSERT INTO recipe_costs (product_id, ingredient_cost, packaging_cost, utilities_cost, labor_cost, total_cost, base_price, profit, margin_percent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (product_id) DO UPDATE SET
           ingredient_cost = $2, packaging_cost = $3, utilities_cost = $4, labor_cost = $5,
           total_cost = $6, base_price = $7, profit = $8, margin_percent = $9, calculated_at = CURRENT_TIMESTAMP`,
        [productId, ingredientCost, packagingCost, utilitiesCost, laborCost, totalCost, price, profit, marginPercent]
      );
    }
  } catch (error) {
    console.error('Cost recalculation error:', error);
  }
}

export default router;

