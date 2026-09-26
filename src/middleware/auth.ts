import 'dotenv/config';
import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';

export interface AuthRequest extends Request {
  usuario?: {
    id: string;
    nombre: string;
    apellido: string;
  };
}

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable is not set in production');
}

const signingSecret = JWT_SECRET || 'development-only-secret-change-me';

function isAuthPayload(value: string | JwtPayload): value is JwtPayload & {
  id: string;
  nombre: string;
  apellido: string;
} {
  return (
    typeof value !== 'string' &&
    typeof value.id === 'string' &&
    typeof value.nombre === 'string' &&
    typeof value.apellido === 'string'
  );
}

export function autenticar(req: AuthRequest, res: Response, next: NextFunction): void {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token no proporcionado' });
    return;
  }

  const token = authorization.slice('Bearer '.length).trim();

  if (!token) {
    res.status(401).json({ error: 'Token no proporcionado' });
    return;
  }

  try {
    const decoded = jwt.verify(token, signingSecret);

    if (!isAuthPayload(decoded)) {
      res.status(401).json({ error: 'Token inválido' });
      return;
    }

    req.usuario = {
      id: decoded.id,
      nombre: decoded.nombre,
      apellido: decoded.apellido,
    };

    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

export function generarToken(usuarioId: string, nombre: string, apellido: string): string {
  return jwt.sign(
    { id: usuarioId, nombre, apellido },
    signingSecret,
    { expiresIn: '24h' }
  );
}
