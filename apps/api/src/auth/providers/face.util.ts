/**
 * Local production face auth (on-prem). Not ISO-certified biometrics.
 * Skin-gate finds one face; embedding is a multi-band spatial descriptor.
 * Challenge flows require multiple frames with inter-frame motion (liveness).
 * Templates are sealed with AES-256-GCM when FACE_TEMPLATE_KEY is set.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { decode as decodeJpeg } from 'jpeg-js';
import { PNG } from 'pngjs';

export const FACE_MATCH_THRESHOLD = 0.88;
/** Min normalized bbox-center shift between challenge frames (fraction of image diagonal). */
export const FACE_MOTION_MIN = 0.04;
export const FACE_CHALLENGE_STEPS = [
  'center',
  'turn-left',
  'turn-right',
] as const;
export type FaceChallengeStep = (typeof FACE_CHALLENGE_STEPS)[number];

interface SkinModel {
  minR: number;
  minG: number;
  minB: number;
  minDeltaRG: number;
  cell: number;
  minSkinFraction: number;
  minCells: number;
  grid: number;
}

interface Raster {
  width: number;
  height: number;
  data: Buffer;
}

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function descriptorFromImageDataUrl(dataUrl: string): number[] {
  const image = decodeDataUrl(dataUrl);
  const model = loadSkinModel();
  const boxes = faceBoxes(image, model);
  if (boxes.length !== 1) throw new Error('No face detected');
  return embed(image, boxes[0], model);
}

/** Average embedding across challenge frames; requires detectable bbox motion. */
export function descriptorFromChallengeFrames(frames: string[]): number[] {
  if (frames.length < FACE_CHALLENGE_STEPS.length) {
    throw new Error(
      `Need ${FACE_CHALLENGE_STEPS.length} challenge frames for liveness`,
    );
  }
  const model = loadSkinModel();
  const samples = frames.slice(0, FACE_CHALLENGE_STEPS.length).map((frame) => {
    const image = decodeDataUrl(frame);
    const boxes = faceBoxes(image, model);
    if (boxes.length !== 1) throw new Error('No face detected');
    return {
      desc: embed(image, boxes[0], model),
      center: boxCenter(boxes[0], model, image),
      diagonal: Math.hypot(image.width, image.height),
    };
  });
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const cur = samples[i];
    const motion =
      Math.hypot(cur.center.x - prev.center.x, cur.center.y - prev.center.y) /
      Math.max(prev.diagonal, 1);
    if (motion < FACE_MOTION_MIN) {
      throw new Error(
        'Liveness failed — not enough head motion between frames',
      );
    }
  }
  const descs = samples.map((sample) => sample.desc);
  const dim = descs[0].length;
  const avg = new Array<number>(dim).fill(0);
  for (const desc of descs) {
    for (let i = 0; i < dim; i++) avg[i] += desc[i];
  }
  for (let i = 0; i < dim; i++) avg[i] /= descs.length;
  const norm = Math.max(Math.hypot(...avg), 1e-9);
  return avg.map((value) => value / norm);
}

function boxCenter(
  box: Box,
  model: SkinModel,
  image: Raster,
): { x: number; y: number } {
  const x0 = box.minX * model.cell;
  const y0 = box.minY * model.cell;
  const x1 = Math.min(image.width, (box.maxX + 1) * model.cell);
  const y1 = Math.min(image.height, (box.maxY + 1) * model.cell);
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
}

export function faceDistance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const delta = a[i] - b[i];
    sum += delta * delta;
  }
  return Math.sqrt(sum);
}

/** Higher is a closer face. Identical embeddings score 1. */
export function matchScore(a: number[], b: number[]): number {
  const dist = faceDistance(a, b);
  if (!Number.isFinite(dist)) return 0;
  return 1 / (1 + dist);
}

export function serializeDescriptor(desc: number[]): string {
  return JSON.stringify(desc);
}

export function parseDescriptor(raw: string): number[] {
  if (raw.startsWith('v1:')) {
    throw new Error('Sealed template requires FACE_TEMPLATE_KEY to open');
  }
  const parsed = JSON.parse(raw) as unknown;
  if (
    !Array.isArray(parsed) ||
    !parsed.every((item) => typeof item === 'number')
  ) {
    throw new Error('Invalid face template');
  }
  return parsed;
}

export function sealTemplate(desc: number[], keyMaterial: string): string {
  const key = deriveKey(keyMaterial);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(desc), 'utf8');
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function openTemplate(raw: string, keyMaterial?: string): number[] {
  if (!raw.startsWith('v1:')) {
    return parseDescriptor(raw);
  }
  if (!keyMaterial?.trim()) {
    throw new Error('FACE_TEMPLATE_KEY required to open sealed template');
  }
  const parts = raw.split(':');
  if (parts.length !== 4) throw new Error('Invalid sealed template');
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const enc = Buffer.from(parts[3], 'base64');
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(keyMaterial), iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(enc), decipher.final()]);
  return parseDescriptor(plain.toString('utf8'));
}

function deriveKey(material: string): Buffer {
  const salt = createHash('sha256').update('tele-pendant-face-v1').digest();
  return scryptSync(material, salt, 32);
}

