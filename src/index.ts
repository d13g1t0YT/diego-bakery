import dotenv from 'dotenv';

dotenv.config();

import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { initializeDatabase } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { ensureBootstrapAdmin } from './db/bootstrap.js';
import authRoutes from './routes/auth.js';
import productosRoutes from './routes/productos.js';
import ordenesRoutes from './routes/ordenes.js';
import backupRoutes from './routes/backup.js';
import estadoRoutes from './routes/estado.js';
import pedidosPublicosRoutes from './routes/pedidos-publicos.js';

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.disable('x-powered-by');
app.use(helmet());
app.use(cors());
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false
}));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/productos', productosRoutes);
app.use('/api/ordenes', ordenesRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/estado', estadoRoutes);
app.use('/api/pedidos-publicos', pedidosPublicosRoutes);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error no controlado:', err);
  res.status(500).json({ error: 'Internal server error' });
});

async function start(): Promise<void> {
  try {
    await initializeDatabase();
    await runMigrations();
    await ensureBootstrapAdmin();

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`✓ Diego Bakery API escuchando en puerto ${PORT}`);
    });

    const shutdown = async (signal: string) => {
      console.log(`Recibida señal ${signal}; cerrando servidor...`);
      server.close(async () => {
        try {
          const { closeDatabase } = await import('./db/connection.js');
          await closeDatabase();
        } finally {
          process.exit(0);
        }
      });
    };

    process.once('SIGTERM', () => void shutdown('SIGTERM'));
    process.once('SIGINT', () => void shutdown('SIGINT'));
  } catch (err) {
    console.error('✗ Error al iniciar la aplicación:', err);
    process.exit(1);
  }
}

void start();
