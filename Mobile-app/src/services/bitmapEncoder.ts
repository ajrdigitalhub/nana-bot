// Packs RGBA pixel data into the monochrome 1-bit-per-pixel format that
// Adafruit_GFX's drawBitmap() (used in the firmware's faces.h) expects:
// MSB-first, row bytes = ceil(width / 8), 1 = lit pixel.

export function rgbaToPackedBitmap(
  data: Uint8ClampedArray | number[],
  width: number,
  height: number,
  threshold = 128
): Uint8Array {
  const rowBytes = Math.ceil(width / 8);
  const out = new Uint8Array(rowBytes * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      // Treat transparent or near-white pixels as "off", darker/opaque
      // strokes as "on" — matches drawing on a white canvas with a dark pen.
      const luminance = (r + g + b) / 3;
      const lit = a > 40 && luminance < threshold;

      if (lit) {
        const byteIndex = y * rowBytes + (x >> 3);
        const bitIndex = 7 - (x & 7); // MSB first
        out[byteIndex] |= (1 << bitIndex);
      }
    }
  }
  return out;
}

export function bitmapToBase64(bitmap: Uint8Array): string {
  // React Native's global.btoa works on binary strings; build one from the
  // byte array first.
  let binary = '';
  for (let i = 0; i < bitmap.length; i++) {
    binary += String.fromCharCode(bitmap[i]);
  }
  return global.btoa(binary);
}
