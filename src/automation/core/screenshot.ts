import path from "path";
import fs from "fs";
import type { Page } from "playwright";
import { getPlatformLogDir } from "@/core/paths";

export interface ScreenshotCaptureResult {
  relativePath: string;
  absolutePath: string;
  pageUrl: string;
}

/**
 * Captures a screenshot into logs/YYYY-MM-DD/<platformId>/
 * Creates both a canonical name (e.g. error.png or success.png) and a timestamped copy.
 */
export async function capturePlatformScreenshot(
  page: Page | null | undefined,
  platformId: string,
  kind: "success" | "error" | "page" | "health"
): Promise<ScreenshotCaptureResult | null> {
  if (!page || page.isClosed()) {
    return null;
  }

  try {
    const now = new Date();
    const dir = getPlatformLogDir(platformId, now);
    const canonicalName = `${kind}.png`;
    const canonicalPath = path.join(dir, canonicalName);

    const timestamp = now.toISOString().replace(/[:.]/g, "-");
    const timestampedPath = path.join(dir, `${kind}-${timestamp}.png`);

    await page.screenshot({
      path: canonicalPath,
      fullPage: kind === "error" || kind === "page",
    });

    fs.copyFileSync(canonicalPath, timestampedPath);

    // Also save failure URL metadata when capturing an error
    const currentUrl = page.url();
    if (kind === "error") {
      const metaPath = path.join(dir, "failure-meta.json");
      fs.writeFileSync(
        metaPath,
        JSON.stringify(
          {
            platformId,
            failureUrl: currentUrl,
            capturedAt: now.toISOString(),
            screenshot: canonicalName,
          },
          null,
          2
        ),
        "utf8"
      );
    }

    const relativePath = path
      .relative(process.cwd(), canonicalPath)
      .replace(/\\/g, "/");

    return {
      relativePath,
      absolutePath: canonicalPath,
      pageUrl: currentUrl,
    };
  } catch {
    return null;
  }
}
