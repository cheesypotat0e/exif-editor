import { setupMainDom } from "./support/helpers";

let sanitizeFilename: typeof import("../main").sanitizeFilename;
let parseDecimalDegreeCoordinates: typeof import("../main").parseDecimalDegreeCoordinates;
let parseInputDateTimeValue: typeof import("../main").parseInputDateTimeValue;
let formatPickerDateTimeValue: typeof import("../main").formatPickerDateTimeValue;
let parseExifOffsetMinutes: typeof import("../main").parseExifOffsetMinutes;
let getUniqueFilenames: typeof import("../main").getUniqueFilenames;

beforeAll(async () => {
  setupMainDom();
  const main = await import("../main");
  sanitizeFilename = main.sanitizeFilename;
  parseDecimalDegreeCoordinates = main.parseDecimalDegreeCoordinates;
  parseInputDateTimeValue = main.parseInputDateTimeValue;
  formatPickerDateTimeValue = main.formatPickerDateTimeValue;
  parseExifOffsetMinutes = main.parseExifOffsetMinutes;
  getUniqueFilenames = main.getUniqueFilenames;
});

describe("sanitizeFilename", () => {
  it("returns fallback when name is empty", () => {
    expect(sanitizeFilename("", "holiday.jpg")).toBe("holiday.jpg");
  });

  it("replaces illegal path characters", () => {
    expect(sanitizeFilename("a/b:c*d", "fallback.jpg")).toBe("a-b-c-d.jpg");
  });

  it("preserves an extension when provided", () => {
    expect(sanitizeFilename("custom.png", "fallback.jpg")).toBe("custom.png");
  });

  it("appends fallback extension when missing", () => {
    expect(sanitizeFilename("custom", "fallback.jpg")).toBe("custom.jpg");
  });
});

describe("parseDecimalDegreeCoordinates", () => {
  const valid: Array<[string, number, number]> = [
    ["0,0", 0, 0],
    ["32.8679,-96.6186", 32.8679, -96.6186],
    ["32.8679, -96.6186", 32.8679, -96.6186],
    ["-33.8688,151.2093", -33.8688, 151.2093],
  ];

  for (const [input, latitude, longitude] of valid) {
    it(`parses ${input}`, () => {
      expect(parseDecimalDegreeCoordinates(input)).toEqual({
        latitude,
        longitude,
      });
    });
  }

  it("rejects out-of-range latitude", () => {
    expect(parseDecimalDegreeCoordinates("91,0")).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(parseDecimalDegreeCoordinates("north,west")).toBeNull();
  });
});

describe("parseInputDateTimeValue", () => {
  it("parses a local datetime-local value", () => {
    const date = parseInputDateTimeValue("2026-06-01T12:34:56");
    expect(date).toBeInstanceOf(Date);
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(5);
    expect(date?.getDate()).toBe(1);
    expect(date?.getHours()).toBe(12);
    expect(date?.getMinutes()).toBe(34);
    expect(date?.getSeconds()).toBe(56);
  });

  it("rejects malformed values", () => {
    expect(parseInputDateTimeValue("not-a-date")).toBeNull();
    expect(parseInputDateTimeValue("2026-01-01")).toBeNull();
  });
});

describe("formatPickerDateTimeValue", () => {
  it("round-trips with parseInputDateTimeValue", () => {
    const input = "2026-03-20T04:43:17";
    const formatted = formatPickerDateTimeValue(
      parseInputDateTimeValue(input)!,
    );
    expect(formatted).toBe(input);
  });
});

describe("parseExifOffsetMinutes", () => {
  it("parses positive and negative offsets", () => {
    expect(parseExifOffsetMinutes("+05:30")).toBe(330);
    expect(parseExifOffsetMinutes("-08:00")).toBe(-480);
  });

  it("rejects invalid offsets", () => {
    expect(parseExifOffsetMinutes(undefined)).toBeNull();
    expect(parseExifOffsetMinutes("UTC")).toBeNull();
  });
});

describe("getUniqueFilenames", () => {
  it("deduplicates colliding names", () => {
    expect(getUniqueFilenames(["a.jpg", "a.jpg", "b.jpg"])).toEqual([
      "a.jpg",
      "a (2).jpg",
      "b.jpg",
    ]);
  });

  it("handles empty names with a default", () => {
    expect(getUniqueFilenames(["", "photo.png"])).toEqual([
      "image.jpg",
      "photo.png",
    ]);
  });
});
