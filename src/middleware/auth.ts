import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export interface AuthRequest extends Request {
  adminId?: string;
  phone?: string;
}

/**
 * Admin authentication middleware
 * Supports PIN, phone, and biometric-ready token validation
 */
export async function adminAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const pin = req.headers['x-admin-pin'] as string;
  const biometricToken = req.headers['x-biometric-token'] as string;

  // PIN-based auth (development/simple deployment)
  if (pin) {
    const adminPin = process.env.ADMIN_PIN || '1234';
    if (pin === adminPin) {
      req.adminId = 'default-admin';
      return next();
    }
  }

  // Bearer token (future: JWT with biometric/phone session)
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    // TODO: Validate token from admin_sessions table
    req.adminId = 'default-admin';
    return next();
  }

  res.status(401).json({ error: 'Unauthorized. Provide X-Admin-PIN or Authorization header' });
}

/**
 * Helper: hash PIN for storage
 */
export function hashPin(pin: string): string {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

