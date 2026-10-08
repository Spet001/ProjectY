import { unzipSync } from 'fflate';

export class JSZipShim {
  public files: Record<string, { name: string; dir: boolean; async: (type: string) => Promise<Uint8Array> }> = {};

  static async loadAsync(data: Uint8Array | ArrayBuffer): Promise<JSZipShim> {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const unzipped = unzipSync(bytes);
    const instance = new JSZipShim();

    for (const [name, content] of Object.entries(unzipped)) {
      instance.files[name] = {
        name,
        dir: name.endsWith('/'),
        async: async (_type: string) => content,
      };
    }

    return instance;
  }
}

export default JSZipShim;
