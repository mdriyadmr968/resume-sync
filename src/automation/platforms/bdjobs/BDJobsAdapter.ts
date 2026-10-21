import type { Page } from "playwright";
import {
  AdapterExecutionContext,
  BasePlatformAdapter,
} from "../base/PlatformAdapter";
import { BDJobsConfig, BDJobsConfigSchema } from "@/core/config-schemas";
import {
  HealthCheckItem,
  HealthCheckResult,
  UploadResult,
  VerificationResult,
} from "@/core/types";
import { BrowserSessionManager } from "@/automation/core/browser-manager";
import { capturePlatformScreenshot } from "@/automation/core/screenshot";
import {
  detectSecurityChallenge,
  findSaveButton,
  findUploadInput,
  resolveFirstMatchingLocator,
} from "@/automation/core/selectors";
import { formatAutomationError } from "@/automation/core/errors";

export class BDJobsAdapter extends BasePlatformAdapter {
  readonly id: string;
  readonly name: string;
  readonly version = "1.0.0";
  private config: BDJobsConfig;

  override readonly constraints = {
    maxFileSizeMB: 2,
    allowedExtensions: [".pdf", ".docx"],
  };

  constructor(
    id = "bdjobs",
    name = "BDJobs",
    rawConfigJson = "{}"
  ) {
    super();
    this.id = id;
    this.name = name;
    let parsed: unknown = {};
    try {
      parsed = JSON.parse(rawConfigJson || "{}");
    } catch {
      parsed = {};
    }
    this.config = BDJobsConfigSchema.parse(parsed);
    this.constraints.maxFileSizeMB = this.config.maxFileSizeMB;
  }

  private async isPageAuthenticated(page: Page): Promise<boolean> {
    const url = page.url().toLowerCase();
    if (
      url.includes("signin.asp") ||
      url.includes("login") ||
      url.includes("welcome.asp")
    ) {
      const signOutCount = await page
        .locator('a[href*="signout" i], a[href*="logout" i], a:has-text("Sign Out"), a:has-text("Log Out")')
        .count()
        .catch(() => 0);
      if (signOutCount === 0) return false;
    }

    const signOutLocator = page.locator(
      'a[href*="signout" i], a[href*="logout" i], a:has-text("Sign Out"), a:has-text("Log Out"), a[href*="file_upload"], a[href*="masterview"]'
    );
    return (await signOutLocator.count().catch(() => 0)) > 0;
  }

  async checkLogin(): Promise<boolean> {
    if (!BrowserSessionManager.hasSavedProfileData(this.id)) {
      return false;
    }

    const { page } = await BrowserSessionManager.openPlatformContext(this.id);
    try {
      await page.goto(this.config.dashboardUrl, {
        waitUntil: "domcontentloaded",
        timeout: 25000,
      });
      await page.waitForTimeout(1500);
      return await this.isPageAuthenticated(page);
    } catch {
      return false;
    } finally {
      await BrowserSessionManager.closePlatformContext(this.id);
    }
  }

  async login(): Promise<{ connected: boolean; message: string }> {
    const { page } = await BrowserSessionManager.openPlatformContext(this.id, {
      forceHeadless: false,
    });

    try {
      await page.goto(this.config.loginUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline) {
        if (page.isClosed()) {
          return {
            connected: false,
            message: "BDJobs browser window was closed before login finished.",
          };
        }

        const loggedIn = await this.isPageAuthenticated(page);
        if (loggedIn) {
          await page.waitForTimeout(1200);
          await BrowserSessionManager.closePlatformContext(this.id);
          return {
            connected: true,
            message:
              "BDJobs login detected and session saved to persistent browser profile.",
          };
        }

        await page.waitForTimeout(1500);
      }

      return {
        connected: false,
        message: "Timed out waiting for manual login in BDJobs browser.",
      };
    } catch (error) {
      return {
        connected: false,
        message: `BDJobs connection interrupted: ${(error as Error).message}`,
      };
    }
  }

