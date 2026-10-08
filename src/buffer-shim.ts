// Lightweight browser Buffer polyfill for ESM & koishipro-core.js
export class Buffer extends Uint8Array {
  static from(value: any, encodingOrOffset?: any, length?: any): Buffer {
    if (typeof value === 'string') {
      const encoder = new TextEncoder();
      return new Buffer(encoder.encode(value).buffer);
    }
    if (value instanceof ArrayBuffer) {
      return new Buffer(value, encodingOrOffset, length);
    }
    if (ArrayBuffer.isView(value)) {
      return new Buffer(value.buffer as ArrayBuffer, value.byteOffset, value.byteLength);
    }
    if (Array.isArray(value)) {
      return new Buffer(new Uint8Array(value).buffer);
    }
    return new Buffer(value);
  }

  static alloc(size: number, fill: number = 0): Buffer {
    const buf = new Buffer(size);
    if (fill !== 0) buf.fill(fill);
    return buf;
  }

  static isBuffer(obj: any): boolean {
    return obj instanceof Uint8Array;
  }

  static concat(list: Uint8Array[], totalLength?: number): Buffer {
    if (totalLength === undefined) {
      totalLength = list.reduce((acc, curr) => acc + curr.length, 0);
    }
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const item of list) {
      result.set(item, offset);
      offset += item.length;
    }
    return new Buffer(result.buffer);
  }

  toString(encoding?: string): string {
    const decoder = new TextDecoder(encoding || 'utf-8');
    return decoder.decode(this);
  }
}

export const SlowBuffer = Buffer;
export const kMaxLength = 2147483647;

if (typeof globalThis !== 'undefined') {
  (globalThis as any).Buffer = Buffer;
}

export default {
  Buffer,
  SlowBuffer,
  kMaxLength,
};
