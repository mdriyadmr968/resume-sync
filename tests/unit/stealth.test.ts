import { describe, it, expect, vi } from "vitest";
import { randomDelay, applyStealthScripts } from "@/automation/core/stealth";

describe("Stealth & Anti-Detection Module", () => {
  it("generates randomized delays within bounds", async () => {
    const start = Date.now();
    await randomDelay(30, 60);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(25);
    expect(elapsed).toBeLessThanOrEqual(150);
  });

  it("applies stealth initialization script to context", async () => {
    const addInitScript = vi.fn();
    const mockContext = { addInitScript } as unknown as import("playwright").BrowserContext;

    await applyStealthScripts(mockContext);
    expect(addInitScript).toHaveBeenCalledTimes(1);
    expect(typeof addInitScript.mock.calls[0][0]).toBe("function");
  });
});
