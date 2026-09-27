export const APPLE_RELEASES_URL = "https://developer.apple.com/news/releases/";
export const SAMSUNG_RELEASES_URL =
  "https://doc.samsungmobile.com/SM-S928B/029279240224/eng.html";
export const GOOGLE_CAMERA_URL =
  "https://play.google.com/store/apps/details?id=com.google.android.GoogleCamera&hl=en";

export const APPLE_PROXY_URL = "/api/proxy/apple";
export const SAMSUNG_PROXY_URL = "/api/proxy/samsung";
export const GOOGLE_PROXY_URL = "/api/proxy/google";

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
  source: "apple" | "samsung" | "google" | "fallback" | string;
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

function isCustomFetch(fetchImplementation?: typeof fetch): boolean {
  if (!fetchImplementation) {
    return false;
  }
  if (typeof window !== "undefined" && fetchImplementation === window.fetch) {
    return false;
  }
  if (
    typeof globalThis !== "undefined" &&
    fetchImplementation === globalThis.fetch
  ) {
    return false;
  }
  return true;
}

export async function fetchLatestIosBetaVersion(
  fetchImplementation?: typeof fetch,
): Promise<SoftwareResolution> {
  const fetcher = fetchImplementation ?? getGlobalFetch();
  if (isCustomFetch(fetchImplementation)) {
    try {
      const response = await fetcher(APPLE_RELEASES_URL, {
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

  // Browser or Node default fetch: try proxy in browser to avoid CORS issues
  const candidates: string[] =
    typeof window !== "undefined"
      ? [
          APPLE_PROXY_URL,
          `https://api.allorigins.win/raw?url=${encodeURIComponent(APPLE_RELEASES_URL)}`,
          APPLE_RELEASES_URL,
        ]
      : [APPLE_RELEASES_URL];

  for (const url of candidates) {
    try {
      const response = await fetcher(url, {
        headers: {
          Accept: "text/html",
          "User-Agent": "exif-editor/0.1",
        },
        signal: AbortSignal.timeout(4_000),
      });
      if (response.ok) {
        const text = await response.text();
        const value = parseLatestIosBetaVersion(text);
        if (value) {
          return { value, source: "apple" };
        }
      }
    } catch {
      // Try next candidate
    }
  }

  // If in browser and proxy/html failed, try endoflife.date (CORS-friendly public API)
  if (typeof window !== "undefined") {
    try {
      const res = await fetcher("https://endoflife.date/api/ios.json", {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(3_000),
      });
      if (res.ok) {
        const data = (await res.json()) as Array<{ latest?: string }>;
        if (data[0]?.latest) {
          return { value: data[0].latest, source: "apple" };
        }
      }
    } catch {
      // Ignore
    }
  }

  return { value: IOS_BETA_FALLBACK, source: "fallback" };
}

export async function fetchLatestSamsungVersion(
  fetchImplementation?: typeof fetch,
): Promise<SoftwareResolution> {
  const fetcher = fetchImplementation ?? getGlobalFetch();
  if (isCustomFetch(fetchImplementation)) {
    try {
      const response = await fetcher(SAMSUNG_RELEASES_URL, {
        headers: {
          Accept: "text/html",
          "User-Agent": "exif-editor/0.1",
        },
        signal: AbortSignal.timeout(4_000),
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

  const candidates: string[] =
    typeof window !== "undefined"
      ? [
          SAMSUNG_PROXY_URL,
          `https://api.allorigins.win/raw?url=${encodeURIComponent(SAMSUNG_RELEASES_URL)}`,
          SAMSUNG_RELEASES_URL,
        ]
      : [SAMSUNG_RELEASES_URL];

  for (const url of candidates) {
    try {
      const response = await fetcher(url, {
        headers: {
          Accept: "text/html",
          "User-Agent": "exif-editor/0.1",
        },
        signal: AbortSignal.timeout(4_000),
      });
      if (response.ok) {
        const text = await response.text();
        const value = parseLatestSamsungVersion(text);
        if (value) {
          return { value, source: "samsung" };
        }
      }
    } catch {
      // Try next candidate
    }
  }

  return { value: AUTHENTIC_SOFTWARE.samsung, source: "fallback" };
}

export async function fetchLatestPixelVersion(
  fetchImplementation?: typeof fetch,
): Promise<SoftwareResolution> {
  const fetcher = fetchImplementation ?? getGlobalFetch();
  if (isCustomFetch(fetchImplementation)) {
    try {
      const response = await fetcher(GOOGLE_CAMERA_URL, {
        headers: {
          Accept: "text/html",
          "User-Agent": "Mozilla/5.0",
        },
        signal: AbortSignal.timeout(4_000),
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

  const candidates: string[] =
    typeof window !== "undefined"
      ? [
          GOOGLE_PROXY_URL,
          `https://api.allorigins.win/raw?url=${encodeURIComponent(GOOGLE_CAMERA_URL)}`,
          GOOGLE_CAMERA_URL,
        ]
      : [GOOGLE_CAMERA_URL];

  for (const url of candidates) {
    try {
      const response = await fetcher(url, {
        headers: {
          Accept: "text/html",
          "User-Agent": "Mozilla/5.0",
        },
        signal: AbortSignal.timeout(4_000),
      });
      if (response.ok) {
        const text = await response.text();
        const value = parseLatestPixelVersion(text);
        if (value) {
          return { value, source: "google" };
        }
      }
    } catch {
      // Try next candidate
    }
  }

  return { value: AUTHENTIC_SOFTWARE.google, source: "fallback" };
}

export function fitSoftwareToField(value: string, fieldCount: number): string {
  return value.substring(0, Math.max(0, fieldCount - 1));
}
