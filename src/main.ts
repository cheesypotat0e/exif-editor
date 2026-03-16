import { FileReader } from "./FileReader";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIconUrl from "leaflet/dist/images/marker-icon.png?inline";
import markerIcon2xUrl from "leaflet/dist/images/marker-icon-2x.png?inline";
import markerShadowUrl from "leaflet/dist/images/marker-shadow.png?inline";

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
  type: "date" | "datetime" | "time" | "coordinate" | "number";
  // Optional fields for combined GPS datetime
  _gpsDateTag?: number;
  _gpsDateOffset?: number;
  _gpsDateCount?: number;
  _gpsRefOffset?: number;
  _gpsRefCount?: number;
  _gpsAltitudeRefOffset?: number;
};

type DateTimePickerState = {
  root: HTMLDivElement;
  hiddenInput: HTMLInputElement;
  monthInput: HTMLInputElement;
  dayInput: HTMLInputElement;
  yearInput: HTMLInputElement;
  visibleHourInput: HTMLInputElement;
  visibleMinuteInput: HTMLInputElement;
  visibleSecondInput: HTMLInputElement;
  visibleMeridiemInput: HTMLInputElement;
  epochInput: HTMLInputElement;
  copyEpochButton: HTMLButtonElement;
  toggleButton: HTMLButtonElement;
  popup: HTMLDivElement;
  monthLabel: HTMLDivElement;
  dayGrid: HTMLDivElement;
  hourInput: HTMLInputElement;
  minuteInput: HTMLInputElement;
  secondInput: HTMLInputElement;
  meridiemSelect: HTMLSelectElement;
  selectedDate: Date;
  viewYear: number;
  viewMonth: number;
};

type LoadedFile = {
  id: string;
  filename: string;
  originalFilename: string;
  workingBuffer: ArrayBuffer;
  parsedFields: EXIFField[];
  previewUrl: string;
  gpsMap?: L.Map | null;
  gpsMarker?: L.Marker | null;
  elements?: {
    container: HTMLDivElement;
    form: HTMLFormElement;
    gpsEditor: HTMLDivElement;
    gpsMapEl: HTMLDivElement;
    gpsHint: HTMLDivElement;
    filenameInput: HTMLInputElement;
    filenameLabel: HTMLSpanElement;
    editFilenameButton: HTMLButtonElement;
    previewButton: HTMLButtonElement;
    previewImg: HTMLImageElement;
    moveUpButton: HTMLButtonElement;
    moveDownButton: HTMLButtonElement;
  };
};

// EXIF tag numbers we care about
const TAGS = {
  DateTime: 0x0132, // Image IFD
  ModifyDate: 0x0132, // alias for Image DateTime in many EXIF tools
  ExifIFDPointer: 0x8769, // pointer from 0th to Exif
  GPSInfoIFDPointer: 0x8825, // pointer from 0th to GPS
  GPSLatitudeRef: 0x0001,
  GPSLatitude: 0x0002,
  GPSLongitudeRef: 0x0003,
  GPSLongitude: 0x0004,
  GPSAltitudeRef: 0x0005,
  GPSAltitude: 0x0006,
  DateTimeOriginal: 0x9003, // Exif
  CreateDate: 0x9004, // alias for DateTimeDigitized
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
let activeDateTimePicker: DateTimePickerState | null = null;
let loadedFiles: LoadedFile[] = [];

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2xUrl,
  iconUrl: markerIconUrl,
  shadowUrl: markerShadowUrl,
});

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const uploader = document.getElementById("uploader") as HTMLDivElement;
const fileInput = document.getElementById("fileInput") as HTMLInputElement;
const imageModal = document.getElementById("imageModal") as HTMLDivElement;
const imageModalBackdrop = document.getElementById(
  "imageModalBackdrop"
) as HTMLDivElement;
const modalPreview = document.getElementById("modalPreview") as HTMLImageElement;
const fileListEl = document.getElementById("fileList") as HTMLDivElement;
const status = document.getElementById("status") as HTMLDivElement;
const downloadAllButton = document.getElementById(
  "downloadAllButton"
) as HTMLButtonElement;

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
downloadAllButton.addEventListener("click", () => {
  void downloadAllLoadedFiles();
});

imageModalBackdrop.addEventListener("click", closeImageModal);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !imageModal.hidden) {
    closeImageModal();
  }
});
document.addEventListener("pointerdown", (event) => {
  if (!activeDateTimePicker) {
    return;
  }

  const target = event.target;
  if (target instanceof Node && !activeDateTimePicker.root.contains(target)) {
    closeDateTimePicker();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && activeDateTimePicker) {
    event.preventDefault();
    closeDateTimePicker(true);
  }
});
window.addEventListener("resize", () => {
  if (activeDateTimePicker) {
    positionDateTimePickerPopup(activeDateTimePicker);
  }
});
window.addEventListener(
  "scroll",
  () => {
    if (activeDateTimePicker) {
      positionDateTimePickerPopup(activeDateTimePicker);
    }
  },
  true
);

function getFileExtension(name: string) {
  const match = name.match(/(\.[^.]+)$/);
  return match ? match[1] : ".jpg";
}

