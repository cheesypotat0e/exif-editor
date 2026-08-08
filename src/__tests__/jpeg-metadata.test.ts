import { cliFixture, loadBuffer, repoFixture, setupMainDom } from "./support/helpers";

let createJpegBlobWithoutXmp: typeof import("../main").createJpegBlobWithoutXmp;
let getXmpSegmentRanges: typeof import("../main").getXmpSegmentRanges;
let normalizeRenderedExifSegment: typeof import("../main").normalizeRenderedExifSegment;
let parseXmpMetadata: typeof import("../main").parseXmpMetadata;
let scanJpegStructure: typeof import("../main").scanJpegStructure;

beforeAll(async () => {
  setupMainDom();
  const main = await import("../main");
  createJpegBlobWithoutXmp = main.createJpegBlobWithoutXmp;
  getXmpSegmentRanges = main.getXmpSegmentRanges;
  normalizeRenderedExifSegment = main.normalizeRenderedExifSegment;
  parseXmpMetadata = main.parseXmpMetadata;
  scanJpegStructure = main.scanJpegStructure;
});

describe("XMP segment handling", () => {
  it("detects XMP APP1 segments in a Photoshop fixture", () => {
    const buffer = loadBuffer(cliFixture("photoshop-xmp.jpg"));
    const structure = scanJpegStructure(buffer);
    expect(structure.xmpRanges.length).toBeGreaterThan(0);
    expect(getXmpSegmentRanges(buffer).length).toBeGreaterThan(0);
  });

  it("parses XMP metadata when present", () => {
    const buffer = loadBuffer(repoFixture("IMG_2619.JPG"));
    const metadata = parseXmpMetadata(buffer);
    expect(metadata).not.toBeNull();
    expect(
      Boolean(
        metadata?.creatorTool ||
          metadata?.modifyDate ||
          metadata?.documentId ||
          metadata?.instanceId ||
          (metadata?.history?.length ?? 0) > 0,
      ),
    ).toBe(true);
  });

  it("removes XMP segments while preserving a valid JPEG", async () => {
    const buffer = loadBuffer(cliFixture("photoshop-xmp.jpg"));
    const structure = scanJpegStructure(buffer);
    const blob = createJpegBlobWithoutXmp(buffer, structure.xmpRanges);
    const stripped = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });

    const bytes = new Uint8Array(stripped);
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xd8);
    expect(bytes[bytes.length - 2]).toBe(0xff);
    expect(bytes[bytes.length - 1]).toBe(0xd9);
    expect(stripped.byteLength).toBeLessThan(buffer.byteLength);
    expect(scanJpegStructure(stripped).xmpRanges).toHaveLength(0);
  });

  it("returns the original buffer as a blob when no XMP is present", async () => {
    const buffer = loadBuffer(cliFixture("no-exif.jpg"));
    const blob = createJpegBlobWithoutXmp(buffer);
    const output = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
    expect(output.byteLength).toBe(buffer.byteLength);
  });
});

describe("normalizeRenderedExifSegment edge cases", () => {
  it("returns short segments unchanged", () => {
    const segment = new Uint8Array([0xff, 0xd8]);
    expect(normalizeRenderedExifSegment(segment, { width: 100, height: 100 }))
      .toBe(segment);
  });

  it("returns non-EXIF APP1 segments unchanged", () => {
    const buffer = loadBuffer(repoFixture("IMG_2619.JPG"));
    const structure = scanJpegStructure(buffer);
    const xmpRange = structure.metadataRanges.find((range) => range.isXmp);
    if (!xmpRange) {
      throw new Error("Expected fixture to include an XMP segment");
    }
    const segment = new Uint8Array(buffer).subarray(xmpRange.start, xmpRange.end);
    const normalized = normalizeRenderedExifSegment(segment, {
      width: 400,
      height: 300,
    });
    expect(normalized).toBe(segment);
  });
});
