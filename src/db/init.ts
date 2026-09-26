import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function initializeDatabase(pool: Pool): Promise<void> {
  try {
    // Read schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    // Execute schema
    await pool.query(schema);
    console.log('✓ Database schema initialized');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