function sanitizeFilename(name: string, fallbackName: string) {
  const trimmed = name.trim().replace(/[\\/:*?"<>|]+/g, "-");
  const fallbackBase = fallbackName.replace(/\.[^.]+$/, "") || "image";
  const fallbackExtension = getFileExtension(fallbackName);

  if (!trimmed) {
    return `${fallbackBase}${fallbackExtension}`;
  }

  if (/\.[^.]+$/.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed}${fallbackExtension}`;
}

function getDownloadFilename(file: LoadedFile) {
  return sanitizeFilename(file.filename, file.originalFilename);
}

function getEditedBlob(file: LoadedFile) {
  applyFormToWorkingBuffer(file);
  return new Blob([file.workingBuffer], { type: "image/jpeg" });
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function getUniqueFilenames(names: string[]) {
  const seen = new Map<string, number>();

  return names.map((name) => {
    const normalized = name || "image.jpg";
    const count = seen.get(normalized) ?? 0;
    seen.set(normalized, count + 1);
    if (count === 0) {
      return normalized;
    }

    const extension = getFileExtension(normalized);
    const base = normalized.slice(0, -extension.length) || "image";
    return `${base} (${count + 1})${extension}`;
  });
}

function refreshLoadedFileControls() {
  loadedFiles.forEach((file, index) => {
    if (!file.elements) {
      return;
    }

    file.elements.moveUpButton.disabled = index === 0;
    file.elements.moveDownButton.disabled = index === loadedFiles.length - 1;
  });
}

function isIOSDevice() {
  if (typeof navigator === "undefined") {
    return false;
  }

  const platform = navigator.platform || "";
  const userAgent = navigator.userAgent || "";

  return (
    /iPad|iPhone|iPod/.test(userAgent) ||
    (/Mac/.test(platform) && navigator.maxTouchPoints > 1)
  );
}

function canShareFiles(file: LoadedFile) {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return false;
  }

  if (typeof File === "undefined") {
    return false;
  }

  if (typeof navigator.canShare !== "function") {
    return true;
  }

  const shareFile = new File([""], getDownloadFilename(file), {
    type: "image/jpeg",
  });
  return navigator.canShare({ files: [shareFile] });
}

function moveLoadedFile(fileId: string, direction: -1 | 1) {
  const fromIndex = loadedFiles.findIndex((file) => file.id === fileId);
  const toIndex = fromIndex + direction;

  if (fromIndex === -1 || toIndex < 0 || toIndex >= loadedFiles.length) {
    return;
  }

  const [file] = loadedFiles.splice(fromIndex, 1);
  loadedFiles.splice(toIndex, 0, file);
  loadedFiles.forEach((item) => {
    if (item.elements) {
      fileListEl.appendChild(item.elements.container);
    }
  });
  refreshLoadedFileControls();
  status.textContent = "Updated file order.";
}

function getZipTimestampParts(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const dosDate =
    ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();

  return { dosDate, dosTime };
}

let crcTable: Uint32Array | null = null;

function getCrcTable() {
  if (crcTable) {
    return crcTable;
  }

  crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[i] = c >>> 0;
  }
  return crcTable;
}

function crc32(data: Uint8Array) {
  const table = getCrcTable();
  let crc = 0xffffffff;

  for (const byte of data) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function createStoredZip(entries: { name: string; data: Uint8Array }[]) {
  const encoder = new TextEncoder();
  const now = getZipTimestampParts(new Date());
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  entries.forEach(({ name, data }) => {
    const nameBytes = encoder.encode(name);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const localView = new DataView(local.buffer);
    const fileCrc = crc32(data);

    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, now.dosTime, true);
    localView.setUint16(12, now.dosDate, true);
    localView.setUint32(14, fileCrc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    localParts.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, now.dosTime, true);
    centralView.setUint16(14, now.dosDate, true);
    centralView.setUint32(16, fileCrc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length;
  });

  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);

  return new Blob([...localParts, ...centralParts, endRecord], {
    type: "application/zip",
  });
}

async function downloadAllLoadedFiles() {
  if (!loadedFiles.length) {
    return;
  }

  const names = getUniqueFilenames(loadedFiles.map((file) => getDownloadFilename(file)));
  const entries = await Promise.all(
    loadedFiles.map(async (file, index) => {
      const data = new Uint8Array(await getEditedBlob(file).arrayBuffer());
      return { name: names[index], data };
    })
  );

  const archive = createStoredZip(entries);
  triggerBlobDownload(archive, "exif-edits.zip");
  status.textContent = `Downloaded ${entries.length} file(s) as ZIP.`;
}

async function shareLoadedFile(fileId: string) {
  const file = loadedFiles.find((item) => item.id === fileId);
  if (!file || !canShareFiles(file)) {
    return;
  }

  try {
    const sharedFile = new File([getEditedBlob(file)], getDownloadFilename(file), {
      type: "image/jpeg",
    });
    await navigator.share({
      files: [sharedFile],
      title: getDownloadFilename(file),
    });
    status.textContent = `Shared ${getDownloadFilename(file)}.`;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return;
    }

    console.error(error);
    status.textContent = "Share failed.";
  }
}

async function handleFileList(list: FileList | null) {
  if (!list || list.length === 0) {
    alert("No file selected.");
    return;
  }

  const addedFiles: LoadedFile[] = [];

  for (const file of Array.from(list)) {
    if (file.type !== "image/jpeg" && !/\.jpe?g$/i.test(file.name)) {
      continue;
    }

    const fileReader = new FileReader();
    const originalBuffer = await fileReader.readAsArrayBuffer(file);
    const workingBuffer = originalBuffer.slice(0);
    let fileFields: EXIFField[] = [];

    try {
      fileFields = parseExifDates(workingBuffer);
    } catch (err) {
      console.error(err);
    }

    addedFiles.push({
      id: crypto.randomUUID(),
      filename: file.name,
      originalFilename: file.name,
      workingBuffer,
      parsedFields: fileFields,
      previewUrl: URL.createObjectURL(file),
    });
  }

  if (!addedFiles.length) {
    alert("Only JPEG images are supported by this demo.");
    return;
  }

  loadedFiles = [...loadedFiles, ...addedFiles];
  for (const file of addedFiles) {
    appendFileEditor(file);
  }
  updateStatus();

  if (fileInput) {
    fileInput.value = "";
  }
}

function beginFilenameEdit(file: LoadedFile) {
  if (!file.elements) {
    return;
  }

  file.elements.filenameLabel.hidden = true;
  file.elements.editFilenameButton.hidden = true;
  file.elements.filenameInput.hidden = false;
  file.elements.filenameInput.focus();
  file.elements.filenameInput.select();
}

function finishFilenameEdit(file: LoadedFile) {
  if (!file.elements) {
    return;
  }

  file.filename = file.elements.filenameInput.value;
  const downloadName = getDownloadFilename(file);
  file.elements.filenameInput.value = file.filename;
  file.elements.filenameLabel.textContent = downloadName;
  file.elements.filenameLabel.hidden = false;
  file.elements.editFilenameButton.hidden = false;
  file.elements.filenameInput.hidden = true;
  file.elements.previewImg.alt = downloadName;
  file.elements.previewButton.setAttribute(
    "aria-label",
    `Open larger image preview for ${downloadName}`
  );
}

function updateStatus() {
  downloadAllButton.disabled = loadedFiles.length === 0;
  status.textContent = loadedFiles.length
    ? `${loadedFiles.length} file(s) loaded`
    : "No files loaded";
  refreshLoadedFileControls();
}

function removeLoadedFile(fileId: string) {
  const fileIndex = loadedFiles.findIndex((file) => file.id === fileId);
  if (fileIndex === -1) {
    return;
  }

  const [removed] = loadedFiles.splice(fileIndex, 1);
  URL.revokeObjectURL(removed.previewUrl);
  removed.gpsMap?.remove();
  removed.elements?.container.remove();
  updateStatus();

  if (!loadedFiles.length) {
    closeImageModal();
    if (fileInput) {
      fileInput.value = "";
    }
  }
}

function downloadLoadedFile(fileId: string) {
  const file = loadedFiles.find((item) => item.id === fileId);
  if (!file) {
    return;
  }

  if (isIOSDevice() && canShareFiles(file)) {
    void shareLoadedFile(file.id);
    return;
  }

  const filename = getDownloadFilename(file);
  triggerBlobDownload(getEditedBlob(file), filename);
  status.textContent = `Downloaded ${filename}.`;
}

function openImageModal(imageUrl: string) {
  if (!imageUrl) {
    return;
  }

  modalPreview.src = imageUrl;
  imageModal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeImageModal() {
  imageModal.hidden = true;
  document.body.classList.remove("modal-open");
}

function parseInputDateTimeValue(value: string) {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
  );

  if (!match) {
    return null;
  }

  const [, y, m, d, hh, mm, ss = "00"] = match;
  const date = new Date(
    Number(y),
    Number(m) - 1,
    Number(d),
    Number(hh),
    Number(mm),
    Number(ss)
  );

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function formatPickerDateTimeValue(date: Date) {
  const y = date.getFullYear().toString().padStart(4, "0");
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  const hh = date.getHours().toString().padStart(2, "0");
  const mm = date.getMinutes().toString().padStart(2, "0");
  const ss = date.getSeconds().toString().padStart(2, "0");

  return `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
}

function getEpochTimestampValue(date: Date) {
  return Math.floor(date.getTime() / 1000).toString();
}

async function copyTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.setAttribute("readonly", "true");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  document.body.removeChild(input);
}

function clampNumber(value: number, min: number, max: number) {
  if (Number.isNaN(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function getExifLittleEndian(view: DataView) {
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
      const potential = offset + 2;
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
    return false;
  }

  return view.getUint16(exifStartOffset, false) === TAGS.LITTLE_ENDIAN;
}

function decimalFromDms(parts: number[], ref: string) {
  if (!Array.isArray(parts) || parts.length !== 3) {
    return null;
  }

  const decimal = parts[0] + parts[1] / 60 + parts[2] / 3600;
  return ref === "S" || ref === "W" ? -decimal : decimal;
}

function decodeGpsRef(value: string | number | number[] | undefined) {
  if (typeof value === "string") {
    return value.trim().charAt(0).toUpperCase() || null;
  }

  if (typeof value === "number") {
    return value > 0 ? String.fromCharCode(value).toUpperCase() : null;
  }

  if (Array.isArray(value)) {
    const first = value.find((entry) => entry > 0);
    return typeof first === "number"
      ? String.fromCharCode(first).toUpperCase()
      : null;
  }

  return null;
}

function dmsFromDecimal(decimal: number) {
  const absolute = Math.abs(decimal);
  const degrees = Math.floor(absolute);
  const minutesFull = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesFull);
  const seconds = (minutesFull - minutes) * 60;

  return [degrees, minutes, seconds];
}

function getInlineValueByteLength(type: number, count: number) {
  const bytesPerComponent =
    type === 1 || type === 2 || type === 6 || type === 7
      ? 1
      : type === 3 || type === 8
        ? 2
        : type === 4 || type === 9 || type === 11
          ? 4
          : type === 5 || type === 10 || type === 12
            ? 8
            : 0;

  return bytesPerComponent * count;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonths(date: Date, amount: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + amount);
  return next;
}

function setPickerDate(state: DateTimePickerState, nextDate: Date) {
  state.selectedDate = new Date(
    nextDate.getFullYear(),
    nextDate.getMonth(),
    nextDate.getDate(),
    state.selectedDate.getHours(),
    state.selectedDate.getMinutes(),
    state.selectedDate.getSeconds()
  );
  state.viewYear = state.selectedDate.getFullYear();
  state.viewMonth = state.selectedDate.getMonth();
  renderDateTimePicker(state);
}

function setPickerTimePart(
  state: DateTimePickerState,
  part: "hours12" | "minutes" | "seconds" | "meridiem",
  value: number
) {
  const next = new Date(state.selectedDate);

  if (part === "hours12") {
    const currentHours = next.getHours();
    const isPm = currentHours >= 12;
    const normalized = clampNumber(value, 1, 12) % 12;
    next.setHours(normalized + (isPm ? 12 : 0));
  } else if (part === "minutes") {
    next.setMinutes(clampNumber(value, 0, 59));
  } else if (part === "seconds") {
    next.setSeconds(clampNumber(value, 0, 59));
  } else {
    const currentHours = next.getHours();
    const isPm = value === 1;
    const hourBase = currentHours % 12;
    next.setHours(hourBase + (isPm ? 12 : 0));
  }

  state.selectedDate = next;
  syncDateTimePickerValue(state);
}

function commitVisibleDateTimeSegments(state: DateTimePickerState) {
  const month = clampNumber(Number(state.monthInput.value), 1, 12);
  const year = clampNumber(Number(state.yearInput.value), 1, 9999);
  const maxDay = daysInMonth(year, month);
  const day = clampNumber(Number(state.dayInput.value), 1, maxDay);
  const hour12 = clampNumber(Number(state.visibleHourInput.value), 1, 12);
  const minute = clampNumber(Number(state.visibleMinuteInput.value), 0, 59);
  const second = clampNumber(Number(state.visibleSecondInput.value), 0, 59);
  const rawMeridiem = state.visibleMeridiemInput.value.trim().toUpperCase();
  const meridiem =
    rawMeridiem === "P" || rawMeridiem === "PM"
      ? "PM"
      : rawMeridiem === "A" || rawMeridiem === "AM"
        ? "AM"
        : state.selectedDate.getHours() >= 12
          ? "PM"
          : "AM";

  let hour24 = hour12 % 12;
  if (meridiem === "PM") {
    hour24 += 12;
  }

  const next = new Date(year, month - 1, day, hour24, minute, second);
  if (Number.isNaN(next.getTime())) {
    syncDateTimePickerValue(state);
    return false;
  }

  state.selectedDate = next;
  state.viewYear = next.getFullYear();
  state.viewMonth = next.getMonth();
  renderDateTimePicker(state);
  return true;
}

function adjustVisibleSegmentValue(
  state: DateTimePickerState,
  segment:
    | "month"
    | "day"
    | "year"
    | "hour"
    | "minute"
    | "second"
    | "meridiem",
  delta: number
) {
  const next = new Date(state.selectedDate);

  if (segment === "month") {
    next.setMonth(next.getMonth() + delta);
  } else if (segment === "day") {
    next.setDate(next.getDate() + delta);
  } else if (segment === "year") {
    next.setFullYear(next.getFullYear() + delta);
  } else if (segment === "hour") {
    next.setHours(next.getHours() + delta);
  } else if (segment === "minute") {
    next.setMinutes(next.getMinutes() + delta);
  } else if (segment === "second") {
    next.setSeconds(next.getSeconds() + delta);
  } else {
    next.setHours((next.getHours() + 12) % 24);
  }

  state.selectedDate = next;
  state.viewYear = next.getFullYear();
  state.viewMonth = next.getMonth();
  renderDateTimePicker(state);
}

function syncDateTimePickerValue(state: DateTimePickerState) {
  state.hiddenInput.value = formatPickerDateTimeValue(state.selectedDate);
  state.epochInput.value = getEpochTimestampValue(state.selectedDate);
  state.monthInput.value = (state.selectedDate.getMonth() + 1)
    .toString()
    .padStart(2, "0");
  state.dayInput.value = state.selectedDate.getDate().toString().padStart(2, "0");
  state.yearInput.value = state.selectedDate.getFullYear().toString().padStart(4, "0");
  const hours24 = state.selectedDate.getHours();
  const hours12 = hours24 % 12 || 12;
  state.visibleHourInput.value = hours12.toString().padStart(2, "0");
  state.visibleMinuteInput.value = state.selectedDate
    .getMinutes()
    .toString()
    .padStart(2, "0");
  state.visibleSecondInput.value = state.selectedDate
    .getSeconds()
    .toString()
    .padStart(2, "0");
  state.visibleMeridiemInput.value = hours24 >= 12 ? "PM" : "AM";
  state.hourInput.value = hours12.toString().padStart(2, "0");
  state.minuteInput.value = state.selectedDate
    .getMinutes()
    .toString()
    .padStart(2, "0");
  state.secondInput.value = state.selectedDate
    .getSeconds()
    .toString()
    .padStart(2, "0");
  state.meridiemSelect.value = hours24 >= 12 ? "PM" : "AM";
}

function focusSelectedDay(state: DateTimePickerState) {
  const selectedValue = `${state.selectedDate.getFullYear()}-${(
    state.selectedDate.getMonth() + 1
  )
    .toString()
    .padStart(2, "0")}-${state.selectedDate
    .getDate()
    .toString()
    .padStart(2, "0")}`;

  const selectedButton = state.dayGrid.querySelector(
    `[data-date="${selectedValue}"]`
  ) as HTMLButtonElement | null;

  selectedButton?.focus();
}

function renderDateTimePicker(state: DateTimePickerState) {
  syncDateTimePickerValue(state);
  state.monthLabel.textContent = `${MONTH_NAMES[state.viewMonth]} ${state.viewYear}`;
  state.dayGrid.innerHTML = "";

  const monthStart = new Date(state.viewYear, state.viewMonth, 1);
  const calendarStart = addDays(monthStart, -monthStart.getDay());
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selectedDay = new Date(state.selectedDate);
  selectedDay.setHours(0, 0, 0, 0);

  for (let i = 0; i < 42; i++) {
    const day = addDays(calendarStart, i);
    const dayButton = document.createElement("button");
    const isoDate = `${day.getFullYear()}-${(day.getMonth() + 1)
      .toString()
      .padStart(2, "0")}-${day.getDate().toString().padStart(2, "0")}`;
    const isCurrentMonth = day.getMonth() === state.viewMonth;
    const isToday = day.getTime() === today.getTime();
    const isSelected = day.getTime() === selectedDay.getTime();

    dayButton.type = "button";
    dayButton.className = "datetime-picker-day";
    if (!isCurrentMonth) {
      dayButton.classList.add("is-outside-month");
    }
    if (isToday) {
      dayButton.classList.add("is-today");
    }
    if (isSelected) {
      dayButton.classList.add("is-selected");
    }

    dayButton.dataset.date = isoDate;
    dayButton.textContent = day.getDate().toString();
    dayButton.tabIndex = isSelected ? 0 : -1;
    dayButton.setAttribute(
      "aria-label",
      day.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    );

    dayButton.addEventListener("click", () => {
      setPickerDate(state, day);
    });

    dayButton.addEventListener("keydown", (event) => {
      let nextDate: Date | null = null;

      if (event.key === "ArrowLeft") {
        nextDate = addDays(state.selectedDate, -1);
      } else if (event.key === "ArrowRight") {
        nextDate = addDays(state.selectedDate, 1);
      } else if (event.key === "ArrowUp") {
        nextDate = addDays(state.selectedDate, -7);
      } else if (event.key === "ArrowDown") {
        nextDate = addDays(state.selectedDate, 7);
      } else if (event.key === "PageUp") {
        nextDate = addMonths(state.selectedDate, event.shiftKey ? -12 : -1);
      } else if (event.key === "PageDown") {
        nextDate = addMonths(state.selectedDate, event.shiftKey ? 12 : 1);
      } else if (event.key === "Home") {
        nextDate = addDays(state.selectedDate, -state.selectedDate.getDay());
      } else if (event.key === "End") {
        nextDate = addDays(state.selectedDate, 6 - state.selectedDate.getDay());
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setPickerDate(state, day);
        return;
      }

      if (!nextDate) {
        return;
      }

      event.preventDefault();
      setPickerDate(state, nextDate);
      requestAnimationFrame(() => focusSelectedDay(state));
    });

    state.dayGrid.appendChild(dayButton);
  }

  if (activeDateTimePicker === state) {
    requestAnimationFrame(() => positionDateTimePickerPopup(state));
  }
}

function openDateTimePicker(state: DateTimePickerState) {
  if (activeDateTimePicker && activeDateTimePicker !== state) {
    closeDateTimePicker();
  }

  activeDateTimePicker = state;
  state.root.classList.add("is-open");
  state.popup.hidden = false;
  state.monthInput.setAttribute("aria-expanded", "true");
  state.toggleButton.setAttribute("aria-expanded", "true");
  renderDateTimePicker(state);
  requestAnimationFrame(() => {
    positionDateTimePickerPopup(state);
    focusSelectedDay(state);
  });
}

function closeDateTimePicker(restoreFocus = false) {
  if (!activeDateTimePicker) {
    return;
  }

  const current = activeDateTimePicker;
  current.root.classList.remove("is-open");
  current.popup.hidden = true;
  current.monthInput.setAttribute("aria-expanded", "false");
  current.toggleButton.setAttribute("aria-expanded", "false");
  activeDateTimePicker = null;

  if (restoreFocus) {
    current.monthInput.focus();
  }
}

function positionDateTimePickerPopup(state: DateTimePickerState) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const padding = 12;
  const preferredWidth = Math.min(320, viewportWidth - padding * 2);

  state.popup.style.width = `${preferredWidth}px`;
  state.popup.style.maxWidth = `${viewportWidth - padding * 2}px`;

  const rootRect = state.root.getBoundingClientRect();
  const popupRect = state.popup.getBoundingClientRect();
  const popupWidth = popupRect.width || preferredWidth;
  const popupHeight = popupRect.height || 380;

  let left = rootRect.left;
  if (left + popupWidth > viewportWidth - padding) {
    left = viewportWidth - popupWidth - padding;
  }
  left = Math.max(padding, left);

  let top = rootRect.bottom + 8;
  if (top + popupHeight > viewportHeight - padding) {
    top = Math.max(padding, rootRect.top - popupHeight - 8);
  }

  state.popup.style.left = `${left}px`;
  state.popup.style.top = `${top}px`;
  state.popup.style.maxHeight = `${Math.max(220, viewportHeight - top - padding)}px`;
}

function createDateTimePicker(idx: number, labelId: string, initialValue: string) {
  const initialDate = parseInputDateTimeValue(initialValue) ?? new Date();
  const root = document.createElement("div");
  const hiddenInput = document.createElement("input");
  const field = document.createElement("div");
  const segmentGroup = document.createElement("div");
  const monthInput = document.createElement("input");
  const dayInput = document.createElement("input");
  const yearInput = document.createElement("input");
  const visibleHourInput = document.createElement("input");
  const visibleMinuteInput = document.createElement("input");
  const visibleSecondInput = document.createElement("input");
  const visibleMeridiemInput = document.createElement("input");
  const epochInput = document.createElement("input");
  const copyEpochButton = document.createElement("button");
  const toggleButton = document.createElement("button");
  const popup = document.createElement("div");
  const header = document.createElement("div");
  const prevButton = document.createElement("button");
  const nextButton = document.createElement("button");
  const monthLabel = document.createElement("div");
  const weekdays = document.createElement("div");
  const dayGrid = document.createElement("div");
  const timePanel = document.createElement("div");
  const timeLabel = document.createElement("div");
  const timeFields = document.createElement("div");
  const hourInput = document.createElement("input");
  const minuteInput = document.createElement("input");
  const secondInput = document.createElement("input");
  const meridiemSelect = document.createElement("select");
  const controlId = `field-${idx}`;
  const popupId = `field-${idx}-picker`;

  root.className = "datetime-picker";
  field.className = "datetime-picker-field";
  segmentGroup.className = "datetime-picker-segments";

  hiddenInput.type = "hidden";
  hiddenInput.dataset.idx = idx.toString();
  hiddenInput.dataset.fieldInput = "true";

  const visibleInputs = [
    { input: monthInput, label: "Month", widthClass: "is-short", maxLength: 2 },
    { input: dayInput, label: "Day", widthClass: "is-short", maxLength: 2 },
    { input: yearInput, label: "Year", widthClass: "is-year", maxLength: 4 },
    {
      input: visibleHourInput,
      label: "Hour",
      widthClass: "is-short",
      maxLength: 2,
    },
    {
      input: visibleMinuteInput,
      label: "Minute",
      widthClass: "is-short",
      maxLength: 2,
    },
    {
      input: visibleSecondInput,
      label: "Second",
      widthClass: "is-short",
      maxLength: 2,
    },
  ];

  visibleInputs.forEach(({ input, label, widthClass, maxLength }) => {
    input.type = "text";
    input.className = `datetime-picker-segment ${widthClass}`;
    input.inputMode = "numeric";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.maxLength = maxLength;
    input.setAttribute("aria-label", label);
    input.setAttribute("aria-haspopup", "dialog");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-controls", popupId);
    input.setAttribute("aria-labelledby", labelId);
  });

  monthInput.id = controlId;

  toggleButton.type = "button";
  toggleButton.className = "datetime-picker-toggle";
  toggleButton.setAttribute("aria-label", "Open date and time picker");
  toggleButton.setAttribute("aria-haspopup", "dialog");
  toggleButton.setAttribute("aria-expanded", "false");
  toggleButton.setAttribute("aria-controls", popupId);
  toggleButton.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1Zm12 8H5v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8ZM6 6a1 1 0 0 0-1 1v1h14V7a1 1 0 0 0-1-1H6Zm2 6h3v3H8v-3Z"/></svg>';

  visibleMeridiemInput.type = "text";
  visibleMeridiemInput.className = "datetime-picker-visible-meridiem";
  visibleMeridiemInput.inputMode = "text";
  visibleMeridiemInput.autocomplete = "off";
  visibleMeridiemInput.spellcheck = false;
  visibleMeridiemInput.maxLength = 2;
  visibleMeridiemInput.setAttribute("aria-label", "AM or PM");
  visibleMeridiemInput.setAttribute("aria-haspopup", "dialog");
  visibleMeridiemInput.setAttribute("aria-expanded", "false");
  visibleMeridiemInput.setAttribute("aria-controls", popupId);
  visibleMeridiemInput.setAttribute("aria-labelledby", labelId);

  epochInput.type = "text";
  epochInput.className = "datetime-picker-epoch-input";
  epochInput.inputMode = "numeric";
  epochInput.readOnly = true;
  epochInput.tabIndex = 0;
  epochInput.setAttribute("aria-label", "Epoch timestamp");

  copyEpochButton.type = "button";
  copyEpochButton.className = "datetime-picker-copy";
  copyEpochButton.textContent = "Copy epoch";
  copyEpochButton.setAttribute("aria-label", "Copy epoch timestamp");

  popup.id = popupId;
  popup.hidden = true;
  popup.className = "datetime-picker-popup";
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-label", "Choose date and time");

  header.className = "datetime-picker-header";

  prevButton.type = "button";
  prevButton.className = "datetime-picker-nav";
  prevButton.setAttribute("aria-label", "Previous month");
  prevButton.textContent = "‹";

  nextButton.type = "button";
  nextButton.className = "datetime-picker-nav";
  nextButton.setAttribute("aria-label", "Next month");
  nextButton.textContent = "›";

  monthLabel.className = "datetime-picker-month";

  weekdays.className = "datetime-picker-weekdays";
  for (const dayName of WEEKDAY_NAMES) {
    const dayCell = document.createElement("div");
    dayCell.textContent = dayName;
    weekdays.appendChild(dayCell);
  }

  dayGrid.className = "datetime-picker-grid";

  timePanel.className = "datetime-picker-time";
  timeLabel.className = "datetime-picker-time-label";
  timeLabel.textContent = "Time";
  timeFields.className = "datetime-picker-time-fields";

  const timeInputs = [
    { input: hourInput, label: "Hour", max: "12" },
    { input: minuteInput, label: "Minute", max: "59" },
    { input: secondInput, label: "Second", max: "59" },
  ];

  timeInputs.forEach(({ input, label, max }, position) => {
    input.type = "number";
    input.className = "datetime-picker-time-input";
    input.min = "0";
    input.max = max;
    input.step = "1";
    input.inputMode = "numeric";
    input.setAttribute("aria-label", label);

    input.addEventListener("focus", () => input.select());
    input.addEventListener("input", () => {
      const value = clampNumber(Number(input.value), 0, Number(max));
      if (label === "Hour") {
        setPickerTimePart(state, "hours12", value);
      } else if (label === "Minute") {
        setPickerTimePart(state, "minutes", value);
      } else {
        setPickerTimePart(state, "seconds", value);
      }
    });
    input.addEventListener("blur", () => {
      input.value = clampNumber(Number(input.value), 0, Number(max))
        .toString()
        .padStart(2, "0");
    });

    timeFields.appendChild(input);

    if (position < timeInputs.length - 1) {
      const separator = document.createElement("span");
      separator.className = "datetime-picker-time-separator";
      separator.textContent = ":";
      timeFields.appendChild(separator);
    }
  });

  meridiemSelect.className = "datetime-picker-meridiem";
  meridiemSelect.setAttribute("aria-label", "AM or PM");
  for (const value of ["AM", "PM"]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    meridiemSelect.appendChild(option);
  }
  meridiemSelect.addEventListener("change", () => {
    setPickerTimePart(state, "meridiem", meridiemSelect.value === "PM" ? 1 : 0);
  });

  timePanel.appendChild(timeLabel);
  timePanel.appendChild(timeFields);
  timePanel.appendChild(meridiemSelect);

  header.appendChild(prevButton);
  header.appendChild(monthLabel);
  header.appendChild(nextButton);
  popup.appendChild(header);
  popup.appendChild(weekdays);
  popup.appendChild(dayGrid);
  popup.appendChild(timePanel);

  const state: DateTimePickerState = {
    root,
    hiddenInput,
    monthInput,
    dayInput,
    yearInput,
    visibleHourInput,
    visibleMinuteInput,
    visibleSecondInput,
    visibleMeridiemInput,
    epochInput,
    copyEpochButton,
    toggleButton,
    popup,
    monthLabel,
    dayGrid,
    hourInput,
    minuteInput,
    secondInput,
    meridiemSelect,
    selectedDate: initialDate,
    viewYear: initialDate.getFullYear(),
    viewMonth: initialDate.getMonth(),
  };

  prevButton.addEventListener("click", () => {
    const next = addMonths(new Date(state.viewYear, state.viewMonth, 1), -1);
    state.viewYear = next.getFullYear();
    state.viewMonth = next.getMonth();
    renderDateTimePicker(state);
  });

  nextButton.addEventListener("click", () => {
    const next = addMonths(new Date(state.viewYear, state.viewMonth, 1), 1);
    state.viewYear = next.getFullYear();
    state.viewMonth = next.getMonth();
    renderDateTimePicker(state);
  });

  function moveToNextSegment(currentIndex: number) {
    const segments = [
      monthInput,
      dayInput,
      yearInput,
      visibleHourInput,
      visibleMinuteInput,
      visibleSecondInput,
      visibleMeridiemInput,
      toggleButton,
    ];
    const next = segments[currentIndex + 1];
    next?.focus();
    if ("select" in next && typeof next.select === "function") {
      next.select();
    }
  }

  function moveToPreviousSegment(currentIndex: number) {
    const segments = [
      monthInput,
      dayInput,
      yearInput,
      visibleHourInput,
      visibleMinuteInput,
      visibleSecondInput,
      visibleMeridiemInput,
      toggleButton,
    ];
    const previous = segments[currentIndex - 1];
    previous?.focus();
    if ("select" in previous && typeof previous.select === "function") {
      previous.select();
    }
  }

  function wireVisibleSegment(
    input: HTMLInputElement,
    maxLength: number,
    index: number,
    segment:
      | "month"
      | "day"
      | "year"
      | "hour"
      | "minute"
      | "second"
  ) {
    input.addEventListener("focus", () => input.select());
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(0, maxLength);
      if (input.value.length === maxLength) {
        moveToNextSegment(index);
      }
    });
    input.addEventListener("blur", () => {
      commitVisibleDateTimeSegments(state);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft" && input.selectionStart === 0) {
        event.preventDefault();
        moveToPreviousSegment(index);
        return;
      }
      if (
        event.key === "ArrowRight" &&
        input.selectionStart === input.value.length
      ) {
        event.preventDefault();
        moveToNextSegment(index);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        commitVisibleDateTimeSegments(state);
        adjustVisibleSegmentValue(state, segment, 1);
        input.focus();
        input.select();
        return;
      }
      if (event.key === "ArrowDown" && !event.altKey) {
        event.preventDefault();
        commitVisibleDateTimeSegments(state);
        adjustVisibleSegmentValue(state, segment, -1);
        input.focus();
        input.select();
        return;
      }
      if (event.key === "ArrowDown" || (event.altKey && event.key === "ArrowDown")) {
        event.preventDefault();
        commitVisibleDateTimeSegments(state);
        openDateTimePicker(state);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        commitVisibleDateTimeSegments(state);
        closeDateTimePicker();
      }
    });
  }

  wireVisibleSegment(monthInput, 2, 0, "month");
  wireVisibleSegment(dayInput, 2, 1, "day");
  wireVisibleSegment(yearInput, 4, 2, "year");
  wireVisibleSegment(visibleHourInput, 2, 3, "hour");
  wireVisibleSegment(visibleMinuteInput, 2, 4, "minute");
  wireVisibleSegment(visibleSecondInput, 2, 5, "second");

  visibleMeridiemInput.addEventListener("focus", () => visibleMeridiemInput.select());
  visibleMeridiemInput.addEventListener("input", () => {
    const normalized = visibleMeridiemInput.value
      .replace(/[^apm]/gi, "")
      .toUpperCase()
      .slice(0, 2);
    visibleMeridiemInput.value = normalized;
  });
  visibleMeridiemInput.addEventListener("blur", () => {
    commitVisibleDateTimeSegments(state);
  });

  visibleMeridiemInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      visibleSecondInput.focus();
      visibleSecondInput.select();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      toggleButton.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      adjustVisibleSegmentValue(state, "meridiem", 1);
      visibleMeridiemInput.focus();
      visibleMeridiemInput.select();
    } else if (event.key === "ArrowDown" && !event.altKey) {
      event.preventDefault();
      adjustVisibleSegmentValue(state, "meridiem", -1);
      visibleMeridiemInput.focus();
      visibleMeridiemInput.select();
    } else if (
      event.key === "ArrowDown" ||
      (event.altKey && event.key === "ArrowDown")
    ) {
      event.preventDefault();
      commitVisibleDateTimeSegments(state);
      openDateTimePicker(state);
    } else if (event.key === "Enter") {
      event.preventDefault();
      commitVisibleDateTimeSegments(state);
      closeDateTimePicker();
    }
  });

  toggleButton.addEventListener("click", () => {
    if (activeDateTimePicker === state) {
      closeDateTimePicker();
      return;
    }

    commitVisibleDateTimeSegments(state);
    openDateTimePicker(state);
  });

  toggleButton.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      visibleMeridiemInput.focus();
      visibleMeridiemInput.select();
    }
  });

  epochInput.addEventListener("focus", () => epochInput.select());
  epochInput.addEventListener("click", () => epochInput.select());

  copyEpochButton.addEventListener("click", async () => {
    try {
      await copyTextToClipboard(epochInput.value);
      copyEpochButton.textContent = "Copied";
      window.setTimeout(() => {
        copyEpochButton.textContent = "Copy epoch";
      }, 1200);
    } catch (error) {
      console.error("Failed to copy epoch timestamp", error);
      copyEpochButton.textContent = "Copy failed";
      window.setTimeout(() => {
        copyEpochButton.textContent = "Copy epoch";
      }, 1600);
    }
  });

  root.appendChild(hiddenInput);
  const slash1 = document.createElement("span");
  slash1.className = "datetime-picker-separator";
  slash1.textContent = "/";
  const slash2 = document.createElement("span");
  slash2.className = "datetime-picker-separator";
  slash2.textContent = "/";
  const comma = document.createElement("span");
  comma.className = "datetime-picker-separator is-comma";
  comma.textContent = ",";
  const colon1 = document.createElement("span");
  colon1.className = "datetime-picker-separator";
  colon1.textContent = ":";
  const colon2 = document.createElement("span");
  colon2.className = "datetime-picker-separator";
  colon2.textContent = ":";

  segmentGroup.appendChild(monthInput);
  segmentGroup.appendChild(slash1);
  segmentGroup.appendChild(dayInput);
  segmentGroup.appendChild(slash2);
  segmentGroup.appendChild(yearInput);
  segmentGroup.appendChild(comma);
  segmentGroup.appendChild(visibleHourInput);
  segmentGroup.appendChild(colon1);
  segmentGroup.appendChild(visibleMinuteInput);
  segmentGroup.appendChild(colon2);
  segmentGroup.appendChild(visibleSecondInput);
  segmentGroup.appendChild(visibleMeridiemInput);

  field.appendChild(segmentGroup);
  field.appendChild(epochInput);
  field.appendChild(copyEpochButton);
  field.appendChild(toggleButton);
  root.appendChild(field);
  root.appendChild(popup);

  renderDateTimePicker(state);
  return root;
}

