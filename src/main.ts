import { isExifJpeg } from "./exif";
import { FileReader } from "./FileReader";

type IDF = {
  type: number;
  count: number;
  value: number | string | number[];
  valueOffset: number;
  tag: number;
};

type EXIFField = {
  label: string;
  name: string;
  ifd: string;
  tag: number;
  count: number;
  valueOffset: number;
  value: number | string | number[];
  type: "date" | "datetime" | "time";
};

// EXIF tag numbers we care about
const TAGS = {
  DateTime: 0x0132, // Image IFD
  ExifIFDPointer: 0x8769, // pointer from 0th to Exif
  GPSInfoIFDPointer: 0x8825, // pointer from 0th to GPS
  DateTimeOriginal: 0x9003, // Exif
  DateTimeDigitized: 0x9004, // Exif
  GPSDateStamp: 0x001d, // GPSDateStamp
  GPSTimeStamp: 0x0007, // GPSTimeStamp

  END_OF_IMAGE: 0xffd9,
  VALID_MARKER_PREFIX: 0xff00,
  APP1_MARKER: 0xffe1,
  EXIF_HEADER: 0x45786966,
  LITTLE_ENDIAN: 0x4949,
  BIG_ENDIAN: 0x4d4d,
  JPEG_START: 0xffd8, // JPEG start
};

// State
let originalBuffer: ArrayBuffer | null = null; // ArrayBuffer
let workingBuffer: ArrayBuffer | null = null; // modifiable copy
let parsedFields: EXIFField[] = [];

const uploader = document.getElementById("uploader") as HTMLDivElement;
const fileInput = document.getElementById("fileInput") as HTMLInputElement;
const preview = document.getElementById("preview") as HTMLImageElement;
const previewInfo = document.getElementById("preview-info") as HTMLDivElement;
const previewInfoText = document.getElementById(
  "preview-info-text"
) as HTMLDivElement;
const fieldsForm = document.getElementById("fields") as HTMLFormElement;
const main = document.getElementById("main") as HTMLDivElement;
const status = document.getElementById("status") as HTMLDivElement;
const filenameEl = document.getElementById("filename") as HTMLDivElement;
const clearBtn = document.getElementById("clearBtn") as HTMLButtonElement;
const downloadBtn = document.getElementById("downloadBtn") as HTMLButtonElement;

// drag/drop
uploader.addEventListener("click", () => fileInput.click());

// set drag over state for uploader
uploader.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploader.classList.add("dragover");
});

// remove drag over state for uploader
uploader.addEventListener("dragleave", () => {
  uploader.classList.remove("dragover");
});

// handle drop event for uploader and remove drag over state
uploader.addEventListener("drop", (e) => {
  e.preventDefault();

  uploader.classList.remove("dragover");

  handleFileList(e.dataTransfer?.files ?? null);
});

uploader.addEventListener("mouseenter", () => {
  uploader.classList.add("dragover");
});

uploader.addEventListener("mouseleave", () => {
  uploader.classList.remove("dragover");
});

fileInput.addEventListener("change", () => handleFileList(fileInput.files));

let currentFilename = "";

clearBtn.addEventListener("click", clearAll);
downloadBtn.addEventListener("click", () => {
  downloadModified(currentFilename);
});

async function handleFileList(list: FileList | null) {
  if (!list || list.length === 0) {
    alert("No file selected.");
    return;
  }

  if (list.length > 1) {
    alert("Only one file can be uploaded at a time.");
  }

  const file = list[0];

  // console.log(isExifJpeg(new DataView(await file.arrayBuffer())));

  if (file.type !== "image/jpeg" && !/\.jpe?g$/i.test(file.name)) {
    const fileReader = new FileReader();
    const arrayBuffer = await fileReader.readAsArrayBuffer(file);

    if (isExifJpeg(new DataView(arrayBuffer))) {
      alert("Only JPEG images are supported by this demo.");
    }
    return;
  }

  filenameEl.textContent = file.name;
  currentFilename = file.name;
  status.textContent = "Reading file...";
  clearState();

  const fileReader = new FileReader();

  originalBuffer = await fileReader.readAsArrayBuffer(file);

  // create a working copy
  workingBuffer = originalBuffer.slice(0);

  // show preview
  preview.src = URL.createObjectURL(file);
  previewInfo.style.display = "flex";
  previewInfoText.textContent = file.name;
  main.style.display = "flex";

  status.textContent = "Parsing EXIF...";

  try {
    parsedFields = parseExifDates(workingBuffer);
  } catch (err) {
    console.error(err);
    status.textContent =
      "No EXIF date fields found or not a standard JPEG with EXIF.";
    parsedFields = [];
  }

  renderFields(parsedFields);
  status.textContent = parsedFields.length
    ? "Found " + parsedFields.length + " date/time field(s)."
    : "No editable EXIF date/time fields found.";
  clearBtn.disabled = false;
  downloadBtn.disabled = false;
}

