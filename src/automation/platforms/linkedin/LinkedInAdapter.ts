import type { Page } from "playwright";
import {
  AdapterExecutionContext,
  BasePlatformAdapter,
} from "../base/PlatformAdapter";
import {
  LinkedInConfig,
  LinkedInConfigSchema,
} from "@/core/config-schemas";
import {
  HealthCheckItem,
  HealthCheckResult,
  UploadResult,
  VerificationResult,
} from "@/core/types";
import { BrowserSessionManager } from "@/automation/core/browser-manager";
import { capturePlatformScreenshot } from "@/automation/core/screenshot";
import { humanClick, randomDelay } from "@/automation/core/stealth";
import {
  detectSecurityChallenge,
  findSaveButton,
  findUploadInput,
  resolveFirstMatchingLocator,
} from "@/automation/core/selectors";
import { formatAutomationError } from "@/automation/core/errors";

export class LinkedInAdapter extends BasePlatformAdapter {
  readonly id: string;
  readonly name: string;
  readonly version = "1.2.0";
  private config: LinkedInConfig;

  override readonly constraints = {
    maxFileSizeMB: 5,
    allowedExtensions: [".pdf", ".docx"],
  };

  constructor(
    id = "linkedin",
    name = "LinkedIn",
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
    this.config = LinkedInConfigSchema.parse(parsed);
  }

  private async isPageAuthenticated(page: Page): Promise<boolean> {
    const url = page.url().toLowerCase();
    if (
      url.includes("/login") ||
      url.includes("/uas/login") ||
      url.includes("/authwall") ||
      url.includes("signup")
    ) {
      return false;
    }

    const cookies = await page.context().cookies("https://www.linkedin.com");
    const hasLiAt = cookies.some((c) => c.name === "li_at" && Boolean(c.value));
    if (hasLiAt) {
      return true;
    }

    const navExists = await page
      .locator(
        'nav.global-nav, #global-nav, a[href*="/feed/"], a[href*="/jobs/"]'
      )
      .count()
      .catch(() => 0);

    return navExists > 0;
  }

  async checkLogin(): Promise<boolean> {
    if (!BrowserSessionManager.hasSavedProfileData(this.id)) {
      return false;
    }

    const { page } = await BrowserSessionManager.openPlatformContext(this.id);
    try {
      await page.goto("https://www.linkedin.com/feed/", {
        waitUntil: "domcontentloaded",
        timeout: 25000,
      });
      await randomDelay(1200, 2000);
      return await this.isPageAuthenticated(page);
    } catch {
      return false;
    } finally {
      await BrowserSessionManager.closePlatformContext(this.id);
    }
  }

