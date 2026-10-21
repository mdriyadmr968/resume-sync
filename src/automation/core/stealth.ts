import type { BrowserContext, Locator, Page } from "playwright";

/**
 * Generates human-like randomized delays between user interactions.
 */
export async function randomDelay(minMs = 1200, maxMs = 2800): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Human-like hover and click to prevent robotic instant-click detection.
 */
export async function humanClick(locator: Locator, hoverDelayMs = 350): Promise<void> {
  try {
    await locator.hover({ timeout: 4000 });
    await new Promise((resolve) => setTimeout(resolve, hoverDelayMs + Math.floor(Math.random() * 250)));
  } catch {
    // Non-fatal if element doesn't support hover or is an attached input
  }
  await locator.click();
}

/**
 * Injects evasions into the browser context so all pages and iframes run with
 * authentic browser properties (navigator.webdriver masked, window.chrome present, plugins populated).
 */
export async function applyStealthScripts(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    // 1. Mask navigator.webdriver
    try {
      Object.defineProperty(navigator, "webdriver", {
        get: () => undefined,
        configurable: true,
      });
    } catch {
      // Ignore if read-only
    }

    // 2. Mock authentic window.chrome
    try {
      const w = window as unknown as { chrome?: Record<string, unknown> };
      if (!w.chrome) {
        w.chrome = {
          runtime: {},
          loadTimes: () => ({}),
          csi: () => ({}),
          app: {},
        };
      }
    } catch {
      // Ignore
    }

    // 3. Mock authentic navigator.plugins
    try {
      if (!navigator.plugins || navigator.plugins.length === 0) {
        const dummyPlugins = [
          { name: "PDF Viewer", filename: "internal-pdf-viewer", description: "Portable Document Format" },
          { name: "Chrome PDF Viewer", filename: "internal-pdf-viewer", description: "Portable Document Format" },
          { name: "Chromium PDF Plugin", filename: "internal-pdf-viewer", description: "Portable Document Format" },
        ];
        Object.defineProperty(navigator, "plugins", {
          get: () => dummyPlugins,
          configurable: true,
        });
      }
    } catch {
      // Ignore
    }

    // 4. Ensure standard languages
    try {
      if (!navigator.languages || navigator.languages.length === 0) {
        Object.defineProperty(navigator, "languages", {
          get: () => ["en-US", "en"],
          configurable: true,
        });
      }
    } catch {
      // Ignore
    }
  });
}
