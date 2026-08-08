export const APPLE_RELEASES_URL = "https://developer.apple.com/news/releases/";
export const IOS_BETA_FALLBACK = "27.0";

export const AUTHENTIC_SOFTWARE = {
  apple: IOS_BETA_FALLBACK,
  samsung: "S928BXXS7AXK2",
  google: "HDR+ 1.0.585804376zdh",
} as const;

export type ProgramNamePreset = {
  label: string;
  value: string;
};

export const PROGRAM_NAME_PRESETS: ProgramNamePreset[] = [
  { label: "Clear / Empty", value: "" },
  { label: "Adobe Photoshop", value: "Adobe Photoshop" },
  { label: "Adobe Lightroom", value: "Adobe Photoshop Lightroom" },
  { label: "GIMP", value: "GIMP 2.10" },
  { label: "Apple iOS", value: AUTHENTIC_SOFTWARE.apple },
  { label: "Samsung Galaxy", value: AUTHENTIC_SOFTWARE.samsung },
  { label: "Google Pixel", value: AUTHENTIC_SOFTWARE.google },
];

export const MIN_SOFTWARE_FIELD_COUNT = Math.max(
  32,
  ...PROGRAM_NAME_PRESETS.map((preset) => preset.value.length + 1),
  ...Object.values(AUTHENTIC_SOFTWARE).map((value) => value.length + 1),
);

export type SoftwareResolution = {
  value: string;
  source: "apple" | "fallback";
};

export function parseLatestIosBetaVersion(html: string): string | undefined {
  const versions = Array.from(
    html.matchAll(/\biOS\s+(\d+)\.(\d+)\s+beta(?:\s+\d+)?\b/gi),
    (match) => ({
      major: Number(match[1]),
      minor: Number(match[2]),
    }),
  );
  versions.sort(
    (left, right) => right.major - left.major || right.minor - left.minor,
  );
  const latest = versions[0];
  return latest ? `${latest.major}.${latest.minor}` : undefined;
}

export async function fetchLatestIosBetaVersion(
  fetchImplementation: typeof fetch = fetch,
): Promise<SoftwareResolution> {
  try {
    const response = await fetchImplementation(APPLE_RELEASES_URL, {
      headers: {
        Accept: "text/html",
        "User-Agent": "exif-editor/0.1",
      },
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) {
      throw new Error(`Apple releases returned HTTP ${response.status}`);
    }
    const value = parseLatestIosBetaVersion(await response.text());
    if (!value) {
      throw new Error("Apple releases did not include an iOS beta");
    }
    return { value, source: "apple" };
  } catch {
    return { value: IOS_BETA_FALLBACK, source: "fallback" };
  }
}

export function fitSoftwareToField(value: string, fieldCount: number): string {
  return value.substring(0, Math.max(0, fieldCount - 1));
}