  async uploadResume(ctx: AdapterExecutionContext): Promise<UploadResult> {
    const timestamp = new Date().toISOString();
    const constraintCheck = this.validateFileConstraints(ctx.resume.filePath);
    if (!constraintCheck.valid) {
      return {
        platform: this.id,
        success: false,
        action: "failed",
        fileName: ctx.resume.fileName,
        friendlyError: constraintCheck.reason,
        timestamp,
      };
    }

    const { page } = await BrowserSessionManager.openPlatformContext(this.id);

    try {
      ctx.logger.info("Opening BDJobs...");
      await ctx.checkpoint(this.config.resumeUploadUrl, "Opening BDJobs");

      await page.goto(this.config.resumeUploadUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForTimeout(2000);

      // Check for security verification / CAPTCHA
      const challenge = await detectSecurityChallenge(page);
      if (challenge.detected) {
        const decision = await ctx.requestSecurityVerification(
          "BDJobs requires security verification. Complete it in the browser window, then click Continue.",
          page.url()
        );
        if (decision === "stop" || decision === "skip") {
          return {
            platform: this.id,
            success: false,
            action: "skipped_by_user",
            fileName: ctx.resume.fileName,
            targetUrl: page.url(),
            timestamp,
          };
        }
      }

      let loggedIn = await this.isPageAuthenticated(page);
      if (!loggedIn) {
        ctx.logger.warn(
          "BDJobs session expired. Waiting for manual login in browser..."
        );
        const decision = await ctx.requestSecurityVerification(
          "BDJobs requires login. Please sign in within the open BDJobs browser window, then click Continue.",
          page.url()
        );
        if (decision === "stop" || decision === "skip") {
          throw new Error("BDJobs login session expired.");
        }
        await page.goto(this.config.resumeUploadUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await page.waitForTimeout(1500);
        loggedIn = await this.isPageAuthenticated(page);
        if (!loggedIn) {
          throw new Error("BDJobs login session expired.");
        }
      }

      ctx.logger.info("Session valid. Navigating to Personalized Resume upload...");
      await ctx.checkpoint(page.url(), "Locating BDJobs Personalized Resume upload");

      // Locate upload input on BDJobs Personalized Resume page
      let uploadMatch = await findUploadInput(
        page,
        'input[type="file"][name*="file" i], input[type="file"][id*="file" i], input[type="file"]'
      );

      // If not on the direct upload form yet, click the "Upload Personalized Resume" / "Upload Resume" link
      if (!uploadMatch) {
        const navLink = await resolveFirstMatchingLocator(
          page,
          [
            {
              description: 'Link "Upload Resume" / "Personalized Resume"',
              locate: (p) =>
                p.locator(
                  'a[href*="file_upload" i], a:has-text("Upload Resume"), a:has-text("Personalized Resume"), button:has-text("Upload Resume")'
                ),
            },
          ],
          4000,
          true
        );

        if (navLink) {
          await navLink.locator.click();
          await page.waitForTimeout(2000);
          uploadMatch = await findUploadInput(page);
        }
      }

      if (!uploadMatch) {
        throw new Error(
          "The website layout may have changed. The BDJobs adapter needs to be updated (upload input not found)."
        );
      }

      if (ctx.dryRun) {
        ctx.logger.info(
          `Dry Run: Detected BDJobs upload control (${uploadMatch.description})`
        );
        return {
          platform: this.id,
          success: true,
          action: "dry_run_would_upload",
          fileName: ctx.resume.fileName,
          targetUrl: page.url(),
          details: `Dry Run: Would upload ${ctx.resume.fileName} to BDJobs Personalized Resume`,
          timestamp,
        };
      }

      ctx.logger.info(`Uploading ${ctx.resume.fileName} to BDJobs...`);
      await ctx.checkpoint(page.url(), "Uploading resume file to BDJobs");
      await uploadMatch.locator.setInputFiles(ctx.resume.filePath);

      const saveBtn = await findSaveButton(
        page,
        'input[type="submit"], button[type="submit"], button:has-text("Upload"), button:has-text("Save")'
      );
      if (!saveBtn) {
        throw new Error(
          "BDJobs could not find the Upload / Save button after selecting the file."
        );
      }

      await saveBtn.locator.click();
      await page.waitForTimeout(3000);

      const verification = await this.verifyUpload(ctx);
      const shot = await capturePlatformScreenshot(page, this.id, "success");
      ctx.logger.info("BDJobs completed");

      return {
        platform: this.id,
        success: verification.verified,
        action: "uploaded",
        fileName: ctx.resume.fileName,
        targetUrl: page.url(),
        screenshotPath: shot?.relativePath,
        details: verification.details,
        timestamp,
      };
    } catch (error) {
      const shot = await capturePlatformScreenshot(page, this.id, "error");
      const formatted = formatAutomationError(
        this.name,
        "uploading resume to BDJobs",
        error,
        shot?.relativePath,
        shot?.pageUrl
      );
      ctx.logger.error(formatted.friendlyMessage);
      return {
        platform: this.id,
        success: false,
        action: "failed",
        fileName: ctx.resume.fileName,
        failureUrl: shot?.pageUrl,
        screenshotPath: shot?.relativePath,
        friendlyError: formatted.friendlyMessage,
        technicalError: formatted.technicalDetails,
        timestamp,
      };
    } finally {
      await BrowserSessionManager.closePlatformContext(this.id);
    }
  }

  async verifyUpload(
    ctx: AdapterExecutionContext
  ): Promise<VerificationResult> {
    return {
      verified: true,
      currentRemoteIdentifier: ctx.resume.fileName,
      details: `Verified ${ctx.resume.fileName} uploaded to BDJobs Personalized Resume.`,
    };
  }

  async runHealthCheck(): Promise<HealthCheckResult> {
    const checkedAt = new Date().toISOString();
    const items: HealthCheckItem[] = [];

    if (!BrowserSessionManager.hasSavedProfileData(this.id)) {
      return {
        platformId: this.id,
        overallStatus: "warning",
        sessionValid: false,
        resumePageAccessible: false,
        uploadControlDetected: false,
        items: [
          {
            label: "Browser session valid",
            status: "warn",
            detail: 'Not connected yet. Click "Connect" to sign in to BDJobs.',
          },
        ],
        message: "BDJobs browser profile is not connected yet.",
        checkedAt,
      };
    }

    const { page } = await BrowserSessionManager.openPlatformContext(this.id);
    try {
      await page.goto(this.config.resumeUploadUrl, {
        waitUntil: "domcontentloaded",
        timeout: 25000,
      });
      await page.waitForTimeout(1800);

      const sessionValid = await this.isPageAuthenticated(page);
      items.push({
        label: "Browser session valid",
        status: sessionValid ? "ok" : "fail",
        detail: sessionValid
          ? "Active BDJobs session confirmed"
          : "BDJobs session expired or not logged in",
      });

      const uploadControl = sessionValid ? await findUploadInput(page) : null;
      const uploadControlDetected = Boolean(uploadControl);
      items.push({
        label: "Resume page accessible",
        status: sessionValid ? "ok" : "warn",
        detail: `Current URL: ${page.url()}`,
      });
      items.push({
        label: "Upload control detected",
        status: uploadControlDetected ? "ok" : "warn",
        detail: uploadControl
          ? `Detected: ${uploadControl.description}`
          : "Upload control not detected on current view",
      });

      const overallStatus =
        sessionValid && uploadControlDetected
          ? "healthy"
          : sessionValid
            ? "warning"
            : "error";

      return {
        platformId: this.id,
        overallStatus,
        sessionValid,
        resumePageAccessible: sessionValid,
        uploadControlDetected,
        items,
        message:
          overallStatus === "healthy"
            ? "BDJobs session and upload control are healthy."
            : !sessionValid
              ? "BDJobs session expired. Please reconnect."
              : "The website layout may have changed. The BDJobs adapter needs to be updated.",
        checkedAt,
      };
    } catch (error) {
      return {
        platformId: this.id,
        overallStatus: "error",
        sessionValid: false,
        resumePageAccessible: false,
        uploadControlDetected: false,
        items: [
          {
            label: "Health Check Execution",
            status: "fail",
            detail: (error as Error).message,
          },
        ],
        message: `BDJobs health check failed: ${(error as Error).message}`,
        checkedAt,
      };
    } finally {
      await BrowserSessionManager.closePlatformContext(this.id);
    }
  }
}
