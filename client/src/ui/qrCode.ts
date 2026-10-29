import { encode } from 'uqr';

/**
 * A QR code for `text` as an SVG string: dark squares on white with a quiet border, sharp at
 * any size. Medium error correction, so a slightly glary phone camera still reads it.
 */
export function qrCodeSvg(text: string): string {
  const { data, size } = encode(text, { ecc: 'M', border: 2 });
  let path = '';
  data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) path += `M${x} ${y}h1v1h-1z`;
    });
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" ` +
    `shape-rendering="crispEdges" role="img" aria-label="QR code to join">` +
    `<rect width="${size}" height="${size}" fill="#fff"/>` +
    `<path d="${path}" fill="#1d1135"/></svg>`
  );
}

/** The same QR code as a PNG picture (for copying or saving), `pixels` per square. */
export function qrCodePng(text: string, pixels = 12): Promise<Blob> {
  const { data, size } = encode(text, { ecc: 'M', border: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = size * pixels;
  canvas.height = size * pixels;
  const context = canvas.getContext('2d');
  if (!context) return Promise.reject(new Error('No 2D canvas'));
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#1d1135';
  data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) context.fillRect(x * pixels, y * pixels, pixels, pixels);
    });
  });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No PNG'))), 'image/png');
  });
}
