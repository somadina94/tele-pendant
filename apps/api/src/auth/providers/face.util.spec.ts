import {
  cosineSimilarity,
  descriptorFromImageDataUrl,
  FACE_MATCH_THRESHOLD,
  parseDescriptor,
  serializeDescriptor,
} from './face.util';

describe('face.util', () => {
  it('matches identical images above threshold', () => {
    const dataUrl =
      'data:image/png;base64,' + Buffer.alloc(512, 120).toString('base64');
    const a = descriptorFromImageDataUrl(dataUrl);
    const b = descriptorFromImageDataUrl(dataUrl);
    expect(cosineSimilarity(a, b)).toBeGreaterThanOrEqual(FACE_MATCH_THRESHOLD);
  });

  it('scores different payloads lower', () => {
    const a = descriptorFromImageDataUrl(
      'data:image/png;base64,' + Buffer.alloc(512, 10).toString('base64'),
    );
    const b = descriptorFromImageDataUrl(
      'data:image/png;base64,' + Buffer.alloc(512, 250).toString('base64'),
    );
    expect(cosineSimilarity(a, b)).toBeLessThan(FACE_MATCH_THRESHOLD);
  });

  it('rejects empty images and invalid templates', () => {
    expect(() => descriptorFromImageDataUrl('data:image/png;base64,')).toThrow(
      /Empty face image/,
    );
    expect(() => parseDescriptor('"nope"')).toThrow(/Invalid face template/);
    expect(() => parseDescriptor('[1,"x"]')).toThrow(/Invalid face template/);
    expect(() => parseDescriptor('{"a":1}')).toThrow(/Invalid face template/);
  });

  it('round-trips serialize/parse and handles raw base64', () => {
    const desc = descriptorFromImageDataUrl(
      Buffer.alloc(64, 40).toString('base64'),
    );
    const raw = serializeDescriptor(desc);
    expect(parseDescriptor(raw)).toEqual(desc);
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1], [])).toBe(0);
  });

  it('samples high luminance into last bin', () => {
    const desc = descriptorFromImageDataUrl(
      'data:image/png;base64,' + Buffer.alloc(64, 255).toString('base64'),
    );
    expect(desc.length).toBe(32);
    expect(desc.some((x) => x > 0)).toBe(true);
  });
});
