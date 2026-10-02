export type ByteRange = { start: number; end: number };

export function parseByteRange(header: string, size: number): ByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || size <= 0 || (!match[1] && !match[2])) return null;
  const first = match[1] ? Number(match[1]) : null;
  const second = match[2] ? Number(match[2]) : null;
  if ((first !== null && !Number.isSafeInteger(first)) || (second !== null && !Number.isSafeInteger(second))) return null;
  if (first === null) {
    if (!second || second <= 0) return null;
    return { start: Math.max(0, size - second), end: size - 1 };
  }
  const end = second === null ? size - 1 : Math.min(second, size - 1);
  if (first >= size || first > end) return null;
  return { start: first, end };
}
