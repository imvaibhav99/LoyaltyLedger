import crypto from 'node:crypto';

// generateId('MBR') → "MBR-A1B2C3D4"
export function generateId(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}