function loadSkinModel(): SkinModel {
  const candidates = [
    join(process.cwd(), 'assets/face-models/skin-gate.json'),
    join(process.cwd(), 'apps/api/assets/face-models/skin-gate.json'),
  ];
  const file = candidates.find((item) => existsSync(item));
  if (!file) throw new Error('Face model missing');
  return JSON.parse(readFileSync(file, 'utf8')) as SkinModel;
}

function decodeDataUrl(dataUrl: string): Raster {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const buf = Buffer.from(base64, 'base64');
  if (buf.length === 0) throw new Error('Empty face image');
  return decodeRaster(buf);
}

function decodeRaster(buf: Buffer): Raster {
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    const img = decodeJpeg(buf, { useTArray: true, formatAsRGBA: true });
    return {
      width: img.width,
      height: img.height,
      data: Buffer.from(img.data),
    };
  }
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    const png = PNG.sync.read(buf);
    return { width: png.width, height: png.height, data: png.data };
  }
  throw new Error('Invalid face image');
}

function isSkin(
  image: Raster,
  x: number,
  y: number,
  model: SkinModel,
): boolean {
  const i = (y * image.width + x) * 4;
  const r = image.data[i];
  const g = image.data[i + 1];
  const b = image.data[i + 2];
  return (
    r > model.minR &&
    g > model.minG &&
    b > model.minB &&
    r > g &&
    r > b &&
    Math.abs(r - g) > model.minDeltaRG
  );
}

function cellSkinFraction(
  image: Raster,
  cx: number,
  cy: number,
  model: SkinModel,
): number {
  let hits = 0;
  let total = 0;
  const y1 = Math.min(image.height, (cy + 1) * model.cell);
  const x1 = Math.min(image.width, (cx + 1) * model.cell);
  for (let y = cy * model.cell; y < y1; y++) {
    for (let x = cx * model.cell; x < x1; x++) {
      total += 1;
      if (isSkin(image, x, y, model)) hits += 1;
    }
  }
  return hits / Math.max(total, 1);
}

function faceBoxes(image: Raster, model: SkinModel): Box[] {
  const cols = Math.ceil(image.width / model.cell);
  const rows = Math.ceil(image.height / model.cell);
  const skin: boolean[] = [];
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      skin.push(
        cellSkinFraction(image, cx, cy, model) >= model.minSkinFraction,
      );
    }
  }
  const seen = new Array<boolean>(skin.length).fill(false);
  const boxes: Box[] = [];
  for (let i = 0; i < skin.length; i++) {
    if (!skin[i] || seen[i]) continue;
    const stack = [i];
    seen[i] = true;
    let minX = cols;
    let minY = rows;
    let maxX = 0;
    let maxY = 0;
    let area = 0;
    while (stack.length > 0) {
      const cur = stack.pop() as number;
      const cx = cur % cols;
      const cy = Math.floor(cur / cols);
      area += 1;
      if (cx < minX) minX = cx;
      if (cy < minY) minY = cy;
      if (cx > maxX) maxX = cx;
      if (cy > maxY) maxY = cy;
      const nexts = [
        cx > 0 ? cur - 1 : -1,
        cx + 1 < cols ? cur + 1 : -1,
        cy > 0 ? cur - cols : -1,
        cy + 1 < rows ? cur + cols : -1,
      ];
      for (const next of nexts) {
        if (next < 0 || seen[next] || !skin[next]) continue;
        seen[next] = true;
        stack.push(next);
      }
    }
    if (area >= model.minCells) boxes.push({ minX, minY, maxX, maxY });
  }
  return boxes;
}

/** Spatial luminance + chroma averages (grid² × 3) for a stronger local template. */
function embed(image: Raster, box: Box, model: SkinModel): number[] {
  const grid = Math.max(model.grid, 12);
  const x0 = box.minX * model.cell;
  const y0 = box.minY * model.cell;
  const x1 = Math.min(image.width, (box.maxX + 1) * model.cell);
  const y1 = Math.min(image.height, (box.maxY + 1) * model.cell);
  const desc: number[] = [];
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      const sx0 = x0 + Math.floor(((x1 - x0) * gx) / grid);
      const sx1 = x0 + Math.floor(((x1 - x0) * (gx + 1)) / grid);
      const sy0 = y0 + Math.floor(((y1 - y0) * gy) / grid);
      const sy1 = y0 + Math.floor(((y1 - y0) * (gy + 1)) / grid);
      let sumY = 0;
      let sumCb = 0;
      let sumCr = 0;
      let count = 0;
      for (let y = sy0; y < sy1; y++) {
        for (let x = sx0; x < sx1; x++) {
          const i = (y * image.width + x) * 4;
          const r = image.data[i];
          const g = image.data[i + 1];
          const b = image.data[i + 2];
          sumY += r * 0.299 + g * 0.587 + b * 0.114;
          sumCb += 128 - 0.169 * r - 0.331 * g + 0.5 * b;
          sumCr += 128 + 0.5 * r - 0.419 * g - 0.081 * b;
          count += 1;
        }
      }
      const n = Math.max(count, 1);
      desc.push(sumY / n, sumCb / n, sumCr / n);
    }
  }
  const norm = Math.max(Math.hypot(...desc), 1e-9);
  return desc.map((value) => value / norm);
}
