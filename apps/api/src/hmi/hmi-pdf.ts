import { createRequire } from 'node:module';
import path from 'node:path';

type PdfViewport = { width: number; height: number };

type PdfPage = {
  getViewport: (opts: { scale: number }) => PdfViewport;
  render: (opts: { canvasContext: unknown; viewport: PdfViewport }) => {
    promise: Promise<void>;
  };
  cleanup: () => void;
};

type PdfPaint = {
  context: unknown;
  toPng: () => Buffer;
};

type PdfTools = {
  open: (data: Uint8Array) => Promise<PdfPage>;
  paint: (width: number, height: number) => PdfPaint;
};

/** Turn PDF page 1 into a PNG so label percents sit on the drawing. */
export async function rasterizeFirstPdfPage(
  bytes: Buffer,
  open: PdfTools['open'],
  paint: PdfTools['paint'],
): Promise<Buffer> {
  if (!bytes.length) throw new Error('PDF is empty');
  const page = await open(new Uint8Array(bytes));
  try {
    const viewport = page.getViewport({ scale: 2 });
    const width = Math.max(1, Math.ceil(viewport.width));
    const height = Math.max(1, Math.ceil(viewport.height));
    const surface = paint(width, height);
    await page.render({ canvasContext: surface.context, viewport }).promise;
    const png = surface.toPng();
    if (!png.length) throw new Error('PDF page rendered empty');
    return png;
  } finally {
    page.cleanup();
  }
}

function standardFontDataUrl(): string {
  const require = createRequire(__filename);
  const pkg = require.resolve('pdfjs-dist/package.json');
  const fonts = path.join(path.dirname(pkg), 'standard_fonts');
  return `${fonts}${path.sep}`;
}

export async function loadPdfTools(): Promise<PdfTools> {
  const pdfjs =
    (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as {
      getDocument: (opts: {
        data: Uint8Array;
        disableWorker: boolean;
        isEvalSupported: boolean;
        standardFontDataUrl: string;
      }) => { promise: Promise<{ getPage: (n: number) => Promise<PdfPage> }> };
    };
  const canvas = (await import('@napi-rs/canvas')) as {
    createCanvas: (
      width: number,
      height: number,
    ) => {
      getContext: (kind: '2d') => unknown;
      toBuffer: (type: 'image/png') => Buffer;
    };
    DOMMatrix?: unknown;
    Path2D?: unknown;
  };
  const globals = globalThis as { DOMMatrix?: unknown; Path2D?: unknown };
  if (canvas.DOMMatrix) globals.DOMMatrix = canvas.DOMMatrix;
  if (canvas.Path2D) globals.Path2D = canvas.Path2D;
  return {
    open: async (data) => {
      const doc = await pdfjs.getDocument({
        data,
        disableWorker: true,
        isEvalSupported: false,
        standardFontDataUrl: standardFontDataUrl(),
      }).promise;
      return doc.getPage(1);
    },
    paint: (width, height) => {
      const surface = canvas.createCanvas(width, height);
      return {
        context: surface.getContext('2d'),
        toPng: () => surface.toBuffer('image/png'),
      };
    },
  };
}

export async function renderPdfFirstPage(
  bytes: Buffer,
  load: () => Promise<PdfTools> = loadPdfTools,
): Promise<Buffer> {
  const tools = await load();
  return rasterizeFirstPdfPage(bytes, tools.open, tools.paint);
}
