import { AUTHENTIC_SOFTWARE } from "./software-constants";

export { AUTHENTIC_SOFTWARE };

export const APPLE_RELEASES_URL =
  "https://developer.apple.com/news/releases/rss/releases.rss";
export const SAMSUNG_RELEASES_URL =
  "https://doc.samsungmobile.com/SM-S928B/029279240224/eng.html";
export const GOOGLE_CAMERA_URL =
  "https://play.google.com/store/apps/details?id=com.google.android.GoogleCamera&hl=en";

export const IOS_BETA_FALLBACK = "27.0";

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
  source: "apple" | "samsung" | "google" | "fallback" | string;
};

export function parseLatestIosBetaVersion(
  rssOrText: string,
): string | undefined {
  const titleMatches = Array.from(
    rssOrText.matchAll(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/gi),
  );

  const candidates: string[] = [];
  if (titleMatches.length > 0) {
    for (const match of titleMatches) {
      const title = match[1].trim();
      if (/^iOS .*beta/i.test(title)) {
        candidates.push(title);
      }
    }
  } else {
    const lines = rssOrText.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.replace(/<[^>]+>/g, "").trim();
      if (/^iOS .*beta/i.test(trimmed)) {
        candidates.push(trimmed);
      }
    }
    if (candidates.length === 0) {
      const stripped = rssOrText.replace(/<[^>]+>/g, "").trim();
      if (/^iOS .*beta/i.test(stripped)) {
        candidates.push(stripped);
      }
    }
  }

  const parsedVersions: Array<{
    major: number;
    minor: number;
    patch?: number;
    version: string;
  }> = [];

  for (const candidate of candidates) {
    const matches = Array.from(
      candidate.matchAll(
        /\biOS\s+(\d+)(?:\.(\d+))?(?:\.(\d+))?\s+beta(?:\s+\d+)?\b/gi,
      ),
    );
    for (const m of matches) {
      const major = Number(m[1]);
      const minor = m[2] !== undefined ? Number(m[2]) : 0;
      const patch = m[3] !== undefined ? Number(m[3]) : undefined;
      parsedVersions.push({
        major,
        minor,
        patch,
        version:
          patch !== undefined
            ? `${major}.${minor}.${patch}`
            : `${major}.${minor}`,
      });
    }
  }

  parsedVersions.sort(
    (a, b) =>
      b.major - a.major ||
      b.minor - a.minor ||
      (b.patch ?? 0) - (a.patch ?? 0),
  );

  return parsedVersions[0]?.version;
}

export function parseLatestSamsungVersion(html: string): string | undefined {
  const match =
    html.match(/Build Number\s*:\s*<\/strong>\s*([A-Z0-9]+)/i) ||
    html.match(/\b(S928B[A-Z0-9]+)\b/i);
  return match ? match[1] : undefined;
}

export function parseLatestPixelVersion(html: string): string | undefined {
  const directMatch = html.match(/\bHDR\+\s*1\.0\.\d+[a-z]*\b/i);
  if (directMatch) {
    return directMatch[0];
  }
  const match = html.match(/\b\d+\.\d+\.\d+\.(\d{8,10})\b/);
  return match ? `HDR+ 1.0.${match[1]}zdh` : undefined;
}

function getGlobalFetch(): typeof fetch {
  if (typeof fetch !== "undefined") {
    return fetch;
  }
  if (typeof globalThis !== "undefined" && globalThis.fetch) {
    return globalThis.fetch.bind(globalThis);
  }
  if (typeof window !== "undefined" && window.fetch) {
    return window.fetch.bind(window);
  }
  return async () => new Response("", { status: 500 });
}

export async function fetchLatestIosBetaVersion(
  fetchImplementation?: typeof fetch,
): Promise<SoftwareResolution> {
  const fetcher = fetchImplementation ?? getGlobalFetch();
  try {
    const response = await fetcher(APPLE_RELEASES_URL, {
      headers: {
        Accept:
          "application/rss+xml, application/xml, text/xml, text/html, */*",
        "User-Agent": "exif-editor/0.1",
      },
      signal: AbortSignal.timeout(6_000),
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

export async function fetchLatestSamsungVersion(
  fetchImplementation?: typeof fetch,
): Promise<SoftwareResolution> {
  const fetcher = fetchImplementation ?? getGlobalFetch();
  try {
    const response = await fetcher(SAMSUNG_RELEASES_URL, {
      headers: {
        Accept: "text/html",
        "User-Agent": "exif-editor/0.1",
      },
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) {
      throw new Error(`Samsung releases returned HTTP ${response.status}`);
    }
    const value = parseLatestSamsungVersion(await response.text());
    if (!value) {
      throw new Error("Samsung releases did not include build number");
    }
    return { value, source: "samsung" };
  } catch {
    return { value: AUTHENTIC_SOFTWARE.samsung, source: "fallback" };
  }
}

export async function fetchLatestPixelVersion(
  fetchImplementation?: typeof fetch,
): Promise<SoftwareResolution> {
  const fetcher = fetchImplementation ?? getGlobalFetch();
  try {
    const response = await fetcher(GOOGLE_CAMERA_URL, {
      headers: {
        Accept: "text/html",
        "User-Agent": "Mozilla/5.0",
      },
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) {
      throw new Error(`Google Camera returned HTTP ${response.status}`);
    }
    const value = parseLatestPixelVersion(await response.text());
    if (!value) {
      throw new Error("Google Camera did not include version");
    }
    return { value, source: "google" };
  } catch {
    return { value: AUTHENTIC_SOFTWARE.google, source: "fallback" };
  }
}

export function fitSoftwareToField(value: string, fieldCount: number): string {
  return value.substring(0, Math.max(0, fieldCount - 1));
}
