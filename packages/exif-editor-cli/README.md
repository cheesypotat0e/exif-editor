# EXIF Editor CLI

A non-destructive command-line tool for editing JPEG timestamps, GPS
coordinates, timestamp labels, filenames, and editor-identifying metadata. It
supports single JPEGs, explicit file lists, and one-level directory batches.

Inputs are never modified and existing output files are never overwritten.

## Requirements

- Node.js 22 or newer
- pnpm

## Quick start

From the repository root:

```sh
pnpm install
pnpm build:cli
pnpm cli -- --timestamp "+1h" photo.jpg
```

The result is written to `photo-edited.jpg`.

The package exposes an `exif-editor` executable when installed or linked. The
examples below use that shorter command. When running from this repository,
replace `exif-editor` with `pnpm cli --`.

## Usage

```text
exif-editor [options] <jpeg...|directory>
```

### Options quick reference

| Option | Value | Description |
| --- | --- | --- |
| `-t`, `--timestamp` | `<date\|offset>` | Set an ISO/EXIF timestamp or apply a relative shift such as `+1h30m` or `-1h30m30s`. |
| `-g`, `--gps` | `<latitude,longitude>` | Set signed decimal-degree GPS coordinates. |
| `-l`, `--label` | `<text\|file.txt>` | Burn in the photo timestamp followed by 1–4 non-empty label lines. An existing `.txt` path is read automatically. |
| `--label-file` | `<file.txt>` | Explicitly read the 1–4 label lines from a UTF-8 text file. |
| `-n`, `--name` | `<name\|IMG_0001>` | Rename one output, or set the starting iOS-style name for a group. |
| `--sanitize` | — | Remove the complete XMP packet, sync EXIF timestamps (`ModifyDate`, `CreateDate`, `DateTimeOriginal`), and set EXIF `Software` to the latest iOS beta version. |
| `--remove-xmp` | — | Remove XMP without changing the EXIF `Software` field. |
| `--software` | `<name>` | Set EXIF `Software` to a literal value or `latest-ios-beta`. |
| `-o`, `--output` | `<path>` | Select the output JPEG, directory, or ZIP path. |
| `-h`, `--help` | — | Display CLI help. |

## Inputs and outputs

| Input | Default output |
| --- | --- |
| One JPEG | A sibling file with an `-edited` suffix. |
| Multiple JPEG arguments | `exif-editor-output/` beside the first input. |
| One directory | A sibling `<directory>-edited.zip` archive. |

Directory input includes `.jpg` and `.jpeg` files directly inside the directory.
Nested directories are not traversed. Directory output is always a ZIP.

Use `--output` to override these defaults:

```sh
exif-editor --gps "47.6062,-122.3321" --output result.jpg photo.jpg
```

## Operation order

When options are combined, each image is processed in this order:

1. Timestamp
2. GPS coordinates
3. Timestamp label
4. XMP/software cleanup
5. Output naming

This ensures the label uses the updated timestamp and XMP cannot be
reintroduced by label rendering.

## Common use cases

### Set an absolute timestamp

```sh
exif-editor --timestamp "2027-01-02T03:04:05-05:00" photo.jpg
```

An absolute timestamp sets `DateTimeOriginal`, `CreateDate`, and `ModifyDate` to
the requested time. If GPS date/time exists, its original difference from the
capture timestamp is retained.

ISO and EXIF forms are accepted:

```sh
exif-editor --timestamp "2027:01:02 03:04:05-05:00" photo.jpg
```

### Shift one photo relatively

```sh
exif-editor --timestamp "+1h30m" photo.jpg
```

Supported components are hours (`h`), minutes (`m`), and seconds (`s`) with
exactly one leading sign:

```text
+1h
+1h30m
-1h30m
+1h30m30s
```

### Shift a group while preserving its spacing

```sh
exif-editor --timestamp "-1h30m30s" one.jpg two.jpg three.jpg
```

Every timestamp is shifted by the same amount, preserving the time distance
between photos and the differences among each photo's EXIF/GPS timestamps.

### Set decimal-degree GPS coordinates

```sh
exif-editor --gps "40.7128,-74.0060" photo.jpg
```

Latitude must be between `-90` and `90`; longitude must be between `-180` and
`180`. A space-separated value is also accepted when quoted.

### Add a timestamp and address label

Using inline Bash/Zsh text:

