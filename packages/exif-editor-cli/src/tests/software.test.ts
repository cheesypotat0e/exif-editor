import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  APPLE_RELEASES_URL,
  IOS_BETA_FALLBACK,
  fetchLatestIosBetaVersion,
  parseLatestIosBetaVersion,
  resolveSoftwareValue,
} from "../software.js";

describe("Apple iOS beta release parsing", () => {
  const cases: Array<[string, string | undefined]> = [
    ["iOS 27.0 beta 4 (24A5390f)", "27.0"],
    ["<h2>iOS 27.0 beta</h2>", "27.0"],
    ["iOS 26.6 beta 2 and iOS 27.0 beta 3", "27.0"],
    ["iOS 28.1 beta and iOS 27.9 beta", "28.1"],
    ["iPadOS 27.0 beta 4", undefined],
    ["iOS 27.0", undefined],
    ["No Apple releases here", undefined],
  ];
  for (const [html, expected] of cases) {
    test(`parses ${JSON.stringify(html)}`, () => {
      assert.equal(parseLatestIosBetaVersion(html), expected);
    });
  }
});

describe("latest iOS beta fetching", () => {
  test("uses the official Apple releases endpoint", async () => {
    let requestedUrl = "";
    const fetchMock = (async (input: string | URL | Request) => {
      requestedUrl = String(input);
      return new Response("iOS 27.0 beta 4");
    }) as typeof fetch;
    const result = await fetchLatestIosBetaVersion(fetchMock);
    assert.equal(requestedUrl, APPLE_RELEASES_URL);
    assert.deepEqual(result, { value: "27.0", source: "apple" });
  });

  test("falls back when Apple returns an error", async () => {
    const fetchMock = (async () => new Response("error", { status: 503 })) as typeof fetch;
    assert.deepEqual(await fetchLatestIosBetaVersion(fetchMock), {
      value: IOS_BETA_FALLBACK,
      source: "fallback",
    });
  });

  test("falls back when Apple returns no iOS beta", async () => {
    const fetchMock = (async () => new Response("No beta here")) as typeof fetch;
    assert.equal((await fetchLatestIosBetaVersion(fetchMock)).source, "fallback");
  });

  test("falls back on a network exception", async () => {
    const fetchMock = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    assert.equal((await fetchLatestIosBetaVersion(fetchMock)).value, IOS_BETA_FALLBACK);
  });
});

describe("software value resolution", () => {
  test("trims and returns a literal value without a lookup", async () => {
    let called = false;
    const result = await resolveSoftwareValue(" 27.0 ", async () => {
      called = true;
      return { value: "99.0", source: "apple" };
    });
    assert.deepEqual(result, { value: "27.0", source: "literal" });
    assert.equal(called, false);
  });

  test("resolves latest-ios-beta case-insensitively", async () => {
    const result = await resolveSoftwareValue("LATEST-IOS-BETA", async () => ({
      value: "27.0",
      source: "apple",
    }));
    assert.deepEqual(result, { value: "27.0", source: "apple" });
  });

  test("rejects an empty software value", async () => {
    await assert.rejects(() => resolveSoftwareValue("  "), /cannot be empty/);
  });
});
