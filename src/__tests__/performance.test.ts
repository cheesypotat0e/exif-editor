import * as fs from "fs";
import * as path from "path";
import { cliFixture, loadBuffer, setupMainDom } from "./support/helpers";

let scanJpegStructure: typeof import("../main").scanJpegStructure;
let createStoredZip: typeof import("../main").createStoredZip;
let runWithConcurrency: typeof import("../main").runWithConcurrency;
let parseExifOrientation: typeof import("../main").parseExifOrientation;
let getDisplayDimensions: typeof import("../main").getDisplayDimensions;
let getContainedDimensions: typeof import("../main").getContainedDimensions;
let normalizeRenderedExifSegment: typeof import("../main").normalizeRenderedExifSegment;

beforeAll(async () => {
  setupMainDom();
  const main = await import("../main");
  scanJpegStructure = main.scanJpegStructure;
  createStoredZip = main.createStoredZip;
  runWithConcurrency = main.runWithConcurrency;
  parseExifOrientation = main.parseExifOrientation;
  getDisplayDimensions = main.getDisplayDimensions;
  getContainedDimensions = main.getContainedDimensions;
  normalizeRenderedExifSegment = main.normalizeRenderedExifSegment;
});

function getSampleBuffer(filename: string) {
  const filePath = path.join(__dirname, "../../", filename);
  const buffer = fs.readFileSync(filePath);
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
}

function setExifOrientation(arrayBuffer: ArrayBuffer, orientation: number) {
  const updated = arrayBuffer.slice(0);
  const structure = scanJpegStructure(updated);
  const exifRange = structure.metadataRanges.find(
    (range) =>
      !range.isXmp &&
      new DataView(updated).getUint32(range.start + 4, false) === 0x45786966,
  );
  if (!exifRange) {
    throw new Error("Fixture has no EXIF segment");
  }
  const tiffStart = exifRange.start + 10;
  const view = new DataView(updated);
  const littleEndian = view.getUint16(tiffStart, false) === 0x4949;
  const ifd0 = tiffStart + view.getUint32(tiffStart + 4, littleEndian);
  const count = view.getUint16(ifd0, littleEndian);
  for (let index = 0; index < count; index++) {
    const entry = ifd0 + 2 + index * 12;
    if (view.getUint16(entry, littleEndian) === 0x0112) {
      view.setUint16(entry + 8, orientation, littleEndian);
      return updated;
    }
  }
  throw new Error("Fixture has no orientation tag");
}

