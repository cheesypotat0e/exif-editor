/**
 * Generates minimal JPEG test fixtures with specific EXIF metadata
 * that the test suite expects. Run once to create the fixture files.
 *
 * Usage: node generate-fixtures.ts
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Types ---

interface Rational {
  num: number;
  den: number;
}

interface IFDEntry {
  tag: number;
  type: number;
  count: number;
  value?: number;
  data?: Uint8Array;
  inlineBytes?: Uint8Array;
  _patchKey?: string;
}

interface ExifSegmentConfig {
  ifd0Entries?: IFDEntry[];
  exifEntries?: IFDEntry[];
  gpsEntries?: IFDEntry[];
}

// --- Helpers ---

function encodeAscii(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length + 1);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  bytes[str.length] = 0;
  return bytes;
}

function writeUint16LE(view: DataView, offset: number, value: number): number {
  view.setUint16(offset, value, true);
  return offset + 2;
}

function writeUint32LE(view: DataView, offset: number, value: number): number {
  view.setUint32(offset, value, true);
  return offset + 4;
}

function degreesToRationals(decimalDeg: number): Rational[] {
  const abs = Math.abs(decimalDeg);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = Math.round((minFloat - min) * 60 * 10000);
  return [
    { num: deg, den: 1 },
    { num: min, den: 1 },
    { num: sec, den: 10000 },
  ];
}

/**
 * Builds a complete EXIF APP1 segment.
 */
