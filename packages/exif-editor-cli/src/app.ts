import { createWriteStream } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, parse, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { ZipArchive, type ArchiverError } from "archiver";
import type { ExifDateTime } from "exiftool-vendored";
import sharp from "sharp";
import {
  formatTimestampLabel,
  normalizeSingleName,
  parseCoordinates,
  parseLabelLines,
  sequenceNames,
} from "./core.js";
import { addTimestampLabel } from "./label.js";
import {
  buildTimestampPlan,
  readMetadata,
  sanitizeMetadata,
  setFileTimestamp,
  timestampParts,
  writeCoordinates,
  writeTimestamp,
} from "./metadata.js";
import {
  fetchLatestIosBetaVersion,
  LATEST_IOS_BETA,
  resolveSoftwareValue,
  type SoftwareResolution,
} from "./software.js";

export type CliOptions = {
  inputs: string[];
  output?: string;
  timestamp?: string;
  name?: string;
  label?: string;
  labelFile?: string;
  gps?: string;
  removeXmp?: boolean;
  sanitize?: boolean;
  software?: string;
  fileDate?: string;
};

export type RunResult = {
  output: string;
  files: string[];
  zipped: boolean;
  software?: SoftwareResolution;
};

export type RunDependencies = {
  latestIosBetaVersion?: () => Promise<SoftwareResolution>;
};

type InputSet = {
  files: string[];
  directory?: string;
};

function isJpeg(path: string): boolean {
  return /\.jpe?g$/i.test(path);
}

async function validateJpeg(path: string): Promise<void> {
  try {
    const metadata = await sharp(path).metadata();
    if (metadata.format !== "jpeg") throw new Error("not JPEG");
  } catch {
    throw new Error(`Not a valid JPEG file: ${path}`);
  }
}

