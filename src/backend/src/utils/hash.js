import { createHash } from 'crypto';

export function hash(input) {
  if (typeof input === 'string') {
    return createHash('sha256').update(input, 'utf8').digest('hex');
  }
  
  if (input instanceof Buffer || input instanceof ArrayBuffer) {
    return createHash('sha256').update(input).digest('hex');
  }
  
  throw new Error('Input must be a string or binary data');
}
