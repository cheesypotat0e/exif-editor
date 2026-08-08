import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  escapeXml,
  formatTimestampLabel,
  normalizeSingleName,
  parseCoordinates,
  parseLabelLines,
  parseRelativeTimestamp,
  sequenceNames,
  type TimestampParts,
} from "../core.js";

describe("relative timestamp parsing", () => {
  const valid: Array<[string, number]> = [
    ["+1h", 3_600_000],
    ["-1h", -3_600_000],
    ["+30m", 1_800_000],
    ["-45m", -2_700_000],
    ["+30s", 30_000],
    ["-59s", -59_000],
    ["+1h30m", 5_400_000],
    ["-1h30m", -5_400_000],
    ["+1h30m30s", 5_430_000],
    ["-23h59m59s", -86_399_000],
    ["+0h0m1s", 1_000],
    ["+100h", 360_000_000],
  ];
  for (const [input, expected] of valid) {
    test(`parses ${input}`, () => {
      assert.equal(parseRelativeTimestamp(input), expected);
    });
  }

  const invalid = [
    "",
    "1h",
    "+",
    "-",
    "+1h-30m",
    "+1H",
    "+1 h",
    " +1h",
    "+1h ",
    "+1d",
  ];
  for (const input of invalid) {
    test(`rejects ${JSON.stringify(input)}`, () => {
      assert.equal(parseRelativeTimestamp(input), null);
    });
  }
});

describe("decimal-degree GPS parsing", () => {
  const valid: Array<[string, number, number]> = [
    ["0,0", 0, 0],
    ["90,180", 90, 180],
    ["-90,-180", -90, -180],
    ["32.8679,-96.6186", 32.8679, -96.6186],
    ["32.8679, -96.6186", 32.8679, -96.6186],
    ["32.8679 -96.6186", 32.8679, -96.6186],
    ["-33.8688,151.2093", -33.8688, 151.2093],
    [" 51.5074 , -0.1278 ", 51.5074, -0.1278],
    ["0.000001,-0.000001", 0.000001, -0.000001],
    ["89.999999,179.999999", 89.999999, 179.999999],
  ];
  for (const [input, latitude, longitude] of valid) {
    test(`parses ${input}`, () => {
      assert.deepEqual(parseCoordinates(input), { latitude, longitude });
    });
  }

  const invalid = [
    "91,0",
    "-91,0",
    "0,181",
    "0,-181",
    "12",
    "12,13,14",
    "north,west",
    "NaN,0",
    "Infinity,0",
    ",",
  ];
  for (const input of invalid) {
    test(`rejects ${input}`, () => {
      assert.throws(() => parseCoordinates(input), /GPS|latitude/);
    });
  }
});

describe("label line parsing", () => {
  const valid: Array<[string, string[]]> = [
    ["one", ["one"]],
    ["one\n", ["one"]],
    [" one ", ["one"]],
    ["one\ntwo", ["one", "two"]],
    ["one\r\ntwo\r\n", ["one", "two"]],
    ["one\rtwo", ["one", "two"]],
    ["1\n2\n3\n4", ["1", "2", "3", "4"]],
    ["1\n2\n3\n4\n", ["1", "2", "3", "4"]],
  ];
  for (const [input, expected] of valid) {
    test(`accepts ${JSON.stringify(input)}`, () => {
      assert.deepEqual(parseLabelLines(input), expected);
    });
  }

  const invalid = ["", "\n", " \n", "one\n\nthree", "\none", "1\n2\n3\n4\n5"];
  for (const input of invalid) {
    test(`rejects ${JSON.stringify(input)}`, () => {
      assert.throws(() => parseLabelLines(input), /1–4|non-empty/);
    });
  }
});

