import { inflateSync } from 'node:zlib';

export type Rgb = [number, number, number];

function paeth(left: number, up: number, upLeft: number) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const diagonal = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= diagonal) return left;
  if (upDistance <= diagonal) return up;
  return upLeft;
}

/** Decode an 8-bit RGB or RGBA PNG. Shared by the lane screenshot tests. */
function decode(buffer: Buffer): { width: number; bytesPerPixel: number; rows: Buffer[] } {
  let offset = 8;
  const chunks: Buffer[] = [];
  let width = 0;
  let height = 0;
  let colorType = 0;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9] ?? 0;
    } else if (type === 'IDAT') chunks.push(data);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * bytesPerPixel;
  let source = 0;
  let previous = Buffer.alloc(stride);
  const rows: Buffer[] = [];
  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    const filter = raw[source] ?? 0;
    source += 1;
    const row = Buffer.alloc(stride);
    for (let index = 0; index < stride; index += 1) {
      const value = raw[source] ?? 0;
      source += 1;
      const left = index >= bytesPerPixel ? (row[index - bytesPerPixel] ?? 0) : 0;
      const up = previous[index] ?? 0;
      const upLeft = index >= bytesPerPixel ? (previous[index - bytesPerPixel] ?? 0) : 0;
      let decoded = value;
      if (filter === 1) decoded = value + left;
      else if (filter === 2) decoded = value + up;
      else if (filter === 3) decoded = value + Math.floor((left + up) / 2);
      else if (filter === 4) decoded = value + paeth(left, up, upLeft);
      else if (filter !== 0) throw new Error(`unsupported png filter ${filter}`);
      row[index] = decoded & 255;
    }
    rows.push(row);
    previous = row;
  }
  return { width, bytesPerPixel, rows };
}

function rgbAt(row: Buffer | undefined, x: number, bytesPerPixel: number): Rgb {
  const start = x * bytesPerPixel;
  return [row?.[start] ?? 0, row?.[start + 1] ?? 0, row?.[start + 2] ?? 0];
}

export function pngPixel(buffer: Buffer, x: number, y: number): Rgb {
  const { bytesPerPixel, rows } = decode(buffer);
  return rgbAt(rows[y], x, bytesPerPixel);
}

/** First row, which is all a 1px-tall lane sample contains. */
export function pngRow(buffer: Buffer): Rgb[] {
  const { width, bytesPerPixel, rows } = decode(buffer);
  const pixels: Rgb[] = [];
  for (let x = 0; x < width; x += 1) pixels.push(rgbAt(rows[0], x, bytesPerPixel));
  return pixels;
}