function setupGpsEditor(file: LoadedFile) {
  const { elements } = file;
  if (!elements) {
    return;
  }

  const latitudeField = file.parsedFields.find(
    (field) => field.name === "GPSLatitude"
  );
  const longitudeField = file.parsedFields.find(
    (field) => field.name === "GPSLongitude"
  );

  if (
    !latitudeField ||
    !longitudeField ||
    typeof latitudeField.value !== "number" ||
    typeof longitudeField.value !== "number"
  ) {
    elements.gpsEditor.style.display = "none";
    file.gpsMap?.remove();
    file.gpsMap = null;
    file.gpsMarker = null;
    return;
  }

  const latitudeInput = elements.form.querySelector(
    `[data-idx="${file.parsedFields.indexOf(latitudeField)}"]`
  ) as HTMLInputElement | null;
  const longitudeInput = elements.form.querySelector(
    `[data-idx="${file.parsedFields.indexOf(longitudeField)}"]`
  ) as HTMLInputElement | null;
  const altitudeField = file.parsedFields.find(
    (field) => field.name === "GPSAltitude"
  );
  const altitudeInput =
    altitudeField &&
    (elements.form.querySelector(
      `[data-idx="${file.parsedFields.indexOf(altitudeField)}"]`
    ) as HTMLInputElement | null);

  if (!latitudeInput || !longitudeInput) {
    elements.gpsEditor.style.display = "none";
    file.gpsMap?.remove();
    file.gpsMap = null;
    file.gpsMarker = null;
    return;
  }

  elements.gpsEditor.style.display = "flex";
  elements.gpsHint.textContent =
    altitudeInput !== null
      ? "Drag the marker or edit the GPS fields directly. Altitude stays editable below."
      : "Drag the marker or edit the GPS fields directly.";

  const updateMarkerPosition = () => {
    const lat = Number(latitudeInput.value);
    const lon = Number(longitudeInput.value);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return;
    }

    if (!file.gpsMap) {
      file.gpsMap = L.map(elements.gpsMapEl).setView([lat, lon], 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(file.gpsMap);
      file.gpsMarker = L.marker([lat, lon], { draggable: true }).addTo(file.gpsMap);
      file.gpsMarker.on("dragend", () => {
        const markerLatLng = file.gpsMarker?.getLatLng();
        if (!markerLatLng) {
          return;
        }
        latitudeInput.value = markerLatLng.lat.toFixed(6);
        longitudeInput.value = markerLatLng.lng.toFixed(6);
      });
    } else {
      file.gpsMap.invalidateSize();
      file.gpsMap.setView([lat, lon]);
      file.gpsMarker?.setLatLng([lat, lon]);
    }
  };

  latitudeInput.addEventListener("input", updateMarkerPosition);
  longitudeInput.addEventListener("input", updateMarkerPosition);

  updateMarkerPosition();
}