describe("group sequence naming", () => {
  const valid: Array<[string, number, string[]]> = [
    ["IMG_0001", 1, ["IMG_0001.JPG"]],
    ["IMG_0042", 2, ["IMG_0042.JPG", "IMG_0043.JPG"]],
    ["img_2521", 2, ["IMG_2521.JPG", "IMG_2522.JPG"]],
    ["IMG_9999", 2, ["IMG_9999.JPG", "IMG_0001.JPG"]],
    ["IMG_9998", 4, ["IMG_9998.JPG", "IMG_9999.JPG", "IMG_0001.JPG", "IMG_0002.JPG"]],
    ["IMG_0000", 2, ["IMG_0000.JPG", "IMG_0001.JPG"]],
    ["IMG_5000", 0, []],
    ["IMG_9990", 10, Array.from({ length: 10 }, (_, index) => `IMG_${9990 + index}.JPG`)],
  ];
  for (const [start, count, expected] of valid) {
    test(`generates ${count} name(s) from ${start}`, () => {
      assert.deepEqual(sequenceNames(start, count), expected);
    });
  }

  const invalid = ["IMG_1", "IMG_00001", "image_0001", "IMG-0001", "IMG_12A4", " IMG_0001"];
  for (const input of invalid) {
    test(`rejects group start ${JSON.stringify(input)}`, () => {
      assert.throws(() => sequenceNames(input, 2), /IMG_2521/);
    });
  }

  test("rejects a sequence large enough to repeat a filename", () => {
    assert.throws(() => sequenceNames("IMG_0001", 10_000), /9,999/);
  });
});

describe("single-file naming", () => {
  const valid: Array<[string, string]> = [
    ["holiday", "holiday.JPG"],
    ["holiday.jpg", "holiday.jpg"],
    ["holiday.jpeg", "holiday.jpeg"],
    ["holiday.JPEG", "holiday.JPEG"],
    [" holiday ", "holiday.JPG"],
    ["IMG_0001", "IMG_0001.JPG"],
    ["space name", "space name.JPG"],
    ["ümlaut-照片", "ümlaut-照片.JPG"],
  ];
  for (const [input, expected] of valid) {
    test(`normalizes ${JSON.stringify(input)}`, () => {
      assert.equal(normalizeSingleName(input), expected);
    });
  }

  const invalid = ["", " ", ".", "..", "../photo", "folder/photo", "folder\\photo"];
  for (const input of invalid) {
    test(`rejects ${JSON.stringify(input)}`, () => {
      assert.throws(() => normalizeSingleName(input), /filename/);
    });
  }
});

describe("timestamp label formatting", () => {
  const cases: Array<[TimestampParts, string]> = [
    [{ year: 2026, month: 1, day: 1, hour: 0, minute: 0, second: 0 }, "Jan 1, 2026 at 12:00:00 AM"],
    [{ year: 2026, month: 2, day: 9, hour: 1, minute: 2, second: 3 }, "Feb 9, 2026 at 1:02:03 AM"],
    [{ year: 2024, month: 2, day: 29, hour: 11, minute: 59, second: 59 }, "Feb 29, 2024 at 11:59:59 AM"],
    [{ year: 2026, month: 3, day: 20, hour: 12, minute: 0, second: 0 }, "Mar 20, 2026 at 12:00:00 PM"],
    [{ year: 2026, month: 6, day: 30, hour: 16, minute: 3, second: 9 }, "Jun 30, 2026 at 4:03:09 PM"],
    [{ year: 1999, month: 9, day: 9, hour: 21, minute: 9, second: 9 }, "Sep 9, 1999 at 9:09:09 PM"],
    [{ year: 2038, month: 12, day: 31, hour: 23, minute: 59, second: 58 }, "Dec 31, 2038 at 11:59:58 PM"],
    [{ year: 2000, month: 10, day: 10, hour: 10, minute: 10, second: 10 }, "Oct 10, 2000 at 10:10:10 AM"],
  ];
  for (const [parts, expected] of cases) {
    test(`formats ${JSON.stringify(parts)}`, () => {
      assert.equal(formatTimestampLabel(parts), expected);
    });
  }
});

describe("SVG escaping", () => {
  const cases: Array<[string, string]> = [
    ["plain text", "plain text"],
    ["A & B", "A &amp; B"],
    ["<address>", "&lt;address&gt;"],
    ['"quoted"', "&quot;quoted&quot;"],
    ["Sam's <A&B>", "Sam&apos;s &lt;A&amp;B&gt;"],
  ];
  for (const [input, expected] of cases) {
    test(`escapes ${input}`, () => {
      assert.equal(escapeXml(input), expected);
    });
  }
});
