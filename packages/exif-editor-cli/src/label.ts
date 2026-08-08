import sharp from "sharp";
import { escapeXml } from "./core.js";

function swapsDimensions(orientation: number | undefined): boolean {
  return orientation !== undefined && orientation >= 5 && orientation <= 8;
}

export async function addTimestampLabel(
  file: string,
  timestampLine: string,
  addressLines: string[],
): Promise<void> {
  const metadata = await sharp(file).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`Could not determine JPEG dimensions for ${file}.`);
  }
  const width = swapsDimensions(metadata.orientation) ? metadata.height : metadata.width;
  const height = swapsDimensions(metadata.orientation) ? metadata.width : metadata.height;
  const shortEdge = Math.min(width, height);
  const fontSize = shortEdge * 0.0562;
  const lineHeight = shortEdge * 0.0618;
  const marginX = shortEdge * 0.0565;
  const marginBottom = shortEdge * 0.0565;
  const lines = [timestampLine, ...addressLines.slice(0, 4)];
  const firstY = height - marginBottom - (lines.length - 1) * lineHeight;
  const text = lines
    .map(
      (line, index) =>
        `<text x="${marginX}" y="${firstY + index * lineHeight}">${escapeXml(line)}</text>`,
    )
    .join("");
  const svg = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <style>
        text { fill: white; stroke: black; stroke-width: ${Math.max(1, shortEdge * 0.0014)}px;
          paint-order: stroke; font: ${fontSize}px -apple-system, BlinkMacSystemFont, "SF Pro", Roboto, Arial, sans-serif; }
      </style>${text}</svg>`,
  );
  const temporary = `${file}.labeling.jpg`;
  await sharp(file)
    .autoOrient()
    .composite([{ input: svg, left: 0, top: 0 }])
    .keepMetadata()
    .jpeg({ quality: 92 })
    .toFile(temporary);
  await import("node:fs/promises").then(({ rename }) => rename(temporary, file));
}
