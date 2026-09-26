import { Router, Response } from 'express';
import { pool } from '../db/connection.js';
import { generarToken, AuthRequest } from '../middleware/auth.js';
import bcrypt from 'bcryptjs';

const router = Router();

// POST /api/auth/login - Autenticar con PIN
router.post('/login', async (req: AuthRequest, res: Response) => {
  try {
    const { telefono, pin } = req.body;

    if (!telefono || !pin) {
      return res.status(400).json({ error: 'Teléfono y PIN requeridos' });
    }

    const result = await pool.query(
      'SELECT id, nombre, apellido, pin_hash FROM usuarios WHERE telefono = $1 AND activo = true',
      [telefono]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const usuario = result.rows[0];
    const pinValido = await bcrypt.compare(pin, usuario.pin_hash);

    if (!pinValido) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = generarToken(usuario.id, usuario.nombre, usuario.apellido);
    res.json({ token, usuario: { id: usuario.id, nombre: usuario.nombre, apellido: usuario.apellido } });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error en autenticación' });
  }
});

// GET /api/auth/verify - Verificar token actual
router.get('/verify', (req: AuthRequest, res: Response) => {
  if (!req.usuario) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  res.json({ usuario: req.usuario });
});

export default router;

