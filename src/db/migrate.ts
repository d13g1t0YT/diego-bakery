import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { pool } from './connection.js';

const schemaPath = join(dirname(fileURLToPath(import.meta.url)), 'schema.sql');

async function runMigrations(): Promise<void> {
  try {
    const schema = await readFile(schemaPath, 'utf8');
    await pool.query(schema);
    console.log('✓ Migraciones ejecutadas exitosamente');
  } catch (err) {
    console.error('✗ Error al ejecutar migraciones:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void runMigrations();
