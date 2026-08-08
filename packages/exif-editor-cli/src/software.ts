export const APPLE_RELEASES_URL = "https://developer.apple.com/news/releases/";
export const IOS_BETA_FALLBACK = "27.0";
export const LATEST_IOS_BETA = "latest-ios-beta";

export type SoftwareResolution = {
  value: string;
  source: "literal" | "apple" | "fallback";
};

export function parseLatestIosBetaVersion(html: string): string | undefined {
  const versions = Array.from(
    html.matchAll(/\biOS\s+(\d+)\.(\d+)\s+beta(?:\s+\d+)?\b/gi),
    (match) => ({
      major: Number(match[1]),
      minor: Number(match[2]),
    }),
  );
  versions.sort((left, right) => right.major - left.major || right.minor - left.minor);
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
        "User-Agent": "exif-editor-cli/0.1",
      },
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) {
      throw new Error(`Apple releases returned HTTP ${response.status}`);
    }
    const value = parseLatestIosBetaVersion(await response.text());
    if (!value) throw new Error("Apple releases did not include an iOS beta");
    return { value, source: "apple" };
  } catch {
    return { value: IOS_BETA_FALLBACK, source: "fallback" };
  }
}

export async function resolveSoftwareValue(
  requested: string,
  latestResolver: () => Promise<SoftwareResolution> = fetchLatestIosBetaVersion,
): Promise<SoftwareResolution> {
  const value = requested.trim();
  if (!value) throw new Error("Software name cannot be empty.");
  return value.toLowerCase() === LATEST_IOS_BETA
    ? latestResolver()
    : { value, source: "literal" };
}