function renderFields(file: LoadedFile, form: HTMLFormElement) {
  form.innerHTML = "";

  if (!file.parsedFields.length) {
    return;
  }

  const fieldPriority: Record<string, number> = {
    ModifyDate: 0,
    DateTimeOriginal: 1,
    CreateDate: 2,
    GPSDateTime: 3,
    GPSLatitude: 4,
    GPSLongitude: 5,
    GPSAltitude: 6,
    GPSDateStamp: 7,
    GPSTimeStamp: 8,
  };

  const fieldEntries = file.parsedFields
    .map((field, idx) => ({ field, idx }))
    .sort((a, b) => {
      const aPriority = fieldPriority[a.field.name] ?? 100;
      const bPriority = fieldPriority[b.field.name] ?? 100;
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      return a.idx - b.idx;
    });

  // Helper function to find corresponding date for a time field
  function findCorrespondingDate(timeField: EXIFField): string | null {
    if (timeField.ifd === "GPS" && timeField.name === "GPSTimeStamp") {
      // For GPS time, look for GPS date stamp
      const gpsDateField = file.parsedFields.find(
        (f) => f.name === "GPSDateStamp" && f.ifd === "GPS"
      );
      if (gpsDateField && typeof gpsDateField.value === "string") {
        return gpsDateField.value;
      }
    }

    // For other time fields, try to find a corresponding datetime field
    // Look for fields in the same IFD first, then fall back to any datetime field
    const sameIFDDateTime = file.parsedFields.find(
      (f) => f.type === "datetime" && f.ifd === timeField.ifd
    );
    if (sameIFDDateTime && typeof sameIFDDateTime.value === "string") {
      return sameIFDDateTime.value;
    }

    // Fall back to any datetime field
    const anyDateTime = file.parsedFields.find((f) => f.type === "datetime");
    if (anyDateTime && typeof anyDateTime.value === "string") {
      return anyDateTime.value;
    }

    return null;
  }

  fieldEntries.forEach(({ field: f, idx }) => {
    const row = document.createElement("div");

    row.className = "row";

    const label = document.createElement("label");
    const labelId = `field-label-${idx}`;

    label.id = labelId;
    label.textContent = f.label;

    let control: HTMLElement;

    if (f.type === "date") {
      const input = document.createElement("input");
      input.type = "date";
      input.dataset.fieldInput = "true";
      input.dataset.idx = idx.toString();
      input.id = `field-${idx}`;
      label.htmlFor = input.id;
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
      control = input;
    } else if (f.type === "time") {
      const input = document.createElement("input");
      input.type = "time";
      input.step = "1";
      input.dataset.fieldInput = "true";
      input.dataset.idx = idx.toString();
      input.id = `field-${idx}`;
      label.htmlFor = input.id;

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
      control = input;
    } else if (f.type === "coordinate" || f.type === "number") {
      const input = document.createElement("input");
      input.type = "number";
      input.step = f.type === "coordinate" ? "0.000001" : "0.1";
      input.dataset.fieldInput = "true";
      input.dataset.idx = idx.toString();
      input.id = `field-${idx}`;
      label.htmlFor = input.id;
      input.value =
        typeof f.value === "number"
          ? f.type === "coordinate"
            ? f.value.toFixed(6)
            : f.value.toFixed(1)
          : "";
      control = input;
    } else {
      label.htmlFor = `field-${idx}`;
      control = createDateTimePicker(
        idx,
        labelId,
        toInputDateTime(f.value as string)
      );
    }

    row.appendChild(label);
    row.appendChild(control);
    form.appendChild(row);
  });

  setupGpsEditor(file);
}

