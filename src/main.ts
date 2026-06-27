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

export type EXIFField = {
  label: string;
  name: string;
  ifd: string;
  tag: number;
  count: number;
  valueOffset: number;
  value: number | string | number[];
  type: "date" | "datetime" | "time" | "coordinate" | "number" | "text";
  // Optional fields for combined GPS datetime
  _gpsDateTag?: number;
  _gpsDateOffset?: number;
  _gpsDateCount?: number;
  _gpsRefOffset?: number;
  _gpsRefCount?: number;
  _gpsAltitudeRefOffset?: number;
  _timezoneOffset?: string;
  _subSeconds?: string;
};

type ImageDimensions = {
  width: number;
  height: number;
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
  timezoneOffset?: string;
  subSeconds?: string;
};

export type LoadedFile = {
  id: string;
  filename: string;
  originalFilename: string;
  workingBuffer: ArrayBuffer;
  dimensions: ImageDimensions;
  parsedFields: EXIFField[];
  xmpMetadata?: XMPMetadata | null;
  xmpRemoved?: boolean;
  previewUrl: string;
  previewRefreshId?: number;
  previewRenderToken?: number;
  gpsMap?: L.Map | null;
  gpsMarker?: L.Marker | null;
  gpsTileLayer?: L.TileLayer | null;
  elements?: {
    container: HTMLDivElement;
    form: HTMLFormElement;
    timestampPanel: HTMLDetailsElement;
    timestampEnabledInput: HTMLInputElement;
    timestampAddressInputs: HTMLInputElement[];
    dimensionsPanel: HTMLDetailsElement;
    dimensionWidthInput: HTMLInputElement;
    dimensionHeightInput: HTMLInputElement;
    dimensionLockInput: HTMLInputElement;
    gpsEditor: HTMLDivElement;
    gpsMapChrome: HTMLDivElement;
    gpsSearchRow: HTMLDivElement;
    gpsSearchInput: HTMLInputElement;
    gpsSearchButton: HTMLButtonElement;
    gpsFullscreenButton: HTMLButtonElement;
    gpsSearchStatus: HTMLDivElement;
    gpsMapEl: HTMLDivElement;
    gpsMapOverlay: HTMLDivElement;
    gpsMapOverlayText: HTMLDivElement;
    gpsMapRefreshButton: HTMLButtonElement;
    gpsHint: HTMLDivElement;
    xmpPanel: HTMLDivElement;
    syncButton: HTMLButtonElement;
    clearXmpButton: HTMLButtonElement;
    filenameInput: HTMLInputElement;
    filenameLabel: HTMLSpanElement;
    editFilenameButton: HTMLButtonElement;
    previewButton: HTMLButtonElement;
    previewImg: HTMLImageElement;
    moveUpButton: HTMLButtonElement;
    moveDownButton: HTMLButtonElement;
  };
};

type XMPHistoryItem = {
  action?: string;
  changed?: string;
  softwareAgent?: string;
  when?: string;
};

type XMPMetadata = {
  toolkit?: string;
  modifyDate?: string;
  metadataDate?: string;
  creatorTool?: string;
  documentId?: string;
  instanceId?: string;
  originalDocumentId?: string;
  history: XMPHistoryItem[];
};

type GeocodeCacheEntry = {
  lat: number;
  lon: number;
  label: string;
  cachedAt: number;
};

// EXIF tag numbers we care about
const TAGS = {
  DateTime: 0x0132, // Image IFD
  ModifyDate: 0x0132, // alias for Image DateTime in many EXIF tools
  Software: 0x0131, // Software / Program Name tag
  ExifIFDPointer: 0x8769, // pointer from 0th to Exif
  GPSInfoIFDPointer: 0x8825, // pointer from 0th to GPS
  GPSLatitudeRef: 0x0001,
  GPSLatitude: 0x0002,
  GPSLongitudeRef: 0x0003,
  GPSLongitude: 0x0004,
  GPSAltitudeRef: 0x0005,
  GPSAltitude: 0x0006,
  ExifImageWidth: 0xa002,
  ExifImageHeight: 0xa003,
  DateTimeOriginal: 0x9003, // Exif
  CreateDate: 0x9004, // alias for DateTimeDigitized
  DateTimeDigitized: 0x9004, // Exif
  OffsetTime: 0x9010,
  OffsetTimeOriginal: 0x9011,
  OffsetTimeDigitized: 0x9012,
  SubSecTime: 0x9290,
  SubSecTimeOriginal: 0x9291,
  SubSecTimeDigitized: 0x9292,
  GPSDateStamp: 0x001d, // GPSDateStamp
  GPSTimeStamp: 0x0007, // GPSTimeStamp

  END_OF_IMAGE: 0xffd9,
  VALID_MARKER_PREFIX: 0xff00,
  APP0: 0xffe0,
  APP1_MARKER: 0xffe1,
  APP2_MARKER: 0xffe2,
  START_OF_SCAN: 0xffda,
  EXIF_HEADER: 0x45786966,
  LITTLE_ENDIAN: 0x4949,
  BIG_ENDIAN: 0x4d4d,
  JPEG_START: 0xffd8, // JPEG start
};

// State
let activeDateTimePicker: DateTimePickerState | null = null;
let loadedFiles: LoadedFile[] = [];
let internetReachable =
  typeof navigator === "undefined" ? true : navigator.onLine;

const GEOCODE_CACHE_KEY = "exif-editor:geocode-cache:v1";
const GEOCODE_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const GEOCODE_CACHE_MAX_ENTRIES = 100;

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
  "imageModalBackdrop",
) as HTMLDivElement;
const modalPreview = document.getElementById(
  "modalPreview",
) as HTMLImageElement;
const fileListEl = document.getElementById("fileList") as HTMLDivElement;
const status = document.getElementById("status") as HTMLDivElement;
const downloadAllButton = document.getElementById(
  "downloadAllButton",
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
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  const fullscreenFile = loadedFiles.find((file) =>
    file.elements?.gpsEditor.classList.contains("is-fullscreen"),
  );
  if (fullscreenFile) {
    setGpsFullscreen(fullscreenFile, false);
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
  true,
);
window.addEventListener("online", () => {
  void refreshInternetConnectivity({ announce: true });
});
window.addEventListener("offline", () => {
  internetReachable = false;
  loadedFiles.forEach((file) => updateGpsMapAvailability(file));
  status.textContent =
    "No internet connection detected. GPS maps are disabled.";
});

function getFileExtension(name: string) {
  const match = name.match(/(\.[^.]+)$/);
  return match ? match[1] : ".jpg";
}

function hasApplicableXmpData(metadata: XMPMetadata | null | undefined) {
  if (!metadata) {
    return false;
  }

  return Boolean(
    metadata.toolkit ||
    metadata.modifyDate ||
    metadata.metadataDate ||
    metadata.creatorTool ||
    metadata.documentId ||
    metadata.instanceId ||
    metadata.originalDocumentId ||
    metadata.history.length,
  );
}

function setMapInteractionsEnabled(map: L.Map, enabled: boolean) {
  const tapHandler = (
    map as L.Map & {
      tap?: { enable(): void; disable(): void };
    }
  ).tap;
  const handlers = [
    map.dragging,
    map.touchZoom,
    map.doubleClickZoom,
    map.scrollWheelZoom,
    map.boxZoom,
    map.keyboard,
    tapHandler,
  ];

  handlers.forEach((handler) => {
    if (!handler) {
      return;
    }

    if (enabled) {
      handler.enable();
    } else {
      handler.disable();
    }
  });
}

async function detectInternetConnectivity() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return false;
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 4000);

  try {
    await fetch(`https://tile.openstreetmap.org/0/0/0.png?ts=${Date.now()}`, {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
    });
    return true;
  } catch (error) {
    console.error("Connectivity check failed", error);
    return false;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function updateGpsMapAvailability(file: LoadedFile) {
  const { elements } = file;
  if (!elements) {
    return;
  }

  const offline = !internetReachable;
  elements.gpsMapOverlay.hidden = !offline;
  elements.gpsMapRefreshButton.disabled = false;
  elements.gpsSearchInput.disabled = offline;
  elements.gpsSearchButton.disabled = offline;

  if (offline) {
    elements.gpsMapOverlayText.textContent =
      "Map is unavailable while offline. Reconnect, then refresh the map.";
    elements.gpsSearchStatus.textContent = elements.gpsSearchStatus.textContent
      ? elements.gpsSearchStatus.textContent
      : "Address lookup requires an internet connection.";
    if (file.gpsMap) {
      setMapInteractionsEnabled(file.gpsMap, false);
    }
    return;
  }

  elements.gpsSearchStatus.textContent = "";
  if (file.gpsMap) {
    setMapInteractionsEnabled(file.gpsMap, true);
    file.gpsMap.invalidateSize();
    file.gpsTileLayer?.redraw();
  }
}

function setGpsFullscreen(file: LoadedFile, expanded: boolean) {
  const { elements } = file;
  if (!elements) {
    return;
  }

  elements.gpsEditor.classList.toggle("is-fullscreen", expanded);
  elements.gpsFullscreenButton.setAttribute(
    "aria-label",
    expanded ? "Exit fullscreen map" : "Open fullscreen map",
  );
  elements.gpsFullscreenButton.setAttribute(
    "aria-pressed",
    expanded ? "true" : "false",
  );
  elements.gpsFullscreenButton.textContent = expanded
    ? "Exit fullscreen"
    : "Fullscreen";
  document.body.classList.toggle("map-fullscreen-open", expanded);

  if (!expanded) {
    elements.gpsSearchInput.blur();
  }

  window.setTimeout(() => {
    file.gpsMap?.invalidateSize();
  }, 0);
}

async function refreshInternetConnectivity(options?: { announce?: boolean }) {
  const reachable = await detectInternetConnectivity();
  const previous = internetReachable;
  internetReachable = reachable;

  loadedFiles.forEach((file) => updateGpsMapAvailability(file));

  if (options?.announce && previous !== reachable) {
    status.textContent = reachable
      ? "Internet connection restored. GPS maps are available again."
      : "No internet connection detected. GPS maps are disabled.";
  }

  return reachable;
}

function getGpsCoordinateControls(file: LoadedFile) {
  if (!file.elements) {
    return null;
  }

  const latitudeFieldIndex = file.parsedFields.findIndex(
    (field) => field.name === "GPSLatitude",
  );
  const longitudeFieldIndex = file.parsedFields.findIndex(
    (field) => field.name === "GPSLongitude",
  );

  if (latitudeFieldIndex === -1 || longitudeFieldIndex === -1) {
    return null;
  }

  const latitudeInput = file.elements.form.querySelector(
    `[data-idx="${latitudeFieldIndex}"]`,
  ) as HTMLInputElement | null;
  const longitudeInput = file.elements.form.querySelector(
    `[data-idx="${longitudeFieldIndex}"]`,
  ) as HTMLInputElement | null;

  if (!latitudeInput || !longitudeInput) {
    return null;
  }

  return { latitudeInput, longitudeInput };
}

function ensureGpsMap(file: LoadedFile, lat: number, lon: number) {
  const { elements } = file;
  if (!elements || !internetReachable) {
    return;
  }

  if (!file.gpsMap) {
    file.gpsMap = L.map(elements.gpsMapEl).setView([lat, lon], 13);
    file.gpsTileLayer = L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution: "&copy; OpenStreetMap contributors",
      },
    ).addTo(file.gpsMap);
    file.gpsMarker = L.marker([lat, lon], { draggable: true }).addTo(
      file.gpsMap,
    );
    file.gpsMarker.on("dragend", () => {
      const markerLatLng = file.gpsMarker?.getLatLng();
      const controls = getGpsCoordinateControls(file);
      if (!markerLatLng || !controls) {
        return;
      }
      controls.latitudeInput.value = markerLatLng.lat.toFixed(6);
      controls.longitudeInput.value = markerLatLng.lng.toFixed(6);
    });
  } else {
    file.gpsMap.invalidateSize();
    file.gpsMap.setView([lat, lon]);
    file.gpsMarker?.setLatLng([lat, lon]);
    file.gpsTileLayer?.redraw();
  }

  setMapInteractionsEnabled(file.gpsMap, internetReachable);
}

