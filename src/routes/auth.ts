import { Router, Response } from 'express';
import { pool } from '../db/connection.js';
import { autenticar, generarToken, AuthRequest } from '../middleware/auth.js';
import bcrypt from 'bcryptjs';

const router = Router();

router.post('/login', async (req: AuthRequest, res: Response) => {
  try {
    const telefono = typeof req.body?.telefono === 'string' ? req.body.telefono.trim() : '';
    const pin = typeof req.body?.pin === 'string' ? req.body.pin : '';

    if (!telefono || !/^\\d{6,20}$/.test(telefono) || !/^\\d{4,12}$/.test(pin)) {
      res.status(400).json({ error: 'Teléfono y PIN requeridos' });
      return;
    }

    const result = await pool.query(
      'SELECT id, nombre, apellido, pin_hash FROM usuarios WHERE telefono = $1 AND activo = true',
      [telefono]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Credenciales inválidas' });
      return;
    }

    const usuario = result.rows[0];
    const pinValido = await bcrypt.compare(pin, usuario.pin_hash);

    if (!pinValido) {
      res.status(401).json({ error: 'Credenciales inválidas' });
      return;
    }

    const token = generarToken(usuario.id, usuario.nombre, usuario.apellido);
    res.json({
      token,
      usuario: { id: usuario.id, nombre: usuario.nombre, apellido: usuario.apellido }
    });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error en autenticación' });
  }
});

router.put('/profile', autenticar, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.usuario?.id;
    if (!id) {
      res.status(401).json({ error: 'Sesión inválida' });
      return;
    }

    const current = await pool.query(
      'SELECT id, nombre, apellido, telefono FROM usuarios WHERE id = $1 AND activo = true LIMIT 1',
      [id]
    );
    if (current.rows.length === 0) {
      res.status(404).json({ error: 'Administrador no encontrado' });
      return;
    }

    const currentUser = current.rows[0];
    const nombre = typeof req.body?.nombre === 'string' ? req.body.nombre.trim() : currentUser.nombre;
    const apellido = typeof req.body?.apellido === 'string' ? req.body.apellido.trim() : currentUser.apellido;
    const telefono = typeof req.body?.telefono === 'string' ? req.body.telefono.trim() : currentUser.telefono;
    const nuevoPin = typeof req.body?.nuevoPin === 'string' ? req.body.nuevoPin : '';

    if (!nombre || !apellido || !/^\d{6,20}$/.test(telefono)) {
      res.status(400).json({ error: 'Nombre, apellido y teléfono válidos son requeridos' });
      return;
    }
    if (nuevoPin && !/^\d{4,12}$/.test(nuevoPin)) {
      res.status(400).json({ error: 'El PIN debe tener entre 4 y 12 dígitos' });
      return;
    }

    const duplicate = await pool.query(
      'SELECT id FROM usuarios WHERE telefono = $1 AND id <> $2 LIMIT 1',
      [telefono, id]
    );
    if (duplicate.rows.length > 0) {
      res.status(409).json({ error: 'Ese teléfono ya está asociado a otra cuenta' });
      return;
    }

    if (nuevoPin) {
      const pinHash = await bcrypt.hash(nuevoPin, 12);
      await pool.query(
        'UPDATE usuarios SET nombre=$1, apellido=$2, telefono=$3, pin_hash=$4, actualizado_en=CURRENT_TIMESTAMP WHERE id=$5',
        [nombre, apellido, telefono, pinHash, id]
      );
    } else {
      await pool.query(
        'UPDATE usuarios SET nombre=$1, apellido=$2, telefono=$3, actualizado_en=CURRENT_TIMESTAMP WHERE id=$4',
        [nombre, apellido, telefono, id]
      );
    }

    const token = generarToken(id, nombre, apellido);
    res.json({
      token,
      usuario: { id, nombre, apellido, telefono }
    });
  } catch (err) {
    console.error('Error actualizando perfil:', err);
    res.status(500).json({ error: 'No se pudo actualizar la cuenta' });
  }
});

router.get('/verify', autenticar, (req: AuthRequest, res: Response) => {
  res.json({ usuario: req.usuario });
});

export default router;
