import {
  ExifDateTime,
  type Tags,
  type WriteTags,
  exiftool,
} from "exiftool-vendored";
import { stat, utimes } from "node:fs/promises";
import { parseRelativeTimestamp, type Coordinates, type TimestampParts } from "./core.js";

type TimestampTag = "DateTimeOriginal" | "CreateDate" | "ModifyDate";

export type TimestampPlan = {
  values: Record<TimestampTag, ExifDateTime>;
  gps?: ExifDateTime;
  anchor: ExifDateTime;
};

const TIMESTAMP_TAGS: TimestampTag[] = [
  "DateTimeOriginal",
  "CreateDate",
  "ModifyDate",
];

function isExifDateTime(value: unknown): value is ExifDateTime {
  return value instanceof ExifDateTime && value.isValid;
}

function firstTimestamp(tags: Tags): ExifDateTime {
  for (const name of TIMESTAMP_TAGS) {
    const value = tags[name];
    if (isExifDateTime(value)) {
      return value;
    }
  }
  throw new Error("The JPEG has no usable EXIF capture timestamp.");
}

async function fileModifyDateTime(file: string): Promise<ExifDateTime | undefined> {
  const { mtime } = await stat(file);
  return ExifDateTime.fromMillis(mtime.getTime(), { zone: "local" });
}

function shifted(value: ExifDateTime, deltaMs: number): ExifDateTime {
  return ExifDateTime.fromMillis(value.toMillis() + deltaMs, {
    zone: value.zone ?? "local",
  });
}

function parseAbsolute(value: string, anchor: ExifDateTime): ExifDateTime {
  const parsed =
    ExifDateTime.fromISO(value, anchor.zone) ??
    ExifDateTime.fromExifStrict(value, anchor.zone) ??
    ExifDateTime.fromExifLoose(value.replace("T", " "), anchor.zone);
  if (!parsed?.isValid) {
    throw new Error(
      'Timestamp must be ISO/EXIF date-time or a relative value such as "+1h30m".',
    );
  }
  return parsed;
}

export async function buildTimestampPlan(tags: Tags, option: string, file?: string): Promise<TimestampPlan> {
  const anchor = firstTimestamp(tags);
  const relativeMs = parseRelativeTimestamp(option);
  const target = relativeMs === null ? parseAbsolute(option, anchor) : shifted(anchor, relativeMs);
  const deltaMs = relativeMs ?? target.toMillis() - anchor.toMillis();
  const values = {} as Record<TimestampTag, ExifDateTime>;

  const fileMtime = !isExifDateTime(tags.ModifyDate) && file
    ? await fileModifyDateTime(file)
    : undefined;

  for (const name of TIMESTAMP_TAGS) {
    if (relativeMs === null) {
      values[name] = target;
    } else {
      const original = tags[name];
      const base = isExifDateTime(original)
        ? original
        : name === "ModifyDate" && fileMtime
          ? fileMtime
          : anchor;
      values[name] = shifted(base, deltaMs);
    }
  }

  return {
    values,
    gps: isExifDateTime(tags.GPSDateTime)
      ? shifted(tags.GPSDateTime, deltaMs)
      : undefined,
    anchor: values.DateTimeOriginal,
  };
}

function exifString(value: ExifDateTime): string {
  return value.toExifString().replace(/(?:Z|[+-]\d{2}:\d{2})$/, "");
}

