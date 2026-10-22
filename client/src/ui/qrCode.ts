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