function appendFileEditor(file: LoadedFile) {
  const container = document.createElement("div");
  const meta = document.createElement("div");
  const previewColumn = document.createElement("div");
  const previewFrame = document.createElement("div");
  const reorderRail = document.createElement("div");
  const previewPanel = document.createElement("div");
  const previewButton = document.createElement("button");
  const previewImg = document.createElement("img");
  const previewInfo = document.createElement("div");
  const previewNameRow = document.createElement("div");
  const filenameLabel = document.createElement("span");
  const editFilenameButton = document.createElement("button");
  const filenameInput = document.createElement("input");
  const previewHint = document.createElement("div");
  const moveUpButton = document.createElement("button");
  const moveDownButton = document.createElement("button");
  const editorPanel = document.createElement("div");
  const form = document.createElement("form");
  const gpsEditorEl = document.createElement("div");
  const gpsMapElement = document.createElement("div");
  const gpsHintEl = document.createElement("div");
  const actions = document.createElement("div");
  const downloadButton = document.createElement("button");
  const clearButton = document.createElement("button");

  container.className = "file-editor";
  meta.className = "meta";
  previewColumn.className = "preview-column";
  previewFrame.className = "preview-frame";
  reorderRail.className = "reorder-rail";
  previewPanel.className = "preview-panel";
  previewButton.className = "preview-button";
  previewButton.type = "button";
  previewButton.setAttribute("aria-label", `Open larger image preview for ${file.filename}`);
  previewImg.className = "preview";
  previewImg.alt = file.filename;
  previewImg.src = file.previewUrl;
  previewInfo.id = "";
  previewInfo.className = "muted";
  previewNameRow.className = "preview-name-row";
  filenameLabel.className = "preview-filename";
  filenameLabel.textContent = getDownloadFilename(file);
  editFilenameButton.type = "button";
  editFilenameButton.className = "icon-button";
  editFilenameButton.setAttribute("aria-label", "Edit filename");
  editFilenameButton.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Zm14.71-9.04a1.003 1.003 0 0 0 0-1.42l-2.5-2.5a1.003 1.003 0 0 0-1.42 0l-1.96 1.96 3.75 3.75 2.13-1.79Z"/></svg>';
  filenameInput.className = "preview-name-input";
  filenameInput.type = "text";
  filenameInput.value = file.filename;
  filenameInput.spellcheck = false;
  filenameInput.setAttribute("aria-label", "Filename for download");
  filenameInput.hidden = true;
  previewHint.textContent = "Click image to enlarge";
  moveUpButton.type = "button";
  moveUpButton.className = "icon-button";
  moveUpButton.setAttribute("aria-label", "Move file up");
  moveUpButton.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5 5 12h4v7h6v-7h4l-7-7Z"/></svg>';
  moveDownButton.type = "button";
  moveDownButton.className = "icon-button";
  moveDownButton.setAttribute("aria-label", "Move file down");
  moveDownButton.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19 19 12h-4V5H9v7H5l7 7Z"/></svg>';
  editorPanel.className = "editor-panel";
  form.className = "file-fields";
  gpsEditorEl.className = "gps-editor";
  gpsEditorEl.style.display = "none";
  gpsMapElement.className = "gps-map";
  gpsHintEl.className = "muted";
  actions.className = "file-card-actions";
  downloadButton.type = "button";
  downloadButton.className = "primary";
  downloadButton.textContent = "Download";
  clearButton.type = "button";
  clearButton.className = "ghost";
  clearButton.textContent = "Clear";

  previewButton.addEventListener("click", () => openImageModal(file.previewUrl));
  editFilenameButton.addEventListener("click", () => beginFilenameEdit(file));
  filenameInput.addEventListener("input", () => {
    file.filename = filenameInput.value;
  });
  filenameInput.addEventListener("blur", () => finishFilenameEdit(file));
  filenameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      finishFilenameEdit(file);
    } else if (event.key === "Escape") {
      event.preventDefault();
      filenameInput.value = file.filename;
      finishFilenameEdit(file);
    }
  });
  moveUpButton.addEventListener("click", () => moveLoadedFile(file.id, -1));
  moveDownButton.addEventListener("click", () => moveLoadedFile(file.id, 1));
  downloadButton.addEventListener("click", () => downloadLoadedFile(file.id));
  clearButton.addEventListener("click", () => removeLoadedFile(file.id));

  previewButton.appendChild(previewImg);
  previewNameRow.appendChild(filenameLabel);
  previewNameRow.appendChild(editFilenameButton);
  previewInfo.appendChild(previewNameRow);
  previewInfo.appendChild(filenameInput);
  previewInfo.appendChild(previewHint);
  reorderRail.appendChild(moveUpButton);
  reorderRail.appendChild(moveDownButton);
  previewPanel.appendChild(previewButton);
  previewPanel.appendChild(previewInfo);
  previewFrame.appendChild(reorderRail);
  previewFrame.appendChild(previewPanel);
  previewColumn.appendChild(previewFrame);
  gpsEditorEl.appendChild(gpsMapElement);
  gpsEditorEl.appendChild(gpsHintEl);
  editorPanel.appendChild(form);
  editorPanel.appendChild(gpsEditorEl);
  actions.appendChild(downloadButton);
  actions.appendChild(clearButton);
  meta.appendChild(previewColumn);
  meta.appendChild(editorPanel);
  container.appendChild(meta);
  container.appendChild(actions);
  fileListEl.appendChild(container);

  file.elements = {
    container,
    form,
    gpsEditor: gpsEditorEl,
    gpsMapEl: gpsMapElement,
    gpsHint: gpsHintEl,
    filenameInput,
    filenameLabel,
    editFilenameButton,
    previewButton,
    previewImg,
    moveUpButton,
    moveDownButton,
  };

  renderFields(file, form);
  refreshLoadedFileControls();
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