function offsetString(value: ExifDateTime): string | undefined {
  const minutes = value.tzoffsetMinutes;
  if (minutes === undefined) return undefined;
  const sign = minutes < 0 ? "-" : "+";
  const absolute = Math.abs(minutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

function gpsWriteTags(value: ExifDateTime): WriteTags {
  const utc = value.setZone("UTC");
  if (!utc) throw new Error("Unable to convert GPS time to UTC.");
  return {
    GPSDateStamp: `${utc.year}:${String(utc.month).padStart(2, "0")}:${String(utc.day).padStart(2, "0")}`,
    GPSTimeStamp: `${String(utc.hour).padStart(2, "0")}:${String(utc.minute).padStart(2, "0")}:${String(utc.second).padStart(2, "0")}`,
  };
}

export async function readMetadata(file: string): Promise<Tags> {
  return exiftool.read(file);
}

export async function writeTimestamp(file: string, plan: TimestampPlan): Promise<void> {
  const offset = offsetString(plan.anchor);
  const writeTags: WriteTags = {
    "EXIF:DateTimeOriginal": exifString(plan.values.DateTimeOriginal),
    "EXIF:CreateDate": exifString(plan.values.CreateDate),
    "EXIF:ModifyDate": exifString(plan.values.ModifyDate),
    ...(offset
      ? {
          OffsetTimeOriginal: offset,
          OffsetTimeDigitized: offset,
          OffsetTime: offset,
        }
      : {}),
    ...(plan.gps ? gpsWriteTags(plan.gps) : {}),
  };
  await exiftool.write(file, writeTags);
}

export async function writeCoordinates(
  file: string,
  coordinates: Coordinates,
): Promise<void> {
  await exiftool.write(file, {
    GPSLatitude: coordinates.latitude,
    GPSLongitude: coordinates.longitude,
    GPSLatitudeRef: coordinates.latitude < 0 ? "S" : "N",
    GPSLongitudeRef: coordinates.longitude < 0 ? "W" : "E",
  });
}

function getOptionalTimestamp(tags: Tags): ExifDateTime | undefined {
  for (const name of TIMESTAMP_TAGS) {
    const value = tags[name];
    if (isExifDateTime(value)) {
      return value;
    }
  }
  return undefined;
}

export async function sanitizeMetadata(
  file: string,
  options: { removeXmp: boolean; software?: string; syncTimestamps?: boolean },
): Promise<ExifDateTime | undefined> {
  const writeTags: WriteTags = options.software
    ? { Software: options.software }
    : {};

  let anchor: ExifDateTime | undefined;

  if (options.syncTimestamps) {
    const tags = await readMetadata(file);
    anchor = getOptionalTimestamp(tags);
    if (anchor) {
      const exifStr = exifString(anchor);
      writeTags["EXIF:DateTimeOriginal"] = exifStr;
      writeTags["EXIF:CreateDate"] = exifStr;
      writeTags["EXIF:ModifyDate"] = exifStr;
      const offset = offsetString(anchor);
      if (offset) {
        writeTags.OffsetTimeOriginal = offset;
        writeTags.OffsetTimeDigitized = offset;
        writeTags.OffsetTime = offset;
      }

      const subSec = typeof tags.SubSecTimeOriginal === "string"
        ? tags.SubSecTimeOriginal
        : typeof tags.SubSecTimeDigitized === "string"
          ? tags.SubSecTimeDigitized
          : undefined;
      if (subSec) {
        writeTags.SubSecTimeOriginal = subSec;
        writeTags.SubSecTimeDigitized = subSec;
      }

      const hasGpsCoords = tags.GPSLatitude !== undefined && tags.GPSLongitude !== undefined;
      if (hasGpsCoords && offset) {
        Object.assign(writeTags, gpsWriteTags(anchor));
      }
    }
  }

  await exiftool.write(file, writeTags, {
    writeArgs: options.removeXmp ? ["-XMP:All=", "-overwrite_original"] : ["-overwrite_original"],
  });

  return anchor;
}

export function timestampParts(value: ExifDateTime): TimestampParts {
  return {
    year: value.year,
    month: value.month,
    day: value.day,
    hour: value.hour,
    minute: value.minute,
    second: value.second,
  };
}

export async function closeMetadataBackend(): Promise<void> {
  await exiftool.end();
}

export async function setFileTimestamp(file: string, date: Date): Promise<void> {
  await utimes(file, date, date);
}
