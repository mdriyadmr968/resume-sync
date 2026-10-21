import { describe, it, expect } from "vitest";
import {
  PortfolioConfigSchema,
  LinkedInConfigSchema,
  BDJobsConfigSchema,
} from "@/core/config-schemas";
import { sanitizeLogMessage } from "@/automation/core/logger";
import { formatAutomationError } from "@/automation/core/errors";

describe("Configuration Validation, Log Sanitization & Error Formatting", () => {
  it("applies dual-target defaults for LinkedIn and git_repo defaults for Portfolio", () => {
    const li = LinkedInConfigSchema.parse({});
    expect(li.syncTarget).toBe("both");
    expect(li.deleteOldestIfFull).toBe(true);

    const pf = PortfolioConfigSchema.parse({});
    expect(pf.mode).toBe("git_repo");
    expect(pf.dataFilePath).toBe("lib/data.ts");

    const bd = BDJobsConfigSchema.parse({});
    expect(bd.maxFileSizeMB).toBe(2);
  });

  it("redacts sensitive cookies, tokens, and passwords from logs", () => {
    const raw =
      'Cookie: li_at=AQEDAR12345secret; password="mySecretPassword123" Bearer eyJhbGciOiJIUzI1NiJ9';
    const sanitized = sanitizeLogMessage(raw);
    expect(sanitized).not.toContain("AQEDAR12345secret");
    expect(sanitized).not.toContain("mySecretPassword123");
    expect(sanitized).toContain("[REDACTED]");
  });

  it("translates Playwright TimeoutError on Save button into a friendly diagnostic report", () => {
    const err = new Error("TimeoutError: locator.click: Timeout 30000ms exceeded while waiting for Save button");
    const formatted = formatAutomationError(
      "LinkedIn",
      "saving resume",
      err,
      "logs/2026-10-21/linkedin/error.png",
      "https://www.linkedin.com/jobs/application-settings"
    );

    expect(formatted.friendlyMessage).toContain(
      "LinkedIn could not find the Save button."
    );
    expect(formatted.friendlyMessage).toContain(
      "logs/2026-10-21/linkedin/error.png"
    );
    expect(formatted.technicalDetails).toContain("Timeout 30000ms exceeded");
  });
});
