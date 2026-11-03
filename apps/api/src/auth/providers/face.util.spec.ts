import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { encode as encodeJpeg } from 'jpeg-js';
import { PNG } from 'pngjs';
import {
  descriptorFromChallengeFrames,
  descriptorFromImageDataUrl,
  faceDistance,
  FACE_MATCH_THRESHOLD,
  matchScore,
  openTemplate,
  parseDescriptor,
  sealTemplate,
  serializeDescriptor,
} from './face.util';

const EMBED_LEN = 12 * 12 * 3;

function paint(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number],
): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      const i = (y * width + x) << 2;
      png.data[i] = r;
      png.data[i + 1] = g;
      png.data[i + 2] = b;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

function dataUrl(buf: Buffer, mime = 'image/png'): string {
  return `data:${mime};base64,${buf.toString('base64')}`;
}

const skin: [number, number, number] = [210, 140, 110];
const dark: [number, number, number] = [20, 20, 20];

function oneFace(shift = 0): Buffer {
  return paint(48, 48, (x, y) => {
    if (x === 0 && y === 0) return [200, 10, 10];
    if (x === 1 && y === 0) return [200, 80, 10];
    if (x === 2 && y === 0) return [180, 200, 100];
    if (x === 3 && y === 0) return [180, 100, 190];
    if (x === 4 && y === 0) return [200, 190, 180];
    if (x === 5 && y === 0) return [80, 200, 80];
    const left = 10 + shift;
    const right = 38 + shift;
    if (x > left && x < right && y > 10 && y < 38) {
      return x < 24 + shift ? skin : [240, 200, 170];
    }
    return dark;
  });
}

function ringFace(): Buffer {
  return paint(32, 32, (x, y) =>
    x < 8 || y < 8 || x >= 24 || y >= 24 ? skin : dark,
  );
}

function twoFaces(): Buffer {
  return paint(48, 48, (x, y) => {
    const left = x > 2 && x < 18 && y > 2 && y < 18;
    const right = x > 30 && x < 46 && y > 30 && y < 46;
    return left || right ? skin : dark;
  });
}

function speck(): Buffer {
  return paint(32, 32, (x, y) => (x < 8 && y < 8 ? skin : dark));
}