function clearState() {
  parsedFields = [];
  fieldsForm.innerHTML = "";
  main.style.display = "none";
  preview.src = "";
  previewInfo.style.display = "none";
  previewInfoText.textContent = "";
  filenameEl.textContent = "";
  status.textContent = "No file loaded";
  clearBtn.disabled = true;
  downloadBtn.disabled = true;
}
function clearAll() {
  originalBuffer = null;
  workingBuffer = null;
  clearState();

  // Reset the file input so the same file can be uploaded again
  if (fileInput) {
    fileInput.value = "";
  }
}

function renderFields(fields: EXIFField[]) {
  fieldsForm.innerHTML = "";

  if (!fields.length) {
    return;
  }

  // Helper function to find corresponding date for a time field
  function findCorrespondingDate(timeField: EXIFField): string | null {
    if (timeField.ifd === "GPS" && timeField.name === "GPSTimeStamp") {
      // For GPS time, look for GPS date stamp
      const gpsDateField = fields.find(
        (f) => f.name === "GPSDateStamp" && f.ifd === "GPS"
      );
      if (gpsDateField && typeof gpsDateField.value === "string") {
        return gpsDateField.value;
      }
    }

    // For other time fields, try to find a corresponding datetime field
    // Look for fields in the same IFD first, then fall back to any datetime field
    const sameIFDDateTime = fields.find(
      (f) => f.type === "datetime" && f.ifd === timeField.ifd
    );
    if (sameIFDDateTime && typeof sameIFDDateTime.value === "string") {
      return sameIFDDateTime.value;
    }

    // Fall back to any datetime field
    const anyDateTime = fields.find((f) => f.type === "datetime");
    if (anyDateTime && typeof anyDateTime.value === "string") {
      return anyDateTime.value;
    }

    return null;
  }

  fields.forEach((f: EXIFField, idx: number) => {
    const row = document.createElement("div");

    row.className = "row";

    const label = document.createElement("label");

    label.textContent = f.label;

    let input;

    if (f.type === "date") {
      input = document.createElement("input");
      input.type = "date";
      const inputDateValue = toInputDate(f.value as string);

      let localDateValue = "";

      if (inputDateValue) {
        // Parse as UTC date
        const [year, month, day] = inputDateValue.split("-").map(Number);
        if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
          // Create a Date object in UTC
          const utcDate = new Date(Date.UTC(year, month - 1, day));
          // Convert to local date
          const localYear = utcDate.getFullYear();
          const localMonth = (utcDate.getMonth() + 1)
            .toString()
            .padStart(2, "0");
          const localDay = utcDate.getDate().toString().padStart(2, "0");
          localDateValue = `${localYear}-${localMonth}-${localDay}`;
        }
      }

      input.value = localDateValue;
    } else if (f.type === "time") {
      input = document.createElement("input");
      input.type = "time";

      // Convert EXIF time (UTC) to local time before setting input value
      const utcTime = toInputTime(f.value as number[]);

      let localTime = "";

      if (utcTime) {
        // utcTime is "HH:MM:SS"
        const [h, m, s] = utcTime.split(":").map(Number);

        // Find the corresponding date from the image instead of using today's date
        const correspondingDate = findCorrespondingDate(f);

        if (correspondingDate) {
          // Parse the date from the image
          const dateMatch = correspondingDate.match(/(\d{4}):(\d{2}):(\d{2})/);
          if (dateMatch) {
            const [_, year, month, day] = dateMatch;
            // Create UTC date using the image's date and time
            const utcDate = new Date(
              Date.UTC(
                parseInt(year),
                parseInt(month) - 1, // Month is 0-indexed
                parseInt(day),
                h,
                m,
                s || 0
              )
            );
            // Convert to local time
            const localHours = utcDate.getHours().toString().padStart(2, "0");
            const localMinutes = utcDate
              .getMinutes()
              .toString()
              .padStart(2, "0");
            const localSeconds = utcDate
              .getSeconds()
              .toString()
              .padStart(2, "0");
            localTime = `${localHours}:${localMinutes}:${localSeconds}`;
          }
        } else {
          // Fallback: if no corresponding date found, use today's date
          // but this should rarely happen with proper EXIF data
          const now = new Date();
          const utcDate = new Date(
            Date.UTC(
              now.getFullYear(),
              now.getMonth(),
              now.getDate(),
              h,
              m,
              s || 0
            )
          );
          // Convert to local time
          const localHours = utcDate.getHours().toString().padStart(2, "0");
          const localMinutes = utcDate.getMinutes().toString().padStart(2, "0");
          const localSeconds = utcDate.getSeconds().toString().padStart(2, "0");
          localTime = `${localHours}:${localMinutes}:${localSeconds}`;
        }
      }

      input.value = localTime;
    } else {
      input = document.createElement("input");
      input.type = "datetime-local";
      input.step = "1";
      input.value = toInputDateTime(f.value as string);
    }

    input.dataset.idx = idx.toString();
    row.appendChild(label);
    row.appendChild(input);
    fieldsForm.appendChild(row);
  });
}

