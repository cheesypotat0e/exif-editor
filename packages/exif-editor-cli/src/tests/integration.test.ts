import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";
import sharp from "sharp";
import { ExifDateTime, exiftool } from "exiftool-vendored";
import { run } from "../app.js";
import { closeMetadataBackend, readMetadata } from "../metadata.js";

const fixtures = fileURLToPath(new URL("../../test/fixtures/", import.meta.url));
const fixture = (name: string) => join(fixtures, name);
const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "exif-editor-cli-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function temporaryInput(name: string): Promise<{ directory: string; input: string }> {
  const directory = await temporaryDirectory();
  const input = join(directory, name);
  await copyFile(fixture(name), input);
  return { directory, input };
}

function hash(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function requireDate(value: unknown): ExifDateTime {
  assert.ok(value instanceof ExifDateTime);
  return value;
}

async function assertSoftwareTag(file: string, expected: string): Promise<void> {
  const tags = await readMetadata(file);
  // exiftool-vendored coerces numeric-looking strings such as "27.0" to 27.
  assert.equal(Number(tags.Software), Number(expected));
  assert.equal((await readFile(file)).includes(Buffer.from(`${expected}\0`)), true);
}

after(async () => {
  await closeMetadataBackend();
  await Promise.all(
    temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

test("renames one JPEG without changing its bytes", async () => {
  const { directory, input } = await temporaryInput("timestamp-only.jpg");
  const original = await readFile(input);
  const result = await run({ inputs: [input], name: "vacation" });
  assert.equal(result.output, join(directory, "vacation.JPG"));
  assert.equal(hash(await readFile(result.output)), hash(original));
  assert.equal(hash(await readFile(input)), hash(original));
});

test("uses an -edited suffix by default", async () => {
  const { directory, input } = await temporaryInput("timestamp-only.jpg");
  const result = await run({ inputs: [input], gps: "1,2" });
  assert.equal(result.output, join(directory, "timestamp-only-edited.jpg"));
});

test("writes an absolute timestamp to every primary EXIF field", async () => {
  const { directory, input } = await temporaryInput("standard-with-gps.jpg");
  const output = join(directory, "absolute.jpg");
  await run({ inputs: [input], output, timestamp: "2027-01-02T03:04:05-05:00" });
  const tags = await readMetadata(output);
  const original = requireDate(tags.DateTimeOriginal);
  assert.equal(original.toExifString(), "2027:01:02 03:04:05-05:00");
  assert.equal(requireDate(tags.CreateDate).toMillis(), original.toMillis());
  assert.equal(requireDate(tags.ModifyDate).toMillis(), original.toMillis());
});

test("preserves a negative GPS-to-capture delta on an absolute update", async () => {
  const { directory, input } = await temporaryInput("gps-earlier.jpg");
  const before = await readMetadata(input);
  const output = join(directory, "earlier.jpg");
  await run({ inputs: [input], output, timestamp: "2030-05-06T07:08:09-05:00" });
  const afterTags = await readMetadata(output);
  assert.equal(
    requireDate(afterTags.GPSDateTime).toMillis() -
      requireDate(afterTags.DateTimeOriginal).toMillis(),
    requireDate(before.GPSDateTime).toMillis() -
      requireDate(before.DateTimeOriginal).toMillis(),
  );
});

test("preserves a positive GPS-to-capture delta on an absolute update", async () => {
  const { directory, input } = await temporaryInput("gps-later.jpg");
  const before = await readMetadata(input);
  const output = join(directory, "later.jpg");
  await run({ inputs: [input], output, timestamp: "2030-05-06T07:08:09-05:00" });
  const afterTags = await readMetadata(output);
  assert.equal(
    requireDate(afterTags.GPSDateTime).toMillis() -
      requireDate(afterTags.DateTimeOriginal).toMillis(),
    requireDate(before.GPSDateTime).toMillis() -
      requireDate(before.DateTimeOriginal).toMillis(),
  );
});

test("relative updates retain differences among regular timestamp fields", async () => {
  const { directory, input } = await temporaryInput("standard-with-gps.jpg");
  const before = await readMetadata(input);
  const output = join(directory, "relative.jpg");
  await run({ inputs: [input], output, timestamp: "+1h30m30s" });
  const afterTags = await readMetadata(output);
  assert.equal(
    requireDate(afterTags.ModifyDate).toMillis() -
      requireDate(afterTags.DateTimeOriginal).toMillis(),
    requireDate(before.ModifyDate).toMillis() -
      requireDate(before.DateTimeOriginal).toMillis(),
  );
});

for (const [name, shift] of [
  ["positive-zone.jpg", "+2s"],
  ["negative-zone.jpg", "-2s"],
] as const) {
  test(`relative update crosses a date boundary for ${name}`, async () => {
    const { directory, input } = await temporaryInput(name);
    const before = await readMetadata(input);
    const output = join(directory, `shifted-${name}`);
    await run({ inputs: [input], output, timestamp: shift });
    const afterTags = await readMetadata(output);
    const expectedDelta = shift.startsWith("+") ? 2_000 : -2_000;
    assert.equal(
      requireDate(afterTags.DateTimeOriginal).toMillis() -
        requireDate(before.DateTimeOriginal).toMillis(),
      expectedDelta,
    );
  });
}

test("updates a JPEG that only has CreateDate", async () => {
  const { directory, input } = await temporaryInput("create-date-only.jpg");
  const output = join(directory, "created.jpg");
  await run({ inputs: [input], output, timestamp: "+1h" });
  const tags = await readMetadata(output);
  assert.ok(tags.DateTimeOriginal instanceof ExifDateTime);
  assert.ok(tags.CreateDate instanceof ExifDateTime);
  assert.ok(tags.ModifyDate instanceof ExifDateTime);
});

test("updates a JPEG that only has ModifyDate", async () => {
  const { directory, input } = await temporaryInput("modify-date-only.jpg");
  const output = join(directory, "modified.jpg");
  await run({ inputs: [input], output, timestamp: "-1h" });
  const tags = await readMetadata(output);
  assert.ok(tags.DateTimeOriginal instanceof ExifDateTime);
  assert.ok(tags.CreateDate instanceof ExifDateTime);
  assert.ok(tags.ModifyDate instanceof ExifDateTime);
});

for (const [coordinates, latitude, longitude] of [
  ["0,0", 0, 0],
  ["90,180", 90, 180],
  ["-90,-180", -90, -180],
  ["-33.8688,151.2093", -33.8688, 151.2093],
] as const) {
  test(`writes GPS coordinates ${coordinates}`, async () => {
    const { directory, input } = await temporaryInput("timestamp-only.jpg");
    const output = join(directory, `gps-${latitude}-${longitude}.jpg`);
    await run({ inputs: [input], output, gps: coordinates });
    if (latitude === 0 && longitude === 0) {
      const raw = (await exiftool.readRaw(output, [
        "-n",
        "-G1",
        "-s",
        "-GPSLatitude",
        "-GPSLongitude",
      ])) as Record<string, number>;
      assert.equal(raw["GPS:GPSLatitude"], 0);
      assert.equal(raw["GPS:GPSLongitude"], 0);
      return;
    }
    const tags = await readMetadata(output);
    assert.equal(tags.GPSLatitude, latitude);
    assert.equal(tags.GPSLongitude, longitude);
  });
}

test("creates GPS metadata in a JPEG that originally has no EXIF", async () => {
  const { directory, input } = await temporaryInput("no-exif.jpg");
  const output = join(directory, "gps-created.jpg");
  await run({ inputs: [input], output, gps: "12.34,-56.78" });
  const tags = await readMetadata(output);
  assert.equal(tags.GPSLatitude, 12.34);
  assert.equal(tags.GPSLongitude, -56.78);
});

test("burns an inline timestamp label while retaining EXIF", async () => {
  const { directory, input } = await temporaryInput("standard-with-gps.jpg");
  const output = join(directory, "labeled.jpg");
  const before = await readFile(input);
  await run({ inputs: [input], output, label: "100 Main Street" });
  assert.notEqual(hash(await readFile(output)), hash(before));
  assert.ok((await readMetadata(output)).DateTimeOriginal instanceof ExifDateTime);
});

test("accepts four inline label lines with XML-sensitive characters", async () => {
  const { directory, input } = await temporaryInput("timestamp-only.jpg");
  const output = join(directory, "four-lines.jpg");
  await run({
    inputs: [input],
    output,
    label: `A & B\n<Building "One">\nSam's Street\nUSA`,
  });
  assert.equal((await sharp(output).metadata()).format, "jpeg");
});

test("reads a label through --label-file", async () => {
  const { directory, input } = await temporaryInput("timestamp-only.jpg");
  const output = join(directory, "label-file.jpg");
  await run({
    inputs: [input],
    output,
    labelFile: fixture("address-four-lines.txt"),
  });
  assert.equal((await sharp(output).metadata()).format, "jpeg");
});

test("auto-detects an existing .txt value passed to --label", async () => {
  const { directory, input } = await temporaryInput("timestamp-only.jpg");
  const output = join(directory, "auto-label-file.jpg");
  await run({
    inputs: [input],
    output,
    label: fixture("address-one-line.txt"),
  });
  assert.equal((await sharp(output).metadata()).format, "jpeg");
});

for (let orientation = 1; orientation <= 8; orientation++) {
  test(`renders a label correctly for EXIF orientation ${orientation}`, async () => {
    const name = `orientation-${orientation}.jpg`;
    const { directory, input } = await temporaryInput(name);
    const output = join(directory, `labeled-${name}`);
    await run({ inputs: [input], output, label: "Orientation fixture" });
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.orientation, 1);
    const swaps = orientation >= 5;
    assert.equal(metadata.width, swaps ? 32 : 48);
    assert.equal(metadata.height, swaps ? 48 : 32);
  });
}

test("processes multiple explicit inputs into one output directory", async () => {
  const directory = await temporaryDirectory();
  const first = join(directory, "first.jpg");
  const second = join(directory, "second.JPG");
  await copyFile(fixture("timestamp-only.jpg"), first);
  await copyFile(fixture("tiny-portrait.JPG"), second);
  const output = join(directory, "outputs");
  const result = await run({ inputs: [first, second], output, gps: "1,2" });
  assert.deepEqual(result.files, ["first.jpg", "second.JPG"]);
  assert.deepEqual((await readdir(output)).sort(), ["first.jpg", "second.JPG"]);
});

test("renames explicit inputs in oldest-photo-first order", async () => {
  const directory = await temporaryDirectory();
  const newer = join(directory, "a-newer.jpg");
  const older = join(directory, "z-older.jpg");
  await copyFile(fixture("timestamp-only.jpg"), newer);
  await copyFile(fixture("space name.jpeg"), older);
  const output = join(directory, "renamed");
  await run({ inputs: [newer, older], output, name: "IMG_7000" });
  const oldestOutput = await readMetadata(join(output, "IMG_7000.JPG"));
  assert.equal(requireDate(oldestOutput.DateTimeOriginal).year, 2016);
});

test("processes only one directory level and creates a ZIP", async () => {
  const root = await temporaryDirectory();
  const inputDirectory = join(root, "photos");
  await mkdir(join(inputDirectory, "nested"), { recursive: true });
  await copyFile(fixture("timestamp-only.jpg"), join(inputDirectory, "one.jpg"));
  await copyFile(fixture("tiny-portrait.JPG"), join(inputDirectory, "two.JPG"));
  await copyFile(fixture("standard-with-gps.jpg"), join(inputDirectory, "nested", "ignored.jpg"));
  await writeFile(join(inputDirectory, "notes.txt"), "ignored");
  const output = join(root, "photos.zip");
  const result = await run({ inputs: [inputDirectory], output, timestamp: "+1h" });
  const zip = await readFile(output);
  assert.equal(zip.subarray(0, 2).toString(), "PK");
  assert.deepEqual(result.files, ["one.jpg", "two.JPG"]);
  assert.equal(zip.includes(Buffer.from("ignored.jpg")), false);
});

test("wraps directory group names after IMG_9999", async () => {
  const root = await temporaryDirectory();
  const inputDirectory = join(root, "photos");
  await mkdir(inputDirectory);
  await copyFile(fixture("timestamp-only.jpg"), join(inputDirectory, "newer.jpg"));
  await copyFile(fixture("space name.jpeg"), join(inputDirectory, "older.jpeg"));
  const output = join(root, "wrapped.zip");
  const result = await run({ inputs: [inputDirectory], output, name: "IMG_9999" });
  assert.deepEqual(result.files, ["IMG_9999.JPG", "IMG_0001.JPG"]);
});

test("handles spaces and Unicode in input and output names", async () => {
  const directory = await temporaryDirectory();
  const input = join(directory, "ümlaut 照片.jpeg");
  await copyFile(fixture("ümlaut-照片.jpg"), input);
  const result = await run({ inputs: [input], name: "旅行 photo" });
  assert.equal(basename(result.output), "旅行 photo.JPG");
  assert.equal((await sharp(result.output).metadata()).format, "jpeg");
});

test("handles a tiny landscape JPEG", async () => {
  const { directory, input } = await temporaryInput("tiny-landscape.jpg");
  const output = join(directory, "tiny-labeled.jpg");
  await run({ inputs: [input], output, label: "Tiny" });
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.width, 16);
  assert.equal(metadata.height, 8);
});

test("applies timestamp, GPS, then label together", async () => {
  const { directory, input } = await temporaryInput("standard-with-gps.jpg");
  const output = join(directory, "everything.jpg");
  await run({
    inputs: [input],
    output,
    timestamp: "2031-02-03T04:05:06-05:00",
    gps: "51.5074,-0.1278",
    label: "London\nUnited Kingdom",
  });
  const tags = await readMetadata(output);
  assert.equal(requireDate(tags.DateTimeOriginal).year, 2031);
  assert.equal(tags.GPSLatitude, 51.5074);
  assert.equal(tags.GPSLongitude, -0.1278);
});

test("removes the complete XMP packet while preserving EXIF Software", async () => {
  const { directory, input } = await temporaryInput("photoshop-xmp.jpg");
  const before = await readMetadata(input);
  assert.equal(before.Software, "Adobe Photoshop 27.8 (Windows)");
  assert.ok(before.CreatorTool);
  const output = join(directory, "without-xmp.jpg");
  await run({ inputs: [input], output, removeXmp: true });
  const tags = await readMetadata(output);
  assert.equal(tags.Software, "Adobe Photoshop 27.8 (Windows)");
  assert.equal(tags.CreatorTool, undefined);
  assert.equal(tags.DocumentID, undefined);
  assert.equal(tags.InstanceID, undefined);
});

test("changes EXIF Software without removing XMP when requested independently", async () => {
  const { directory, input } = await temporaryInput("photoshop-xmp.jpg");
  const output = join(directory, "software-only.jpg");
  await run({ inputs: [input], output, software: "27.0" });
  const tags = await readMetadata(output);
  await assertSoftwareTag(output, "27.0");
  assert.ok(tags.CreatorTool);
});

test("--sanitize removes XMP and applies a literal software override", async () => {
  const { directory, input } = await temporaryInput("photoshop-xmp.jpg");
  const output = join(directory, "sanitized-literal.jpg");
  const result = await run({
    inputs: [input],
    output,
    sanitize: true,
    software: "27.0",
  });
  const tags = await readMetadata(output);
  assert.deepEqual(result.software, { value: "27.0", source: "literal" });
  await assertSoftwareTag(output, "27.0");
  assert.equal(tags.CreatorTool, undefined);
  assert.equal(
    requireDate(tags.ModifyDate).toMillis(),
    requireDate(tags.DateTimeOriginal).toMillis(),
  );
  assert.equal(
    requireDate(tags.CreateDate).toMillis(),
    requireDate(tags.DateTimeOriginal).toMillis(),
  );
});

test("--sanitize syncs all image timestamps after modifications", async () => {
  const { directory, input } = await temporaryInput("photoshop-xmp.jpg");
  const output = join(directory, "sanitized-synced.jpg");
  const before = await readMetadata(input);
  assert.notEqual(
    requireDate(before.ModifyDate).toMillis(),
    requireDate(before.DateTimeOriginal).toMillis(),
  );

  await run({
    inputs: [input],
    output,
    timestamp: "+1h",
    label: "Sanitized Photo",
    sanitize: true,
    software: "27.0",
  });

  const tags = await readMetadata(output);
  const original = requireDate(tags.DateTimeOriginal);
  assert.equal(requireDate(tags.CreateDate).toMillis(), original.toMillis());
  assert.equal(requireDate(tags.ModifyDate).toMillis(), original.toMillis());
  assert.equal(
    original.toMillis() - requireDate(before.DateTimeOriginal).toMillis(),
    3_600_000,
  );
});

test("--sanitize resolves the latest iOS beta once and reports its source", async () => {
  const { directory, input } = await temporaryInput("photoshop-xmp.jpg");
  const output = join(directory, "sanitized-auto.jpg");
  let calls = 0;
  const result = await run(
    { inputs: [input], output, sanitize: true },
    {
      latestIosBetaVersion: async () => {
        calls++;
        return { value: "27.0", source: "apple" };
      },
    },
  );
  assert.equal(calls, 1);
  assert.deepEqual(result.software, { value: "27.0", source: "apple" });
  const tags = await readMetadata(output);
  await assertSoftwareTag(output, "27.0");
  assert.equal(tags.CreatorTool, undefined);
});

test("latest-ios-beta is accepted explicitly by --software", async () => {
  const { directory, input } = await temporaryInput("timestamp-only.jpg");
  const output = join(directory, "latest-software.jpg");
  await run(
    { inputs: [input], output, software: "latest-ios-beta" },
    {
      latestIosBetaVersion: async () => ({
        value: "27.0",
        source: "apple",
      }),
    },
  );
  await assertSoftwareTag(output, "27.0");
});

test("metadata cleanup runs after label rendering", async () => {
  const { directory, input } = await temporaryInput("photoshop-xmp.jpg");
  const output = join(directory, "labeled-clean.jpg");
  await run({
    inputs: [input],
    output,
    label: "100 Main Street",
    removeXmp: true,
    software: "27.0",
  });
  const tags = await readMetadata(output);
  await assertSoftwareTag(output, "27.0");
  assert.equal(tags.CreatorTool, undefined);
  assert.equal((await sharp(output).metadata()).format, "jpeg");
});

test("sanitizes every JPEG in an explicit input group", async () => {
  const directory = await temporaryDirectory();
  const first = join(directory, "first.jpg");
  const second = join(directory, "second.jpg");
  await copyFile(fixture("photoshop-xmp.jpg"), first);
  await copyFile(fixture("photoshop-xmp.jpg"), second);
  const output = join(directory, "clean");
  await run({
    inputs: [first, second],
    output,
    removeXmp: true,
    software: "27.0",
  });
  for (const name of ["first.jpg", "second.jpg"]) {
    const tags = await readMetadata(join(output, name));
    await assertSoftwareTag(join(output, name), "27.0");
    assert.equal(tags.CreatorTool, undefined);
  }
});

test("--sanitize cleans every JPEG in a directory ZIP group with one version lookup", async () => {
  const root = await temporaryDirectory();
  const inputDirectory = join(root, "photos");
  const extractedDirectory = join(root, "extracted");
  await mkdir(join(inputDirectory, "nested"), { recursive: true });
  for (const name of ["first.jpg", "second.JPG", "third.jpeg"]) {
    await copyFile(fixture("photoshop-xmp.jpg"), join(inputDirectory, name));
  }
  await copyFile(
    fixture("photoshop-xmp.jpg"),
    join(inputDirectory, "nested", "ignored.jpg"),
  );
  const sourceHashes = await Promise.all(
    ["first.jpg", "second.JPG", "third.jpeg"].map(async (name) =>
      hash(await readFile(join(inputDirectory, name))),
    ),
  );
  const output = join(root, "sanitized.zip");
  let lookups = 0;
  const result = await run(
    { inputs: [inputDirectory], output, sanitize: true },
    {
      latestIosBetaVersion: async () => {
        lookups++;
        return { value: "27.0", source: "apple" };
      },
    },
  );

  assert.equal(lookups, 1);
  assert.equal(result.zipped, true);
  assert.deepEqual(result.files, ["first.jpg", "second.JPG", "third.jpeg"]);
  const archive = new AdmZip(output);
  assert.deepEqual(
    archive.getEntries().map((entry) => entry.entryName).sort(),
    ["first.jpg", "second.JPG", "third.jpeg"],
  );
  archive.extractAllTo(extractedDirectory);
  for (const name of result.files) {
    const extracted = join(extractedDirectory, name);
    await assertSoftwareTag(extracted, "27.0");
    assert.equal((await readMetadata(extracted)).CreatorTool, undefined);
  }
  assert.deepEqual(
    await Promise.all(
      ["first.jpg", "second.JPG", "third.jpeg"].map(async (name) =>
        hash(await readFile(join(inputDirectory, name))),
      ),
    ),
    sourceHashes,
  );
});

test("rejects a call with no edit options", async () => {
  await assert.rejects(() => run({ inputs: [fixture("timestamp-only.jpg")] }), /edit option/);
});

test("rejects a call with no inputs", async () => {
  await assert.rejects(() => run({ inputs: [], gps: "1,2" }), /at least one JPEG/);
});

test("rejects mixed directory and file inputs", async () => {
  await assert.rejects(
    () => run({ inputs: [fixtures, fixture("timestamp-only.jpg")], gps: "1,2" }),
    /cannot be combined/,
  );
});

test("rejects an empty input directory", async () => {
  const directory = await temporaryDirectory();
  await assert.rejects(() => run({ inputs: [directory], gps: "1,2" }), /no JPEG/);
});

test("rejects a non-JPEG extension", async () => {
  await assert.rejects(
    () => run({ inputs: [fixture("address-one-line.txt")], gps: "1,2" }),
    /Not a JPEG/,
  );
});

for (const name of ["not-a-jpeg.jpg", "truncated.jpg"]) {
  test(`rejects malformed image fixture ${name}`, async () => {
    await assert.rejects(
      () => run({ inputs: [fixture(name)], name: "copy" }),
      /Not a valid JPEG/,
    );
  });
}

test("rejects timestamp updates when no source timestamp exists", async () => {
  await assert.rejects(
    () => run({ inputs: [fixture("no-exif.jpg")], timestamp: "+1h" }),
    /no usable EXIF/,
  );
});

test("rejects labels when no source timestamp exists", async () => {
  await assert.rejects(
    () => run({ inputs: [fixture("no-exif.jpg")], label: "Somewhere" }),
    /no EXIF timestamp/,
  );
});

test("rejects conflicting inline and file labels", async () => {
  await assert.rejects(
    () =>
      run({
        inputs: [fixture("timestamp-only.jpg")],
        label: "Inline",
        labelFile: fixture("address-one-line.txt"),
      }),
    /either --label or --label-file/,
  );
});

test("rejects an explicit label file with five lines", async () => {
  const directory = await temporaryDirectory();
  const labelFile = join(directory, "five.txt");
  await writeFile(labelFile, "1\n2\n3\n4\n5");
  await assert.rejects(
    () => run({ inputs: [fixture("timestamp-only.jpg")], labelFile }),
    /1–4/,
  );
});

test("rejects an invalid group starting name", async () => {
  const output = join(await temporaryDirectory(), "output");
  await assert.rejects(
    () =>
      run({
        inputs: [fixture("timestamp-only.jpg"), fixture("tiny-landscape.jpg")],
        output,
        name: "holiday",
      }),
    /IMG_2521/,
  );
});

test("does not overwrite an existing output file", async () => {
  const { directory, input } = await temporaryInput("timestamp-only.jpg");
  const output = join(directory, "exists.jpg");
  await writeFile(output, "keep me");
  await assert.rejects(() => run({ inputs: [input], output, gps: "1,2" }), /already exists/);
  assert.equal(await readFile(output, "utf8"), "keep me");
});

test("does not overwrite a source when rename matches the source name", async () => {
  const { input } = await temporaryInput("timestamp-only.jpg");
  const before = await readFile(input);
  await assert.rejects(
    () => run({ inputs: [input], name: "timestamp-only.jpg" }),
    /already exists/,
  );
  assert.equal(hash(await readFile(input)), hash(before));
});

test("does not overwrite an existing ZIP", async () => {
  const root = await temporaryDirectory();
  const inputDirectory = join(root, "photos");
  await mkdir(inputDirectory);
  await cp(fixture("timestamp-only.jpg"), join(inputDirectory, "one.jpg"));
  const output = join(root, "exists.zip");
  await writeFile(output, "keep zip");
  await assert.rejects(
    () => run({ inputs: [inputDirectory], output, gps: "1,2" }),
    /already exists/,
  );
  assert.equal(await readFile(output, "utf8"), "keep zip");
});
