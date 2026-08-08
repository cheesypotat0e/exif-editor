export type TimestampParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export type Coordinates = { latitude: number; longitude: number };

const RELATIVE_TIMESTAMP = /^([+-])(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/;
const IMAGE_SEQUENCE = /^IMG_(\d{4})$/i;

export function parseRelativeTimestamp(value: string): number | null {
  const match = RELATIVE_TIMESTAMP.exec(value);
  if (!match || (!match[2] && !match[3] && !match[4])) {
    return null;
  }
  const seconds =
    Number(match[2] ?? 0) * 3600 +
    Number(match[3] ?? 0) * 60 +
    Number(match[4] ?? 0);
  return seconds * 1000 * (match[1] === "-" ? -1 : 1);
}

export function parseCoordinates(value: string): Coordinates {
  const parts = value.trim().split(/[\s,]+/);
  if (parts.length !== 2 || parts.some((part) => part === "")) {
    throw new Error('GPS coordinates must be decimal degrees, for example "32.8679,-96.6186".');
  }
  const [latitude, longitude] = parts.map(Number);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error("GPS latitude must be -90…90 and longitude must be -180…180.");
  }
  return { latitude, longitude };
}

export function parseLabelLines(value: string): string[] {
  const lines = value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim());
  if (lines.at(-1) === "") {
    lines.pop();
  }
  if (lines.length < 1 || lines.length > 4 || lines.some((line) => !line)) {
    throw new Error("A label must contain 1–4 non-empty lines.");
  }
  return lines;
}

export function sequenceNames(startName: string, count: number): string[] {
  const match = IMAGE_SEQUENCE.exec(startName);
  if (!match) {
    throw new Error(
      "Renaming multiple files requires an iOS-style starting name such as IMG_2521.",
    );
  }
  if (count > 9999) {
    throw new Error("An IMG_ sequence can contain at most 9,999 files.");
  }
  let number = Number(match[1]);
  return Array.from({ length: count }, () => {
    const name = `IMG_${String(number).padStart(4, "0")}.JPG`;
    number = number === 9999 ? 1 : number + 1;
    return name;
  });
}

export function normalizeSingleName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "." || trimmed === ".." || /[/\\]/.test(trimmed)) {
    throw new Error("The output name must be a filename, not a path.");
  }
  return /\.jpe?g$/i.test(trimmed) ? trimmed : `${trimmed}.JPG`;
}

export function formatTimestampLabel(parts: TimestampParts): string {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const hour = parts.hour % 12 || 12;
  const meridiem = parts.hour >= 12 ? "PM" : "AM";
  return `${months[parts.month - 1]} ${parts.day}, ${parts.year} at ${hour}:${String(parts.minute).padStart(2, "0")}:${String(parts.second).padStart(2, "0")} ${meridiem}`;
}

export function escapeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[
        character
      ]!,
  );
}
