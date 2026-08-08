import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ExifDateTime, type Tags } from "exiftool-vendored";
import { buildTimestampPlan, timestampParts } from "../metadata.js";

function date(value: string, zone?: string): ExifDateTime {
  const result = ExifDateTime.fromExifStrict(value, zone);
  assert.ok(result);
  return result;
}

function standardTags(): {
  tags: Tags;
  original: ExifDateTime;
  create: ExifDateTime;
  modify: ExifDateTime;
  gps: ExifDateTime;
} {
  const original = date("2026:03:20 04:43:17", "UTC-5");
  const create = date("2026:03:20 04:43:18", "UTC-5");
  const modify = date("2026:03:20 04:47:46", "UTC-5");
  const gps = date("2026:03:20 09:43:02Z");
  return {
    tags: {
      DateTimeOriginal: original,
      CreateDate: create,
      ModifyDate: modify,
      GPSDateTime: gps,
    } as Tags,
    original,
    create,
    modify,
    gps,
  };
}

describe("absolute timestamp plans", () => {
  const cases: Array<[string, string]> = [
    ["2027-01-02T03:04:05-05:00", "2027:01:02 03:04:05-05:00"],
    ["2027-01-02 03:04:05-05:00", "2027:01:02 03:04:05-05:00"],
    ["2027:01:02 03:04:05-05:00", "2027:01:02 03:04:05-05:00"],
    ["2024-02-29T23:59:59Z", "2024:02:29 23:59:59+00:00"],
    ["2038-01-19T03:14:07+00:00", "2038:01:19 03:14:07+00:00"],
    ["2000-01-01T00:00:00+05:30", "2000:01:01 00:00:00+05:30"],
  ];
  for (const [input, expected] of cases) {
    test(`sets all primary timestamps from ${input}`, async () => {
      const plan = await buildTimestampPlan(standardTags().tags, input);
      assert.equal(plan.anchor.toExifString(), expected);
      assert.equal(plan.values.CreateDate.toMillis(), plan.anchor.toMillis());
      assert.equal(plan.values.ModifyDate.toMillis(), plan.anchor.toMillis());
    });
  }

  test("uses the source zone when an absolute timestamp omits one", async () => {
    const plan = await buildTimestampPlan(standardTags().tags, "2027-01-02T03:04:05");
    assert.equal(plan.anchor.toExifString(), "2027:01:02 03:04:05-05:00");
  });

  test("preserves a GPS time that was earlier than capture time", async () => {
    const { tags, original, gps } = standardTags();
    const plan = await buildTimestampPlan(tags, "2027-01-02T03:04:05-05:00");
    assert.ok(plan.gps);
    assert.equal(plan.gps.toMillis() - plan.anchor.toMillis(), gps.toMillis() - original.toMillis());
  });
});

describe("relative timestamp plans", () => {
  const shifts = ["+1s", "-1s", "+30m", "-1h", "+1h30m", "-23h59m59s"];
  for (const shift of shifts) {
    test(`shifts every timestamp by ${shift}`, async () => {
      const { tags, original, create, modify, gps } = standardTags();
      const plan = await buildTimestampPlan(tags, shift);
      const delta = plan.anchor.toMillis() - original.toMillis();
      assert.equal(plan.values.CreateDate.toMillis() - create.toMillis(), delta);
      assert.equal(plan.values.ModifyDate.toMillis() - modify.toMillis(), delta);
      assert.equal(plan.gps!.toMillis() - gps.toMillis(), delta);
    });
  }

  test("retains the one-second CreateDate difference", async () => {
    const { tags } = standardTags();
    const plan = await buildTimestampPlan(tags, "+1h");
    assert.equal(plan.values.CreateDate.toMillis() - plan.anchor.toMillis(), 1_000);
  });

  test("retains the ModifyDate difference", async () => {
    const { tags, modify, original } = standardTags();
    const plan = await buildTimestampPlan(tags, "-30m");
    assert.equal(
      plan.values.ModifyDate.toMillis() - plan.anchor.toMillis(),
      modify.toMillis() - original.toMillis(),
    );
  });
});

describe("timestamp anchor fallbacks and errors", () => {
  test("falls back to CreateDate", async () => {
    const create = date("2020:05:06 07:08:09", "UTC+2");
    const plan = await buildTimestampPlan({ CreateDate: create } as Tags, "+1h");
    assert.equal(plan.anchor.toMillis(), create.toMillis() + 3_600_000);
  });

  test("falls back to ModifyDate", async () => {
    const modify = date("2020:05:06 07:08:09", "UTC-3");
    const plan = await buildTimestampPlan({ ModifyDate: modify } as Tags, "-1h");
    assert.equal(plan.anchor.toMillis(), modify.toMillis() - 3_600_000);
  });

  test("fills missing primary timestamp values from the anchor", async () => {
    const original = date("2020:05:06 07:08:09", "UTC");
    const plan = await buildTimestampPlan({ DateTimeOriginal: original } as Tags, "+1m");
    assert.equal(plan.values.CreateDate.toMillis(), plan.anchor.toMillis());
    assert.equal(plan.values.ModifyDate.toMillis(), plan.anchor.toMillis());
  });

  test("does not invent GPS time when it is absent", async () => {
    const original = date("2020:05:06 07:08:09", "UTC");
    assert.equal((await buildTimestampPlan({ DateTimeOriginal: original } as Tags, "+1m")).gps, undefined);
  });

  test("rejects metadata with no usable timestamp", async () => {
    await assert.rejects(() => buildTimestampPlan({} as Tags, "+1h"), /no usable EXIF/);
  });

  test("rejects an invalid absolute timestamp", async () => {
    await assert.rejects(
      () => buildTimestampPlan(standardTags().tags, "tomorrow afternoon"),
      /Timestamp must be/,
    );
  });

  test("extracts timestamp parts without timezone conversion", () => {
    assert.deepEqual(timestampParts(date("2024:02:29 23:59:58", "UTC+5:30")), {
      year: 2024,
      month: 2,
      day: 29,
      hour: 23,
      minute: 59,
      second: 58,
    });
  });
});