function normalizeGeocodeQuery(address: string) {
  return address.trim().replace(/\s+/g, " ").toLowerCase();
}

function readGeocodeCache() {
  if (typeof localStorage === "undefined") {
    return {} as Record<string, GeocodeCacheEntry>;
  }

  try {
    const raw = localStorage.getItem(GEOCODE_CACHE_KEY);
    if (!raw) {
      return {} as Record<string, GeocodeCacheEntry>;
    }

    return JSON.parse(raw) as Record<string, GeocodeCacheEntry>;
  } catch (error) {
    console.error("Failed to read geocode cache", error);
    return {} as Record<string, GeocodeCacheEntry>;
  }
}

function writeGeocodeCache(cache: Record<string, GeocodeCacheEntry>) {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    const entries = Object.entries(cache)
      .sort(([, a], [, b]) => b.cachedAt - a.cachedAt)
      .slice(0, GEOCODE_CACHE_MAX_ENTRIES);
    localStorage.setItem(
      GEOCODE_CACHE_KEY,
      JSON.stringify(Object.fromEntries(entries)),
    );
  } catch (error) {
    console.error("Failed to write geocode cache", error);
  }
}

function getCachedGeocode(address: string) {
  const normalized = normalizeGeocodeQuery(address);
  const cache = readGeocodeCache();
  const cached = cache[normalized];

  if (!cached) {
    return null;
  }

  if (Date.now() - cached.cachedAt > GEOCODE_CACHE_TTL_MS) {
    delete cache[normalized];
    writeGeocodeCache(cache);
    return null;
  }

  return cached;
}

function setCachedGeocode(
  address: string,
  value: Omit<GeocodeCacheEntry, "cachedAt">,
) {
  const normalized = normalizeGeocodeQuery(address);
  const cache = readGeocodeCache();
  cache[normalized] = {
    ...value,
    cachedAt: Date.now(),
  };
  writeGeocodeCache(cache);
}

async function geocodeAddress(address: string) {
  const cached = getCachedGeocode(address);
  if (cached) {
    return cached;
  }

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(
      address,
    )}`,
    {
      headers: {
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Geocoding failed with status ${response.status}`);
  }

  const results = (await response.json()) as Array<{
    lat: string;
    lon: string;
    display_name?: string;
  }>;

  if (!results.length) {
    return null;
  }

  const result = {
    lat: Number(results[0].lat),
    lon: Number(results[0].lon),
    label: results[0].display_name ?? address,
  };

  setCachedGeocode(address, result);
  return result;
}

async function handleGpsAddressSearch(file: LoadedFile) {
  const { elements } = file;
  const controls = getGpsCoordinateControls(file);
  if (!elements || !controls) {
    return;
  }

  const address = elements.gpsSearchInput.value.trim();
  if (!address) {
    elements.gpsSearchStatus.textContent =
      "Enter an address to position the map.";
    return;
  }

  elements.gpsSearchStatus.textContent = "Checking connection...";
  const reachable = await refreshInternetConnectivity();
  if (!reachable) {
    elements.gpsSearchStatus.textContent =
      "Address lookup is unavailable while offline.";
    return;
  }

  elements.gpsSearchButton.disabled = true;
  elements.gpsSearchStatus.textContent = "Searching address...";

  try {
    const result = await geocodeAddress(address);
    if (!result || Number.isNaN(result.lat) || Number.isNaN(result.lon)) {
      elements.gpsSearchStatus.textContent = "No matching address found.";
      return;
    }

    controls.latitudeInput.value = result.lat.toFixed(6);
    controls.longitudeInput.value = result.lon.toFixed(6);
    ensureGpsMap(file, result.lat, result.lon);
    elements.gpsSearchStatus.textContent = `Mapped: ${result.label}`;
  } catch (error) {
    console.error("Address lookup failed", error);
    elements.gpsSearchStatus.textContent =
      "Address lookup failed. Check your connection and try again.";
  } finally {
    elements.gpsSearchButton.disabled = !internetReachable;
  }
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

function getXmpSegmentRanges(arrayBuffer: ArrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const xmpHeader = "http://ns.adobe.com/xap/1.0/\0";
  const decoder = new TextDecoder();
  const ranges: Array<{ start: number; end: number }> = [];

  let offset = 2;
  while (offset + 4 <= bytes.length) {
    const markerOffset = offset;
    const marker = (bytes[offset] << 8) | bytes[offset + 1];
    offset += 2;

    if (marker === TAGS.END_OF_IMAGE) {
      break;
    }

    if ((marker & TAGS.VALID_MARKER_PREFIX) !== TAGS.VALID_MARKER_PREFIX) {
      break;
    }

    if (offset + 2 > bytes.length) {
      break;
    }

    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    const payloadStart = offset + 2;
    const segmentEnd = markerOffset + 2 + segmentLength;

    if (segmentEnd > bytes.length) {
      break;
    }

    if (
      marker === TAGS.APP1_MARKER &&
      payloadStart + xmpHeader.length <= bytes.length &&
      decoder.decode(
        bytes.subarray(payloadStart, payloadStart + xmpHeader.length),
      ) === xmpHeader
    ) {
      ranges.push({ start: markerOffset, end: segmentEnd });
    }

    offset = segmentEnd;
  }

  return ranges;
}

function stripXmpSegments(arrayBuffer: ArrayBuffer) {
  const ranges = getXmpSegmentRanges(arrayBuffer);
  if (ranges.length === 0) {
    return arrayBuffer;
  }

  const bytes = new Uint8Array(arrayBuffer);
  const keptParts: Uint8Array[] = [];
  let cursor = 0;

  for (const range of ranges) {
    if (cursor < range.start) {
      keptParts.push(bytes.slice(cursor, range.start));
    }
    cursor = range.end;
  }

  if (cursor < bytes.length) {
    keptParts.push(bytes.slice(cursor));
  }

  const totalLength = keptParts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(totalLength);
  let writeOffset = 0;

  keptParts.forEach((part) => {
    result.set(part, writeOffset);
    writeOffset += part.length;
  });

  return result.buffer;
}

function getJpegSegmentEnd(bytes: Uint8Array, offset: number) {
  if (offset + 4 > bytes.length) {
    return null;
  }

  const marker = (bytes[offset] << 8) | bytes[offset + 1];
  if ((marker & TAGS.VALID_MARKER_PREFIX) !== TAGS.VALID_MARKER_PREFIX) {
    return null;
  }

  if (
    marker === TAGS.END_OF_IMAGE ||
    marker === TAGS.START_OF_SCAN ||
    (marker >= 0xffd0 && marker <= 0xffd7)
  ) {
    return offset + 2;
  }

  const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
  const end = offset + 2 + segmentLength;
  return end <= bytes.length ? end : null;
}

function getJpegMetadataSegments(arrayBuffer: ArrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const segments: Uint8Array[] = [];
  let offset = 2;

  while (offset + 4 <= bytes.length) {
    const marker = (bytes[offset] << 8) | bytes[offset + 1];
    if (marker === TAGS.START_OF_SCAN || marker === TAGS.END_OF_IMAGE) {
      break;
    }

    const segmentEnd = getJpegSegmentEnd(bytes, offset);
    if (segmentEnd === null) {
      break;
    }

    if (marker === TAGS.APP1_MARKER || marker === TAGS.APP2_MARKER) {
      segments.push(bytes.slice(offset, segmentEnd));
    }

    offset = segmentEnd;
  }

  return segments;
}

function getJpegMetadataInsertionOffset(arrayBuffer: ArrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return 2;
  }

  let offset = 2;
  while (offset + 4 <= bytes.length) {
    const marker = (bytes[offset] << 8) | bytes[offset + 1];
    if (marker !== TAGS.APP0) {
      break;
    }

    const segmentEnd = getJpegSegmentEnd(bytes, offset);
    if (segmentEnd === null) {
      break;
    }
    offset = segmentEnd;
  }

  return offset;
}

function insertJpegMetadataSegments(
  jpegBuffer: ArrayBuffer,
  segments: Uint8Array[],
) {
  if (!segments.length) {
    return jpegBuffer;
  }

  const bytes = new Uint8Array(jpegBuffer);
  const insertionOffset = getJpegMetadataInsertionOffset(jpegBuffer);
  const metadataLength = segments.reduce(
    (total, segment) => total + segment.length,
    0,
  );
  const result = new Uint8Array(bytes.length + metadataLength);
  let writeOffset = 0;

  result.set(bytes.slice(0, insertionOffset), writeOffset);
  writeOffset += insertionOffset;

  for (const segment of segments) {
    result.set(segment, writeOffset);
    writeOffset += segment.length;
  }

  result.set(bytes.slice(insertionOffset), writeOffset);
  return result.buffer;
}

function getRequestedDimensions(file: LoadedFile): ImageDimensions {
  const width = Number(file.elements?.dimensionWidthInput.value);
  const height = Number(file.elements?.dimensionHeightInput.value);

  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1
  ) {
    return file.dimensions;
  }

  return {
    width: Math.min(width, 65535),
    height: Math.min(height, 65535),
  };
}

function dimensionsChanged(a: ImageDimensions, b: ImageDimensions) {
  return a.width !== b.width || a.height !== b.height;
}

