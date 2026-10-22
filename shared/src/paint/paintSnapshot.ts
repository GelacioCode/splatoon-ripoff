// The whole paint grid in a few bytes for players who join mid-match: the cells (one byte
// each, see PaintGrid) as runs of equal values. Layout: the cell count, then for each run its
// value and length. Counts are varints (7 bits per byte, low bits first).

function writeVarint(out: number[], value: number): void {
  let rest = value;
  while (rest >= 0x80) {
    out.push((rest & 0x7f) | 0x80);
    rest = Math.floor(rest / 0x80);
  }
  out.push(rest);
}

export function encodePaintSnapshot(cells: Uint8Array): Uint8Array {
  const out: number[] = [];
  writeVarint(out, cells.length);
  let i = 0;
  while (i < cells.length) {
    const value = cells[i];
    let end = i + 1;
    while (end < cells.length && cells[end] === value) end++;
    out.push(value);
    writeVarint(out, end - i);
    i = end;
  }
  return Uint8Array.from(out);
}

/** The cells from a snapshot, or null when the data is damaged. */
export function decodePaintSnapshot(bytes: Uint8Array): Uint8Array | null {
  let offset = 0;
  const readVarint = (): number | null => {
    let value = 0;
    let scale = 1;
    while (offset < bytes.length) {
      const byte = bytes[offset++];
      value += (byte & 0x7f) * scale;
      if (byte < 0x80) return value;
      scale *= 0x80;
      if (scale > 2 ** 35) return null;
    }
    return null;
  };

  const length = readVarint();
  if (length === null) return null;
  const cells = new Uint8Array(length);
  let filled = 0;
  while (filled < length) {
    if (offset >= bytes.length) return null;
    const value = bytes[offset++];
    const run = readVarint();
    if (run === null || run === 0 || filled + run > length) return null;
    cells.fill(value, filled, filled + run);
    filled += run;
  }
  return cells;
}
