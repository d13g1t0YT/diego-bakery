import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { initializeDatabase } from './db/init.js';
import adminRoutes from './routes/admin.js';
import productsRoutes from './routes/products.js';
import recipesRoutes from './routes/recipes.js';
import ingredientsRoutes from './routes/ingredients.js';
import inventoryRoutes from './routes/inventory.js';
import ordersRoutes from './routes/orders.js';
import customersRoutes from './routes/customers.js';
import paymentsRoutes from './routes/payments.js';
import expensesRoutes from './routes/expenses.js';
import investmentsRoutes from './routes/investments.js';
import debtsRoutes from './routes/debts.js';
import lossesRoutes from './routes/losses.js';
import promotionsRoutes from './routes/promotions.js';
import loyaltyRoutes from './routes/loyalty.js';
import syncRoutes from './routes/sync.js';
import reportsRoutes from './routes/reports.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection pool
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/admin', adminRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/recipes', recipesRoutes);
app.use('/api/ingredients', ingredientsRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/expenses', expensesRoutes);
app.use('/api/investments', investmentsRoutes);
app.use('/api/debts', debtsRoutes);
app.use('/api/losses', lossesRoutes);
app.use('/api/promotions', promotionsRoutes);
app.use('/api/loyalty', loyaltyRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/reports', reportsRoutes);

// Error handling
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    timestamp: new Date().toISOString(),
  });
});

// Initialize database and start server
async function start() {
  try {
    console.log('Initializing database...');
    await initializeDatabase(pool);
    console.log('Database initialized');

    app.listen(PORT, () => {
      console.log(`🍞 Diego Bakery API running on port ${PORT}`);
      console.log(`Admin mode - Offline-first with sync support`);
      console.log(`Database: Connected`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

