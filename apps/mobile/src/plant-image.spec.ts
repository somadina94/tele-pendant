import { isSvgAsset, svgViewSize } from './plant-image';

describe('plant image', () => {
  it('treats an svg path as svg and a png from a pdf as a raster', () => {
    expect(
      isSvgAsset('http://192.168.0.192:4050/hmi-assets/demo-crane.svg'),
    ).toBe(true);
    expect(isSvgAsset('/hmi-assets/page.svg?v=1')).toBe(true);
    expect(
      isSvgAsset('/hmi-assets/5e9ce4f9-fa3f-4c6a-99ce-c70661aae287.png'),
    ).toBe(false);
  });

  it('reads the svg view box', () => {
    expect(
      svgViewSize(
        '<svg viewBox="0 0 267 150" xmlns="http://www.w3.org/2000/svg"/>',
      ),
    ).toEqual({ width: 267, height: 150 });
  });

  it('reads width and height when there is no view box', () => {
    expect(svgViewSize('<svg width="400" height="200"></svg>')).toEqual({
      width: 400,
      height: 200,
    });
    expect(svgViewSize('<svg></svg>')).toBeNull();
  });
});