describe('face.util', () => {
  it('matches one face and rejects lookalikes by distance', () => {
    const url = dataUrl(oneFace());
    const desc = descriptorFromImageDataUrl(url);
    expect(desc.length).toBe(EMBED_LEN);
    const again = descriptorFromImageDataUrl(url.split(',')[1]);
    expect(matchScore(desc, again)).toBe(1);
    expect(matchScore(desc, again)).toBeGreaterThanOrEqual(
      FACE_MATCH_THRESHOLD,
    );
    const other = descriptorFromImageDataUrl(dataUrl(ringFace()));
    expect(matchScore(desc, other)).toBeLessThan(FACE_MATCH_THRESHOLD);
    expect(serializeDescriptor(desc)).toContain('[');
    expect(parseDescriptor(serializeDescriptor(desc))).toEqual(desc);
  });

  it('downscales large frames and keeps a dominant face blob', () => {
    const large = paint(640, 480, (x, y) => {
      if (x > 200 && x < 400 && y > 120 && y < 360) {
        return x < 300 ? skin : [240, 200, 170];
      }
      return dark;
    });
    expect(descriptorFromImageDataUrl(dataUrl(large)).length).toBe(EMBED_LEN);

    const dominant = paint(96, 64, (x, y) => {
      const main = x > 8 && x < 56 && y > 8 && y < 56;
      const tiny = x > 76 && x < 92 && y > 40 && y < 56;
      return main || tiny ? skin : dark;
    });
    expect(descriptorFromImageDataUrl(dataUrl(dominant)).length).toBe(
      EMBED_LEN,
    );
  });

  it('requires motion across challenge frames and seals templates', () => {
    expect(() => descriptorFromChallengeFrames([dataUrl(oneFace(0))])).toThrow(
      /Need 3 challenge frames/,
    );

    const still = dataUrl(oneFace(0));
    expect(() => descriptorFromChallengeFrames([still, still, still])).toThrow(
      /Liveness failed/,
    );

    // Same bbox region, different appearance (head-turn style) — embed motion.
    const poseA = paint(48, 48, (x, y) => {
      if (x > 10 && x < 38 && y > 10 && y < 38) {
        return x < 24 ? skin : [240, 200, 170];
      }
      return dark;
    });
    const poseB = paint(48, 48, (x, y) => {
      if (x > 10 && x < 38 && y > 10 && y < 38) {
        return x < 18 ? [200, 120, 90] : [250, 210, 180];
      }
      return dark;
    });
    const poseC = paint(48, 48, (x, y) => {
      if (x > 10 && x < 38 && y > 10 && y < 38) {
        return x < 30 ? [180, 100, 80] : skin;
      }
      return dark;
    });
    expect(
      descriptorFromChallengeFrames([
        dataUrl(poseA),
        dataUrl(poseB),
        dataUrl(poseC),
      ]).length,
    ).toBe(EMBED_LEN);

    const leftBias = paint(64, 64, (x, y) => {
      if (x > 2 && x < 26 && y > 16 && y < 48) {
        return x < 14 ? skin : [240, 200, 170];
      }
      return dark;
    });
    const rightBias = paint(64, 64, (x, y) => {
      if (x > 38 && x < 62 && y > 16 && y < 48) {
        return x < 50 ? [200, 120, 90] : [250, 210, 180];
      }
      return dark;
    });
    const frames = [dataUrl(oneFace(0)), dataUrl(leftBias), dataUrl(rightBias)];
    const avg = descriptorFromChallengeFrames(frames);
    expect(avg.length).toBe(EMBED_LEN);

    const key = 'test-face-template-key-min-32-chars!!';
    const sealed = sealTemplate(avg, key);
    expect(sealed.startsWith('v1:')).toBe(true);
    expect(openTemplate(sealed, key)).toEqual(avg);
    expect(() => openTemplate(sealed)).toThrow(/FACE_TEMPLATE_KEY/);
    expect(() => parseDescriptor(sealed)).toThrow(/Sealed template/);
    expect(() => openTemplate('v1:only:three', key)).toThrow(
      /Invalid sealed template/,
    );
    expect(() =>
      descriptorFromChallengeFrames([
        dataUrl(twoFaces()),
        dataUrl(oneFace(0)),
        dataUrl(oneFace(2)),
      ]),
    ).toThrow(/No face detected/);
  });

  it('decodes a jpeg and rejects empty, invalid, and multi-face frames', () => {
    const jpeg = Buffer.from(
      encodeJpeg(
        {
          data: oneFaceRaster(),
          width: 48,
          height: 48,
        },
        90,
      ).data,
    );
    expect(descriptorFromImageDataUrl(dataUrl(jpeg, 'image/jpeg')).length).toBe(
      EMBED_LEN,
    );
    expect(() => descriptorFromImageDataUrl('data:image/png;base64,')).toThrow(
      /Empty face image/,
    );
    expect(() =>
      descriptorFromImageDataUrl(dataUrl(Buffer.from([0, 1, 2, 3]))),
    ).toThrow(/Invalid face image/);
    expect(() =>
      descriptorFromImageDataUrl(dataUrl(Buffer.from([0xff, 0x00, 0, 0]))),
    ).toThrow(/Invalid face image/);
    expect(() =>
      descriptorFromImageDataUrl(dataUrl(Buffer.from([0x89, 0x00, 0, 0]))),
    ).toThrow(/Invalid face image/);
    expect(() => descriptorFromImageDataUrl(dataUrl(twoFaces()))).toThrow(
      /No face detected/,
    );
    expect(() => descriptorFromImageDataUrl(dataUrl(speck()))).toThrow(
      /No face detected/,
    );
    expect(() =>
      descriptorFromImageDataUrl(dataUrl(paint(32, 32, () => dark))),
    ).toThrow(/No face detected/);
  });

  it('rejects bad templates and scores an empty descriptor as no match', () => {
    expect(() => parseDescriptor('"nope"')).toThrow(/Invalid face template/);
    expect(() => parseDescriptor('[1,"x"]')).toThrow(/Invalid face template/);
    expect(() => parseDescriptor('{"a":1}')).toThrow(/Invalid face template/);
    expect(faceDistance([], [])).toBe(Number.POSITIVE_INFINITY);
    expect(matchScore([], [1])).toBe(0);
    expect(faceDistance([1, 0], [1])).toBe(0);
  });

  it('reads the vendored model from the repo path and fails when it is gone', () => {
    const cwd = process.cwd();
    const repoRoot = cwd.endsWith(`${join('apps', 'api')}`)
      ? join(cwd, '../..')
      : cwd;
    try {
      process.chdir(repoRoot);
      expect(descriptorFromImageDataUrl(dataUrl(oneFace())).length).toBe(
        EMBED_LEN,
      );
      process.chdir(mkdtempSync(join(tmpdir(), 'face-')));
      expect(() => descriptorFromImageDataUrl(dataUrl(oneFace()))).toThrow(
        /Face model missing/,
      );
    } finally {
      process.chdir(cwd);
    }
  });
});

function oneFaceRaster(): Buffer {
  const png = oneFace();
  return PNG.sync.read(png).data;
}
