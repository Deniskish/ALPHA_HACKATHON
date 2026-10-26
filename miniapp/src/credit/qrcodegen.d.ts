export namespace qrcodegen {
  export interface Ecc {
    ordinal: number;
    formatBits: number;
  }

  export class QrCode {
    public static readonly Ecc: {
      LOW: Ecc;
      MEDIUM: Ecc;
      QUARTILE: Ecc;
      HIGH: Ecc;
    };

    public static encodeText(text: string, ecl: Ecc): QrCode;

    public readonly size: number;
    public getModule(x: number, y: number): boolean;
  }
}
