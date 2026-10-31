export function getBit(buf: Buffer, address: number): boolean {
  const byte = buf[address >> 3] ?? 0;
  return Boolean(byte & (1 << (address % 8)));
}

export function setBit(buf: Buffer, address: number, value: boolean): void {
  const index = address >> 3;
  const mask = 1 << (address % 8);
  if (value) {
    buf[index] = (buf[index] ?? 0) | mask;
  } else {
    buf[index] = (buf[index] ?? 0) & ~mask;
  }
}