function applyFormToWorkingBuffer(file: LoadedFile) {
  if (!file.elements) {
    return;
  }

  const inputs = file.elements.form.querySelectorAll(
    '[data-field-input="true"]'
  ) as NodeListOf<HTMLInputElement>;

  const parsedFields = file.parsedFields;
  const dv = new DataView(file.workingBuffer);
  const littleEndian = getExifLittleEndian(dv);

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
    } else if (field.type === "coordinate") {
      const decimal = Number(inp.value);
      if (Number.isNaN(decimal)) {
        return;
      }

      const ref =
        field.name === "GPSLatitude"
          ? decimal >= 0
            ? "N"
            : "S"
          : decimal >= 0
            ? "E"
            : "W";
      const [degrees, minutes, seconds] = dmsFromDecimal(decimal);
      const secondsScaled = Math.round(seconds * 1000000);

      if (field._gpsRefOffset && field._gpsRefCount) {
        dv.setUint8(field._gpsRefOffset, ref.charCodeAt(0));
        if (field._gpsRefCount > 1) {
          dv.setUint8(field._gpsRefOffset + 1, 0);
        }
      }

      const abs = field.valueOffset;
      dv.setUint32(abs, degrees, littleEndian);
      dv.setUint32(abs + 4, 1, littleEndian);
      dv.setUint32(abs + 8, minutes, littleEndian);
      dv.setUint32(abs + 12, 1, littleEndian);
      dv.setUint32(abs + 16, secondsScaled, littleEndian);
      dv.setUint32(abs + 20, 1000000, littleEndian);
      return;
    } else if (field.type === "number") {
      const value = Number(inp.value);
      if (Number.isNaN(value)) {
        return;
      }

      const abs = field.valueOffset;
      const scaled = Math.round(Math.abs(value) * 100);
      dv.setUint32(abs, scaled, littleEndian);
      dv.setUint32(abs + 4, 100, littleEndian);
      if (field._gpsAltitudeRefOffset !== undefined) {
        dv.setUint8(field._gpsAltitudeRefOffset, value < 0 ? 1 : 0);
      }
      return;
    } else {
      // Use the original fromInputDateTime function
      newVal = fromInputDateTime(inp.value);

      // For combined GPS datetime, convert to UTC and split into date and time
      if (
        field.ifd === "GPS" &&
        field.name === "GPSDateTime" &&
        typeof newVal === "string"
      ) {
        // Parse the local datetime string "YYYY:MM:DD HH:MM:SS"
        const match = newVal.match(
          /(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/
        );
        if (match) {
          const [_, y, m, d, hh, mm, ss] = match;

          // Create local date object
          const localDate = new Date(
            parseInt(y),
            parseInt(m) - 1,
            parseInt(d),
            parseInt(hh),
            parseInt(mm),
            parseInt(ss)
          );

          // Convert to UTC
          const utcYear = localDate.getUTCFullYear();
          const utcMonth = (localDate.getUTCMonth() + 1)
            .toString()
            .padStart(2, "0");
          const utcDay = localDate.getUTCDate().toString().padStart(2, "0");
          const utcHours = localDate.getUTCHours();
          const utcMinutes = localDate.getUTCMinutes();
          const utcSeconds = localDate.getUTCSeconds();

          // Write the GPS date stamp
          if (
            field._gpsDateTag &&
            field._gpsDateOffset &&
            field._gpsDateCount
          ) {
            const dateStr = `${utcYear}:${utcMonth}:${utcDay}`;
            const dateBytes = new Uint8Array(field._gpsDateCount);
            const encoder = new TextEncoder();
            const encoded = encoder.encode(dateStr);
            const len = Math.min(encoded.length, field._gpsDateCount - 1);
            dateBytes.set(encoded.subarray(0, len), 0);
            dateBytes[len] = 0; // null terminate

            for (let i = 0; i < field._gpsDateCount; i++) {
              dv.setUint8(field._gpsDateOffset + i, dateBytes[i]);
            }
          }

          // Update newVal to be the time array for the GPS timestamp
          newVal = [utcHours, utcMinutes, utcSeconds];
        }
      }
    }

    if (newVal.length === 0) {
      return; // skip
    }

    let target = newVal;

    const count = field.count;

    let bytes =
      field.type === "time" ||
      (field.type === "datetime" && field.name === "GPSDateTime")
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
      // This handles both GPSTimeStamp and the time component of GPSDateTime
      for (let i = 0; i < count; i++) {
        const abs = field.valueOffset + 8 * i;

        dv.setUint32(abs, target[i], littleEndian);
        dv.setUint32(abs + 4, 1, littleEndian);
      }
    }
  });

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
      const inlineValueBytes = getInlineValueByteLength(type, count);

      let valueOffsetAbsolute = null;

      if (type === 2) {
        // ASCII
        if (inlineValueBytes <= 4) {
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
      } else if (type === 5 || type === 10) {
        // RATIONAL (two LONGs: numerator/denominator)
        // Value is always an offset to the actual data
        const off = view.getUint32(valueOrOffset, littleEndian);
        valueOffsetAbsolute = tiffStartOffset + off;
        let rationals: { numerator: number; denominator: number }[] = [];
        for (let k = 0; k < count; k++) {
          const num =
            type === 10
              ? view.getInt32(valueOffsetAbsolute + k * 8, littleEndian)
              : view.getUint32(valueOffsetAbsolute + k * 8, littleEndian);
          const denom =
            type === 10
              ? view.getInt32(valueOffsetAbsolute + k * 8 + 4, littleEndian)
              : view.getUint32(valueOffsetAbsolute + k * 8 + 4, littleEndian);
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
      } else if (type === 1 || type === 7) {
        if (inlineValueBytes <= 4) {
          valueOffsetAbsolute = valueOrOffset;
        } else {
          const off = view.getUint32(valueOrOffset, littleEndian);
          valueOffsetAbsolute = tiffStartOffset + off;
        }
        const values: number[] = [];
        for (let k = 0; k < count; k++) {
          values.push(view.getUint8(valueOffsetAbsolute + k));
        }

        entries.set(tag, {
          tag,
          type,
          count,
          valueOffset: valueOffsetAbsolute,
          value: count === 1 ? values[0] : values,
        });
      } else if (type === 3 || type === 4) {
        const componentSize = type === 3 ? 2 : 4;
        if (inlineValueBytes <= 4) {
          valueOffsetAbsolute = valueOrOffset;
        } else {
          const off = view.getUint32(valueOrOffset, littleEndian);
          valueOffsetAbsolute = tiffStartOffset + off;
        }

        const values: number[] = [];
        for (let k = 0; k < count; k++) {
          const itemOffset = valueOffsetAbsolute + k * componentSize;
          values.push(
            type === 3
              ? view.getUint16(itemOffset, littleEndian)
              : view.getUint32(itemOffset, littleEndian)
          );
        }

        const value = count === 1 ? values[0] : values;

        entries.set(tag, {
          tag,
          type,
          count,
          value,
          valueOffset:
            tag === TAGS.ExifIFDPointer || tag === TAGS.GPSInfoIFDPointer
              ? valueOrOffset
              : valueOffsetAbsolute,
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
      entryPtr += 12;
    }

    const nextIFD = view.getUint32(entryPtr, littleEndian);

    return { entries, nextIFD };
  }

  // read 0th IFD
  const ifd0 = readIFD(firstIFDOffset);

  const ifd0DateTags = [
    {
      tag: TAGS.ModifyDate,
      name: "ModifyDate",
      label: "ModifyDate (Image DateTime, 0th IFD)",
    },
  ];

  for (const fieldDef of ifd0DateTags) {
    const entry = ifd0.entries.get(fieldDef.tag);
    if (!entry) {
      continue;
    }

    results.push({
      label: fieldDef.label,
      name: fieldDef.name,
      ifd: "0th",
      tag: fieldDef.tag,
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
    const exifDateTags = [
      {
        tag: TAGS.DateTimeOriginal,
        name: "DateTimeOriginal",
        label: "DateTimeOriginal (Exif IFD)",
      },
      {
        tag: TAGS.CreateDate,
        name: "CreateDate",
        label: "CreateDate (DateTimeDigitized, Exif IFD)",
      },
    ];

    for (const fieldDef of exifDateTags) {
      const entry = exifIFD.entries.get(fieldDef.tag);
      if (!entry) {
        continue;
      }

      results.push({
        label: fieldDef.label,
        name: fieldDef.name,
        ifd: "Exif",
        tag: fieldDef.tag,
        count: entry.count,
        valueOffset: entry.valueOffset,
        value: entry.value,
        type: "datetime",
      });
    }
  }

  if (gpsIFDOffset) {
    const gpsIFD = readIFD(gpsIFDOffset);
    const gpsLatitudeRef = gpsIFD.entries.get(TAGS.GPSLatitudeRef);
    const gpsLatitude = gpsIFD.entries.get(TAGS.GPSLatitude);
    const gpsLongitudeRef = gpsIFD.entries.get(TAGS.GPSLongitudeRef);
    const gpsLongitude = gpsIFD.entries.get(TAGS.GPSLongitude);
    const gpsAltitudeRef = gpsIFD.entries.get(TAGS.GPSAltitudeRef);
    const gpsAltitude = gpsIFD.entries.get(TAGS.GPSAltitude);
    const gpsDateEntry = gpsIFD.entries.get(TAGS.GPSDateStamp);
    const gpsTimeEntry = gpsIFD.entries.get(TAGS.GPSTimeStamp);
    const latitudeRef = decodeGpsRef(gpsLatitudeRef?.value as
      | string
      | number
      | number[]
      | undefined);
    const longitudeRef = decodeGpsRef(gpsLongitudeRef?.value as
      | string
      | number
      | number[]
      | undefined);

    if (
      latitudeRef &&
      gpsLatitude &&
      Array.isArray(gpsLatitude.value)
    ) {
      const latitude = decimalFromDms(gpsLatitude.value as number[], latitudeRef);
      if (latitude !== null) {
        results.push({
          label: "GPS Latitude",
          name: "GPSLatitude",
          ifd: "GPS",
          tag: TAGS.GPSLatitude,
          count: gpsLatitude.count,
          valueOffset: gpsLatitude.valueOffset,
          value: latitude,
          type: "coordinate",
          _gpsRefOffset: gpsLatitudeRef?.valueOffset,
          _gpsRefCount: gpsLatitudeRef?.count,
        });
      }
    }

    if (
      longitudeRef &&
      gpsLongitude &&
      Array.isArray(gpsLongitude.value)
    ) {
      const longitude = decimalFromDms(
        gpsLongitude.value as number[],
        longitudeRef
      );
      if (longitude !== null) {
        results.push({
          label: "GPS Longitude",
          name: "GPSLongitude",
          ifd: "GPS",
          tag: TAGS.GPSLongitude,
          count: gpsLongitude.count,
          valueOffset: gpsLongitude.valueOffset,
          value: longitude,
          type: "coordinate",
          _gpsRefOffset: gpsLongitudeRef?.valueOffset,
          _gpsRefCount: gpsLongitudeRef?.count,
        });
      }
    }

    if (gpsAltitude && typeof gpsAltitude.value === "number") {
      const altitudeValue =
        (gpsAltitude.value as number) * (gpsAltitudeRef?.value === 1 ? -1 : 1);
      results.push({
        label: "GPS Altitude (m)",
        name: "GPSAltitude",
        ifd: "GPS",
        tag: TAGS.GPSAltitude,
        count: gpsAltitude.count,
        valueOffset: gpsAltitude.valueOffset,
        value: altitudeValue,
        type: "number",
        _gpsAltitudeRefOffset: gpsAltitudeRef?.valueOffset,
      });
    }

    // Combine GPS date and time into a single datetime field for easier editing
    if (gpsDateEntry && gpsTimeEntry) {
      const dateStr = gpsDateEntry.value as string; // "YYYY:MM:DD"
      const timeArr = gpsTimeEntry.value as number[]; // [H, M, S] in UTC

      // Parse the date components
      const dateMatch = dateStr.match(/(\d{4}):(\d{2}):(\d{2})/);
      if (dateMatch && Array.isArray(timeArr) && timeArr.length === 3) {
        const [_, year, month, day] = dateMatch;
        const [h, m, s] = timeArr;

        // Create UTC datetime
        const utcDate = new Date(
          Date.UTC(
            parseInt(year),
            parseInt(month) - 1,
            parseInt(day),
            h,
            m,
            s || 0
          )
        );

        // Convert to local datetime string
        const localYear = utcDate.getFullYear();
        const localMonth = (utcDate.getMonth() + 1).toString().padStart(2, "0");
        const localDay = utcDate.getDate().toString().padStart(2, "0");
        const localHours = utcDate.getHours().toString().padStart(2, "0");
        const localMinutes = utcDate.getMinutes().toString().padStart(2, "0");
        const localSeconds = utcDate.getSeconds().toString().padStart(2, "0");

        const localDateTimeStr = `${localYear}:${localMonth}:${localDay} ${localHours}:${localMinutes}:${localSeconds}`;

        results.push({
          label: "GPS DateTime (GPS IFD)",
          name: "GPSDateTime",
          ifd: "GPS",
          tag: TAGS.GPSTimeStamp, // Use timestamp tag as primary
          count: gpsTimeEntry.count,
          valueOffset: gpsTimeEntry.valueOffset,
          value: localDateTimeStr,
          type: "datetime",
          // Store references to both entries for saving later
          _gpsDateTag: TAGS.GPSDateStamp,
          _gpsDateOffset: gpsDateEntry.valueOffset,
          _gpsDateCount: gpsDateEntry.count,
        } as any);
      }
    } else {
      // Fall back to showing separate fields if only one is present
      if (gpsDateEntry) {
        results.push({
          label: "GPSDateStamp (GPS IFD)",
          name: "GPSDateStamp",
          ifd: "GPS",
          tag: TAGS.GPSDateStamp,
          count: gpsDateEntry.count,
          valueOffset: gpsDateEntry.valueOffset,
          value: gpsDateEntry.value,
          type: "date",
        });
      }

      if (gpsTimeEntry) {
        results.push({
          label: "GPSTimeStamp (GPS IFD)",
          name: "GPSTimeStamp",
          ifd: "GPS",
          tag: TAGS.GPSTimeStamp,
          count: gpsTimeEntry.count,
          valueOffset: gpsTimeEntry.valueOffset,
          value: gpsTimeEntry.value,
          type: "time",
        });
      }
    }
  }

  return results;
}
