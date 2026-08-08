import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { exiftool } from "exiftool-vendored";

const fixtureDirectory = fileURLToPath(
  new URL("../test/fixtures/", import.meta.url),
);

interface Fixture {
  name: string;
  width: number;
  height: number;
  color: string;
  tags: Record<string, string | number>;
}

const fixtures: Fixture[] = [
  {
    name: "standard-with-gps.jpg",
    width: 96,
    height: 72,
    color: "#355c7d",
    tags: {
      "EXIF:DateTimeOriginal": "2024:06:15 10:30:00",
      "EXIF:CreateDate": "2024:06:15 10:30:00",
      "EXIF:ModifyDate": "2024:06:15 10:35:00",
      OffsetTimeOriginal: "-05:00",
      OffsetTimeDigitized: "-05:00",
      OffsetTime: "-05:00",
      GPSDateStamp: "2024:06:15",
      GPSTimeStamp: "15:29:45",
      GPSLatitude: 32.8679,
      GPSLongitude: -96.6186,
      GPSLatitudeRef: "N",
      GPSLongitudeRef: "W",
      Make: "Mock Camera Co",
      Model: "Fixture One",
    },
  },
  {
    name: "timestamp-only.jpg",
    width: 80,
    height: 60,
    color: "#6c5b7b",
    tags: {
      "EXIF:DateTimeOriginal": "2023:01:02 03:04:05",
      "EXIF:CreateDate": "2023:01:02 03:04:06",
      "EXIF:ModifyDate": "2023:01:02 03:05:05",
      OffsetTimeOriginal: "+00:00",
      OffsetTimeDigitized: "+00:00",
      OffsetTime: "+00:00",
    },
  },
  {
    name: "positive-zone.jpg",
    width: 72,
    height: 96,
    color: "#c06c84",
    tags: {
      "EXIF:DateTimeOriginal": "2024:02:29 23:59:58",
      "EXIF:CreateDate": "2024:02:29 23:59:58",
      "EXIF:ModifyDate": "2024:02:29 23:59:59",
      OffsetTimeOriginal: "+05:30",
      OffsetTimeDigitized: "+05:30",
      OffsetTime: "+05:30",
      GPSDateStamp: "2024:02:29",
      GPSTimeStamp: "18:29:28",
    },
  },
  {
    name: "negative-zone.jpg",
    width: 96,
    height: 72,
    color: "#f67280",
    tags: {
      "EXIF:DateTimeOriginal": "2024:12:31 23:59:59",
      "EXIF:CreateDate": "2024:12:31 23:59:59",
      "EXIF:ModifyDate": "2025:01:01 00:00:04",
      OffsetTimeOriginal: "-08:00",
      OffsetTimeDigitized: "-08:00",
      OffsetTime: "-08:00",
      GPSDateStamp: "2025:01:01",
      GPSTimeStamp: "08:00:29",
    },
  },
  {
    name: "gps-earlier.jpg",
    width: 88,
    height: 66,
    color: "#f8b195",
    tags: {
      "EXIF:DateTimeOriginal": "2024:07:04 12:00:00",
      "EXIF:CreateDate": "2024:07:04 12:00:00",
      "EXIF:ModifyDate": "2024:07:04 12:00:00",
      OffsetTimeOriginal: "-05:00",
      OffsetTimeDigitized: "-05:00",
      OffsetTime: "-05:00",
      GPSDateStamp: "2024:07:04",
      GPSTimeStamp: "16:59:30",
    },
  },
  {
    name: "gps-later.jpg",
    width: 88,
    height: 66,
    color: "#99b898",
    tags: {
      "EXIF:DateTimeOriginal": "2024:07:04 12:00:00",
      "EXIF:CreateDate": "2024:07:04 12:00:00",
      "EXIF:ModifyDate": "2024:07:04 12:00:00",
      OffsetTimeOriginal: "-05:00",
      OffsetTimeDigitized: "-05:00",
      OffsetTime: "-05:00",
      GPSDateStamp: "2024:07:04",
      GPSTimeStamp: "17:00:45",
    },
  },
  {
    name: "create-date-only.jpg",
    width: 64,
    height: 48,
    color: "#2a363b",
    tags: {
      "EXIF:CreateDate": "2020:05:06 07:08:09",
      OffsetTimeDigitized: "+02:00",
    },
  },
  {
    name: "modify-date-only.jpg",
    width: 64,
    height: 48,
    color: "#e84a5f",
    tags: {
      "EXIF:ModifyDate": "2019:11:12 13:14:15",
      OffsetTime: "-03:30",
    },
  },
  {
    name: "southern-eastern.jpg",
    width: 90,
    height: 60,
    color: "#45ada8",
    tags: {
      "EXIF:DateTimeOriginal": "2022:08:09 10:11:12",
      "EXIF:CreateDate": "2022:08:09 10:11:12",
      "EXIF:ModifyDate": "2022:08:09 10:11:12",
      OffsetTimeOriginal: "+10:00",
      OffsetTimeDigitized: "+10:00",
      OffsetTime: "+10:00",
      GPSLatitude: -33.8688,
      GPSLongitude: 151.2093,
      GPSLatitudeRef: "S",
      GPSLongitudeRef: "E",
    },
  },
  {
    name: "boundary-gps.jpg",
    width: 90,
    height: 60,
    color: "#547980",
    tags: {
      "EXIF:DateTimeOriginal": "2021:01:01 00:00:00",
      "EXIF:CreateDate": "2021:01:01 00:00:00",
      "EXIF:ModifyDate": "2021:01:01 00:00:00",
      OffsetTimeOriginal: "+00:00",
      OffsetTimeDigitized: "+00:00",
      OffsetTime: "+00:00",
      GPSLatitude: -90,
      GPSLongitude: 180,
      GPSLatitudeRef: "S",
      GPSLongitudeRef: "E",
    },
  },
  {
    name: "tiny-landscape.jpg",
    width: 16,
    height: 8,
    color: "#594f4f",
    tags: {
      "EXIF:DateTimeOriginal": "2018:03:04 05:06:07",
      "EXIF:CreateDate": "2018:03:04 05:06:07",
      "EXIF:ModifyDate": "2018:03:04 05:06:07",
    },
  },
  {
    name: "tiny-portrait.JPG",
    width: 8,
    height: 16,
    color: "#9de0ad",
    tags: {
      "EXIF:DateTimeOriginal": "2017:04:05 06:07:08",
      "EXIF:CreateDate": "2017:04:05 06:07:08",
      "EXIF:ModifyDate": "2017:04:05 06:07:08",
    },
  },
  {
    name: "space name.jpeg",
    width: 40,
    height: 30,
    color: "#e5fcc2",
    tags: {
      "EXIF:DateTimeOriginal": "2016:05:06 07:08:09",
      "EXIF:CreateDate": "2016:05:06 07:08:09",
      "EXIF:ModifyDate": "2016:05:06 07:08:09",
    },
  },
  {
    name: "ümlaut-照片.jpg",
    width: 40,
    height: 30,
    color: "#ff847c",
    tags: {
      "EXIF:DateTimeOriginal": "2015:06:07 08:09:10",
      "EXIF:CreateDate": "2015:06:07 08:09:10",
      "EXIF:ModifyDate": "2015:06:07 08:09:10",
    },
  },
  {
    name: "photoshop-xmp.jpg",
    width: 64,
    height: 48,
    color: "#4a4e69",
    tags: {
      "EXIF:DateTimeOriginal": "2026:07:27 20:18:11",
      "EXIF:CreateDate": "2026:07:27 20:18:11",
      "EXIF:ModifyDate": "2026:07:28 04:22:37",
      OffsetTimeOriginal: "-07:00",
      OffsetTimeDigitized: "-07:00",
      OffsetTime: "-07:00",
      Software: "Adobe Photoshop 27.8 (Windows)",
      "XMP:CreatorTool": "Adobe Photoshop 27.8 (Windows)",
      "XMP:DocumentID": "adobe:docid:photoshop:fixture-document",
      "XMP:InstanceID": "xmp.iid:fixture-instance",
      "XMP:OriginalDocumentID": "fixture-original-document",
      "XMP:HistorySoftwareAgent": "Adobe Photoshop 27.8 (Windows)",
    },
  },
  ...Array.from({ length: 8 }, (_, index): Fixture => ({
    name: `orientation-${index + 1}.jpg`,
    width: 48,
    height: 32,
    color: `rgb(${40 + index * 20}, ${100 + index * 10}, ${180 - index * 12})`,
    tags: {
      "EXIF:DateTimeOriginal": `2020:01:0${index + 1} 01:02:03`,
      "EXIF:CreateDate": `2020:01:0${index + 1} 01:02:03`,
      "EXIF:ModifyDate": `2020:01:0${index + 1} 01:02:03`,
      "Orientation#": index + 1,
    },
  })),
];

