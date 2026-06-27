import { describe, it, expect } from "vitest";
import { selectHttpLinks } from "../src/core/navigator.js";

describe("selectHttpLinks", () => {
  it("keeps only absolute http(s) links and dedupes", () => {
    expect(
      selectHttpLinks([
        "http://a.test/",
        "https://b.test/",
        "https://b.test/", // duplicate
        "ftp://c.test/",
        "/relative",
        "mailto:x@y.test",
      ]),
    ).toEqual(["http://a.test/", "https://b.test/"]);
  });

  it("tolerates non-string values from SVG anchors without throwing", () => {
    // SVGAElement.href is an SVGAnimatedString; it can serialize across the
    // Playwright boundary as {} / null / undefined. These must be dropped, not crash.
    expect(
      selectHttpLinks([
        "http://a.test/",
        {},
        { baseVal: "http://nope.test/" },
        null,
        undefined,
        123,
      ]),
    ).toEqual(["http://a.test/"]);
  });

  it("returns an empty array for empty input", () => {
    expect(selectHttpLinks([])).toEqual([]);
  });
});
