/**
 * Local face convenience auth. Not a certified biometric and not liveness.
 * A vendored skin-gate model finds one face region. The template is an 8×8
 * luminance embedding of that region. Match is Euclidean distance.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { decode as decodeJpeg } from 'jpeg-js';
import { PNG } from 'pngjs';

export const FACE_MATCH_THRESHOLD = 0.92;

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
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const buf = Buffer.from(base64, 'base64');
  if (buf.length === 0) throw new Error('Empty face image');
  const image = decodeRaster(buf);
  const model = loadSkinModel();
  const boxes = faceBoxes(image, model);
  if (boxes.length !== 1) throw new Error('No face detected');
  return embed(image, boxes[0], model);
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
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'number')) {
    throw new Error('Invalid face template');
  }
  return parsed;
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

function isSkin(image: Raster, x: number, y: number, model: SkinModel): boolean {
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
      skin.push(cellSkinFraction(image, cx, cy, model) >= model.minSkinFraction);
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

function embed(image: Raster, box: Box, model: SkinModel): number[] {
  const x0 = box.minX * model.cell;
  const y0 = box.minY * model.cell;
  const x1 = Math.min(image.width, (box.maxX + 1) * model.cell);
  const y1 = Math.min(image.height, (box.maxY + 1) * model.cell);
  const desc: number[] = [];
  for (let gy = 0; gy < model.grid; gy++) {
    for (let gx = 0; gx < model.grid; gx++) {
      const sx0 = x0 + Math.floor(((x1 - x0) * gx) / model.grid);
      const sx1 = x0 + Math.floor(((x1 - x0) * (gx + 1)) / model.grid);
      const sy0 = y0 + Math.floor(((y1 - y0) * gy) / model.grid);
      const sy1 = y0 + Math.floor(((y1 - y0) * (gy + 1)) / model.grid);
      let sum = 0;
      let count = 0;
      for (let y = sy0; y < sy1; y++) {
        for (let x = sx0; x < sx1; x++) {
          const i = (y * image.width + x) * 4;
          sum += image.data[i] * 0.3 + image.data[i + 1] * 0.59 + image.data[i + 2] * 0.11;
          count += 1;
        }
      }
      desc.push(sum / Math.max(count, 1));
    }
  }
  const norm = Math.max(Math.hypot(...desc), 1e-9);
  return desc.map((value) => value / norm);
}
