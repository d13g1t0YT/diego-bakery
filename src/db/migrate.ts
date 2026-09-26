import { readFileSync } from 'fs';
import { join } from 'path';
import { pool } from './connection.js';

async function runMigrations() {
  const schemaPath = join(process.cwd(), 'src', 'db', 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');

  try {
    await pool.query(schema);
    console.log('✓ Migraciones ejecutadas exitosamente');
  } catch (err) {
    console.error('✗ Error al ejecutar migraciones:', err);
    throw err;
  } finally {
    await pool.end();
  }
}

runMigrations();

