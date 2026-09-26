import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is not set');
}

export const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export async function initializeDatabase() {
  try {
    const client = await pool.connect();
    console.log('✓ Conexión a base de datos establecida');
    client.release();
  } catch (err) {
    console.error('✗ Error al conectar a la base de datos:', err);
    throw err;
  }
}

export async function closeDatabase() {
  await pool.end();
}

