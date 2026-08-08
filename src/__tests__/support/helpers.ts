import * as fs from "fs";
import * as path from "path";

export const MAIN_DOM_HTML = `
  <div id="uploader"></div>
  <input id="fileInput" type="file" />
  <div id="imageModal"></div>
  <div id="imageModalBackdrop"></div>
  <img id="modalPreview" />
  <div id="fileList"></div>
  <div id="status"></div>
  <button id="downloadAllButton"></button>
`;

export function setupMainDom() {
  document.body.innerHTML = MAIN_DOM_HTML;
}

export function loadBuffer(filePath: string): ArrayBuffer {
  const buffer = fs.readFileSync(filePath);
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
}

export function cliFixture(name: string) {
  return path.join(
    __dirname,
    "../../../packages/exif-editor-cli/test/fixtures",
    name,
  );
}

export function repoFixture(name: string) {
  return path.join(__dirname, "../../../", name);
}
