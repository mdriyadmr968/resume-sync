import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { setMasterResumeFromLocalFile } from "@/core/resume-manager";
import { runSyncJob } from "@/core/sync-orchestrator";
import { syncBus } from "@/core/interaction-gate";
import {
  AdapterExecutionContext,
  BasePlatformAdapter,
} from "@/automation/platforms/base/PlatformAdapter";
import {
  HealthCheckResult,
  UploadResult,
  VerificationResult,
} from "@/core/types";

class MockAdapter extends BasePlatformAdapter {
  readonly id: string;
  readonly name: string;
  readonly version = "1.0.0-mock";
  private behavior: "success" | "fail" | "require_verification";

  constructor(
    id: string,
    name: string,
    behavior: "success" | "fail" | "require_verification"
  ) {
    super();
    this.id = id;
    this.name = name;
    this.behavior = behavior;
  }

  async checkLogin() {
    return true;
  }

  async login() {
    return { connected: true, message: "Mock connected" };
  }

  async uploadResume(ctx: AdapterExecutionContext): Promise<UploadResult> {
    if (this.behavior === "require_verification") {
      // Trigger human-in-the-loop gate and auto-resolve it after 50ms
      setTimeout(() => {
        syncBus.respondToPrompt("continue");
      }, 50);

      const decision = await ctx.requestSecurityVerification(
        "Mock 2FA required",
        "https://example.com/2fa"
      );

      if (decision !== "continue") {
        return {
          platform: this.id,
          success: false,
          action: "skipped_by_user",
          fileName: ctx.resume.fileName,
          timestamp: new Date().toISOString(),
        };
      }
    }

    if (this.behavior === "fail") {
      return {
        platform: this.id,
        success: false,
        action: "failed",
        fileName: ctx.resume.fileName,
        friendlyError: `${this.name} mock failure`,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      platform: this.id,
      success: true,
      action: ctx.dryRun ? "dry_run_would_upload" : "uploaded",
      fileName: ctx.resume.fileName,
      timestamp: new Date().toISOString(),
    };
  }

  async verifyUpload(): Promise<VerificationResult> {
    return { verified: true, details: "Mock verified" };
  }

  async runHealthCheck(): Promise<HealthCheckResult> {
    return {
      platformId: this.id,
      overallStatus: "healthy",
      sessionValid: true,
      resumePageAccessible: true,
      uploadControlDetected: true,
      items: [],
      message: "Healthy",
      checkedAt: new Date().toISOString(),
    };
  }
}

describe("Sync Orchestrator State Transitions & Failure Isolation", () => {
  let tempDir: string;
  let resumePdfPath: string;

  beforeAll(async () => {
    process.env.TEST_MODE = "true";
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "orch-test-"));
    resumePdfPath = path.join(tempDir, "Orchestrator_Test_Resume.pdf");
    fs.writeFileSync(
      resumePdfPath,
      Buffer.concat([
        Buffer.from("%PDF-1.7\n"),
        Buffer.from(`Unique test payload ${Date.now()}`),
        Buffer.alloc(200, "Z"),
      ])
    );
    await setMasterResumeFromLocalFile(resumePdfPath);
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("handles pending -> running -> success, failed, and requires_user_action without stopping the batch", async () => {
    const job = await runSyncJob({
      platformIds: ["portfolio", "linkedin", "bdjobs"],
      force: true,
      interactive: false,
      triggerSource: "cli",
      customAdapterFactory: (id) => {
        if (id === "portfolio")
          return new MockAdapter("portfolio", "Portfolio", "success");
        if (id === "linkedin")
          return new MockAdapter(
            "linkedin",
            "LinkedIn",
            "require_verification"
          );
        if (id === "bdjobs")
          return new MockAdapter("bdjobs", "BDJobs", "fail");
        return null;
      },
    });

    expect(job.status).toBe("completed");
    expect(job.successCount).toBe(2); // portfolio + linkedin (after 2FA continue)
    expect(job.failedCount).toBe(1); // bdjobs
    expect(job.attentionCount).toBe(1); // linkedin requested verification
  });

  it("skips platforms whose lastSyncedHash already matches the current Master Resume SHA-256", async () => {
    const secondJob = await runSyncJob({
      platformIds: ["portfolio"],
      force: false,
      interactive: false,
      triggerSource: "cli",
      customAdapterFactory: () =>
        new MockAdapter("portfolio", "Portfolio", "success"),
    });

    expect(secondJob.skippedCount).toBe(1);
    expect(secondJob.records[0].status).toBe("skipped");
    expect(secondJob.records[0].action).toBe("already_up_to_date");
  });
});
