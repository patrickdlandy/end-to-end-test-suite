import * as cheerio from "cheerio";
import { makeResult, type Check, type CheckContext, type CheckResult, type Finding } from "../types.js";

/** Recommended length bounds for the title and meta description. */
const TITLE_MIN = 10;
const TITLE_MAX = 70;
const DESC_MIN = 50;
const DESC_MAX = 160;

/**
 * Checks on-page SEO essentials parsed from the document: title, meta
 * description, a single h1, canonical link, html lang, and Open Graph basics.
 */
export const seoMetaCheck: Check = {
  id: "seo.meta",
  category: "seo",
  needs: ["artifacts"],
  run({ artifacts }: CheckContext): CheckResult {
    const $ = cheerio.load(artifacts.html);
    const findings: Finding[] = [];

    const title = $("head > title").first().text().trim();
    if (!title) {
      findings.push({ severity: "error", message: "Missing <title>", remediation: "Add a descriptive <title>." });
    } else if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
      findings.push({
        severity: "warning",
        message: `Title length ${title.length} outside recommended ${TITLE_MIN}-${TITLE_MAX} chars`,
      });
    }

    const description = $('meta[name="description"]').attr("content")?.trim() ?? "";
    if (!description) {
      findings.push({
        severity: "warning",
        message: "Missing meta description",
        remediation: "Add a <meta name=\"description\"> summarizing the page.",
      });
    } else if (description.length < DESC_MIN || description.length > DESC_MAX) {
      findings.push({
        severity: "info",
        message: `Meta description length ${description.length} outside recommended ${DESC_MIN}-${DESC_MAX} chars`,
      });
    }

    const h1Count = $("h1").length;
    if (h1Count === 0) {
      findings.push({ severity: "warning", message: "No <h1> on the page" });
    } else if (h1Count > 1) {
      findings.push({ severity: "info", message: `Multiple <h1> elements (${h1Count})` });
    }

    const canonical = $('link[rel="canonical"]').attr("href")?.trim() ?? "";
    if (!canonical) {
      findings.push({
        severity: "warning",
        message: "Missing canonical link",
        remediation: "Add <link rel=\"canonical\"> to avoid duplicate-content ambiguity.",
      });
    }

    const lang = $("html").attr("lang")?.trim() ?? "";
    if (!lang) {
      findings.push({ severity: "warning", message: "Missing lang attribute on <html>" });
    }

    const ogTitle = $('meta[property="og:title"]').attr("content")?.trim() ?? "";
    const ogImage = $('meta[property="og:image"]').attr("content")?.trim() ?? "";
    if (!ogTitle || !ogImage) {
      findings.push({
        severity: "info",
        message: "Incomplete Open Graph tags (og:title and/or og:image missing)",
      });
    }

    const hasError = findings.some((f) => f.severity === "error");
    const hasWarning = findings.some((f) => f.severity === "warning");
    return makeResult(this, {
      status: hasError ? "fail" : hasWarning ? "warn" : "pass",
      observations: {
        title,
        titleLength: title.length,
        description,
        descriptionLength: description.length,
        h1Count,
        canonical,
        lang,
        ogTitle,
        ogImage,
      },
      findings,
    });
  },
};
