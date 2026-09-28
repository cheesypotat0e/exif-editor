import {
  AUTHENTIC_SOFTWARE,
  fetchLatestIosBetaVersion,
  fetchLatestPixelVersion,
  fetchLatestSamsungVersion,
  fitSoftwareToField,
  IOS_BETA_FALLBACK,
  MIN_SOFTWARE_FIELD_COUNT,
  parseLatestIosBetaVersion,
  parseLatestPixelVersion,
  parseLatestSamsungVersion,
  PROGRAM_NAME_PRESETS,
} from "../software";

describe("parseLatestIosBetaVersion", () => {
  it.each([
    ["iOS 27.0 beta 4 (24A5390f)", "27.0"],
    ["<h2>iOS 27.0 beta</h2>", "27.0"],
    ["iOS 26.6 beta 2 and iOS 27.0 beta 3", "27.0"],
    ["iPadOS 27.0 beta 4", undefined],
    ["iOS 27.0", undefined],
    [
      "<rss><channel><item><title>iOS 27.2 beta 2 (24B5089g)</title></item></channel></rss>",
      "27.2",
    ],
    [
      "<rss><channel><item><title>iOS 27.0 (24A437)</title></item><item><title>iOS 27.2 beta 2 (24B5089g)</title></item></channel></rss>",
      "27.2",
    ],
    [
      "<rss><channel><item><title>iPadOS 27.2 beta 2 (24B5089g)</title></item></channel></rss>",
      undefined,
    ],
  ])("parses %s", (html, expected) => {
    expect(parseLatestIosBetaVersion(html)).toBe(expected);
  });
});

describe("parseLatestSamsungVersion", () => {
  it.each([
    [
      "<div class='col-md-3'><strong>Build Number : </strong>S928BXXS6DZH2</div>",
      "S928BXXS6DZH2",
    ],
    ["Build Number : S928BXXU4BYE7", "S928BXXU4BYE7"],
    ["firmware S928BXXS7AXK2 ready", "S928BXXS7AXK2"],
    ["no build here", undefined],
  ])("parses %s", (html, expected) => {
    expect(parseLatestSamsungVersion(html)).toBe(expected);
  });
});

describe("parseLatestPixelVersion", () => {
  it.each([
    ["Google Camera version 9.9.106.773153235 installed", "HDR+ 1.0.773153235zdh"],
    ["version 9.4.103.641377609 on Play Store", "HDR+ 1.0.641377609zdh"],
    ["EXIF Software: HDR+ 1.0.585804376zdh", "HDR+ 1.0.585804376zdh"],
    ["no version found", undefined],
  ])("parses %s", (html, expected) => {
    expect(parseLatestPixelVersion(html)).toBe(expected);
  });
});

describe("fetchLatestIosBetaVersion", () => {
  it("returns the latest iOS beta from Apple releases", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => "iOS 27.0 beta 4",
    });

    await expect(fetchLatestIosBetaVersion(fetchMock)).resolves.toEqual({
      value: "27.0",
      source: "apple",
    });
  });

  it("falls back when Apple releases are unavailable", async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error("offline"));

    await expect(fetchLatestIosBetaVersion(fetchMock)).resolves.toEqual({
      value: IOS_BETA_FALLBACK,
      source: "fallback",
    });
  });
});

describe("fetchLatestSamsungVersion", () => {
  it("returns the latest Samsung build from release notes", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        "<div class='col-md-3'><strong>Build Number : </strong>S928BXXS6DZH2</div>",
    });

    await expect(fetchLatestSamsungVersion(fetchMock)).resolves.toEqual({
      value: "S928BXXS6DZH2",
      source: "samsung",
    });
  });

  it("falls back when Samsung releases are unavailable", async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error("offline"));

    await expect(fetchLatestSamsungVersion(fetchMock)).resolves.toEqual({
      value: AUTHENTIC_SOFTWARE.samsung,
      source: "fallback",
    });
  });
});

describe("fetchLatestPixelVersion", () => {
  it("returns the latest Pixel HDR+ version from Google Camera release", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => "Google Camera 9.9.106.773153235",
    });

    await expect(fetchLatestPixelVersion(fetchMock)).resolves.toEqual({
      value: "HDR+ 1.0.773153235zdh",
      source: "google",
    });
  });

  it("falls back when Google Camera page is unavailable", async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error("offline"));

    await expect(fetchLatestPixelVersion(fetchMock)).resolves.toEqual({
      value: AUTHENTIC_SOFTWARE.google,
      source: "fallback",
    });
  });
});

describe("program name presets", () => {
  it("includes accurate Apple, Samsung, and Google values", () => {
    expect(
      PROGRAM_NAME_PRESETS.find((preset) => preset.label === "Apple iOS")?.value,
    ).toBe(AUTHENTIC_SOFTWARE.apple);
    expect(
      PROGRAM_NAME_PRESETS.find((preset) => preset.label === "Samsung Galaxy")
        ?.value,
    ).toBe(AUTHENTIC_SOFTWARE.samsung);
    expect(
      PROGRAM_NAME_PRESETS.find((preset) => preset.label === "Google Pixel")
        ?.value,
    ).toBe(AUTHENTIC_SOFTWARE.google);
  });

  it("reserves enough EXIF capacity for the longest preset", () => {
    const longestPreset = PROGRAM_NAME_PRESETS.reduce(
      (max, preset) => Math.max(max, preset.value.length),
      0,
    );
    expect(MIN_SOFTWARE_FIELD_COUNT).toBeGreaterThan(longestPreset);
  });
});

describe("fitSoftwareToField", () => {
  it("truncates values to the EXIF field capacity", () => {
    expect(fitSoftwareToField("HDR+ 1.0.585804376zdh", 13)).toBe(
      "HDR+ 1.0.585",
    );
  });
});
