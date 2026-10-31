/**
 * Basic face convenience auth — NOT biometric security.
 * Builds a coarse grayscale histogram descriptor from a data-URL / base64 image
 * and compares with cosine similarity. Fail closed to password when unsure.
 */

export function descriptorFromImageDataUrl(dataUrl: string): number[] {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const buf = Buffer.from(base64, 'base64');
  const bins = new Array<number>(32).fill(0);
  if (buf.length === 0) {
    throw new Error('Empty face image');
  }
  // Sample bytes as pseudo luminance (works for JPEG/PNG payloads without decoding)
  const step = Math.max(1, Math.floor(buf.length / 2048));
  for (let i = 0; i < buf.length; i += step) {
    const v = buf[i];
    bins[Math.floor((v / 256) * 32)] += 1;
  }
  const norm = Math.sqrt(bins.reduce((s, x) => s + x * x, 0));
  return bins.map((x) => x / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export const FACE_MATCH_THRESHOLD = 0.92;

export function serializeDescriptor(desc: number[]): string {
  return JSON.stringify(desc);
}

export function parseDescriptor(raw: string): number[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === 'number')) {
    throw new Error('Invalid face template');
  }
  return parsed;
}