async function collectInputs(inputs: string[]): Promise<InputSet> {
  if (!inputs.length) throw new Error("Provide at least one JPEG or one directory.");
  const resolved = inputs.map((input) => resolve(input));
  const stats = await Promise.all(resolved.map((path) => stat(path)));
  const directories = stats.filter((item) => item.isDirectory()).length;
  if (directories) {
    if (inputs.length !== 1 || directories !== 1) {
      throw new Error("A directory input cannot be combined with other inputs.");
    }
    const entries = await readdir(resolved[0], { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && isJpeg(entry.name))
      .map((entry) => join(resolved[0], entry.name))
      .sort((a, b) => a.localeCompare(b));
    if (!files.length) throw new Error("The directory contains no JPEG files.");
    await Promise.all(files.map(validateJpeg));
    return { files, directory: resolved[0] };
  }
  const invalid = resolved.find((path, index) => !stats[index].isFile() || !isJpeg(path));
  if (invalid) throw new Error(`Not a JPEG file: ${invalid}`);
  await Promise.all(resolved.map(validateJpeg));
  return { files: resolved };
}

async function resolveLabel(options: CliOptions): Promise<string[] | undefined> {
  if (options.label && options.labelFile) {
    throw new Error("Use either --label or --label-file, not both.");
  }
  let value = options.label;
  const file = options.labelFile
    ? resolve(options.labelFile)
    : value && /\.txt$/i.test(value)
      ? resolve(value)
      : undefined;
  if (file) {
    try {
      value = await readFile(file, "utf8");
    } catch (error) {
      if (options.labelFile) throw error;
    }
  }
  return value === undefined ? undefined : parseLabelLines(value);
}

async function oldestFirst(files: string[]): Promise<string[]> {
  const dated = await Promise.all(
    files.map(async (file) => {
      const tags = await readMetadata(file);
      const value = tags.DateTimeOriginal ?? tags.CreateDate ?? tags.ModifyDate;
      const millis =
        value && typeof value === "object" && "toMillis" in value
          ? (value as ExifDateTime).toMillis()
          : Number.POSITIVE_INFINITY;
      return { file, millis };
    }),
  );
  return dated
    .sort((a, b) => a.millis - b.millis || a.file.localeCompare(b.file))
    .map(({ file }) => file);
}

async function createZip(files: Array<{ path: string; name: string }>, output: string) {
  if (await stat(output).catch(() => null)) {
    throw new Error(`Output already exists: ${output}`);
  }
  await mkdir(dirname(output), { recursive: true });
  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.on("warning", (error: ArchiverError) => {
    if (error.code !== "ENOENT") throw error;
  });
  for (const file of files) archive.file(file.path, { name: file.name });
  const completed = pipeline(archive, createWriteStream(output));
  await archive.finalize();
  await completed;
}

function defaultOutput(input: InputSet, names: string[], hasRename: boolean): string {
  if (input.directory) return `${input.directory}-edited.zip`;
  if (input.files.length === 1) {
    const parsed = parse(input.files[0]);
    return join(
      parsed.dir,
      hasRename ? names[0] : `${parsed.name}-edited${parsed.ext}`,
    );
  }
  return join(dirname(input.files[0]), "exif-editor-output");
}

export async function run(
  options: CliOptions,
  dependencies: RunDependencies = {},
): Promise<RunResult> {
  if (
    options.timestamp === undefined &&
    options.name === undefined &&
    options.label === undefined &&
    options.labelFile === undefined &&
    options.gps === undefined &&
    options.removeXmp !== true &&
    options.sanitize !== true &&
    options.software === undefined &&
    options.fileDate === undefined
  ) {
    throw new Error("Provide at least one edit option.");
  }
  const input = await collectInputs(options.inputs);
  const labels = await resolveLabel(options);
  const coordinates = options.gps ? parseCoordinates(options.gps) : undefined;
  const removeXmp = options.sanitize === true || options.removeXmp === true;
  const softwareRequest =
    options.software ?? (options.sanitize ? LATEST_IOS_BETA : undefined);
  const software = softwareRequest
    ? await resolveSoftwareValue(
        softwareRequest,
        dependencies.latestIosBetaVersion ?? fetchLatestIosBetaVersion,
      )
    : undefined;
  const isGroup = input.files.length > 1;
  const ordered = options.name && isGroup ? await oldestFirst(input.files) : input.files;
  const names = options.name
    ? isGroup
      ? sequenceNames(options.name, ordered.length)
      : [normalizeSingleName(options.name)]
    : ordered.map((file) => basename(file));
  const workDirectory = await mkdtemp(join(tmpdir(), "exif-editor-cli-"));

  try {
    const completed: Array<{ path: string; name: string }> = [];
    for (let index = 0; index < ordered.length; index++) {
      const source = ordered[index];
      const working = join(workDirectory, `working-${index}${extname(source)}`);
      await copyFile(source, working);
      let labelTimestamp: ExifDateTime | undefined;

      // The public operation order is intentional: timestamp, GPS, then label.
      if (options.timestamp) {
        const plan = await buildTimestampPlan(await readMetadata(working), options.timestamp, working);
        await writeTimestamp(working, plan);
        labelTimestamp = plan.anchor;
      }
      if (coordinates) await writeCoordinates(working, coordinates);
      if (labels) {
        if (!labelTimestamp) {
          const tags = await readMetadata(working);
          const value = tags.DateTimeOriginal ?? tags.CreateDate ?? tags.ModifyDate;
          if (!value || typeof value !== "object" || !("toMillis" in value)) {
            throw new Error(`Cannot add a timestamp label: ${basename(source)} has no EXIF timestamp.`);
          }
          labelTimestamp = value as ExifDateTime;
        }
        await addTimestampLabel(
          working,
          formatTimestampLabel(timestampParts(labelTimestamp)),
          labels,
        );
      }
      if (removeXmp || software || options.sanitize) {
        const sanitizeAnchor = await sanitizeMetadata(working, {
          removeXmp,
          software: software?.value,
          syncTimestamps: options.sanitize === true,
        });
        if (options.sanitize && sanitizeAnchor) {
          await setFileTimestamp(working, new Date(sanitizeAnchor.toMillis()));
        }
      }
      if (options.fileDate && !options.sanitize) {
        if (options.fileDate === "match") {
          const tags = await readMetadata(working);
          const anchor = tags.DateTimeOriginal ?? tags.CreateDate ?? tags.ModifyDate;
          if (anchor && typeof anchor === "object" && "toMillis" in anchor) {
            await setFileTimestamp(working, new Date((anchor as ExifDateTime).toMillis()));
          }
        } else {
          const parsed = new Date(options.fileDate);
          if (Number.isNaN(parsed.getTime())) {
            throw new Error(`Invalid --file-date value: ${options.fileDate}`);
          }
          await setFileTimestamp(working, parsed);
        }
      }
      completed.push({ path: working, name: names[index] });
    }

    const requestedOutput = resolve(
      options.output ?? defaultOutput(input, names, options.name !== undefined),
    );
    if (input.directory) {
      const zipOutput = /\.zip$/i.test(requestedOutput)
        ? requestedOutput
        : `${requestedOutput}.zip`;
      await createZip(completed, zipOutput);
      return {
        output: zipOutput,
        files: completed.map((file) => file.name),
        zipped: true,
        software,
      };
    }
    if (completed.length === 1) {
      const destination =
        options.output && (await stat(requestedOutput).catch(() => null))?.isDirectory()
          ? join(requestedOutput, completed[0].name)
          : requestedOutput;
      if (input.files.includes(destination) || (await stat(destination).catch(() => null))) {
        throw new Error(`Output already exists: ${destination}`);
      }
      await mkdir(dirname(destination), { recursive: true });
      await rename(completed[0].path, destination);
      return {
        output: destination,
        files: [basename(destination)],
        zipped: false,
        software,
      };
    }
    await mkdir(requestedOutput, { recursive: true });
    const destinations = completed.map((file) => join(requestedOutput, file.name));
    for (const destination of destinations) {
      if (input.files.includes(destination) || (await stat(destination).catch(() => null))) {
        throw new Error(`Output already exists: ${destination}`);
      }
    }
    for (let index = 0; index < completed.length; index++) {
      const file = completed[index];
      const destination = destinations[index];
      await rename(file.path, destination);
    }
    return {
      output: requestedOutput,
      files: completed.map((file) => file.name),
      zipped: false,
      software,
    };
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
}
