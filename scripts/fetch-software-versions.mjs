import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");
const constantsFilePath = resolve(rootDir, "src", "software-constants.ts");

export const APPLE_RSS_URL =
  "https://developer.apple.com/news/releases/rss/releases.rss";
export const SAMSUNG_RELEASES_URL =
  "https://doc.samsungmobile.com/SM-S928B/029279240224/eng.html";
export const GOOGLE_CAMERA_URL =
  "https://play.google.com/store/apps/details?id=com.google.android.GoogleCamera&hl=en";

export const FALLBACK_SOFTWARE = {
  apple: "27.0",
  samsung: "S928BXXS7AXK2",
  google: "HDR+ 1.0.585804376zdh",
};

/**
 * Parses Apple releases RSS feed and uses /^iOS .*beta/i to find the latest iOS beta version.
 */
export function parseLatestIosBetaVersion(rssOrText) {
  const titleMatches = Array.from(
    rssOrText.matchAll(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/gi),
  );

  const candidates = [];
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

  const parsedVersions = [];
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

/**
 * Parses Samsung release notes HTML to find the build number.
 */
export function parseLatestSamsungVersion(html) {
  const match =
    html.match(/Build Number\s*:\s*<\/strong>\s*([A-Z0-9]+)/i) ||
    html.match(/\b(S928B[A-Z0-9]+)\b/i);
  return match ? match[1] : undefined;
}

/**
 * Parses Google Camera Play Store HTML to find the Pixel HDR+ version.
 */
export function parseLatestPixelVersion(html) {
  const directMatch = html.match(/\bHDR\+\s*1\.0\.\d+[a-z]*\b/i);
  if (directMatch) {
    return directMatch[0];
  }
  const match = html.match(/\b\d+\.\d+\.\d+\.(\d{8,10})\b/);
  return match ? `HDR+ 1.0.${match[1]}zdh` : undefined;
}

export async function fetchLatestIosBeta() {
  try {
    const res = await fetch(APPLE_RSS_URL, {
      headers: {
        Accept:
          "application/rss+xml, application/xml, text/xml, text/html, */*",
        "User-Agent": "exif-editor/0.1",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`Apple RSS returned HTTP ${res.status}`);
    }
    const text = await res.text();
    const version = parseLatestIosBetaVersion(text);
    if (!version) {
      throw new Error("No iOS beta version found in Apple RSS feed");
    }
    return version;
  } catch (err) {
    console.warn(`[build:software] Failed to fetch Apple iOS beta: ${err.message}`);
    return null;
  }
}

export async function fetchLatestSamsung() {
  try {
    const res = await fetch(SAMSUNG_RELEASES_URL, {
      headers: {
        Accept: "text/html",
        "User-Agent": "exif-editor/0.1",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`Samsung releases returned HTTP ${res.status}`);
    }
    const text = await res.text();
    const version = parseLatestSamsungVersion(text);
    if (!version) {
      throw new Error("No build number found in Samsung release notes");
    }
    return version;
  } catch (err) {
    console.warn(`[build:software] Failed to fetch Samsung version: ${err.message}`);
    return null;
  }
}

export async function fetchLatestPixel() {
  try {
    const res = await fetch(GOOGLE_CAMERA_URL, {
      headers: {
        Accept: "text/html",
        "User-Agent": "Mozilla/5.0",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`Google Camera returned HTTP ${res.status}`);
    }
    const text = await res.text();
    const version = parseLatestPixelVersion(text);
    if (!version) {
      throw new Error("No version found on Google Camera Play Store page");
    }
    return version;
  } catch (err) {
    console.warn(`[build:software] Failed to fetch Pixel version: ${err.message}`);
    return null;
  }
}

function loadExistingConstants() {
  if (!existsSync(constantsFilePath)) {
    return { ...FALLBACK_SOFTWARE };
  }
  try {
    const content = readFileSync(constantsFilePath, "utf8");
    const appleMatch = content.match(/apple:\s*"([^"]+)"/);
    const samsungMatch = content.match(/samsung:\s*"([^"]+)"/);
    const googleMatch = content.match(/google:\s*"([^"]+)"/);
    return {
      apple: appleMatch ? appleMatch[1] : FALLBACK_SOFTWARE.apple,
      samsung: samsungMatch ? samsungMatch[1] : FALLBACK_SOFTWARE.samsung,
      google: googleMatch ? googleMatch[1] : FALLBACK_SOFTWARE.google,
    };
  } catch {
    return { ...FALLBACK_SOFTWARE };
  }
}

export async function updateSoftwareConstants() {
  console.log("[build:software] Fetching latest program names for EXIF tags...");

  const existing = loadExistingConstants();

  const [iosBeta, samsungBuild, pixelVersion] = await Promise.all([
    fetchLatestIosBeta(),
    fetchLatestSamsung(),
    fetchLatestPixel(),
  ]);

  const finalApple = iosBeta ?? existing.apple ?? FALLBACK_SOFTWARE.apple;
  const finalSamsung = samsungBuild ?? existing.samsung ?? FALLBACK_SOFTWARE.samsung;
  const finalGoogle = pixelVersion ?? existing.google ?? FALLBACK_SOFTWARE.google;

  console.log(`[build:software] Apple iOS beta: ${finalApple} (${iosBeta ? "fetched" : "fallback"})`);
  console.log(`[build:software] Samsung Galaxy: ${finalSamsung} (${samsungBuild ? "fetched" : "fallback"})`);
  console.log(`[build:software] Google Pixel:   ${finalGoogle} (${pixelVersion ? "fetched" : "fallback"})`);

  const fileContent = `// Auto-generated by scripts/fetch-software-versions.mjs during build.
// Do not edit manually.

export const AUTHENTIC_SOFTWARE = {
  apple: "${finalApple}",
  samsung: "${finalSamsung}",
  google: "${finalGoogle}",
} as const;
`;

  writeFileSync(constantsFilePath, fileContent, "utf8");
  console.log(`[build:software] Updated ${constantsFilePath}`);

  return {
    apple: finalApple,
    samsung: finalSamsung,
    google: finalGoogle,
  };
}

if (process.argv[1] === __filename) {
  await updateSoftwareConstants();
}