function getTimestampAddressLines(file: LoadedFile) {
  return (
    file.elements?.timestampAddressInputs
      .map((input) => input.value.trim())
      .filter((line) => line !== "")
      .slice(0, 4) ?? []
  );
}

function getTimestampDate(file: LoadedFile) {
  const dateFieldIndex = file.parsedFields.findIndex(
    (field) => field.type === "datetime" && field.name === "DateTimeOriginal",
  );
  if (dateFieldIndex === -1 || !file.elements) {
    return null;
  }

  const input = file.elements.form.querySelector(
    `[data-idx="${dateFieldIndex}"]`,
  ) as HTMLInputElement | null;
  const inputValue =
    input?.value ??
    (typeof file.parsedFields[dateFieldIndex].value === "string"
      ? toInputDateTime(file.parsedFields[dateFieldIndex].value)
      : "");
  const date = parseInputDateTimeValue(inputValue);

  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function isTimestampOverlayEnabled(file: LoadedFile) {
  return file.elements?.timestampEnabledInput.checked === true;
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality = 0.92) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Unable to encode resized JPEG"));
        }
      },
      "image/jpeg",
      quality,
    );
  });
}

async function decodeImageBitmap(blob: Blob) {
  if ("createImageBitmap" in window) {
    return window.createImageBitmap(blob);
  }

  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function resizeJpegBuffer(
  arrayBuffer: ArrayBuffer,
  dimensions: ImageDimensions,
) {
  const sourceBlob = new Blob([arrayBuffer], { type: "image/jpeg" });
  const image = await decodeImageBitmap(sourceBlob);
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas rendering is unavailable");
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  let source: CanvasImageSource = image;
  let sourceWidth = image.width;
  let sourceHeight = image.height;

  while (
    sourceWidth > dimensions.width * 2 ||
    sourceHeight > dimensions.height * 2
  ) {
    const intermediateCanvas = document.createElement("canvas");
    intermediateCanvas.width = Math.max(
      dimensions.width,
      Math.round(sourceWidth / 2),
    );
    intermediateCanvas.height = Math.max(
      dimensions.height,
      Math.round(sourceHeight / 2),
    );

    const intermediateContext = intermediateCanvas.getContext("2d");
    if (!intermediateContext) {
      throw new Error("Canvas rendering is unavailable");
    }

    intermediateContext.imageSmoothingEnabled = true;
    intermediateContext.imageSmoothingQuality = "high";
    intermediateContext.drawImage(
      source,
      0,
      0,
      intermediateCanvas.width,
      intermediateCanvas.height,
    );

    source = intermediateCanvas;
    sourceWidth = intermediateCanvas.width;
    sourceHeight = intermediateCanvas.height;
  }

  context.drawImage(source, 0, 0, dimensions.width, dimensions.height);

  if ("close" in image && typeof image.close === "function") {
    image.close();
  }

  const resizedBlob = await canvasToJpegBlob(canvas);
  return resizedBlob.arrayBuffer();
}

async function addTimestampOverlay(
  imageBuffer: ArrayBuffer | Uint8Array,
  dateObj: Date,
  addressLines: string[],
) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const blob = new Blob([new Uint8Array(imageBuffer)], {
      type: "image/jpeg",
    });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);

      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas rendering is unavailable"));
        return;
      }

      ctx.drawImage(img, 0, 0);

      const dateStr = dateObj.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const timeStr = dateObj.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      });
      const timestampLine = `${dateStr} at ${timeStr}`;
      const validAddressLines = addressLines.filter(
        (line) => line && line.trim() !== "",
      );
      const linesToDraw = [timestampLine, ...validAddressLines.slice(0, 4)];

      // 1. Find the shortest edge to ensure uniformity across Portrait/Landscape/Square
      const shortEdge = Math.min(canvas.width, canvas.height);

      // 2. Calculate dimensions using exact percentages from the original reference
      const fontSize = shortEdge * 0.0562; // ~5.62% of image scale
      const lineHeight = shortEdge * 0.0618; // ~6.18% spacing between lines
      const marginX = shortEdge * 0.0565; // ~5.65% left padding
      const marginBottom = shortEdge * 0.0565; // ~5.65% bottom padding

      // Scale the shadow proportionally (min 1px so it doesn't disappear on tiny images)
      const shadowOffset = Math.max(1, shortEdge * 0.0007);

      // 3. Configure Font and Text properties
      // Use exactly the calculated font size
      ctx.font = `${fontSize}px "-apple-system", "BlinkMacSystemFont", "SF Pro", "San Francisco", "Roboto", "Arial", sans-serif`;
      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom"; // Anchors to the bottom of the text

      // 4. Apply the Drop Shadow
      ctx.shadowColor = "rgba(0, 0, 0, 1)";
      ctx.shadowOffsetX = shadowOffset;
      ctx.shadowOffsetY = shadowOffset;
      ctx.shadowBlur = Math.max(1, shadowOffset * 0.5); // Very slight blur to soften the sub-pixels

      // 5. Draw the text lines from bottom to top
      let currentY = canvas.height - marginBottom;

      for (let i = linesToDraw.length - 1; i >= 0; i--) {
        ctx.fillText(linesToDraw[i], marginX, currentY);
        currentY -= lineHeight;
      }

      // const referenceWidth = 3024;
      // const scale = canvas.width / referenceWidth;

      // const fontSize = Math.max(1, Math.round(175 * scale));
      // const lineHeight = Math.max(1, Math.round(188 * scale));
      // const marginX = Math.max(1, Math.round(170 * scale));
      // const marginBottom = Math.max(1, Math.round(170 * scale));

      // ctx.font = `${fontSize}px "-apple-system", "BlinkMacSystemFont", "SF Pro", "San Francisco", "Roboto", "Arial", sans-serif`;
      // ctx.fillStyle = "#FFFFFF";
      // ctx.textAlign = "left";
      // ctx.textBaseline = "bottom";
      // ctx.shadowColor = "rgba(0, 0, 0, 1)";
      // ctx.shadowOffsetX = 2 * scale;
      // ctx.shadowOffsetY = 2 * scale;
      // ctx.shadowBlur = 1 * scale;

      // let currentY = canvas.height - marginBottom;
      // for (let i = linesToDraw.length - 1; i >= 0; i--) {
      //   ctx.fillText(linesToDraw[i], marginX, currentY);
      //   currentY -= lineHeight;
      // }

      canvas.toBlob(
        (outBlob) => {
          if (!outBlob) {
            reject(new Error("Canvas to Blob conversion failed"));
            return;
          }

          outBlob.arrayBuffer().then(resolve).catch(reject);
        },
        "image/jpeg",
        0.95,
      );
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image from buffer: " + err));
    };

    img.src = url;
  });
}

function parseJpegDimensions(arrayBuffer: ArrayBuffer): ImageDimensions | null {
  const view = new DataView(arrayBuffer);
  if (view.byteLength < 4 || view.getUint16(0, false) !== TAGS.JPEG_START) {
    return null;
  }

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset, false);
    offset += 2;

    if (marker === TAGS.START_OF_SCAN || marker === TAGS.END_OF_IMAGE) {
      break;
    }

    if ((marker & TAGS.VALID_MARKER_PREFIX) !== TAGS.VALID_MARKER_PREFIX) {
      break;
    }

    const segmentLength = view.getUint16(offset, false);
    const isStartOfFrame =
      (marker >= 0xffc0 && marker <= 0xffc3) ||
      (marker >= 0xffc5 && marker <= 0xffc7) ||
      (marker >= 0xffc9 && marker <= 0xffcb) ||
      (marker >= 0xffcd && marker <= 0xffcf);

    if (isStartOfFrame && offset + 7 <= view.byteLength) {
      return {
        height: view.getUint16(offset + 3, false),
        width: view.getUint16(offset + 5, false),
      };
    }

    offset += segmentLength;
  }

  return null;
}

function updateExifPixelDimensions(
  arrayBuffer: ArrayBuffer,
  dimensions: ImageDimensions,
) {
  const view = new DataView(arrayBuffer);
  if (view.byteLength < 4 || view.getUint16(0, false) !== TAGS.JPEG_START) {
    return;
  }

  let offset = 2;
  let tiffStartOffset = -1;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset, false);
    offset += 2;

    if (marker === TAGS.START_OF_SCAN || marker === TAGS.END_OF_IMAGE) {
      break;
    }

    if ((marker & TAGS.VALID_MARKER_PREFIX) !== TAGS.VALID_MARKER_PREFIX) {
      break;
    }

    const segmentLength = view.getUint16(offset, false);
    if (marker === TAGS.APP1_MARKER) {
      const potential = offset + 2;
      if (
        potential + 6 <= view.byteLength &&
        view.getUint32(potential, false) === TAGS.EXIF_HEADER &&
        view.getUint16(potential + 4, false) === 0
      ) {
        tiffStartOffset = potential + 6;
        break;
      }
    }

    offset += segmentLength;
  }

  if (tiffStartOffset === -1 || tiffStartOffset + 8 > view.byteLength) {
    return;
  }

  const byteOrder = view.getUint16(tiffStartOffset, false);
  const littleEndian = byteOrder === TAGS.LITTLE_ENDIAN;
  if (!littleEndian && byteOrder !== TAGS.BIG_ENDIAN) {
    return;
  }

  if (view.getUint16(tiffStartOffset + 2, littleEndian) !== 42) {
    return;
  }

  const firstIFDOffset =
    tiffStartOffset + view.getUint32(tiffStartOffset + 4, littleEndian);

  function getLinkedIFDOffset(ifdOffset: number, pointerTag: number) {
    if (ifdOffset + 2 > view.byteLength) {
      return null;
    }

    const count = view.getUint16(ifdOffset, littleEndian);
    let entryOffset = ifdOffset + 2;
    for (let index = 0; index < count; index++) {
      if (entryOffset + 12 > view.byteLength) {
        return null;
      }

      if (view.getUint16(entryOffset, littleEndian) === pointerTag) {
        return tiffStartOffset + view.getUint32(entryOffset + 8, littleEndian);
      }

      entryOffset += 12;
    }

    return null;
  }

  function updateDimensionTag(ifdOffset: number, tag: number, value: number) {
    if (ifdOffset + 2 > view.byteLength) {
      return;
    }

    const count = view.getUint16(ifdOffset, littleEndian);
    let entryOffset = ifdOffset + 2;
    for (let index = 0; index < count; index++) {
      if (entryOffset + 12 > view.byteLength) {
        return;
      }

      if (view.getUint16(entryOffset, littleEndian) === tag) {
        const type = view.getUint16(entryOffset + 2, littleEndian);
        const componentCount = view.getUint32(entryOffset + 4, littleEndian);
        if (componentCount !== 1) {
          return;
        }

        if (type === 3 && value <= 65535) {
          view.setUint16(entryOffset + 8, value, littleEndian);
        } else if (type === 4) {
          view.setUint32(entryOffset + 8, value, littleEndian);
        }
        return;
      }

      entryOffset += 12;
    }
  }

  const exifIFDOffset = getLinkedIFDOffset(firstIFDOffset, TAGS.ExifIFDPointer);
  if (!exifIFDOffset) {
    return;
  }

  updateDimensionTag(exifIFDOffset, TAGS.ExifImageWidth, dimensions.width);
  updateDimensionTag(exifIFDOffset, TAGS.ExifImageHeight, dimensions.height);
}

