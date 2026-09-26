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

router.get('/verify', autenticar, (req: AuthRequest, res: Response) => {
  res.json({ usuario: req.usuario });
});

export default router;
