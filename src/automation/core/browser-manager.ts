import fs from "fs";
import path from "path";
import { chromium, type BrowserContext, type Page } from "playwright";
import { getPlatformProfileDir } from "@/core/paths";
import { applyStealthScripts } from "./stealth";

interface ActiveContextEntry {
  context: BrowserContext;
  page: Page;
  platformId: string;
  openedAt: Date;
}

const globalForBrowser = globalThis as unknown as {
  activeContexts: Map<string, ActiveContextEntry> | undefined;
  profileLocks: Set<string> | undefined;
};

const activeContexts =
  globalForBrowser.activeContexts ?? new Map<string, ActiveContextEntry>();
const profileLocks = globalForBrowser.profileLocks ?? new Set<string>();

if (process.env.NODE_ENV !== "production") {
  globalForBrowser.activeContexts = activeContexts;
  globalForBrowser.profileLocks = profileLocks;
}

/**
 * Cleans up stale Chromium SingletonLock files if no active context is running for that profile.
 */
function clearStaleProfileLockIfNeeded(profileDir: string, platformId: string) {
  if (activeContexts.has(platformId)) return;
  const lockFiles = ["SingletonLock", "SingletonCookie", "SingletonSocket"];
  for (const file of lockFiles) {
    const full = path.join(profileDir, file);
    if (fs.existsSync(full)) {
      try {
        fs.unlinkSync(full);
      } catch {
        // Ignore if held by an active OS process
      }
    }
  }
}

export class BrowserSessionManager {
  /**
   * Opens or reuses a persistent Chromium browser context for a specific platform.
   * Runs in visible headful mode at all times (except headless under TEST_MODE for CI/unit tests).
   * Applies anti-detection stealth arguments and script evasions.
   * Each platform gets its own isolated profile directory:
   *   data/browser-profiles/<platformId>/
   */
  static async openPlatformContext(
    platformId: string
  ): Promise<{ context: BrowserContext; page: Page; profileDir: string }> {
    const existing = activeContexts.get(platformId);
    if (existing) {
      try {
        if (!existing.page.isClosed()) {
          await existing.page.bringToFront().catch(() => {});
          return {
            context: existing.context,
            page: existing.page,
            profileDir: getPlatformProfileDir(platformId),
          };
        }
      } catch {
        activeContexts.delete(platformId);
      }
    }

    if (profileLocks.has(platformId)) {
      throw new Error(
        `Browser profile for "${platformId}" is currently initializing. Please wait a moment.`
      );
    }

    profileLocks.add(platformId);
    const profileDir = getPlatformProfileDir(platformId);
    clearStaleProfileLockIfNeeded(profileDir, platformId);

    try {
      const isTestMode = process.env.TEST_MODE === "true";
      // Explicitly enforce headful mode at all times; headless is strictly limited to automated unit tests
      const headless = isTestMode;

      const stealthArgs = [
        "--disable-blink-features=AutomationControlled",
        "--no-default-browser-check",
        "--no-first-run",
        "--disable-infobars",
        "--window-size=1280,880",
      ];

      let context: BrowserContext;
      try {
        // Prefer standard Chrome channel if installed on Windows for authentic TLS,
        // codecs, and natural user environment, falling back to bundled Playwright Chromium.
        context = await chromium.launchPersistentContext(profileDir, {
          headless,
          channel: isTestMode ? undefined : "chrome",
          viewport: { width: 1280, height: 840 },
          acceptDownloads: true,
          ignoreDefaultArgs: ["--enable-automation"],
          args: stealthArgs,
        });
      } catch {
        context = await chromium.launchPersistentContext(profileDir, {
          headless,
          viewport: { width: 1280, height: 840 },
          acceptDownloads: true,
          ignoreDefaultArgs: ["--enable-automation"],
          args: stealthArgs,
        });
      }

      // Apply evasions to mask navigator.webdriver, mock window.chrome, and set plugins
      await applyStealthScripts(context);

      const pages = context.pages();
      const page = pages.length > 0 ? pages[0] : await context.newPage();

      context.on("close", () => {
        activeContexts.delete(platformId);
      });

      activeContexts.set(platformId, {
        context,
        page,
        platformId,
        openedAt: new Date(),
      });

      return { context, page, profileDir };
    } finally {
      profileLocks.delete(platformId);
    }
  }

  /**
   * Closes the persistent browser context for a platform and flushes cookies/storage to disk.
   */
  static async closePlatformContext(platformId: string): Promise<void> {
    const entry = activeContexts.get(platformId);
    if (!entry) return;
    activeContexts.delete(platformId);
    try {
      await entry.context.close();
    } catch {
      // Ignore already closed errors
    }
  }

  /**
   * Closes all active persistent browser contexts (used when Stop is clicked).
   */
  static async closeAllContexts(): Promise<void> {
    const ids = Array.from(activeContexts.keys());
    for (const id of ids) {
      await this.closePlatformContext(id);
    }
  }

  /**
   * Checks if a persistent browser profile directory already has saved session data on disk.
   */
  static hasSavedProfileData(platformId: string): boolean {
    const profileDir = getPlatformProfileDir(platformId);
    if (!fs.existsSync(profileDir)) return false;
    const entries = fs.readdirSync(profileDir);
    return entries.some(
      (name) => name === "Default" || name === "Local State" || name.includes("Cookies")
    );
  }
}