async function getEditedBlob(file: LoadedFile) {
  applyFormToWorkingBuffer(file);
  const requestedDimensions = getRequestedDimensions(file);
  updateExifPixelDimensions(file.workingBuffer, requestedDimensions);

  const metadataSourceBuffer = file.xmpRemoved
    ? stripXmpSegments(file.workingBuffer)
    : file.workingBuffer;
  let outputBuffer = metadataSourceBuffer;
  const metadataSegments = getJpegMetadataSegments(metadataSourceBuffer);

  if (dimensionsChanged(file.dimensions, requestedDimensions)) {
    const resizedBuffer = await resizeJpegBuffer(
      metadataSourceBuffer,
      requestedDimensions,
    );
    outputBuffer = insertJpegMetadataSegments(resizedBuffer, metadataSegments);
  }

  const timestampDate = getTimestampDate(file);
  if (isTimestampOverlayEnabled(file) && timestampDate) {
    const overlayBuffer = await addTimestampOverlay(
      outputBuffer,
      timestampDate,
      getTimestampAddressLines(file),
    );
    outputBuffer = insertJpegMetadataSegments(overlayBuffer, metadataSegments);
  }

  return new Blob([outputBuffer], { type: "image/jpeg" });
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

function schedulePreviewRefresh(file: LoadedFile) {
  if (!file.elements) {
    return;
  }

  if (file.previewRefreshId !== undefined) {
    window.clearTimeout(file.previewRefreshId);
  }

  file.previewRefreshId = window.setTimeout(() => {
    file.previewRefreshId = undefined;
    void refreshFilePreview(file);
  }, 250);
}

async function refreshFilePreview(file: LoadedFile) {
  if (!file.elements) {
    return;
  }

  const token = (file.previewRenderToken ?? 0) + 1;
  file.previewRenderToken = token;

  try {
    const blob = await getEditedBlob(file);
    if (file.previewRenderToken !== token || !file.elements) {
      return;
    }

    const nextUrl = URL.createObjectURL(blob);
    const previousUrl = file.previewUrl;
    file.previewUrl = nextUrl;
    file.elements.previewImg.src = nextUrl;
    if (!imageModal.hidden && modalPreview.src === previousUrl) {
      modalPreview.src = nextUrl;
    }
    URL.revokeObjectURL(previousUrl);
  } catch (error) {
    console.error("Failed to refresh image preview", error);
  }
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
  if (
    typeof navigator === "undefined" ||
    typeof navigator.share !== "function"
  ) {
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

  // Ensure all parts are of type BlobPart (Uint8Array is allowed)
  return new Blob(
    [
      ...(localParts as BlobPart[]),
      ...(centralParts as BlobPart[]),
      endRecord as BlobPart,
    ],
    {
      type: "application/zip",
    },
  );
}

async function downloadAllLoadedFiles() {
  if (!loadedFiles.length) {
    return;
  }

  const names = getUniqueFilenames(
    loadedFiles.map((file) => getDownloadFilename(file)),
  );
  const entries = await Promise.all(
    loadedFiles.map(async (file, index) => {
      const editedBlob = await getEditedBlob(file);
      const data = new Uint8Array(await editedBlob.arrayBuffer());
      return { name: names[index], data };
    }),
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
    const sharedFile = new File(
      [await getEditedBlob(file)],
      getDownloadFilename(file),
      {
        type: "image/jpeg",
      },
    );
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

function parseXmpMetadata(arrayBuffer: ArrayBuffer): XMPMetadata | null {
  const bytes = new Uint8Array(arrayBuffer);
  const xmpHeader = "http://ns.adobe.com/xap/1.0/\0";
  const decoder = new TextDecoder();
  const getAttrByLocalName = (element: Element, localName: string) => {
    const attrName = element
      .getAttributeNames()
      .find((name) => name.split(":").pop() === localName);
    return attrName ? (element.getAttribute(attrName) ?? undefined) : undefined;
  };

  let offset = 2;
  while (offset + 4 <= bytes.length) {
    const marker = (bytes[offset] << 8) | bytes[offset + 1];
    offset += 2;

    if (marker === TAGS.END_OF_IMAGE) {
      break;
    }

    if ((marker & TAGS.VALID_MARKER_PREFIX) !== TAGS.VALID_MARKER_PREFIX) {
      break;
    }

    if (offset + 2 > bytes.length) {
      break;
    }

    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    const payloadStart = offset + 2;
    const payloadEnd = offset + segmentLength;

    if (
      marker === TAGS.APP1_MARKER &&
      payloadEnd <= bytes.length &&
      decoder.decode(
        bytes.subarray(payloadStart, payloadStart + xmpHeader.length),
      ) === xmpHeader
    ) {
      const xml = decoder.decode(
        bytes.subarray(payloadStart + xmpHeader.length, payloadEnd),
      );
      const doc = new DOMParser().parseFromString(xml, "application/xml");

      if (doc.querySelector("parsererror")) {
        return null;
      }

      const allElements = Array.from(doc.getElementsByTagName("*"));
      const getFirstAttribute = (localName: string) =>
        allElements
          .map((element) => getAttrByLocalName(element, localName))
          .find((value) => !!value);

      const history: XMPHistoryItem[] = allElements
        .filter((element) => element.localName === "li")
        .map((item) => ({
          action: getAttrByLocalName(item, "action"),
          changed: getAttrByLocalName(item, "changed"),
          softwareAgent: getAttrByLocalName(item, "softwareAgent"),
          when: getAttrByLocalName(item, "when"),
        }))
        .filter(
          (entry) =>
            entry.action || entry.changed || entry.softwareAgent || entry.when,
        );

      const metadata: XMPMetadata = {
        toolkit: getFirstAttribute("xmptk"),
        modifyDate: getFirstAttribute("ModifyDate"),
        metadataDate: getFirstAttribute("MetadataDate"),
        creatorTool: getFirstAttribute("CreatorTool"),
        documentId: getFirstAttribute("DocumentID"),
        instanceId: getFirstAttribute("InstanceID"),
        originalDocumentId: getFirstAttribute("OriginalDocumentID"),
        history,
      };

      if (
        !metadata.toolkit &&
        !metadata.modifyDate &&
        !metadata.metadataDate &&
        !metadata.creatorTool &&
        !metadata.documentId &&
        !metadata.instanceId &&
        !metadata.originalDocumentId &&
        metadata.history.length === 0
      ) {
        return null;
      }

      return metadata;
    }

    offset += segmentLength;
  }

  return null;
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
    const dimensions = parseJpegDimensions(originalBuffer);
    let fileFields: EXIFField[] = [];
    const xmpMetadata = parseXmpMetadata(originalBuffer);

    try {
      fileFields = parseExifDates(workingBuffer);
    } catch (err) {
      if (
        err instanceof Error &&
        err.message === "No EXIF APP1 segment found"
      ) {
        console.info(`${file.name} has no EXIF APP1 segment.`);
      } else {
        console.error(err);
      }
    }

    addedFiles.push({
      id: crypto.randomUUID(),
      filename: file.name,
      originalFilename: file.name,
      workingBuffer,
      dimensions: dimensions ?? { width: 0, height: 0 },
      parsedFields: fileFields,
      xmpMetadata,
      xmpRemoved: false,
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
    `Open larger image preview for ${downloadName}`,
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
  if (removed.previewRefreshId !== undefined) {
    window.clearTimeout(removed.previewRefreshId);
  }
  removed.previewRenderToken = (removed.previewRenderToken ?? 0) + 1;
  URL.revokeObjectURL(removed.previewUrl);
  if (removed.elements?.gpsEditor.classList.contains("is-fullscreen")) {
    document.body.classList.remove("map-fullscreen-open");
  }
  removed.gpsMap?.remove();
  removed.gpsTileLayer = null;
  removed.elements?.container.remove();
  updateStatus();

  if (!loadedFiles.length) {
    closeImageModal();
    if (fileInput) {
      fileInput.value = "";
    }
  }
}

async function downloadLoadedFile(fileId: string) {
  const file = loadedFiles.find((item) => item.id === fileId);
  if (!file) {
    return;
  }

  if (isIOSDevice() && canShareFiles(file)) {
    void shareLoadedFile(file.id);
    return;
  }

  const filename = getDownloadFilename(file);
  triggerBlobDownload(await getEditedBlob(file), filename);
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
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
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
    Number(ss),
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

function parseExifOffsetMinutes(offset?: string) {
  if (!offset) {
    return null;
  }

  const match = offset.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const [, sign, hours, minutes] = match;
  const totalMinutes = Number(hours) * 60 + Number(minutes);
  return sign === "-" ? -totalMinutes : totalMinutes;
}

function parseExifSubSecondsMillis(subSeconds?: string) {
  if (!subSeconds) {
    return 0;
  }

  const digits = subSeconds.replace(/\D/g, "");
  if (!digits) {
    return 0;
  }

  return Number(`0.${digits}`) * 1000;
}

function getPreferredPhotoOffset(fields: EXIFField[]) {
  return (
    fields.find(
      (field) =>
        field.name === "DateTimeOriginal" &&
        typeof field._timezoneOffset === "string",
    )?._timezoneOffset ??
    fields.find(
      (field) =>
        field.name === "CreateDate" &&
        typeof field._timezoneOffset === "string",
    )?._timezoneOffset ??
    fields.find(
      (field) =>
        field.name === "ModifyDate" &&
        typeof field._timezoneOffset === "string",
    )?._timezoneOffset
  );
}

function shiftUtcDateToOffset(date: Date, offsetMinutes: number) {
  return new Date(date.getTime() + offsetMinutes * 60 * 1000);
}

function formatDateParts(date: Date, useUtc = false) {
  const year = useUtc ? date.getUTCFullYear() : date.getFullYear();
  const month = ((useUtc ? date.getUTCMonth() : date.getMonth()) + 1)
    .toString()
    .padStart(2, "0");
  const day = (useUtc ? date.getUTCDate() : date.getDate())
    .toString()
    .padStart(2, "0");
  return { year, month, day };
}

function formatTimeParts(date: Date, useUtc = false) {
  const hours = (useUtc ? date.getUTCHours() : date.getHours())
    .toString()
    .padStart(2, "0");
  const minutes = (useUtc ? date.getUTCMinutes() : date.getMinutes())
    .toString()
    .padStart(2, "0");
  const seconds = (useUtc ? date.getUTCSeconds() : date.getSeconds())
    .toString()
    .padStart(2, "0");
  return { hours, minutes, seconds };
}

function getGpsUtcDate(dateStr: string, timeArr: number[]) {
  const dateMatch = dateStr.match(/(\d{4}):(\d{2}):(\d{2})/);
  if (!dateMatch || !Array.isArray(timeArr) || timeArr.length !== 3) {
    return null;
  }

  const [, year, month, day] = dateMatch;
  const [h, m, s] = timeArr;

  return new Date(
    Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), h, m, s || 0),
  );
}

function getGpsLocalDateTimeFromUtc(
  dateStr: string,
  timeArr: number[],
  timezoneOffset?: string,
) {
  const utcDate = getGpsUtcDate(dateStr, timeArr);
  if (!utcDate) {
    return null;
  }

  const offsetMinutes = parseExifOffsetMinutes(timezoneOffset);
  if (offsetMinutes === null) {
    return {
      date: formatDateParts(utcDate),
      time: formatTimeParts(utcDate),
    };
  }

  const shifted = shiftUtcDateToOffset(utcDate, offsetMinutes);
  return {
    date: formatDateParts(shifted, true),
    time: formatTimeParts(shifted, true),
  };
}

function getGpsUtcPartsFromLocalInput(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  seconds: number,
  timezoneOffset?: string,
) {
  const offsetMinutes = parseExifOffsetMinutes(timezoneOffset);

  if (offsetMinutes === null) {
    const localDate = new Date(year, month - 1, day, hours, minutes, seconds);
    return {
      year: localDate.getUTCFullYear(),
      month: localDate.getUTCMonth() + 1,
      day: localDate.getUTCDate(),
      hours: localDate.getUTCHours(),
      minutes: localDate.getUTCMinutes(),
      seconds: localDate.getUTCSeconds(),
    };
  }

  const utcMillis =
    Date.UTC(year, month - 1, day, hours, minutes, seconds) -
    offsetMinutes * 60 * 1000;
  const utcDate = new Date(utcMillis);
  return {
    year: utcDate.getUTCFullYear(),
    month: utcDate.getUTCMonth() + 1,
    day: utcDate.getUTCDate(),
    hours: utcDate.getUTCHours(),
    minutes: utcDate.getUTCMinutes(),
    seconds: utcDate.getUTCSeconds(),
  };
}

function getEpochTimestampValue(
  date: Date,
  timezoneOffset?: string,
  subSeconds?: string,
) {
  const offsetMinutes = parseExifOffsetMinutes(timezoneOffset);
  const subSecondMillis = parseExifSubSecondsMillis(subSeconds);

  if (offsetMinutes === null) {
    return Math.floor((date.getTime() + subSecondMillis) / 1000).toString();
  }

  const utcMillis =
    Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
      Math.round(subSecondMillis),
    ) -
    offsetMinutes * 60 * 1000;

  return Math.floor(utcMillis / 1000).toString();
}

const COPY_ICON_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1a3 3 0 0 1 3 3v9h-2V4a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v1H4V4a3 3 0 0 1 3-3h9Zm-11 6h9a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V10a3 3 0 0 1 3-3Zm0 2a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V10a1 1 0 0 0-1-1H5Z"/></svg>';

const CHECK_ICON_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.55 18.2 4.3 12.95l1.4-1.4 3.85 3.85 8.75-8.75 1.4 1.4-10.15 10.15Z"/></svg>';

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
    state.selectedDate.getSeconds(),
  );
  state.viewYear = state.selectedDate.getFullYear();
  state.viewMonth = state.selectedDate.getMonth();
  renderDateTimePicker(state);
}

function setPickerTimePart(
  state: DateTimePickerState,
  part: "hours12" | "minutes" | "seconds" | "meridiem",
  value: number,
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
  segment: "month" | "day" | "year" | "hour" | "minute" | "second" | "meridiem",
  delta: number,
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
  state.hiddenInput.dispatchEvent(new Event("input", { bubbles: true }));
  state.epochInput.value = getEpochTimestampValue(
    state.selectedDate,
    state.timezoneOffset,
    state.subSeconds,
  );
  state.monthInput.value = (state.selectedDate.getMonth() + 1)
    .toString()
    .padStart(2, "0");
  state.dayInput.value = state.selectedDate
    .getDate()
    .toString()
    .padStart(2, "0");
  state.yearInput.value = state.selectedDate
    .getFullYear()
    .toString()
    .padStart(4, "0");
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
    `[data-date="${selectedValue}"]`,
  ) as HTMLButtonElement | null;

  selectedButton?.focus();
}

function renderDateTimePicker(state: DateTimePickerState) {
  syncDateTimePickerValue(state);
  state.monthLabel.textContent = `${MONTH_NAMES[state.viewMonth]} ${
    state.viewYear
  }`;
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
      }),
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
  state.popup.style.maxHeight = `${Math.max(
    220,
    viewportHeight - top - padding,
  )}px`;
}