```sh
exif-editor \
  --label $'123 Main Street\nNew York, NY 10001\nUnited States' \
  photo.jpg
```

Using a portable text file:

```sh
exif-editor --label-file address.txt photo.jpg
```

The first rendered line is the photo's EXIF timestamp. The supplied text adds
1–4 address/description lines below it. Empty interior lines and more than four
lines are rejected.

### Update the timestamp before adding its label

```sh
exif-editor \
  --timestamp "2027-01-02T03:04:05-05:00" \
  --label-file address.txt \
  photo.jpg
```

The burned-in label displays the new timestamp.

### Rename one output

```sh
exif-editor --name vacation.jpg photo.jpg
```

The source remains at `photo.jpg`; the edited copy is written as
`vacation.jpg`.

### Rename a group in capture-time order

```sh
exif-editor --name IMG_2521 one.jpg two.jpg three.jpg
```

For groups, the starting name must match `IMG_0000`. The oldest photo receives
the starting number and later photos increment from it. Names wrap from
`IMG_9999.JPG` to `IMG_0001.JPG`.

### Process a directory and create a ZIP

```sh
exif-editor \
  --timestamp "+1h" \
  --name IMG_2521 \
  --output updated.zip \
  ./photos
```

All JPEGs directly inside `./photos` are shifted, sorted by capture time,
renamed, and placed in `updated.zip`.

### Remove Photoshop XMP metadata

Remove the full XMP packet without changing the software name:

```sh
exif-editor --remove-xmp edited-in-photoshop.jpg
```

This removes XMP history, Adobe document/instance IDs, creator-tool fields, and
other XMP namespaces. Camera EXIF, GPS, ICC, IPTC, and Photoshop image-resource
blocks remain intact.

### Sanitize Photoshop output

```sh
exif-editor --sanitize edited-in-photoshop.jpg
```

`--sanitize` is equivalent to:

```sh
exif-editor \
  --remove-xmp \
  --software latest-ios-beta \
  edited-in-photoshop.jpg
```

The CLI attempts to fetch the latest iOS beta version from Apple Developer
Releases once per command. If the request fails or cannot be parsed, the
built-in fallback is `27.0`. The resolved value and source (`apple`, `fallback`,
or `literal`) are printed after processing.

For reproducible output without a network lookup:

```sh
exif-editor --remove-xmp --software 27.0 edited-in-photoshop.jpg
```

### Sanitize a list of files

```sh
exif-editor --sanitize first.jpg second.jpg third.jpg
```

Every output is sanitized, and the iOS beta lookup is performed only once for
the group.

### Sanitize a directory into a ZIP

```sh
exif-editor --sanitize --output sanitized.zip ./photos
```

Every JPEG directly inside `./photos` is sanitized before being added to the
archive.

### Combine all major edits

```sh
exif-editor \
  --timestamp "+1h30m" \
  --gps "47.6062,-122.3321" \
  --label-file address.txt \
  --sanitize \
  --name IMG_2521 \
  --output updated.zip \
  ./photos
```

## Timestamp and GPS behavior

- Absolute timestamps synchronize the three primary EXIF timestamps.
- Relative changes shift each existing timestamp by the same duration.
- GPS date/time is stored in UTC.
- The original GPS-to-capture-time difference is retained during timestamp
  changes, including when GPS time is earlier than the other timestamp fields.
- A timestamp option does not invent GPS date/time when none exists.

## Safety and validation

- Inputs must contain valid JPEG data, not only a `.jpg` or `.jpeg` extension.
- Source files are copied to temporary working files before editing.
- Existing output JPEGs and ZIPs are not overwritten.
- A directory cannot be combined with other input arguments.
- A label requires an existing EXIF timestamp.
- XMP/software cleanup is applied to every member of file-list and directory
  groups.

## Development

Run the CLI test suite:

```sh
pnpm test:cli
```

Regenerate the mock JPEG fixtures:

```sh
pnpm --filter exif-editor-cli fixtures
```

The suite currently contains more than 190 independently reported unit and
integration tests. Fixtures cover all eight EXIF orientations, positive and
negative timezone offsets, GPS times before and after capture time, coordinate
boundaries and hemispheres, missing or partial EXIF, Photoshop XMP, tiny
images, mixed extension casing, spaces and Unicode filenames, and malformed or
truncated JPEG input.