function buildExifSegment(config: ExifSegmentConfig): Uint8Array {
  const {
    ifd0Entries = [],
    exifEntries = [],
    gpsEntries = [],
  } = config;

  const buf = new ArrayBuffer(16384);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  let pos = 0;

  pos = writeUint16LE(view, pos, 0x4949); // II (little-endian)
  pos = writeUint16LE(view, pos, 42);
  pos = writeUint32LE(view, pos, 8); // IFD0 starts right after TIFF header

  const allIfd0: IFDEntry[] = [...ifd0Entries];
  const hasExif = exifEntries.length > 0;
  const hasGps = gpsEntries.length > 0;

  if (hasExif) allIfd0.push({ tag: 0x8769, type: 4, count: 1, value: 0, _patchKey: "exifPtr" });
  if (hasGps) allIfd0.push({ tag: 0x8825, type: 4, count: 1, value: 0, _patchKey: "gpsPtr" });

  allIfd0.sort((a, b) => a.tag - b.tag);

  const ifd0Count = allIfd0.length;
  pos = writeUint16LE(view, pos, ifd0Count);

  const ifd0EntryStart = pos;
  pos += ifd0Count * 12 + 4;

  let dataPos = pos;
  const patchLocations: Record<string, number> = {};

  for (let i = 0; i < ifd0Count; i++) {
    const entry = allIfd0[i];
    const entryOffset = ifd0EntryStart + i * 12;

    writeUint16LE(view, entryOffset, entry.tag);
    writeUint16LE(view, entryOffset + 2, entry.type);
    writeUint32LE(view, entryOffset + 4, entry.count);

    if (entry._patchKey) {
      patchLocations[entry._patchKey] = entryOffset + 8;
      writeUint32LE(view, entryOffset + 8, 0);
    } else if (entry.data) {
      const byteLen = entry.data.length;
      if (byteLen <= 4) {
        bytes.set(entry.data, entryOffset + 8);
      } else {
        writeUint32LE(view, entryOffset + 8, dataPos);
        bytes.set(entry.data, dataPos);
        dataPos += byteLen;
        if (dataPos % 2 !== 0) dataPos++;
      }
    } else {
      writeUint32LE(view, entryOffset + 8, entry.value ?? 0);
    }
  }

  writeUint32LE(view, ifd0EntryStart + ifd0Count * 12, 0);
  pos = dataPos;

  if (hasExif) {
    writeUint32LE(view, patchLocations.exifPtr, pos);

    const exifCount = exifEntries.length;
    pos = writeUint16LE(view, pos, exifCount);
    const exifEntryStart = pos;
    pos += exifCount * 12 + 4;
    let exifDataPos = pos;

    for (let i = 0; i < exifCount; i++) {
      const entry = exifEntries[i];
      const entryOffset = exifEntryStart + i * 12;

      writeUint16LE(view, entryOffset, entry.tag);
      writeUint16LE(view, entryOffset + 2, entry.type);
      writeUint32LE(view, entryOffset + 4, entry.count);

      if (entry.data) {
        const byteLen = entry.data.length;
        if (byteLen <= 4) {
          bytes.set(entry.data, entryOffset + 8);
        } else {
          writeUint32LE(view, entryOffset + 8, exifDataPos);
          bytes.set(entry.data, exifDataPos);
          exifDataPos += byteLen;
          if (exifDataPos % 2 !== 0) exifDataPos++;
        }
      } else {
        writeUint32LE(view, entryOffset + 8, entry.value ?? 0);
      }
    }

    writeUint32LE(view, exifEntryStart + exifCount * 12, 0);
    pos = exifDataPos;
  }

  if (hasGps) {
    writeUint32LE(view, patchLocations.gpsPtr, pos);

    const gpsCount = gpsEntries.length;
    pos = writeUint16LE(view, pos, gpsCount);
    const gpsEntryStart = pos;
    pos += gpsCount * 12 + 4;
    let gpsDataPos = pos;

    for (let i = 0; i < gpsCount; i++) {
      const entry = gpsEntries[i];
      const entryOffset = gpsEntryStart + i * 12;

      writeUint16LE(view, entryOffset, entry.tag);
      writeUint16LE(view, entryOffset + 2, entry.type);
      writeUint32LE(view, entryOffset + 4, entry.count);

      if (entry.data) {
        const byteLen = entry.data.length;
        if (byteLen <= 4) {
          bytes.set(entry.data, entryOffset + 8);
        } else {
          writeUint32LE(view, entryOffset + 8, gpsDataPos);
          bytes.set(entry.data, gpsDataPos);
          gpsDataPos += byteLen;
          if (gpsDataPos % 2 !== 0) gpsDataPos++;
        }
      } else if (entry.inlineBytes) {
        bytes.set(entry.inlineBytes, entryOffset + 8);
      } else {
        writeUint32LE(view, entryOffset + 8, entry.value ?? 0);
      }
    }

    writeUint32LE(view, gpsEntryStart + gpsCount * 12, 0);
    pos = gpsDataPos;
  }

  const tiffData = bytes.slice(0, pos);

  const exifHeader = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);
  const segmentPayload = new Uint8Array(exifHeader.length + tiffData.length);
  segmentPayload.set(exifHeader, 0);
  segmentPayload.set(tiffData, exifHeader.length);

  const segmentLength = 2 + segmentPayload.length;
  const app1 = new Uint8Array(2 + 2 + segmentPayload.length);
  app1[0] = 0xff;
  app1[1] = 0xe1;
  app1[2] = (segmentLength >> 8) & 0xff;
  app1[3] = segmentLength & 0xff;
  app1.set(segmentPayload, 4);

  return app1;
}

function buildXmpSegment(xml: string): Uint8Array {
  const xmpHeader = "http://ns.adobe.com/xap/1.0/\0";
  const headerBytes = new TextEncoder().encode(xmpHeader);
  const xmlBytes = new TextEncoder().encode(xml);
  const payload = new Uint8Array(headerBytes.length + xmlBytes.length);
  payload.set(headerBytes, 0);
  payload.set(xmlBytes, headerBytes.length);

  const segmentLength = 2 + payload.length;
  const segment = new Uint8Array(2 + 2 + payload.length);
  segment[0] = 0xff;
  segment[1] = 0xe1;
  segment[2] = (segmentLength >> 8) & 0xff;
  segment[3] = segmentLength & 0xff;
  segment.set(payload, 4);
  return segment;
}

function buildMinimalScanData(): Uint8Array {
  return new Uint8Array([
    0xff, 0xda, // SOS marker
    0x00, 0x08, // length
    0x01, // number of components
    0x01, 0x00, // component 1, Huffman table 0/0
    0x00, 0x3f, 0x00, // spectral selection start/end, successive approx
    0x7b, 0x40,
  ]);
}

