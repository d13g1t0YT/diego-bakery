import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  usuario?: {
    id: string;
    nombre: string;
    apellido: string;
  };
}

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-key';

export function autenticar(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.usuario = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

export function generarToken(usuarioId: string, nombre: string, apellido: string): string {
  return jwt.sign(
    { id: usuarioId, nombre, apellido },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

