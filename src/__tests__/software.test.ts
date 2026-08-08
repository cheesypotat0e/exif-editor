import {
  AUTHENTIC_SOFTWARE,
  fetchLatestIosBetaVersion,
  fitSoftwareToField,
  IOS_BETA_FALLBACK,
  parseLatestIosBetaVersion,
  PROGRAM_NAME_PRESETS,
} from "../software";

describe("parseLatestIosBetaVersion", () => {
  it.each([
    ["iOS 27.0 beta 4 (24A5390f)", "27.0"],
    ["<h2>iOS 27.0 beta</h2>", "27.0"],
    ["iOS 26.6 beta 2 and iOS 27.0 beta 3", "27.0"],
    ["iPadOS 27.0 beta 4", undefined],
    ["iOS 27.0", undefined],
  ])("parses %s", (html, expected) => {
    expect(parseLatestIosBetaVersion(html)).toBe(expected);
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
});

describe("fitSoftwareToField", () => {
  it("truncates values to the EXIF field capacity", () => {
    expect(fitSoftwareToField("HDR+ 1.0.585804376zdh", 13)).toBe(
      "HDR+ 1.0.585",
    );
  });
});
