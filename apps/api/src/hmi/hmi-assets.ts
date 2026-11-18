import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { NextFunction, Request, Response } from 'express';

const HMI_ASSETS_PREFIX = '/hmi-assets';

/** Persist plant graphics next to SQLite so docker named volumes keep them. */
export function hmiAssetsDirectory(): string {
  const dataRoot =
    process.env.SQLITE_DIR?.trim() ||
    process.env.DATABASE_PATH?.replace(/[/\\][^/\\]+$/, '') ||
    join(process.cwd(), 'data');
  const dir = join(dataRoot, 'hmi-assets');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function hmiAssetPublicPath(filename: string): string {
  return `${HMI_ASSETS_PREFIX}/${filename}`;
}

/** Serves uploaded plant graphics outside the /api/v1 prefix (no auth). */
export function serveHmiAssets(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.method !== 'GET') {
    next();
    return;
  }
  const match = /^\/hmi-assets\/([^/]+)$/.exec(req.path);
  if (!match || match[1].includes('..')) {
    next();
    return;
  }
  const file = join(hmiAssetsDirectory(), match[1]);
  if (!existsSync(file)) {
    res.status(404).type('application/json').json({
      message: 'HMI asset not found',
    });
    return;
  }
  res.sendFile(file, (err) => {
    if (err) next(err);
  });
}

export const HMI_ASSET_MIME: Record<string, string> = {
  'image/svg+xml': 'svg',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export function svgFailureMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Invalid SVG';
}

/** Drop scripts, embedded documents, and event handlers from an uploaded SVG. */
export function sanitizeSvg(source: string): string {
  let svg = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  svg = svg.replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject>/gi, '');
  svg = svg.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '');
  svg = svg.replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '');
  svg = svg.replace(/<embed\b[^>]*\/?>/gi, '');
  svg = svg.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  svg = svg.replace(/javascript\s*:/gi, '');
  if (!/<svg[\s>]/i.test(svg)) {
    throw new Error('SVG must contain an svg root');
  }
  return svg;
}
