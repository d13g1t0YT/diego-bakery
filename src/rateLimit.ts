import type { Request } from 'express';
import { isIP } from 'node:net';
import { ipKeyGenerator } from 'express-rate-limit';

/**
 * Railway's public edge overwrites X-Real-IP with the public client's IP.
 * Prefer that verified edge header and never trust X-Forwarded-For globally.
 * Requests without a valid edge IP fall back to the direct socket address.
 */
export function clientIpKeyGenerator(req: Request): string {
  const edgeIp = req.get('x-real-ip')?.trim();
  if (edgeIp && isIP(edgeIp)) return ipKeyGenerator(edgeIp);

  const socketIp = req.socket.remoteAddress?.trim();
  if (socketIp && isIP(socketIp)) return ipKeyGenerator(socketIp);

  return 'unknown-ip';
}