await rm(fixtureDirectory, { recursive: true, force: true });
await mkdir(fixtureDirectory, { recursive: true });

try {
  for (const fixture of fixtures) {
    const output = join(fixtureDirectory, fixture.name);
    await sharp({
      create: {
        width: fixture.width,
        height: fixture.height,
        channels: 3,
        background: fixture.color,
      },
    })
      .jpeg({ quality: 82 })
      .toFile(output);
    await exiftool.write(output, fixture.tags);
    await rm(`${output}_original`, { force: true });
  }

  const noExif = join(fixtureDirectory, "no-exif.jpg");
  await sharp({
    create: { width: 32, height: 24, channels: 3, background: "#abcdef" },
  })
    .jpeg({ quality: 75 })
    .toFile(noExif);

  const base = await readFile(noExif);
  await writeFile(join(fixtureDirectory, "truncated.jpg"), base.subarray(0, 48));
  await writeFile(
    join(fixtureDirectory, "not-a-jpeg.jpg"),
    "This file deliberately has a JPEG extension but is not a JPEG.\n",
  );
  await writeFile(join(fixtureDirectory, "address-one-line.txt"), "100 Main Street\n");
  await writeFile(
    join(fixtureDirectory, "address-four-lines.txt"),
    "Building A\n100 Main Street\nSpringfield, CA 90210\nUnited States\n",
  );
} finally {
  await exiftool.end();
}

console.log(`Generated ${fixtures.length + 3} image fixtures in ${fixtureDirectory}`);
