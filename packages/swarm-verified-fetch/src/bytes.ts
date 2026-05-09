export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}

export function spanBytesFromLength(length: number | bigint): Uint8Array {
  const output = new Uint8Array(8);
  let value = BigInt(length);

  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number(value & 0xffn);
    value >>= 8n;
  }

  return output;
}

export function lengthFromSpanBytes(span: Uint8Array): bigint {
  let value = 0n;

  for (let index = span.length - 1; index >= 0; index -= 1) {
    value = (value << 8n) + BigInt(span[index] ?? 0);
  }

  return value;
}
