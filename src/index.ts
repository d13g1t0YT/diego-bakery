import dotenv from 'dotenv';

dotenv.config();

import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
import iaRoutes from './routes/ia.js';
import recetasRoutes from './routes/recetas.js';
import iaProductoRoutes from './routes/ia-producto.js';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendPath = path.resolve(__dirname, '..', 'app-dist');

app.disable('x-powered-by');
app.use(helmet());
app.use(cors());
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  // La IA tiene autenticación propia y no debe consumir el límite
  // general de solicitudes de la aplicación.
  skip: (req) =>
    req.path.startsWith('/api/ia') ||
    req.path.startsWith('/api/ia-producto')
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
app.use('/api/ia', iaRoutes);
app.use('/api/recetas', recetasRoutes);
app.use('/api/ia-producto', iaProductoRoutes);

if (process.env.NODE_ENV === 'production') {
  // Express 4 treats a trailing slash as optional by default, so a plain
  // "/app" route also matches "/app/". Guard it explicitly to prevent a
  // self-redirect loop.
  app.get('/app', (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/app') {
      return res.redirect(308, '/app/');
    }
    next();
  });

  app.use('/app', (_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  });

  app.use('/app', express.static(frontendPath, {
    index: 'index.html',
    fallthrough: true,
    setHeaders: (res, filePath) => {
      if (
        filePath.endsWith('index.html') ||
        filePath.endsWith('local-loader.js') ||
        filePath.endsWith('remote-loader.js') ||
        filePath.endsWith('live-version.json') ||
        filePath.endsWith('manifest.webmanifest')
      ) {
        res.setHeader('Cache-Control', 'no-store, max-age=0');
      } else if (filePath.includes('/assets/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));

  app.get('/app/*', (_req: Request, res: Response) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });

  app.get('/', (_req: Request, res: Response) => {
    res.redirect('/app/');
  });
}

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error no controlado:', err);
  res.status(500).json({ error: 'Internal server error' });
});


async function verifyOpenAIConnection(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL || 'gpt-5.6-sol';

  if (!apiKey) {
    console.error('✗ OpenAI IA: OPENAI_API_KEY no está configurada');
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        store: false,
        max_output_tokens: 32,
        input: [{ role: 'user', content: [{ type: 'input_text', text: 'Responde únicamente: OK' }] }]
      })
    });

    const payload: any = await response.json().catch(() => ({}));

    if (!response.ok) {
      const code = payload?.error?.code ? String(payload.error.code) : 'unknown_error';
      console.error('✗ OpenAI IA: conexión rechazada', response.status, code);
      return;
    }

    console.log('✓ OpenAI IA: conexión comprobada correctamente con modelo ' + model);
  } catch (error: any) {
    console.error(
      error?.name === 'AbortError'
        ? '✗ OpenAI IA: prueba agotó el tiempo'
        : '✗ OpenAI IA: error de conexión'
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function start(): Promise<void> {
  try {
    await initializeDatabase();
    await runMigrations();
    await ensureBootstrapAdmin();

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log('✓ Diego Bakery API escuchando en puerto ' + PORT);
      if (process.env.NODE_ENV === 'production') {
        console.log('✓ Diego Bakery App publicada en /app/');
      }
      void verifyOpenAIConnection();
    });

    const shutdown = async (signal: string) => {
      console.log('Recibida señal ' + signal + '; cerrando servidor...');
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
