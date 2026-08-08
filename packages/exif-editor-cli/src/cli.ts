#!/usr/bin/env node
import { run, type CliOptions } from "./app.js";
import { closeMetadataBackend } from "./metadata.js";

const HELP = `Usage: exif-editor [options] <jpeg...|directory>

Options:
  -t, --timestamp <date|offset>  ISO/EXIF timestamp or +1h30m / -1h30m30s
  -g, --gps <lat,lon>           Decimal-degree GPS coordinates
  -l, --label <text|file.txt>   1–4 label lines; newlines are preserved
      --label-file <file.txt>   Read the 1–4 label lines from a text file
      --sanitize                Remove XMP, sync timestamps, and set Software to latest iOS beta
      --remove-xmp              Remove the complete XMP metadata packet
      --software <name>         Set EXIF Software; accepts latest-ios-beta
      --file-date <match|ISO>   Set output file mtime (match = EXIF capture time)
  -n, --name <name|IMG_0001>    Single filename or group sequence start
  -o, --output <path>           Output file, directory, or ZIP path
  -h, --help                    Show help

Edits run in this order: timestamp, GPS, label, metadata cleanup. Inputs are never modified.
A directory input reads JPEGs from that directory only and produces a ZIP.`;

type ValueOption =
  | "timestamp"
  | "gps"
  | "label"
  | "labelFile"
  | "name"
  | "output"
  | "software"
  | "fileDate";

const valueOptions: Record<string, ValueOption> = {
  "-t": "timestamp",
  "--timestamp": "timestamp",
  "-g": "gps",
  "--gps": "gps",
  "-l": "label",
  "--label": "label",
  "--label-file": "labelFile",
  "-n": "name",
  "--name": "name",
  "-o": "output",
  "--output": "output",
  "--software": "software",
  "--file-date": "fileDate",
};

const booleanOptions: Record<string, "sanitize" | "removeXmp"> = {
  "--sanitize": "sanitize",
  "--remove-xmp": "removeXmp",
};

function parseArguments(args: string[]): CliOptions | null {
  const options: CliOptions = { inputs: [] };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "-h" || argument === "--help") return null;
    if (argument === "--") {
      options.inputs.push(...args.slice(index + 1));
      break;
    }
    const equals = argument.startsWith("--") ? argument.indexOf("=") : -1;
    const key = equals > 0 ? argument.slice(0, equals) : argument;
    const option = valueOptions[key];
    if (option) {
      const value = equals > 0 ? argument.slice(equals + 1) : args[++index];
      if (value === undefined) throw new Error(`${key} requires a value.`);
      options[option] = value;
    } else if (booleanOptions[key]) {
      options[booleanOptions[key]] = true;
    } else if (argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`);
    } else {
      options.inputs.push(argument);
    }
  }
  return options;
}

let exitCode = 0;
try {
  const options = parseArguments(process.argv.slice(2));
  if (!options) {
    console.log(HELP);
  } else {
    const result = await run(options);
    const softwareMessage = result.software
      ? `\nSoftware: ${result.software.value} (${result.software.source})`
      : "";
    console.log(
      `${result.zipped ? "Created ZIP" : "Wrote"}: ${result.output}\n${result.files.length} JPEG(s) updated.${softwareMessage}`,
    );
  }
} catch (error) {
  exitCode = 1;
  console.error(`exif-editor: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await closeMetadataBackend();
}
process.exitCode = exitCode;