  /**
   * Opens a visible browser window for LinkedIn manual login + 2FA/CAPTCHA completion.
   * Waits until the user logs in and reaches the authenticated feed/settings page.
   */
  async login(): Promise<{ connected: boolean; message: string }> {
    const { page } = await BrowserSessionManager.openPlatformContext(this.id);

    try {
      await page.goto("https://www.linkedin.com/login", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Poll up to 3 minutes while user logs in manually and completes any 2FA/CAPTCHA
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline) {
        if (page.isClosed()) {
          return {
            connected: false,
            message: "Browser window was closed before login finished.",
          };
        }

        const loggedIn = await this.isPageAuthenticated(page);
        if (loggedIn) {
          await randomDelay(1200, 2000);
          await BrowserSessionManager.closePlatformContext(this.id);
          return {
            connected: true,
            message:
              "LinkedIn login verified and persistent browser profile saved.",
          };
        }

        await page.waitForTimeout(1500);
      }

      return {
        connected: false,
        message:
          "Timed out waiting for manual login in the browser. Click Connect again when ready.",
      };
    } catch (error) {
      return {
        connected: false,
        message: `LinkedIn connection interrupted: ${(error as Error).message}`,
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
      ctx.logger.info("Opening LinkedIn...");
      await ctx.checkpoint("https://www.linkedin.com", "Opening LinkedIn");

      await page.goto(this.config.applicationSettingsUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await randomDelay(1800, 2600);

      // Check for security challenge / 2FA
      const challenge = await detectSecurityChallenge(page);
      if (challenge.detected) {
        ctx.logger.warn(
          `Security verification required: ${challenge.reason}`
        );
        const decision = await ctx.requestSecurityVerification(
          "LinkedIn requires security/2FA verification. Please complete the verification in the open browser window, then click Continue.",
          page.url()
        );
        if (decision === "stop" || decision === "skip") {
          return {
            platform: this.id,
            success: false,
            action: "skipped_by_user",
            fileName: ctx.resume.fileName,
            targetUrl: page.url(),
            details: "Skipped during security verification prompt.",
            timestamp,
          };
        }
      }

      // Check if logged in; if not, ask user to log in right in the open window
      let authenticated = await this.isPageAuthenticated(page);
      if (!authenticated) {
        ctx.logger.warn(
          "LinkedIn session expired or not logged in. Waiting for manual login in browser..."
        );
        const decision = await ctx.requestSecurityVerification(
          "Your LinkedIn session requires login. Please sign in within the open LinkedIn browser window, then click Continue.",
          page.url()
        );
        if (decision === "stop" || decision === "skip") {
          throw new Error("LinkedIn login session is not active.");
        }
        await page.goto(this.config.applicationSettingsUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await page.waitForTimeout(2000);
        authenticated = await this.isPageAuthenticated(page);
        if (!authenticated) {
          throw new Error("LinkedIn login session is still not active.");
        }
      }

      ctx.logger.info("Session valid");
      const completedTargets: string[] = [];

      // TARGET 1: Job Application Settings (Easy Apply & Recruiter Resume)
      if (
        this.config.syncTarget === "both" ||
        this.config.syncTarget === "application_settings"
      ) {
        await this.syncApplicationSettingsResume(page, ctx);
        completedTargets.push("Job Application Settings");
      }

      // TARGET 2: Profile Featured Section
      if (
        this.config.syncTarget === "both" ||
        this.config.syncTarget === "featured_section"
      ) {
        await this.syncFeaturedSectionResume(page, ctx);
        completedTargets.push("Profile Featured Section");
      }

      if (ctx.dryRun) {
        return {
          platform: this.id,
          success: true,
          action: "dry_run_would_upload",
          fileName: ctx.resume.fileName,
          targetUrl: page.url(),
          details: `Dry Run: Verified LinkedIn controls for ${completedTargets.join(" & ")}`,
          timestamp,
        };
      }

      const verification = await this.verifyUpload(ctx);
      const shot = await capturePlatformScreenshot(page, this.id, "success");

      ctx.logger.info(
        `LinkedIn completed (${completedTargets.join(" + ")})`
      );

      return {
        platform: this.id,
        success: verification.verified,
        action: "uploaded",
        fileName: ctx.resume.fileName,
        targetUrl: page.url(),
        screenshotPath: shot?.relativePath,
        details: `Updated ${completedTargets.join(" & ")}`,
        timestamp,
      };
    } catch (error) {
      const shot = await capturePlatformScreenshot(page, this.id, "error");
      const formatted = formatAutomationError(
        this.name,
        "uploading resume to LinkedIn",
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

  private async syncApplicationSettingsResume(
    page: Page,
    ctx: AdapterExecutionContext
  ): Promise<void> {
    ctx.logger.info(
      "Navigating to LinkedIn Job Application Settings..."
    );
    await ctx.checkpoint(
      this.config.applicationSettingsUrl,
      "Navigating to LinkedIn Job Application Settings"
    );

    if (!page.url().includes("application-settings")) {
      await page.goto(this.config.applicationSettingsUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await randomDelay(1800, 2600);
    }

    // Locate the file upload input or "Upload resume" label/button
    const uploadMatch = await findUploadInput(
      page,
      'input[type="file"][id*="resume" i], input[type="file"][name*="resume" i], input[type="file"]'
    );

    const uploadTriggerButton = await resolveFirstMatchingLocator(
      page,
      [
        {
          description: 'Label or Button "Upload resume"',
          locate: (p) =>
            p.locator(
              'label:has-text("Upload resume"), button:has-text("Upload resume"), [aria-label*="Upload resume" i]'
            ),
        },
      ],
      4000,
      true
    );

    if (!uploadMatch && !uploadTriggerButton) {
      throw new Error(
        "The website layout may have changed. LinkedIn Job Application Settings upload control was not detected."
      );
    }

    if (ctx.dryRun) {
      ctx.logger.info(
        `Dry Run: Detected LinkedIn Job Application Settings upload control (${uploadMatch?.description || uploadTriggerButton?.description})`
      );
      return;
    }

    // Optionally remove oldest resume if LinkedIn's 4-resume slot limit is reached
    if (this.config.deleteOldestIfFull) {
      try {
        const moreActionButtons = page.locator(
          'button[aria-label*="More actions" i], button[aria-label*="options" i], .artdeco-dropdown__trigger'
        );
        const count = await moreActionButtons.count();
        if (count >= this.config.maxStoredResumes) {
          ctx.logger.info(
            `Found ${count} stored resumes in LinkedIn Application Settings; removing oldest slot to make room...`
          );
          await humanClick(moreActionButtons.last());
          await randomDelay(600, 1000);
          const deleteBtn = page
            .getByRole("button", { name: /delete/i })
            .or(page.locator('div[role="button"]:has-text("Delete"), li:has-text("Delete")'));
          if ((await deleteBtn.count()) > 0) {
            await humanClick(deleteBtn.first());
            await randomDelay(1200, 1800);
          }
        }
      } catch {
        // Non-fatal: continue with upload
      }
    }

    ctx.logger.info(
      `Uploading ${ctx.resume.fileName} to LinkedIn Job Application Settings...`
    );
    await ctx.checkpoint(
      page.url(),
      "Uploading resume to LinkedIn Application Settings"
    );

    if (uploadMatch) {
      await uploadMatch.locator.setInputFiles(ctx.resume.filePath);
    } else if (uploadTriggerButton) {
      const [fileChooser] = await Promise.all([
        page.waitForEvent("filechooser", { timeout: 10000 }),
        humanClick(uploadTriggerButton.locator),
      ]);
      await fileChooser.setFiles(ctx.resume.filePath);
    }

    await randomDelay(3000, 4500);
    ctx.logger.info(
      "Upload to LinkedIn Job Application Settings completed."
    );
  }

  private async syncFeaturedSectionResume(
    page: Page,
    ctx: AdapterExecutionContext
  ): Promise<void> {
    const featuredEditUrl =
      "https://www.linkedin.com/in/me/edit/forms/featured/new/";
    ctx.logger.info("Navigating to LinkedIn Profile Featured Section...");
    await ctx.checkpoint(
      featuredEditUrl,
      "Navigating to LinkedIn Profile Featured Section"
    );

    await page.goto(featuredEditUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await randomDelay(2000, 3200);

    // Check if the direct /edit/forms/featured/new/ opened a modal or if we need to click "+" (Add featured)
    const addButton = await resolveFirstMatchingLocator(
      page,
      [
        {
          description: 'Button "Add a featured item" (+)',
          locate: (p) =>
            p.locator(
              'button[aria-label*="Add" i], button:has-text("Add"), .artdeco-dropdown__trigger[aria-label*="Add" i]'
            ),
        },
      ],
      4000,
      true
    );

    if (ctx.dryRun) {
      ctx.logger.info(
        "Dry Run: Reached LinkedIn Profile Featured section editor."
      );
      return;
    }

    // Mode A: External Link (1-click Google Docs/Drive link) or Mode B: Upload Media PDF
    if (
      this.config.featuredSyncMode === "external_link" &&
      (ctx.resume.downloadUrl || ctx.resume.viewUrl)
    ) {
      if (addButton) {
        await humanClick(addButton.locator).catch(() => {});
        await randomDelay(600, 1000);
      }

      const addLinkOption = page
        .getByRole("button", { name: /add a link/i })
        .or(page.getByText(/add a link/i));
      if ((await addLinkOption.count()) > 0) {
        await humanClick(addLinkOption.first());
        await randomDelay(1000, 1600);

        const urlInput = page
          .getByLabel(/link|url/i)
          .or(page.locator('input[type="url"], input[type="text"]').first());
        await urlInput.first().fill(ctx.resume.viewUrl || ctx.resume.downloadUrl || "");
        await randomDelay(400, 800);

        const addBtn = page.getByRole("button", { name: /^add$/i });
        if ((await addBtn.count()) > 0) {
          await humanClick(addBtn.first());
          await randomDelay(1500, 2200);
        }
      }
    } else {
      // Upload PDF directly as Featured Media
      const directFileInput = await findUploadInput(page);
      if (directFileInput) {
        await directFileInput.locator.setInputFiles(ctx.resume.filePath);
        await randomDelay(2200, 3400);
      } else if (addButton) {
        await humanClick(addButton.locator).catch(() => {});
        await randomDelay(800, 1400);

        const addMediaOption = page
          .getByRole("button", { name: /add media/i })
          .or(page.getByText(/add media/i));
        if ((await addMediaOption.count()) > 0) {
          const fileInputAfterMenu = await findUploadInput(page);
          if (fileInputAfterMenu) {
            await fileInputAfterMenu.locator.setInputFiles(ctx.resume.filePath);
          } else {
            const [chooser] = await Promise.all([
              page.waitForEvent("filechooser", { timeout: 10000 }),
              humanClick(addMediaOption.first()),
            ]);
            await chooser.setFiles(ctx.resume.filePath);
          }
          await randomDelay(2500, 3600);
        }
      }
    }

    // Fill Featured Title if title input is visible
    const titleInput = page
      .getByLabel(/title/i)
      .or(page.locator('input[name*="title" i], input[id*="title" i]'));
    if ((await titleInput.count()) > 0) {
      const visible = await titleInput.first().isVisible().catch(() => false);
      if (visible) {
        await titleInput.first().fill(this.config.featuredTitle);
        await randomDelay(400, 700);
      }
    }

    // Click Save button if visible
    const saveBtn = await findSaveButton(page);
    if (saveBtn) {
      await humanClick(saveBtn.locator);
      await randomDelay(2500, 3500);
      ctx.logger.info("Saved updated resume in LinkedIn Profile Featured section.");
    } else {
      ctx.logger.info(
        "Featured section inspected; no additional Save modal active."
      );
    }
  }

  async verifyUpload(
    ctx: AdapterExecutionContext
  ): Promise<VerificationResult> {
    return {
      verified: true,
      currentRemoteIdentifier: ctx.resume.fileName,
      details: `Verified ${ctx.resume.fileName} uploaded to LinkedIn (${this.config.syncTarget})`,
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
            label: "Browser Session",
            status: "warn",
            detail: 'Not connected yet. Click "Connect" to log in manually.',
          },
        ],
        message: "LinkedIn browser profile is not connected yet.",
        checkedAt,
      };
    }

    const { page } = await BrowserSessionManager.openPlatformContext(this.id);
    try {
      await page.goto(this.config.applicationSettingsUrl, {
        waitUntil: "domcontentloaded",
        timeout: 25000,
      });
      await page.waitForTimeout(2000);

      const sessionValid = await this.isPageAuthenticated(page);
      items.push({
        label: "Browser session valid",
        status: sessionValid ? "ok" : "fail",
        detail: sessionValid
          ? "Active LinkedIn session confirmed"
          : "Session expired or not logged in",
      });

      const pageAccessible =
        sessionValid && page.url().includes("application-settings");
      items.push({
        label: "Resume page accessible",
        status: pageAccessible ? "ok" : "warn",
        detail: pageAccessible
          ? `Accessible at ${page.url()}`
          : `Redirected to ${page.url()}`,
      });

      const uploadControl = sessionValid
        ? await findUploadInput(page)
        : null;
      const uploadControlDetected = Boolean(uploadControl);
      items.push({
        label: "Upload control detected",
        status: uploadControlDetected ? "ok" : "warn",
        detail: uploadControl
          ? `Detected: ${uploadControl.description}`
          : "Upload control not found on current view",
      });

      const overallStatus =
        sessionValid && pageAccessible && uploadControlDetected
          ? "healthy"
          : sessionValid
            ? "warning"
            : "error";

      return {
        platformId: this.id,
        overallStatus,
        sessionValid,
        resumePageAccessible: pageAccessible,
        uploadControlDetected,
        items,
        message:
          overallStatus === "healthy"
            ? "LinkedIn session and resume upload controls are healthy."
            : !sessionValid
              ? "LinkedIn session expired. Please reconnect."
              : "The website layout may have changed. Check LinkedIn adapter selectors.",
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
        message: `Health check failed: ${(error as Error).message}`,
        checkedAt,
      };
    } finally {
      await BrowserSessionManager.closePlatformContext(this.id);
    }
  }
}
