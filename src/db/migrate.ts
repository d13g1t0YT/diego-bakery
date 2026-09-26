import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { pool } from './connection.js';

const schemaPath = join(dirname(fileURLToPath(import.meta.url)), 'schema.sql');

export async function runMigrations(): Promise<void> {
  const schema = await readFile(schemaPath, 'utf8');
  await pool.query(schema);
  console.log('✓ Migraciones ejecutadas exitosamente');
}

async function main(): Promise<void> {
  try {
    await runMigrations();
  } catch (err) {
    console.error('✗ Error al ejecutar migraciones:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