describe("performance architecture", () => {
  it("indexes JPEG metadata and XMP ranges once", () => {
    const structure = scanJpegStructure(getSampleBuffer("IMG_2619.JPG"));
    expect(structure.metadataRanges.length).toBeGreaterThan(0);
    expect(structure.xmpRanges.length).toBeGreaterThan(0);
    expect(structure.metadataRanges.some((range) => range.isXmp)).toBe(true);
  });

  it("bounds concurrent imports while retaining input-indexed results", async () => {
    const completionOrder: number[] = [];
    const resultSlots: number[] = [];
    let active = 0;
    let peakActive = 0;

    await runWithConcurrency([40, 5, 20], 2, async (delay, index) => {
      active++;
      peakActive = Math.max(peakActive, active);
      await new Promise((resolve) => setTimeout(resolve, delay));
      completionOrder.push(index);
      resultSlots[index] = index;
      active--;
    });

    expect(peakActive).toBe(2);
    expect(completionOrder[0]).toBe(1);
    expect(resultSlots).toEqual([0, 1, 2]);
  });

  it("writes ZIP local entries in import order", async () => {
    const archive = await createStoredZip([
      { name: "first.jpg", data: new Uint8Array([1, 2, 3]) },
      { name: "second.jpg", data: new Uint8Array([4, 5]) },
    ]);
    const archiveBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new globalThis.FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(archive);
    });
    const bytes = new Uint8Array(archiveBuffer);
    const decoder = new TextDecoder();
    const names: string[] = [];
    let offset = 0;

    while (
      offset + 30 <= bytes.length &&
      new DataView(bytes.buffer).getUint32(offset, true) === 0x04034b50
    ) {
      const view = new DataView(bytes.buffer, offset);
      const dataLength = view.getUint32(18, true);
      const nameLength = view.getUint16(26, true);
      names.push(
        decoder.decode(bytes.subarray(offset + 30, offset + 30 + nameLength)),
      );
      offset += 30 + nameLength + dataLength;
    }

    expect(names).toEqual(["first.jpg", "second.jpg"]);
  });

  it("preserves aspect ratios for portrait, landscape, square, and panorama cards", () => {
    expect(getContainedDimensions({ width: 300, height: 400 }, 144, 192))
      .toEqual({ width: 144, height: 192 });
    expect(getContainedDimensions({ width: 400, height: 300 }, 144, 192))
      .toEqual({ width: 144, height: 108 });
    expect(getContainedDimensions({ width: 500, height: 500 }, 144, 192))
      .toEqual({ width: 144, height: 144 });
    expect(getContainedDimensions({ width: 800, height: 200 }, 144, 192))
      .toEqual({ width: 144, height: 36 });
  });

  it("uses display dimensions for rotated EXIF images", () => {
    expect(getDisplayDimensions({ width: 400, height: 300 }, 6)).toEqual({
      width: 300,
      height: 400,
    });
    expect(getDisplayDimensions({ width: 400, height: 300 }, 1)).toEqual({
      width: 400,
      height: 300,
    });
  });

  it("normalizes transformed EXIF output without mutating the source", () => {
    const oriented = setExifOrientation(getSampleBuffer("IMG_2619.JPG"), 6);
    expect(parseExifOrientation(oriented)).toBe(6);
    const output = oriented.slice(0);
    const structure = scanJpegStructure(output);
    const exifRange = structure.metadataRanges.find(
      (range) => !range.isXmp,
    );
    expect(exifRange).toBeDefined();
    const segment = new Uint8Array(output).slice(
      exifRange!.start,
      exifRange!.end,
    );
    const normalized = normalizeRenderedExifSegment(segment, {
      width: 300,
      height: 400,
    });
    new Uint8Array(output).set(normalized, exifRange!.start);

    expect(parseExifOrientation(output)).toBe(1);
    expect(parseExifOrientation(oriented)).toBe(6);
  });

  it("runWithConcurrency handles an empty list", async () => {
    await runWithConcurrency([], 2, async () => {
      throw new Error("should not run");
    });
  });

  it("runWithConcurrency propagates task errors", async () => {
    await expect(
      runWithConcurrency([1], 1, async () => {
        throw new Error("task failed");
      }),
    ).rejects.toThrow("task failed");
  });

  it("createStoredZip handles an empty archive", async () => {
    const archive = await createStoredZip([]);
    const archiveBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new globalThis.FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(archive);
    });
    expect(new Uint8Array(archiveBuffer).length).toBe(22);
  });

  it("createStoredZip supports unicode filenames", async () => {
    const archive = await createStoredZip([
      { name: "ümlaut-照片.jpg", data: new Uint8Array([7, 8, 9]) },
    ]);
    const archiveBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new globalThis.FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(archive);
    });
    const bytes = new Uint8Array(archiveBuffer);
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const nameLength = view.getUint16(26, true);
    const name = new TextDecoder().decode(bytes.subarray(30, 30 + nameLength));
    expect(name).toBe("ümlaut-照片.jpg");
  });
});

describe("parseExifOrientation fixtures", () => {
  for (let orientation = 1; orientation <= 8; orientation++) {
    it(`reads orientation ${orientation}`, () => {
      const buffer = loadBuffer(cliFixture(`orientation-${orientation}.jpg`));
      expect(parseExifOrientation(buffer)).toBe(orientation);
    });
  }
});