function createDateTimePicker(
  idx: number,
  labelId: string,
  fieldData: EXIFField,
) {
  const initialValue = toInputDateTime(fieldData.value as string);
  const initialDate = parseInputDateTimeValue(initialValue) ?? new Date();
  const root = document.createElement("div");
  const hiddenInput = document.createElement("input");
  const controls = document.createElement("div");
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
  controls.className = "datetime-picker-controls";
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
  toggleButton.className = "datetime-picker-toggle datetime-picker-action";
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

  epochInput.type = "hidden";

  copyEpochButton.type = "button";
  copyEpochButton.className = "datetime-picker-copy datetime-picker-action";
  copyEpochButton.setAttribute("aria-label", "Copy epoch timestamp");
  copyEpochButton.title = "Copy epoch timestamp";
  copyEpochButton.innerHTML = COPY_ICON_SVG;

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
    timezoneOffset: fieldData._timezoneOffset,
    subSeconds: fieldData._subSeconds,
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
    segment: "month" | "day" | "year" | "hour" | "minute" | "second",
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
      if (
        event.key === "ArrowDown" ||
        (event.altKey && event.key === "ArrowDown")
      ) {
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

  visibleMeridiemInput.addEventListener("focus", () =>
    visibleMeridiemInput.select(),
  );
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

  copyEpochButton.addEventListener("click", async () => {
    try {
      await copyTextToClipboard(epochInput.value);
      copyEpochButton.dataset.state = "success";
      copyEpochButton.title = "Copied epoch timestamp";
      copyEpochButton.innerHTML = CHECK_ICON_SVG;
      window.setTimeout(() => {
        copyEpochButton.dataset.state = "";
        copyEpochButton.title = "Copy epoch timestamp";
        copyEpochButton.innerHTML = COPY_ICON_SVG;
      }, 1200);
    } catch (error) {
      console.error("Failed to copy epoch timestamp", error);
      copyEpochButton.dataset.state = "error";
      copyEpochButton.title = "Failed to copy epoch timestamp";
      window.setTimeout(() => {
        copyEpochButton.dataset.state = "";
        copyEpochButton.title = "Copy epoch timestamp";
        copyEpochButton.innerHTML = COPY_ICON_SVG;
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
  field.appendChild(toggleButton);
  controls.appendChild(epochInput);
  controls.appendChild(field);
  controls.appendChild(copyEpochButton);
  root.appendChild(controls);
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
    (field) => field.name === "GPSLatitude",
  );
  const longitudeField = file.parsedFields.find(
    (field) => field.name === "GPSLongitude",
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
    file.gpsTileLayer = null;
    return;
  }

  const latitudeInput = elements.form.querySelector(
    `[data-idx="${file.parsedFields.indexOf(latitudeField)}"]`,
  ) as HTMLInputElement | null;
  const longitudeInput = elements.form.querySelector(
    `[data-idx="${file.parsedFields.indexOf(longitudeField)}"]`,
  ) as HTMLInputElement | null;
  const altitudeField = file.parsedFields.find(
    (field) => field.name === "GPSAltitude",
  );
  const altitudeInput =
    altitudeField &&
    (elements.form.querySelector(
      `[data-idx="${file.parsedFields.indexOf(altitudeField)}"]`,
    ) as HTMLInputElement | null);

  if (!latitudeInput || !longitudeInput) {
    elements.gpsEditor.style.display = "none";
    file.gpsMap?.remove();
    file.gpsMap = null;
    file.gpsMarker = null;
    file.gpsTileLayer = null;
    return;
  }

  elements.gpsEditor.style.display = "flex";
  elements.gpsHint.textContent = internetReachable
    ? altitudeInput !== null
      ? "Search for an address, drag the marker, or edit the GPS fields directly. Altitude stays editable below."
      : "Search for an address, drag the marker, or edit the GPS fields directly."
    : "Reconnect to load the map. You can still edit the GPS fields directly.";

  const updateMarkerPosition = () => {
    const lat = Number(latitudeInput.value);
    const lon = Number(longitudeInput.value);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return;
    }

    ensureGpsMap(file, lat, lon);
  };

  latitudeInput.addEventListener("input", updateMarkerPosition);
  longitudeInput.addEventListener("input", updateMarkerPosition);

  updateGpsMapAvailability(file);
  updateMarkerPosition();
}

export function renderFields(file: LoadedFile, form: HTMLFormElement) {
  form.innerHTML = "";
  updateSyncButtonVisibility(file);

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
    Software: 9,
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
  const photoTimezoneOffset = getPreferredPhotoOffset(file.parsedFields);

  // Helper function to find corresponding date for a time field
  function findCorrespondingDate(timeField: EXIFField): string | null {
    if (timeField.ifd === "GPS" && timeField.name === "GPSTimeStamp") {
      // For GPS time, look for GPS date stamp
      const gpsDateField = file.parsedFields.find(
        (f) => f.name === "GPSDateStamp" && f.ifd === "GPS",
      );
      if (gpsDateField && typeof gpsDateField.value === "string") {
        return gpsDateField.value;
      }
    }

    // For other time fields, try to find a corresponding datetime field
    // Look for fields in the same IFD first, then fall back to any datetime field
    const sameIFDDateTime = file.parsedFields.find(
      (f) => f.type === "datetime" && f.ifd === timeField.ifd,
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

    if (f.type === "text") {
      const container = document.createElement("div");
      container.className = "text-field-container";

      const input = document.createElement("input");
      input.type = "text";
      input.dataset.fieldInput = "true";
      input.dataset.idx = idx.toString();
      input.id = `field-${idx}`;
      input.value = f.value as string;
      input.maxLength = f.count - 1;
      label.htmlFor = input.id;

      const select = document.createElement("select");
      select.className = "preset-select";
      select.setAttribute("aria-label", "Program name presets");

      const placeholderOpt = document.createElement("option");
      placeholderOpt.value = "";
      placeholderOpt.textContent = "Presets...";
      placeholderOpt.disabled = true;
      placeholderOpt.selected = true;
      select.appendChild(placeholderOpt);

      const presets = [
        { label: "Clear / Empty", value: "" },
        { label: "Adobe Photoshop", value: "Adobe Photoshop" },
        { label: "Adobe Lightroom", value: "Adobe Photoshop Lightroom" },
        { label: "GIMP", value: "GIMP 2.10" },
        { label: "Apple iOS", value: "iOS" },
        { label: "Google Android", value: "Android" },
      ];

      presets.forEach((preset) => {
        const opt = document.createElement("option");
        opt.value = preset.value;
        opt.textContent = preset.label;
        select.appendChild(opt);
      });

      select.addEventListener("change", () => {
        input.value = select.value;
        if (input.value.length > input.maxLength) {
          input.value = input.value.substring(0, input.maxLength);
        }
        input.dispatchEvent(new Event("input", { bubbles: true }));
        select.selectedIndex = 0;
      });

      container.appendChild(input);
      container.appendChild(select);
      control = container;
    } else if (f.type === "date") {
      const input = document.createElement("input");
      input.type = "date";
      input.dataset.fieldInput = "true";
      input.dataset.idx = idx.toString();
      input.id = `field-${idx}`;
      label.htmlFor = input.id;
      const inputDateValue = toInputDate(f.value as string);

      let localDateValue = "";

      if (inputDateValue) {
        const [year, month, day] = inputDateValue.split("-").map(Number);
        if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
          if (f.ifd === "GPS" && f.name === "GPSDateStamp") {
            const gpsTimeField = file.parsedFields.find(
              (field) =>
                field.ifd === "GPS" &&
                field.name === "GPSTimeStamp" &&
                Array.isArray(field.value),
            );
            const localGpsDateTime =
              gpsTimeField &&
              getGpsLocalDateTimeFromUtc(
                f.value as string,
                gpsTimeField.value as number[],
                photoTimezoneOffset,
              );
            if (localGpsDateTime) {
              localDateValue = `${localGpsDateTime.date.year}-${localGpsDateTime.date.month}-${localGpsDateTime.date.day}`;
            }
          }

          if (!localDateValue) {
            const utcDate = new Date(Date.UTC(year, month - 1, day));
            const localYear = utcDate.getFullYear();
            const localMonth = (utcDate.getMonth() + 1)
              .toString()
              .padStart(2, "0");
            const localDay = utcDate.getDate().toString().padStart(2, "0");
            localDateValue = `${localYear}-${localMonth}-${localDay}`;
          }
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
        const [h, m, s] = utcTime.split(":").map(Number);
        const correspondingDate = findCorrespondingDate(f);

        if (correspondingDate) {
          if (f.ifd === "GPS" && f.name === "GPSTimeStamp") {
            const localGpsDateTime = getGpsLocalDateTimeFromUtc(
              correspondingDate,
              [h, m, s || 0],
              photoTimezoneOffset,
            );
            if (localGpsDateTime) {
              localTime = `${localGpsDateTime.time.hours}:${localGpsDateTime.time.minutes}:${localGpsDateTime.time.seconds}`;
            }
          }

          if (!localTime) {
            const dateMatch = correspondingDate.match(
              /(\d{4}):(\d{2}):(\d{2})/,
            );
            if (dateMatch) {
              const [_, year, month, day] = dateMatch;
              const utcDate = new Date(
                Date.UTC(
                  parseInt(year),
                  parseInt(month) - 1,
                  parseInt(day),
                  h,
                  m,
                  s || 0,
                ),
              );
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
          }
        } else {
          const now = new Date();
          const utcDate = new Date(
            Date.UTC(
              now.getFullYear(),
              now.getMonth(),
              now.getDate(),
              h,
              m,
              s || 0,
            ),
          );
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
      control = createDateTimePicker(idx, labelId, f);
    }

    row.appendChild(label);
    row.appendChild(control);
    form.appendChild(row);
  });

  setupGpsEditor(file);
}

function getSyncSourceField(file: LoadedFile) {
  return (
    file.parsedFields.find(
      (field) => field.type === "datetime" && field.name === "DateTimeOriginal",
    ) ??
    file.parsedFields.find(
      (field) => field.type === "datetime" && field.name === "CreateDate",
    ) ??
    file.parsedFields.find(
      (field) => field.type === "datetime" && field.name === "ModifyDate",
    ) ??
    null
  );
}

function getPrimaryExifDateTimeFields(file: LoadedFile) {
  const primaryFieldNames = new Set([
    "ModifyDate",
    "DateTimeOriginal",
    "CreateDate",
  ]);
  return file.parsedFields.filter(
    (field) => field.type === "datetime" && primaryFieldNames.has(field.name),
  );
}

function getComparableExifEpoch(field: EXIFField) {
  if (typeof field.value !== "string") {
    return null;
  }

  const date = parseInputDateTimeValue(toInputDateTime(field.value));
  if (!date) {
    return null;
  }

  return getEpochTimestampValue(date, field._timezoneOffset, field._subSeconds);
}

function hasPrimaryExifDateTimeMismatch(file: LoadedFile) {
  const comparableEpochs = getPrimaryExifDateTimeFields(file)
    .map((field) => getComparableExifEpoch(field))
    .filter((epoch): epoch is string => epoch !== null);

  return comparableEpochs.length > 1 && new Set(comparableEpochs).size > 1;
}

function updateSyncButtonVisibility(file: LoadedFile) {
  const syncButton = file.elements?.syncButton;
  if (!syncButton) {
    return;
  }

  syncButton.hidden = !hasPrimaryExifDateTimeMismatch(file);
}

function syncDateTimeFieldsToOriginal(file: LoadedFile) {
  if (!file.elements) {
    return;
  }

  const sourceField = getSyncSourceField(file);
  if (!sourceField || typeof sourceField.value !== "string") {
    return;
  }

  const sourceValue = toInputDateTime(sourceField.value);
  if (!sourceValue) {
    return;
  }

  file.parsedFields.forEach((field, idx) => {
    if (
      field.type !== "datetime" ||
      !["ModifyDate", "DateTimeOriginal", "CreateDate"].includes(field.name)
    ) {
      return;
    }

    const input = file.elements?.form.querySelector(
      `[data-idx="${idx}"]`,
    ) as HTMLInputElement | null;

    if (!input) {
      return;
    }

    input.value = sourceValue;
    field.value = fromInputDateTime(sourceValue);
  });

  applyFormToWorkingBuffer(file);
  renderFields(file, file.elements.form);
  updateSyncButtonVisibility(file);
  status.textContent = `Synced EXIF timestamps for ${getDownloadFilename(
    file,
  )}.`;
}

function renderXmpPanel(file: LoadedFile, panel: HTMLDivElement) {
  panel.innerHTML = "";

  if (!hasApplicableXmpData(file.xmpMetadata)) {
    panel.hidden = true;
    return;
  }
  const metadata = file.xmpMetadata!;

  const latestHistory = metadata.history.at(-1);
  const rows: Array<[string, string | undefined]> = [
    ["Editor", latestHistory?.softwareAgent ?? metadata.creatorTool],
    ["XMP ModifyDate", metadata.modifyDate],
    ["XMP MetadataDate", metadata.metadataDate],
    ["Toolkit", metadata.toolkit],
    ["Document ID", metadata.documentId],
    ["Instance ID", metadata.instanceId],
  ];

  const headingRow = document.createElement("div");
  headingRow.className = "metadata-heading-row";
  const heading = document.createElement("div");
  heading.className = "metadata-heading";
  heading.textContent = "XMP Metadata";
  headingRow.appendChild(heading);

  const clearButton =
    file.elements?.clearXmpButton ?? document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "warning";
  clearButton.textContent = "Clear XMP";
  clearButton.hidden = !!file.xmpRemoved;
  headingRow.appendChild(clearButton);
  panel.appendChild(headingRow);

  rows.forEach(([label, value]) => {
    if (!value) {
      return;
    }

    const row = document.createElement("div");
    row.className = "metadata-row";
    const labelEl = document.createElement("div");
    labelEl.className = "metadata-label";
    labelEl.textContent = label;
    const valueEl = document.createElement("div");
    valueEl.className = "metadata-value";
    valueEl.textContent = value;
    row.appendChild(labelEl);
    row.appendChild(valueEl);
    panel.appendChild(row);
  });

  if (metadata.history.length) {
    const historyHeading = document.createElement("div");
    historyHeading.className = "metadata-subheading";
    historyHeading.textContent = "History";
    panel.appendChild(historyHeading);

    const historyList = document.createElement("div");
    historyList.className = "metadata-history";

    metadata.history.forEach((entry) => {
      const item = document.createElement("div");
      item.className = "metadata-history-item";
      item.textContent = [
        entry.action,
        entry.softwareAgent,
        entry.when,
        entry.changed,
      ]
        .filter(Boolean)
        .join(" • ");
      historyList.appendChild(item);
    });

    panel.appendChild(historyList);
  }

  panel.hidden = false;
}

function clearXmpMetadata(file: LoadedFile) {
  if (!file.elements || !file.xmpMetadata) {
    return;
  }

  file.xmpRemoved = true;
  file.xmpMetadata = null;
  renderXmpPanel(file, file.elements.xmpPanel);
  status.textContent = `Removed XMP metadata from ${getDownloadFilename(
    file,
  )} for export.`;
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
  const timestampPanel = document.createElement("details");
  const timestampSummary = document.createElement("summary");
  const timestampGrid = document.createElement("div");
  const timestampToggleRow = document.createElement("label");
  const timestampEnabledInput = document.createElement("input");
  const timestampAddressInputs = Array.from({ length: 4 }, () =>
    document.createElement("input"),
  );
  const dimensionsPanel = document.createElement("details");
  const dimensionsHeading = document.createElement("summary");
  const dimensionsGrid = document.createElement("div");
  const dimensionWidthRow = document.createElement("label");
  const dimensionWidthInput = document.createElement("input");
  const dimensionHeightRow = document.createElement("label");
  const dimensionHeightInput = document.createElement("input");
  const dimensionLockRow = document.createElement("label");
  const dimensionLockInput = document.createElement("input");
  const dimensionResetButton = document.createElement("button");
  const form = document.createElement("form");
  const gpsEditorEl = document.createElement("div");
  const gpsMapChrome = document.createElement("div");
  const gpsSearchRow = document.createElement("div");
  const gpsSearchInput = document.createElement("input");
  const gpsSearchButton = document.createElement("button");
  const gpsFullscreenButton = document.createElement("button");
  const gpsSearchStatus = document.createElement("div");
  const gpsMapElement = document.createElement("div");
  const gpsMapOverlay = document.createElement("div");
  const gpsMapOverlayText = document.createElement("div");
  const gpsMapRefreshButton = document.createElement("button");
  const gpsHintEl = document.createElement("div");
  const xmpPanel = document.createElement("div");
  const actions = document.createElement("div");
  const syncButton = document.createElement("button");
  const clearXmpButton = document.createElement("button");
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
  previewButton.setAttribute(
    "aria-label",
    `Open larger image preview for ${file.filename}`,
  );
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
  timestampPanel.className = "timestamp-panel";
  timestampSummary.className = "timestamp-summary";
  timestampSummary.textContent = "Photo timestamp label";
  timestampGrid.className = "timestamp-grid";
  timestampToggleRow.className = "timestamp-toggle";
  timestampEnabledInput.type = "checkbox";
  timestampEnabledInput.setAttribute("aria-label", "Add timestamp to photo");
  timestampAddressInputs.forEach((input, index) => {
    input.type = "text";
    input.className = "timestamp-address-input";
    input.placeholder = `Address line ${index + 1}`;
    input.disabled = true;
    input.setAttribute("aria-label", `Timestamp address line ${index + 1}`);
  });
  dimensionsPanel.className = "dimensions-panel";
  dimensionsHeading.className = "dimensions-summary";
  dimensionsHeading.textContent = `Image dimensions: ${file.dimensions.width} x ${file.dimensions.height}`;
  dimensionsGrid.className = "dimensions-grid";
  dimensionWidthRow.className = "dimension-field";
  dimensionWidthRow.textContent = "Width";
  dimensionWidthInput.type = "number";
  dimensionWidthInput.min = "1";
  dimensionWidthInput.max = "65535";
  dimensionWidthInput.step = "1";
  dimensionWidthInput.value = file.dimensions.width.toString();
  dimensionWidthInput.setAttribute("aria-label", "Image width in pixels");
  dimensionHeightRow.className = "dimension-field";
  dimensionHeightRow.textContent = "Height";
  dimensionHeightInput.type = "number";
  dimensionHeightInput.min = "1";
  dimensionHeightInput.max = "65535";
  dimensionHeightInput.step = "1";
  dimensionHeightInput.value = file.dimensions.height.toString();
  dimensionHeightInput.setAttribute("aria-label", "Image height in pixels");
  dimensionLockRow.className = "dimension-lock";
  dimensionLockInput.type = "checkbox";
  dimensionLockInput.checked = true;
  dimensionLockInput.setAttribute("aria-label", "Lock image aspect ratio");
  dimensionResetButton.type = "button";
  dimensionResetButton.className = "ghost";
  dimensionResetButton.textContent = "Reset";
  form.className = "file-fields";
  gpsEditorEl.className = "gps-editor";
  gpsEditorEl.style.display = "none";
  gpsMapChrome.className = "gps-map-chrome";
  gpsSearchRow.className = "gps-search-row";
  gpsSearchInput.type = "text";
  gpsSearchInput.className = "gps-search-input";
  gpsSearchInput.placeholder = "Enter an address or place";
  gpsSearchInput.setAttribute("aria-label", "Search address for GPS map");
  gpsSearchButton.type = "button";
  gpsSearchButton.className = "ghost";
  gpsSearchButton.textContent = "Find";
  gpsFullscreenButton.type = "button";
  gpsFullscreenButton.className = "ghost gps-fullscreen-button";
  gpsFullscreenButton.textContent = "Fullscreen";
  gpsFullscreenButton.setAttribute("aria-label", "Open fullscreen map");
  gpsFullscreenButton.setAttribute("aria-pressed", "false");
  gpsSearchStatus.className = "muted gps-search-status";
  gpsMapElement.className = "gps-map";
  gpsMapOverlay.className = "gps-map-overlay";
  gpsMapOverlay.hidden = true;
  gpsMapOverlayText.className = "gps-map-overlay-text";
  gpsMapRefreshButton.type = "button";
  gpsMapRefreshButton.className = "primary";
  gpsMapRefreshButton.textContent = "Refresh map";
  gpsHintEl.className = "muted";
  xmpPanel.className = "metadata-panel";
  xmpPanel.hidden = true;
  actions.className = "file-card-actions";
  syncButton.type = "button";
  syncButton.className = "warning";
  syncButton.textContent = "Sync timestamps";
  syncButton.hidden = !hasPrimaryExifDateTimeMismatch(file);
  clearXmpButton.type = "button";
  clearXmpButton.className = "warning";
  clearXmpButton.textContent = "Clear XMP";
  clearXmpButton.hidden = !hasApplicableXmpData(file.xmpMetadata);
  downloadButton.type = "button";
  downloadButton.className = "primary";
  downloadButton.textContent = "Download";
  clearButton.type = "button";
  clearButton.className = "ghost";
  clearButton.textContent = "Clear";

  previewButton.addEventListener("click", () =>
    openImageModal(file.previewUrl),
  );
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
  const updateTimestampAddressInputs = () => {
    const enabled = timestampEnabledInput.checked;
    timestampAddressInputs.forEach((input) => {
      input.disabled = !enabled;
    });
  };
  timestampEnabledInput.addEventListener("change", () => {
    updateTimestampAddressInputs();
    schedulePreviewRefresh(file);
  });
  timestampAddressInputs.forEach((input) => {
    input.addEventListener("input", () => schedulePreviewRefresh(file));
  });
  form.addEventListener("input", () => schedulePreviewRefresh(file));
  form.addEventListener("focusout", () => schedulePreviewRefresh(file));
  const updateDimensionsSummary = () => {
    const width = dimensionWidthInput.value || file.dimensions.width.toString();
    const height =
      dimensionHeightInput.value || file.dimensions.height.toString();
    dimensionsHeading.textContent = `Image dimensions: ${width} x ${height}`;
  };
  dimensionWidthInput.addEventListener("input", () => {
    if (!dimensionLockInput.checked || file.dimensions.width < 1) {
      updateDimensionsSummary();
      schedulePreviewRefresh(file);
      return;
    }

    const width = Number(dimensionWidthInput.value);
    if (!Number.isInteger(width) || width < 1) {
      updateDimensionsSummary();
      schedulePreviewRefresh(file);
      return;
    }

    dimensionHeightInput.value = Math.max(
      1,
      Math.round((width * file.dimensions.height) / file.dimensions.width),
    ).toString();
    updateDimensionsSummary();
    schedulePreviewRefresh(file);
  });
  dimensionHeightInput.addEventListener("input", () => {
    if (!dimensionLockInput.checked || file.dimensions.height < 1) {
      updateDimensionsSummary();
      schedulePreviewRefresh(file);
      return;
    }

    const height = Number(dimensionHeightInput.value);
    if (!Number.isInteger(height) || height < 1) {
      updateDimensionsSummary();
      schedulePreviewRefresh(file);
      return;
    }

    dimensionWidthInput.value = Math.max(
      1,
      Math.round((height * file.dimensions.width) / file.dimensions.height),
    ).toString();
    updateDimensionsSummary();
    schedulePreviewRefresh(file);
  });
  dimensionResetButton.addEventListener("click", () => {
    dimensionWidthInput.value = file.dimensions.width.toString();
    dimensionHeightInput.value = file.dimensions.height.toString();
    updateDimensionsSummary();
    schedulePreviewRefresh(file);
  });
  syncButton.addEventListener("click", () =>
    syncDateTimeFieldsToOriginal(file),
  );
  clearXmpButton.addEventListener("click", () => clearXmpMetadata(file));
  gpsSearchButton.addEventListener("click", () => {
    void handleGpsAddressSearch(file);
  });
  gpsFullscreenButton.addEventListener("click", () => {
    const expanded = !gpsEditorEl.classList.contains("is-fullscreen");
    setGpsFullscreen(file, expanded);
  });
  gpsSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleGpsAddressSearch(file);
    }
    if (
      event.key === "Escape" &&
      gpsEditorEl.classList.contains("is-fullscreen")
    ) {
      event.preventDefault();
      setGpsFullscreen(file, false);
    }
  });
  gpsMapRefreshButton.addEventListener("click", () => {
    gpsMapRefreshButton.disabled = true;
    gpsMapOverlayText.textContent = "Checking connection...";
    void refreshInternetConnectivity({ announce: true }).then((reachable) => {
      updateGpsMapAvailability(file);
      const controls = getGpsCoordinateControls(file);
      if (reachable && controls) {
        const lat = Number(controls.latitudeInput.value);
        const lon = Number(controls.longitudeInput.value);
        if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
          ensureGpsMap(file, lat, lon);
        }
      } else if (!reachable) {
        gpsMapOverlayText.textContent =
          "Map is unavailable while offline. Reconnect, then refresh the map.";
      }
      gpsMapRefreshButton.disabled = false;
    });
  });
  downloadButton.addEventListener("click", () => {
    void downloadLoadedFile(file.id);
  });
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
  timestampToggleRow.appendChild(timestampEnabledInput);
  timestampToggleRow.append("Add timestamp to photo");
  timestampGrid.appendChild(timestampToggleRow);
  timestampAddressInputs.forEach((input) => timestampGrid.appendChild(input));
  timestampPanel.appendChild(timestampSummary);
  timestampPanel.appendChild(timestampGrid);
  dimensionWidthRow.appendChild(dimensionWidthInput);
  dimensionHeightRow.appendChild(dimensionHeightInput);
  dimensionLockRow.appendChild(dimensionLockInput);
  dimensionLockRow.append("Lock ratio");
  dimensionsGrid.appendChild(dimensionWidthRow);
  dimensionsGrid.appendChild(dimensionHeightRow);
  dimensionsGrid.appendChild(dimensionLockRow);
  dimensionsGrid.appendChild(dimensionResetButton);
  dimensionsPanel.appendChild(dimensionsHeading);
  dimensionsPanel.appendChild(dimensionsGrid);
  file.elements = {
    container,
    form,
    timestampPanel,
    timestampEnabledInput,
    timestampAddressInputs,
    dimensionsPanel,
    dimensionWidthInput,
    dimensionHeightInput,
    dimensionLockInput,
    gpsEditor: gpsEditorEl,
    gpsMapChrome,
    gpsSearchRow,
    gpsSearchInput,
    gpsSearchButton,
    gpsFullscreenButton,
    gpsSearchStatus,
    gpsMapEl: gpsMapElement,
    gpsMapOverlay,
    gpsMapOverlayText,
    gpsMapRefreshButton,
    gpsHint: gpsHintEl,
    xmpPanel,
    syncButton,
    clearXmpButton,
    filenameInput,
    filenameLabel,
    editFilenameButton,
    previewButton,
    previewImg,
    moveUpButton,
    moveDownButton,
  };

  gpsSearchRow.appendChild(gpsSearchInput);
  gpsSearchRow.appendChild(gpsSearchButton);
  gpsMapChrome.appendChild(gpsSearchRow);
  gpsMapChrome.appendChild(gpsFullscreenButton);
  gpsMapOverlay.appendChild(gpsMapOverlayText);
  gpsMapOverlay.appendChild(gpsMapRefreshButton);
  gpsMapElement.appendChild(gpsMapChrome);
  gpsMapElement.appendChild(gpsMapOverlay);
  gpsEditorEl.appendChild(gpsMapElement);
  gpsEditorEl.appendChild(gpsSearchStatus);
  gpsEditorEl.appendChild(gpsHintEl);
  editorPanel.appendChild(form);
  editorPanel.appendChild(gpsEditorEl);
  editorPanel.appendChild(timestampPanel);
  editorPanel.appendChild(dimensionsPanel);
  renderXmpPanel(file, xmpPanel);
  editorPanel.appendChild(xmpPanel);
  actions.appendChild(syncButton);
  actions.appendChild(downloadButton);
  actions.appendChild(clearButton);
  meta.appendChild(previewColumn);
  meta.appendChild(editorPanel);
  container.appendChild(meta);
  container.appendChild(actions);
  fileListEl.appendChild(container);

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

export function applyFormToWorkingBuffer(file: LoadedFile) {
  if (!file.elements) {
    return;
  }
  const { form } = file.elements;

  const inputs = form.querySelectorAll(
    '[data-field-input="true"]',
  ) as NodeListOf<HTMLInputElement>;

  const parsedFields = file.parsedFields;
  const dv = new DataView(file.workingBuffer);
  const littleEndian = getExifLittleEndian(dv);
  const photoTimezoneOffset = getPreferredPhotoOffset(parsedFields);

  inputs.forEach((inp: HTMLInputElement) => {
    const idx = Number(inp.dataset.idx);

    const field = parsedFields[idx];

    let newVal: string | number[];

    if (field.type === "text") {
      newVal = inp.value;
    } else if (field.type === "date") {
      // Use the original fromInputDate function
      newVal = fromInputDate(inp.value);

      // For GPS date fields, convert local date to UTC
      if (
        field.ifd === "GPS" &&
        field.name === "GPSDateStamp" &&
        typeof newVal === "string"
      ) {
        const [y, m, d] = newVal.split(":");
        const gpsTimeField = parsedFields.find(
          (f) => f.name === "GPSTimeStamp" && f.ifd === "GPS",
        );
        const gpsTimeInput =
          gpsTimeField &&
          (form.querySelector(
            `[data-idx="${parsedFields.indexOf(gpsTimeField)}"]`,
          ) as HTMLInputElement | null);
        const [hours, minutes, seconds] = gpsTimeInput
          ? fromInputTime(gpsTimeInput.value)
          : [0, 0, 0];
        const utcParts = getGpsUtcPartsFromLocalInput(
          parseInt(y),
          parseInt(m),
          parseInt(d),
          hours ?? 0,
          minutes ?? 0,
          seconds ?? 0,
          photoTimezoneOffset,
        );
        const utcYear = utcParts.year;
        const utcMonth = utcParts.month.toString().padStart(2, "0");
        const utcDay = utcParts.day.toString().padStart(2, "0");
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
          (f) => f.name === "GPSDateStamp" && f.ifd === "GPS",
        );
        if (gpsDateField && typeof gpsDateField.value === "string") {
          const dateMatch = gpsDateField.value.match(/(\d{4}):(\d{2}):(\d{2})/);
          if (dateMatch) {
            const [_, year, month, day] = dateMatch;
            const [localHours, localMinutes, localSeconds] = newVal;
            const utcParts = getGpsUtcPartsFromLocalInput(
              parseInt(year),
              parseInt(month),
              parseInt(day),
              localHours,
              localMinutes,
              localSeconds,
              photoTimezoneOffset,
            );
            newVal = [utcParts.hours, utcParts.minutes, utcParts.seconds];
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
      field.value = decimal;
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
      field.value = value;
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
          /(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/,
        );
        if (match) {
          const [_, y, m, d, hh, mm, ss] = match;
          const utcParts = getGpsUtcPartsFromLocalInput(
            parseInt(y),
            parseInt(m),
            parseInt(d),
            parseInt(hh),
            parseInt(mm),
            parseInt(ss),
            photoTimezoneOffset,
          );
          const utcYear = utcParts.year;
          const utcMonth = utcParts.month.toString().padStart(2, "0");
          const utcDay = utcParts.day.toString().padStart(2, "0");
          const utcHours = utcParts.hours;
          const utcMinutes = utcParts.minutes;
          const utcSeconds = utcParts.seconds;

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

    if (newVal.length === 0 && field.type !== "text") {
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
      field.value = new TextDecoder().decode(encoded.subarray(0, len));
    } else if (Array.isArray(target)) {
      // This handles both GPSTimeStamp and the time component of GPSDateTime
      for (let i = 0; i < count; i++) {
        const abs = field.valueOffset + 8 * i;

        dv.setUint32(abs, target[i], littleEndian);
        dv.setUint32(abs + 4, 1, littleEndian);
      }
      field.value =
        field.type === "datetime" && field.name === "GPSDateTime"
          ? fromInputDateTime(inp.value)
          : target.slice(0, count);
    }
  });
}

// ---------- EXIF parsing (custom, minimal, only to find & edit ASCII date/time tags) ----------
export function parseExifDates(arrayBuffer: ArrayBuffer): EXIFField[] {
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

  if (fortyTwo.getUint16(0, littleEndian) !== 42) {
    throw new Error("Invalid TIFF header");
  }

  const firstIFDOffsetView = new DataView(view.buffer, tiffStartOffset + 4, 4);

  const firstIFDOffset =
    firstIFDOffsetView.getUint32(0, littleEndian) + tiffStartOffset;

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
            denominator !== 0 ? numerator / denominator : 0,
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
              : view.getUint32(itemOffset, littleEndian),
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

  function getAsciiValue(entries: Map<number, IDF>, tag: number) {
    const entry = entries.get(tag);
    return typeof entry?.value === "string" ? entry.value : undefined;
  }

  function pushDateTimeField(
    entries: Map<number, IDF>,
    fieldDef: {
      tag: number;
      name: string;
      label: string;
      ifd: string;
      offsetTag?: number;
      subSecTag?: number;
      companionEntries?: Map<number, IDF>;
    },
  ) {
    const entry = entries.get(fieldDef.tag);
    if (!entry) {
      return;
    }

    const companionEntries = fieldDef.companionEntries ?? entries;

    results.push({
      label: fieldDef.label,
      name: fieldDef.name,
      ifd: fieldDef.ifd,
      tag: fieldDef.tag,
      count: entry.count,
      valueOffset: entry.valueOffset,
      value: entry.value,
      type: "datetime",
      _timezoneOffset: fieldDef.offsetTag
        ? getAsciiValue(companionEntries, fieldDef.offsetTag)
        : undefined,
      _subSeconds: fieldDef.subSecTag
        ? getAsciiValue(companionEntries, fieldDef.subSecTag)
        : undefined,
    });
  }

  // read 0th IFD
  const ifd0 = readIFD(firstIFDOffset);

  const softwareEntry = ifd0.entries.get(TAGS.Software);
  if (softwareEntry) {
    results.push({
      label: "Program name",
      name: "Software",
      ifd: "0th",
      tag: TAGS.Software,
      count: softwareEntry.count,
      valueOffset: softwareEntry.valueOffset,
      value: softwareEntry.value,
      type: "text",
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
    pushDateTimeField(ifd0.entries, {
      tag: TAGS.ModifyDate,
      name: "ModifyDate",
      label: "ModifyDate (Image DateTime, 0th IFD)",
      ifd: "0th",
      offsetTag: TAGS.OffsetTime,
      subSecTag: TAGS.SubSecTime,
      companionEntries: exifIFD.entries,
    });
    pushDateTimeField(exifIFD.entries, {
      tag: TAGS.DateTimeOriginal,
      name: "DateTimeOriginal",
      label: "DateTimeOriginal (Exif IFD)",
      ifd: "Exif",
      offsetTag: TAGS.OffsetTimeOriginal,
      subSecTag: TAGS.SubSecTimeOriginal,
    });
    pushDateTimeField(exifIFD.entries, {
      tag: TAGS.CreateDate,
      name: "CreateDate",
      label: "CreateDate (DateTimeDigitized, Exif IFD)",
      ifd: "Exif",
      offsetTag: TAGS.OffsetTimeDigitized,
      subSecTag: TAGS.SubSecTimeDigitized,
    });
  } else {
    pushDateTimeField(ifd0.entries, {
      tag: TAGS.ModifyDate,
      name: "ModifyDate",
      label: "ModifyDate (Image DateTime, 0th IFD)",
      ifd: "0th",
      offsetTag: TAGS.OffsetTime,
      subSecTag: TAGS.SubSecTime,
    });
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
    const latitudeRef = decodeGpsRef(
      gpsLatitudeRef?.value as string | number | number[] | undefined,
    );
    const longitudeRef = decodeGpsRef(
      gpsLongitudeRef?.value as string | number | number[] | undefined,
    );

    if (latitudeRef && gpsLatitude && Array.isArray(gpsLatitude.value)) {
      const latitude = decimalFromDms(
        gpsLatitude.value as number[],
        latitudeRef,
      );
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

    if (longitudeRef && gpsLongitude && Array.isArray(gpsLongitude.value)) {
      const longitude = decimalFromDms(
        gpsLongitude.value as number[],
        longitudeRef,
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
      const gpsDisplayOffset = getPreferredPhotoOffset(results);

      const localGpsDateTime = getGpsLocalDateTimeFromUtc(
        dateStr,
        timeArr,
        gpsDisplayOffset,
      );
      if (localGpsDateTime) {
        const localDateTimeStr = `${localGpsDateTime.date.year}:${localGpsDateTime.date.month}:${localGpsDateTime.date.day} ${localGpsDateTime.time.hours}:${localGpsDateTime.time.minutes}:${localGpsDateTime.time.seconds}`;

        results.push({
          label: "GPS DateTime (GPS IFD)",
          name: "GPSDateTime",
          ifd: "GPS",
          tag: TAGS.GPSTimeStamp, // Use timestamp tag as primary
          count: gpsTimeEntry.count,
          valueOffset: gpsTimeEntry.valueOffset,
          value: localDateTimeStr,
          type: "datetime",
          _timezoneOffset: gpsDisplayOffset,
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
