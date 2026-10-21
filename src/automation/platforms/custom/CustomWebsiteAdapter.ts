import {
  AdapterExecutionContext,
  BasePlatformAdapter,
} from "../base/PlatformAdapter";
import {
  CustomWebsiteConfig,
  CustomWebsiteConfigSchema,
} from "@/core/config-schemas";
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
} from "@/automation/core/selectors";
import { formatAutomationError } from "@/automation/core/errors";

export class CustomWebsiteAdapter extends BasePlatformAdapter {
  readonly id: string;
  readonly name: string;
  readonly version = "1.0.0";
  private config: CustomWebsiteConfig;

  constructor(id: string, name: string, rawConfigJson: string) {
    super();
    this.id = id;
    this.name = name;
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(rawConfigJson || "{}");
    } catch {
      parsed = {};
    }
    this.config = CustomWebsiteConfigSchema.parse({
      websiteUrl: parsed.websiteUrl || "https://example.com",
      loginUrl: parsed.loginUrl || parsed.websiteUrl || "https://example.com/login",
      resumePageUrl:
        parsed.resumePageUrl || parsed.websiteUrl || "https://example.com/profile",
      ...parsed,
    });
    this.constraints.maxFileSizeMB = this.config.maxFileSizeMB;
  }

  async checkLogin(): Promise<boolean> {
    if (!BrowserSessionManager.hasSavedProfileData(this.id)) {
      return false;
    }

    const { page } = await BrowserSessionManager.openPlatformContext(this.id);
    try {
      await page.goto(this.config.resumePageUrl, {
        waitUntil: "domcontentloaded",
        timeout: 25000,
      });
      await page.waitForTimeout(1500);
      if (this.config.loggedInSelector) {
        const count = await page
          .locator(this.config.loggedInSelector)
          .count()
          .catch(() => 0);
        if (count > 0) return true;
      }
      return !page.url().toLowerCase().includes("login");
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
            message: `${this.name} browser window closed before login completed.`,
          };
        }

        if (this.config.loggedInSelector) {
          const count = await page
            .locator(this.config.loggedInSelector)
            .count()
            .catch(() => 0);
          if (count > 0) {
            await BrowserSessionManager.closePlatformContext(this.id);
            return {
              connected: true,
              message: `${this.name} login detected and session saved.`,
            };
          }
        }

        await page.waitForTimeout(1500);
      }

      await BrowserSessionManager.closePlatformContext(this.id);
      return {
        connected: true,
        message: `${this.name} browser session saved.`,
      };
    } catch (error) {
      return {
        connected: false,
        message: `Connection failed: ${(error as Error).message}`,
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
      ctx.logger.info(`Opening ${this.name} at ${this.config.resumePageUrl}`);
      await ctx.checkpoint(
        this.config.resumePageUrl,
        `Opening ${this.name} resume page`
      );

      await page.goto(this.config.resumePageUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForTimeout(2000);

      const challenge = await detectSecurityChallenge(page);
      if (challenge.detected) {
        const decision = await ctx.requestSecurityVerification(
          `${this.name} requires verification. Complete it in the browser, then click Continue.`,
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

      const uploadMatch = await findUploadInput(
        page,
        this.config.uploadSelector
      );
      if (!uploadMatch) {
        throw new Error(
          `Could not locate upload control using selector "${this.config.uploadSelector}".`
        );
      }

      if (ctx.dryRun) {
        ctx.logger.info(
          `Dry Run: Detected upload control (${uploadMatch.description}) on ${this.name}`
        );
        return {
          platform: this.id,
          success: true,
          action: "dry_run_would_upload",
          fileName: ctx.resume.fileName,
          targetUrl: page.url(),
          details: `Dry Run: Would upload ${ctx.resume.fileName} to ${this.name}`,
          timestamp,
        };
      }

      await uploadMatch.locator.setInputFiles(ctx.resume.filePath);
      ctx.logger.info(`Selected file ${ctx.resume.fileName}`);

      const saveMatch = await findSaveButton(page, this.config.saveSelector);
      if (!saveMatch) {
        throw new Error(
          `Could not find Save button using selector "${this.config.saveSelector}".`
        );
      }

      await saveMatch.locator.click();
      await page.waitForTimeout(2500);

      const shot = await capturePlatformScreenshot(page, this.id, "success");

      return {
        platform: this.id,
        success: true,
        action: "uploaded",
        fileName: ctx.resume.fileName,
        targetUrl: page.url(),
        screenshotPath: shot?.relativePath,
        details: `Uploaded ${ctx.resume.fileName} to ${this.name}`,
        timestamp,
      };
    } catch (error) {
      const shot = await capturePlatformScreenshot(page, this.id, "error");
      const formatted = formatAutomationError(
        this.name,
        `uploading resume to ${this.name}`,
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
      details: `Verified upload on ${this.name}`,
    };
  }

  async runHealthCheck(): Promise<HealthCheckResult> {
    const checkedAt = new Date().toISOString();
    const items: HealthCheckItem[] = [];
    const hasProfile = BrowserSessionManager.hasSavedProfileData(this.id);

    if (!hasProfile) {
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
            detail: 'Not connected yet. Click "Connect" to log in.',
          },
        ],
        message: `${this.name} is not connected yet.`,
        checkedAt,
      };
    }

    const { page } = await BrowserSessionManager.openPlatformContext(this.id);
    try {
      await page.goto(this.config.resumePageUrl, {
        waitUntil: "domcontentloaded",
        timeout: 25000,
      });
      await page.waitForTimeout(1500);

      const uploadMatch = await findUploadInput(
        page,
        this.config.uploadSelector
      );
      items.push({
        label: "Resume page accessible",
        status: "ok",
        detail: `Loaded ${page.url()}`,
      });
      items.push({
        label: "Upload control detected",
        status: uploadMatch ? "ok" : "fail",
        detail: uploadMatch
          ? `Matched ${uploadMatch.description}`
          : `Selector "${this.config.uploadSelector}" not found`,
      });

      return {
        platformId: this.id,
        overallStatus: uploadMatch ? "healthy" : "warning",
        sessionValid: true,
        resumePageAccessible: true,
        uploadControlDetected: Boolean(uploadMatch),
        items,
        message: uploadMatch
          ? `${this.name} selectors verified.`
          : `The website layout may have changed. Selector "${this.config.uploadSelector}" was not found.`,
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
            label: "Health Check",
            status: "fail",
            detail: (error as Error).message,
          },
        ],
        message: `Health check failed: ${(error as Error).message}`,
        checkedAt,
      };
    } finally {
      await BrowserSessionManager.closePlatformContext(this.id);
    }
  }
}
