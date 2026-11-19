/** True when the plant asset is an SVG the phone must draw itself. */
export function isSvgAsset(url: string): boolean {
  const path = url.split(/[?#]/)[0]?.toLowerCase() ?? '';
  return path.endsWith('.svg');
}

/** Width and height from an SVG viewBox, then from width and height attributes. */
export function svgViewSize(
  xml: string,
): { width: number; height: number } | null {
  const box = xml.match(
    /viewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([-\d.]+)\s+([-\d.]+)\s*["']/i,
  );
  if (box) {
    const width = Number(box[1]);
    const height = Number(box[2]);
    if (width > 0 && height > 0) return { width, height };
  }
  const widthAttr = xml.match(/\bwidth\s*=\s*["']([\d.]+)/i);
  const heightAttr = xml.match(/\bheight\s*=\s*["']([\d.]+)/i);
  if (widthAttr && heightAttr) {
    const width = Number(widthAttr[1]);
    const height = Number(heightAttr[1]);
    if (width > 0 && height > 0) return { width, height };
  }
  return null;
}
