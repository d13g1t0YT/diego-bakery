import bcrypt from 'bcryptjs';
import { pool } from './connection.js';

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export async function ensureBootstrapAdmin(): Promise<void> {
  const telefono = env('ADMIN_PHONE');
  const pin = env('ADMIN_PIN');
  const nombre = env('ADMIN_NAME') || 'Administrador';
  const apellido = env('ADMIN_LASTNAME') || 'Diego Bakery';

  if (!telefono || !pin) return;
  if (!/^\\d{6,20}$/.test(telefono) || !/^\\d{4,12}$/.test(pin)) {
    throw new Error('ADMIN_PHONE o ADMIN_PIN no tienen un formato válido');
  }

  const existing = await pool.query('SELECT id FROM usuarios WHERE telefono = $1 LIMIT 1', [telefono]);
  if (existing.rows.length > 0) return;

  const pinHash = await bcrypt.hash(pin, 12);
  await pool.query(
    'INSERT INTO usuarios (nombre, apellido, telefono, pin_hash) VALUES ($1, $2, $3, $4)',
    [nombre, apellido, telefono, pinHash]
  );
  console.log('✓ Administrador inicial creado desde variables de entorno');
}