function buildSOF0AndDHT() {
  const sof0 = new Uint8Array([
    0xff, 0xc0,
    0x00, 0x0b,
    0x08,
    0x00, 0x01,
    0x00, 0x01,
    0x01,
    0x01, 0x11, 0x00,
  ]);

  const dqt = new Uint8Array(2 + 2 + 1 + 64);
  dqt[0] = 0xff;
  dqt[1] = 0xdb;
  dqt[2] = 0x00;
  dqt[3] = 0x43;
  dqt[4] = 0x00;
  for (let i = 0; i < 64; i++) dqt[5 + i] = 1;

  const dht = new Uint8Array([
    0xff, 0xc4,
    0x00, 0x1f,
    0x00,
    0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01,
    0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b,
  ]);

  return { sof0, dqt, dht };
}

function concatArrays(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

function asciiEntry(tag: number, str: string): IFDEntry {
  const data = encodeAscii(str);
  return { tag, type: 2, count: data.length, data };
}

function rationalEntry(tag: number, rationals: Rational[]): IFDEntry {
  const data = new Uint8Array(rationals.length * 8);
  const dv = new DataView(data.buffer);
  rationals.forEach((r, i) => {
    dv.setUint32(i * 8, r.num, true);
    dv.setUint32(i * 8 + 4, r.den, true);
  });
  return { tag, type: 5, count: rationals.length, data };
}

function shortEntry(tag: number, value: number): IFDEntry {
  return { tag, type: 3, count: 1, value };
}

// --- Fixture: IMG_2865.JPG ---

function generateIMG2865(): Uint8Array {
  const ifd0Entries: IFDEntry[] = [
    shortEntry(0x0112, 1),
    asciiEntry(0x0131, "GIMP 2.10.36"),
    asciiEntry(0x0132, "2026:03:20 04:47:46"),
  ];

  const exifEntries: IFDEntry[] = [
    asciiEntry(0x9003, "2026:03:20 04:43:17"),
    asciiEntry(0x9004, "2026:03:20 04:43:17"),
  ].sort((a, b) => a.tag - b.tag);

  const latRationals = degreesToRationals(32.867872);
  const lonRationals = degreesToRationals(96.61863);

  const gpsEntries: IFDEntry[] = [
    { tag: 0x0001, type: 2, count: 2, inlineBytes: new Uint8Array([0x4e, 0x00, 0x00, 0x00]) },
    rationalEntry(0x0002, latRationals),
    { tag: 0x0003, type: 2, count: 2, inlineBytes: new Uint8Array([0x57, 0x00, 0x00, 0x00]) },
    rationalEntry(0x0004, lonRationals),
    { tag: 0x0005, type: 1, count: 1, inlineBytes: new Uint8Array([0x00, 0x00, 0x00, 0x00]) },
    rationalEntry(0x0006, [{ num: 16148, den: 100 }]),
    rationalEntry(0x0007, [{ num: 4, den: 1 }, { num: 43, den: 1 }, { num: 17, den: 1 }]),
    asciiEntry(0x001d, "2026:03:20"),
  ];

  const exifSegment = buildExifSegment({ ifd0Entries, exifEntries, gpsEntries });
  const { sof0, dqt, dht } = buildSOF0AndDHT();
  const scanData = buildMinimalScanData();

  return concatArrays(
    new Uint8Array([0xff, 0xd8]),
    exifSegment,
    dqt,
    sof0,
    dht,
    scanData,
    new Uint8Array([0xff, 0xd9]),
  );
}

// --- Fixture: IMG_2619.JPG ---

function generateIMG2619(): Uint8Array {
  const ifd0Entries: IFDEntry[] = [
    asciiEntry(0x010f, "Apple"),
    asciiEntry(0x0110, "iPhone 17 Pro Max"),
    shortEntry(0x0112, 1),
    asciiEntry(0x0132, "2026:03:20 04:40:00"),
    asciiEntry(0x013c, "iPhone 17 Pro Max"),
  ];

  const lensSpecData = new Uint8Array(32);
  const lsDv = new DataView(lensSpecData.buffer);
  lsDv.setUint32(0, 6765, true);
  lsDv.setUint32(4, 1000, true);
  lsDv.setUint32(8, 6765, true);
  lsDv.setUint32(12, 1000, true);
  lsDv.setUint32(16, 178, true);
  lsDv.setUint32(20, 100, true);
  lsDv.setUint32(24, 178, true);
  lsDv.setUint32(28, 100, true);

  const exifEntries: IFDEntry[] = [
    asciiEntry(0x9003, "2026:03:20 04:40:00"),
    asciiEntry(0x9004, "2026:03:20 04:40:00"),
    shortEntry(0xa405, 24),
    { tag: 0xa432, type: 5, count: 4, data: lensSpecData },
    asciiEntry(0xa433, "Apple"),
    asciiEntry(0xa434, "iPhone 17 Pro Max back triple camera 6.765mm f/1.78"),
  ].sort((a, b) => a.tag - b.tag);

  const latRationals = degreesToRationals(32.867877);
  const lonRationals = degreesToRationals(96.61861);

  const gpsEntries: IFDEntry[] = [
    { tag: 0x0001, type: 2, count: 2, inlineBytes: new Uint8Array([0x4e, 0x00, 0x00, 0x00]) },
    rationalEntry(0x0002, latRationals),
    { tag: 0x0003, type: 2, count: 2, inlineBytes: new Uint8Array([0x57, 0x00, 0x00, 0x00]) },
    rationalEntry(0x0004, lonRationals),
    { tag: 0x0005, type: 1, count: 1, inlineBytes: new Uint8Array([0x00, 0x00, 0x00, 0x00]) },
    rationalEntry(0x0006, [{ num: 100, den: 1 }]),
    rationalEntry(0x0007, [{ num: 4, den: 1 }, { num: 40, den: 1 }, { num: 0, den: 1 }]),
    asciiEntry(0x001d, "2026:03:20"),
  ];

  const exifSegment = buildExifSegment({ ifd0Entries, exifEntries, gpsEntries });

  const xmpXml = `<?xpacket begin="\xEF\xBB\xBF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/"
    xmp:CreatorTool="16.0"
    xmp:ModifyDate="2026-03-20T04:40:00"
    xmpMM:DocumentID="xmp.did:ABC123"
    xmpMM:InstanceID="xmp.iid:DEF456">
   <xmpMM:History>
    <rdf:Seq>
     <rdf:li
      stEvt:action="saved"
      stEvt:when="2026-03-20T04:40:00"
      stEvt:softwareAgent="16.0"
      xmlns:stEvt="http://ns.adobe.com/xap/1.0/sType/ResourceEvent#"/>
    </rdf:Seq>
   </xmpMM:History>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

  const xmpSegment = buildXmpSegment(xmpXml);
  const { sof0, dqt, dht } = buildSOF0AndDHT();
  const scanData = buildMinimalScanData();

  return concatArrays(
    new Uint8Array([0xff, 0xd8]),
    exifSegment,
    xmpSegment,
    dqt,
    sof0,
    dht,
    scanData,
    new Uint8Array([0xff, 0xd9]),
  );
}

// --- Fixture: IMG_0239.jpg ---

function generateIMG0239(): Uint8Array {
  const { sof0, dqt, dht } = buildSOF0AndDHT();
  const scanData = buildMinimalScanData();

  return concatArrays(
    new Uint8Array([0xff, 0xd8]),
    dqt,
    sof0,
    dht,
    scanData,
    new Uint8Array([0xff, 0xd9]),
  );
}

// --- Write files ---

const fixtures = [
  { name: "IMG_2865.JPG", generate: generateIMG2865 },
  { name: "IMG_2619.JPG", generate: generateIMG2619 },
  { name: "IMG_0239.jpg", generate: generateIMG0239 },
];

for (const fixture of fixtures) {
  const data = fixture.generate();
  const outPath = path.join(__dirname, fixture.name);
  fs.writeFileSync(outPath, data);
  console.log(`Generated ${fixture.name} (${data.length} bytes)`);
}
