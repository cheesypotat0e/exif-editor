const TAGS = {
  SOI: 0xffd8,
  APP0: 0xffe0,
  APP0_IDENTIFIER: 0x4a46494600, // "JFIF\0"
} as const;

export const isExifJpeg = (dataView: DataView): boolean => {
  // Find the SOI marker
  if (dataView.byteLength < 2 || dataView.getUint16(0) !== TAGS.SOI) {
    console.error("File does not start with the JPEG SOI marker (FFD8).");
    return false;
  }

  let offset = 2;

  // APP0 Marker
  if (dataView.getUint16(offset) !== TAGS.APP0) {
    console.error("File does not start with the JPEG APP0 marker (FFE0).");
    return false;
  }

  offset += 2;

  // APP0 Marker Length
  const app0Length = dataView.getUint16(offset);

  // APP0 Marker Data (length include the marker and length itself)
  const app0DataView = new DataView(dataView.buffer, offset - 2, app0Length);

  // App0 Length Offset (0x02 bytes from APP0 Marker)
  let app0DataOffset = 4;

  // App0 Identifier Offset (0x04 bytes from APP0 Marker)
  app0DataOffset += 2;

  const identifier = new Uint8Array(
    app0DataView.buffer,
    app0DataView.byteOffset + 4,
    5
  ).reduce((acc, byte) => {
    // Use BigInt for safe shifting and combining
    return (acc << 8n) | BigInt(byte);
  }, 0n);

  if (identifier !== BigInt(TAGS.APP0_IDENTIFIER)) {
    console.error("File does not start with the JPEG JFIF marker (JFIF\\0).");
    return false;
  }

  // JFIF format revision (0x09 bytes from APP0 Marker)
  app0DataOffset += 5;

  // const version = new Uint8Array(
  //   app0DataView.buffer,
  //   app0DataView.byteOffset + app0DataOffset,
  //   2
  // ).reduce((acc, byte) => {
  // Use BigInt for safe shifting and combining
  //   return (acc << 8n) | BigInt(byte);
  // }, 0n);

  // Units for image resolution (0x0b bytes from APP0 Marker)
  app0DataOffset += 2;

  // const units = dataView.getUint8(app0DataOffset);

  // // X density (0x0c bytes from APP0 Marker)
  // app0DataOffset += 1;

  // const xDensity = dataView.getUint16(app0DataOffset);

  // // Y density (0x0e bytes from APP0 Marker)
  // app0DataOffset += 2;

  // const yDensity = dataView.getUint16(app0DataOffset);

  // // X thumbnail (0x10 bytes from APP0 Marker)
  // app0DataOffset += 2;

  // const xThumbnail = dataView.getUint8(app0DataOffset);

  // // Y thumbnail (0x12 bytes from APP0 Marker)
  // app0DataOffset += 1;

  // const yThumbnail = dataView.getUint8(app0DataOffset);

  // const app0Data = {
  //   length: app0Length,
  //   identifier: identifier.toString(16),
  //   version: version.toString(16),
  //   units: units.toString(16),
  //   xDensity,
  //   yDensity,
  //   xThumbnail,
  //   yThumbnail,
  // };

  return true;
};
