import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from './connection.js';

function env(name:string):string|undefined {
  const value=process.env[name]?.trim();
  return value||undefined;
}

export async function ensureBootstrapAdmin():Promise<void> {
  const telefono=env('ADMIN_PHONE');
  const pin=env('ADMIN_PIN');
  const nombre=env('ADMIN_NAME')||'Administrador';
  const apellido=env('ADMIN_LASTNAME')||'Diego Bakery';
  if(!telefono)return;
  if(!/^\d{6,20}$/.test(telefono))throw new Error('ADMIN_PHONE no tiene un formato válido');

  // Bootstrap only creates the initial owner account. Once an active
  // administrator exists, deployments must never overwrite edited credentials.
  const existing=await pool.query(
    'SELECT id FROM usuarios WHERE activo=true ORDER BY creado_en ASC LIMIT 1'
  );

  if(existing.rows.length>0) {
    console.log('✓ Administrador existente preservado');
    return;
  }

  const pinHash=await bcrypt.hash(pin,12);
      await pool.query(
        'UPDATE usuarios SET nombre=$1, apellido=$2, pin_hash=$3, activo=true, actualizado_en=CURRENT_TIMESTAMP WHERE telefono=$4',
        [nombre,apellido,pinHash,telefono]
      );
    } else {
      await pool.query(
        'UPDATE usuarios SET nombre=$1, apellido=$2, activo=true, actualizado_en=CURRENT_TIMESTAMP WHERE telefono=$3',
        [nombre,apellido,telefono]
      );
    }
    console.log('✓ Administrador principal listo');
    return;
  }

  // If the PIN reference is unavailable but the database already contains an
  // administrator, move that account to the configured owner phone while
  // preserving its existing secure PIN hash.
  if(!pin || !/^\d{4,12}$/.test(pin)) {
    const fallback=await pool.query(
      'SELECT id FROM usuarios WHERE activo=true ORDER BY creado_en ASC LIMIT 1'
    );
    if(fallback.rows.length>0) {
      await pool.query(
        'UPDATE usuarios SET telefono=$1, nombre=$2, apellido=$3, activo=true, actualizado_en=CURRENT_TIMESTAMP WHERE id=$4',
        [telefono,nombre,apellido,fallback.rows[0].id]
      );
      console.log('✓ Administrador existente asociado al teléfono configurado');
      return;
    }
    throw new Error('No existe un administrador inicial y ADMIN_PIN no está disponible');
  }

  const pinHash=await bcrypt.hash(pin,12);
  await pool.query(
    'INSERT INTO usuarios (nombre,apellido,telefono,pin_hash) VALUES ($1,$2,$3,$4)',
    [nombre,apellido,telefono,pinHash]
  );
  console.log('✓ Administrador principal creado');
}