// convert EXIF "YYYY:MM:DD HH:MM:SS" to input datetime-local value "YYYY-MM-DDTHH:MM:SS"
function toInputDateTime(exifStr: string) {
  if (!exifStr) {
    return ""; // expect 'YYYY:MM:DD HH:MM:SS' (19 chars)
  }

  const s = exifStr.trim(); // drop trailing null

  // some values might be missing seconds; try to be permissive
  const m = s.match(/(\d{4}):(\d{2}):(\d{2})\s*(\d{2}):(\d{2}):(\d{2})?/);

  if (!m) {
    return "";
  }

  const yy = m[1],
    mm = m[2],
    dd = m[3],
    HH = m[4] || "00",
    MIN = m[5] || "00",
    SS = m[6] || "00";
  return `${yy}-${mm}-${dd}T${HH}:${MIN}:${SS}`;
}

function toInputDate(exifStr: string) {
  if (!exifStr) {
    return "";
  }

  const m = exifStr.match(/(\d{4}):(\d{2}):(\d{2})/);

  if (!m) {
    return "";
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function toInputTime(exifNumbers: number[]) {
  if (!exifNumbers || exifNumbers.length !== 3) {
    return "";
  }

  return [
    exifNumbers[0].toString().padStart(2, "0"),
    exifNumbers[1].toString().padStart(2, "0"),
    exifNumbers[2].toString().padStart(2, "0"),
  ].join(":");
}

// convert input values back to EXIF string formats
function fromInputDateTime(val: string) {
  if (!val) {
    return ""; // val like 2023-08-09T13:45:30
  }

  const [d, t] = val.split("T");

  if (!d) {
    return "";
  }
  const [y, m, day] = d.split("-");
  const [hh, mm, ss] = (t || "00:00:00").split(":");
  return `${y}:${m}:${day} ${hh}:${mm}:${ss}`;
}

function fromInputDate(val: string) {
  if (!val) {
    return "";
  }

  const [y, m, d] = val.split("-");

  return `${y}:${m}:${d}`;
}

function fromInputTime(val: string): number[] {
  if (!val) {
    return [];
  }
  // Accepts "HH:MM:SS" or "HH:MM"
  const parts = val.split(":").map(Number);
  if (parts.length === 2) {
    // If only HH:MM, add 0 for seconds
    parts.push(0);
  }
  if (parts.length !== 3 || parts.some(isNaN)) {
    return [];
  }
  return parts;
}

function downloadModified(filename: string) {
  if (!workingBuffer) {
    return;
  }

  const inputs = fieldsForm.querySelectorAll("input");

  const dv = new DataView(workingBuffer);

  inputs.forEach((inp: HTMLInputElement) => {
    const idx = Number(inp.dataset.idx);

    const field = parsedFields[idx];

    let newVal: string | number[];

    if (field.type === "date") {
      // Use the original fromInputDate function
      newVal = fromInputDate(inp.value);

      // For GPS date fields, convert local date to UTC
      if (
        field.ifd === "GPS" &&
        field.name === "GPSDateStamp" &&
        typeof newVal === "string"
      ) {
        const [y, m, d] = newVal.split(":");
        const localDate = new Date(
          parseInt(y),
          parseInt(m) - 1, // Month is 0-indexed
          parseInt(d)
        );
        const utcYear = localDate.getUTCFullYear();
        const utcMonth = (localDate.getUTCMonth() + 1)
          .toString()
          .padStart(2, "0");
        const utcDay = localDate.getUTCDate().toString().padStart(2, "0");
        newVal = `${utcYear}:${utcMonth}:${utcDay}`;
      }
    } else if (field.type === "time") {
      // Use the original fromInputTime function
      newVal = fromInputTime(inp.value);

      // For GPS time fields, convert local time to UTC
      if (
        field.ifd === "GPS" &&
        field.name === "GPSTimeStamp" &&
        Array.isArray(newVal)
      ) {
        const gpsDateField = parsedFields.find(
          (f) => f.name === "GPSDateStamp" && f.ifd === "GPS"
        );
        if (gpsDateField && typeof gpsDateField.value === "string") {
          const dateMatch = gpsDateField.value.match(/(\d{4}):(\d{2}):(\d{2})/);
          if (dateMatch) {
            const [_, year, month, day] = dateMatch;
            const [localHours, localMinutes, localSeconds] = newVal;

            const localDate = new Date(
              parseInt(year),
              parseInt(month) - 1,
              parseInt(day),
              localHours,
              localMinutes,
              localSeconds
            );

            newVal = [
              localDate.getUTCHours(),
              localDate.getUTCMinutes(),
              localDate.getUTCSeconds(),
            ];
          }
        }
      }
    } else {
      // Use the original fromInputDateTime function
      newVal = fromInputDateTime(inp.value);
    }

    if (newVal.length === 0) {
      return; // skip
    }

    let target = newVal;

    const count = field.count;

    let bytes =
      field.type === "time"
        ? new Uint32Array(count * 2)
        : new Uint8Array(count);

    const encoder = new TextEncoder();

    // For GPSDateStamp, standard is 'YYYY:MM:DD' without time. For others include full time.
    // Write as ASCII. If string too long, truncate.

    if (typeof target === "string") {
      let s = target;

      const encoded = encoder.encode(s);

      const maxStore = count; // includes null if present

      let len = Math.min(encoded.length, maxStore - 1);

      bytes.set(encoded.subarray(0, len), 0);
      // null terminate

      bytes[len] = 0;

      // rest already zero
      // write into workingBuffer at absolute offset
      const abs = field.valueOffset;

      for (let i = 0; i < count; i++) {
        dv.setUint8(abs + i, bytes[i]);
      }
    } else if (Array.isArray(target)) {
      for (let i = 0; i < count; i++) {
        const abs = field.valueOffset + 8 * i;

        dv.setUint32(abs, target[i]);
        dv.setUint32(abs + 4, 1);
      }
    }
  });

  // create blob and trigger download
  const blob = new Blob([workingBuffer], { type: "image/jpeg" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  status.textContent = "Download ready - modified image saved.";
}

// ---------- EXIF parsing (custom, minimal, only to find & edit ASCII date/time tags) ----------
function parseExifDates(arrayBuffer: ArrayBuffer): EXIFField[] {
  const view = new DataView(arrayBuffer);

  if (view.getUint16(0, false) !== TAGS.JPEG_START) {
    throw new Error("Not a JPEG");
  }

  let offset = 2;
  let exifStartOffset = -1;
  while (offset < view.byteLength) {
    if (offset + 4 > view.byteLength) {
      break;
    }

    const marker = view.getUint16(offset, false);
    offset += 2;

    if (marker === TAGS.END_OF_IMAGE) {
      break;
    }

    if ((marker & TAGS.VALID_MARKER_PREFIX) !== TAGS.VALID_MARKER_PREFIX) {
      break;
    }

    const segLen = view.getUint16(offset, false);
    if (marker === TAGS.APP1_MARKER) {
      // APP1

      const potential = offset + 2; // start of payload

      if (potential + 6 <= view.byteLength) {
        const hdr = new DataView(view.buffer, potential, 6);

        if (
          hdr.getUint32(0, false) === TAGS.EXIF_HEADER &&
          hdr.getUint16(4, false) === 0
        ) {
          exifStartOffset = potential + 6;
          break;
        }
      }
    }

    offset += segLen;
  }

  if (exifStartOffset === -1) {
    throw new Error("No EXIF APP1 segment found");
  }

  const tiffStartOffset = exifStartOffset;

  const byteOrder = new DataView(view.buffer, tiffStartOffset, 2);

  let littleEndian: boolean = false;

  if (byteOrder.getUint16(0, false) === TAGS.LITTLE_ENDIAN) {
    littleEndian = true;
  } else if (byteOrder.getUint16(0, false) !== TAGS.BIG_ENDIAN) {
    throw new Error("Invalid TIFF byte order");
  }

  const fortyTwo = new DataView(view.buffer, tiffStartOffset + 2, 2);

  if (fortyTwo.getUint16(0, false) !== 42) {
    throw new Error("Invalid TIFF header");
  }

  const firstIFDOffsetView = new DataView(view.buffer, tiffStartOffset + 4, 4);

  const firstIFDOffset =
    firstIFDOffsetView.getUint32(0, false) + tiffStartOffset;

  const results: EXIFField[] = [];

  // helper: read an IFD and return map of entries and also find pointers
  function readIFD(at: number) {
    const entries: Map<number, IDF> = new Map();

    const num = view.getUint16(at, littleEndian);

    let entryPtr = at + 2;

    for (let i = 0; i < num; i++) {
      const tag = view.getUint16(entryPtr, littleEndian);
      const type = view.getUint16(entryPtr + 2, littleEndian);
      const count = view.getUint32(entryPtr + 4, littleEndian);
      const valueOrOffset = entryPtr + 8;

      let valueOffsetAbsolute = null;

      if (type === 2) {
        // ASCII
        if (count <= 4) {
          // value is stored inline in the 4 bytes
          valueOffsetAbsolute = valueOrOffset; // these bytes are the value
        } else {
          const off = view.getUint32(valueOrOffset, littleEndian);
          valueOffsetAbsolute = tiffStartOffset + off;
        }
        // read string
        let s = "";
        for (let k = 0; k < count; k++) {
          const b = view.getUint8(valueOffsetAbsolute + k);

          if (b === 0) {
            break;
          }

          s += String.fromCharCode(b);
        }

        entries.set(tag, {
          tag,
          type,
          count,
          valueOffset: valueOffsetAbsolute,
          value: s,
        });
      } else if (type === 5) {
        // RATIONAL (two LONGs: numerator/denominator)
        // Value is always an offset to the actual data
        const off = view.getUint32(valueOrOffset, littleEndian);
        valueOffsetAbsolute = tiffStartOffset + off;
        let rationals: { numerator: number; denominator: number }[] = [];
        for (let k = 0; k < count; k++) {
          const num = view.getUint32(valueOffsetAbsolute + k * 8, littleEndian);
          const denom = view.getUint32(
            valueOffsetAbsolute + k * 8 + 4,
            littleEndian
          );
          rationals.push({ numerator: num, denominator: denom });
        }
        // Calculate the value for RATIONAL type: numerator/denominator as number or array of numbers
        let value;

        if (count === 1) {
          const { numerator, denominator } = rationals[0];
          value = denominator !== 0 ? numerator / denominator : 0;
        } else {
          value = rationals.map(({ numerator, denominator }) =>
            denominator !== 0 ? numerator / denominator : 0
          );
        }

        entries.set(tag, {
          tag,
          type,
          count,
          valueOffset: valueOffsetAbsolute,
          value,
        });
      } else {
        // store meta for non-ascii
        if (type === 4 || type === 3) {
          // uint32 or uint16: we may need pointers
          if (tag === TAGS.ExifIFDPointer || tag === TAGS.GPSInfoIFDPointer) {
            // read pointer
            const off = view.getUint32(valueOrOffset, littleEndian);

            entries.set(tag, {
              tag,
              type,
              count,
              value: off,
              valueOffset: valueOrOffset,
            });
          } else {
            entries.set(tag, {
              tag,
              type,
              count,
              value: 0,
              valueOffset: valueOrOffset,
            });
          }
        } else {
          entries.set(tag, {
            tag,
            type,
            count,
            value: 0,
            valueOffset: valueOrOffset,
          });
        }
      }
      entryPtr += 12;
    }

    const nextIFD = view.getUint32(entryPtr, littleEndian);

    return { entries, nextIFD };
  }

  // read 0th IFD
  const ifd0 = readIFD(firstIFDOffset);

  // check DateTime in 0th
  if (ifd0.entries.get(TAGS.DateTime)) {
    const entry = ifd0.entries.get(TAGS.DateTime)!;
    results.push({
      label: "Image DateTime (0th IFD)",
      name: "DateTime",
      ifd: "0th",
      tag: TAGS.DateTime,
      count: entry.count,
      valueOffset: entry.valueOffset,
      value: entry.value,
      type: "datetime",
    });
  }

  // check pointers to Exif and GPS
  let exifIFDOffset = null;

  let gpsIFDOffset = null;

  if (ifd0.entries.get(TAGS.ExifIFDPointer)) {
    const entry = ifd0.entries.get(TAGS.ExifIFDPointer)!;
    exifIFDOffset = tiffStartOffset + (entry.value as number);
  }

  if (ifd0.entries.get(TAGS.GPSInfoIFDPointer)) {
    const entry = ifd0.entries.get(TAGS.GPSInfoIFDPointer)!;
    gpsIFDOffset = tiffStartOffset + (entry.value as number);
  }

  if (exifIFDOffset) {
    const exifIFD = readIFD(exifIFDOffset);
    if (exifIFD.entries.get(TAGS.DateTimeOriginal)) {
      const entry = exifIFD.entries.get(TAGS.DateTimeOriginal)!;
      results.push({
        label: "DateTimeOriginal (Exif IFD)",
        name: "DateTimeOriginal",
        ifd: "Exif",
        tag: TAGS.DateTimeOriginal,
        count: entry.count,
        valueOffset: entry.valueOffset,
        value: entry.value,
        type: "datetime",
      });
    }
    if (exifIFD.entries.get(TAGS.DateTimeDigitized)) {
      const entry = exifIFD.entries.get(TAGS.DateTimeDigitized)!;
      results.push({
        label: "DateTimeDigitized (Exif IFD)",
        name: "DateTimeDigitized",
        ifd: "Exif",
        tag: TAGS.DateTimeDigitized,
        count: entry.count,
        valueOffset: entry.valueOffset,
        value: entry.value,
        type: "datetime",
      });
    }
  }

  if (gpsIFDOffset) {
    const gpsIFD = readIFD(gpsIFDOffset);
    if (gpsIFD.entries.get(TAGS.GPSDateStamp)) {
      const entry = gpsIFD.entries.get(TAGS.GPSDateStamp)!;
      results.push({
        label: "GPSDateStamp (GPS IFD)",
        name: "GPSDateStamp",
        ifd: "GPS",
        tag: TAGS.GPSDateStamp,
        count: entry.count,
        valueOffset: entry.valueOffset,
        value: entry.value,
        type: "date",
      });
    }

    if (gpsIFD.entries.get(TAGS.GPSTimeStamp)) {
      const entry = gpsIFD.entries.get(TAGS.GPSTimeStamp)!;
      results.push({
        label: "GPSTimeStamp (GPS IFD)",
        name: "GPSTimeStamp",
        ifd: "GPS",
        tag: TAGS.GPSTimeStamp,
        count: entry.count,
        valueOffset: entry.valueOffset,
        value: entry.value,
        type: "time",
      });
    }
  }

  return results;
}
