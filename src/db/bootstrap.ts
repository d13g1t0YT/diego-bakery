import 'dotenv/config';
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

  if (!telefono) return;
  if (!/^\d{6,20}$/.test(telefono)) {
    throw new Error('ADMIN_PHONE no tiene un formato válido');
  }

  // Bootstrap only creates the initial owner account. Once an active
  // administrator exists, deployments must never overwrite edited credentials.
  const existing = await pool.query(
    'SELECT id FROM usuarios WHERE activo = true ORDER BY creado_en ASC LIMIT 1'
  );

  if (existing.rows.length > 0) {
    console.log('✓ Administrador existente preservado');
    return;
  }

  if (!pin || !/^\d{4,12}$/.test(pin)) {
    throw new Error('No existe un administrador inicial y ADMIN_PIN no está disponible');
  }

  const pinHash = await bcrypt.hash(pin, 12);
  await pool.query(
    'INSERT INTO usuarios (nombre, apellido, telefono, pin_hash) VALUES ($1, $2, $3, $4)',
    [nombre, apellido, telefono, pinHash]
  );
  console.log('✓ Administrador principal creado');
}
