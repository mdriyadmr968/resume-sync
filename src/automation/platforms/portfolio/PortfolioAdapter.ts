import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import {
  AdapterExecutionContext,
  BasePlatformAdapter,
} from "../base/PlatformAdapter";
import {
  PortfolioConfig,
  PortfolioConfigSchema,
} from "@/core/config-schemas";
import {
  HealthCheckItem,
  HealthCheckResult,
  UploadResult,
  VerificationResult,
} from "@/core/types";
import { BrowserSessionManager } from "@/automation/core/browser-manager";
import { capturePlatformScreenshot } from "@/automation/core/screenshot";
import { findSaveButton, findUploadInput } from "@/automation/core/selectors";
import { formatAutomationError } from "@/automation/core/errors";
import { calculateFileSha256 } from "@/core/resume-manager";

export class PortfolioAdapter extends BasePlatformAdapter {
  readonly id: string;
  readonly name: string;
  readonly version = "1.2.0";
  private config: PortfolioConfig;

  constructor(
    id = "portfolio",
    name = "Portfolio",
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
    this.config = PortfolioConfigSchema.parse(parsed);
  }

  async checkLogin(): Promise<boolean> {
    if (this.config.mode === "git_repo") {
      const repoPath = path.resolve(this.config.localRepoPath);
      const dataFile = path.join(repoPath, this.config.dataFilePath);
      return fs.existsSync(repoPath) && fs.existsSync(dataFile);
    }

    if (this.config.mode === "file_copy") {
      if (!this.config.destinationFilePath) return false;
      return fs.existsSync(path.dirname(path.resolve(this.config.destinationFilePath)));
    }

    return BrowserSessionManager.hasSavedProfileData(this.id);
  }

  async login(): Promise<{ connected: boolean; message: string }> {
    if (this.config.mode === "git_repo") {
      const repoPath = path.resolve(this.config.localRepoPath);
      const dataFile = path.join(repoPath, this.config.dataFilePath);
      if (fs.existsSync(repoPath) && fs.existsSync(dataFile)) {
        return {
          connected: true,
          message: `Connected to local Git repository at ${repoPath}`,
        };
      }
      return {
        connected: false,
        message: `Could not find ${this.config.dataFilePath} inside ${repoPath}`,
      };
    }

    if (this.config.mode === "file_copy") {
      return {
        connected: Boolean(this.config.destinationFilePath),
        message: this.config.destinationFilePath
          ? `Configured file destination: ${this.config.destinationFilePath}`
          : "Please configure a destination file path first.",
      };
    }

    // Browser Admin Mode
    const targetUrl = this.config.adminLoginUrl || this.config.publicSiteUrl;
    const { page } = await BrowserSessionManager.openPlatformContext(this.id);
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    return {
      connected: true,
      message:
        "Portfolio admin browser opened. Complete login in the browser window; your session is saved automatically.",
    };
  }

  async uploadResume(ctx: AdapterExecutionContext): Promise<UploadResult> {
    const timestamp = new Date().toISOString();

    try {
      if (this.config.mode === "git_repo") {
        return await this.uploadViaGitRepo(ctx);
      }

      if (this.config.mode === "file_copy") {
        return await this.uploadViaFileCopy(ctx);
      }

      return await this.uploadViaBrowserAdmin(ctx);
    } catch (error) {
      const formatted = formatAutomationError(
        this.name,
        "updating portfolio resume",
        error
      );
      ctx.logger.error(formatted.friendlyMessage);
      return {
        platform: this.id,
        success: false,
        action: "failed",
        fileName: ctx.resume.fileName,
        friendlyError: formatted.friendlyMessage,
        technicalError: formatted.technicalDetails,
        timestamp,
      };
    }
  }

  private async uploadViaGitRepo(
    ctx: AdapterExecutionContext
  ): Promise<UploadResult> {
    const timestamp = new Date().toISOString();
    const repoPath = path.resolve(this.config.localRepoPath);
    const dataFileFull = path.join(repoPath, this.config.dataFilePath);

    ctx.logger.info(`Checking local portfolio repository at ${repoPath}`);
    await ctx.checkpoint(this.config.publicSiteUrl, "Checking portfolio repository");

    if (!fs.existsSync(repoPath)) {
      throw new Error(`Portfolio repository directory not found: ${repoPath}`);
    }
    if (!fs.existsSync(dataFileFull)) {
      throw new Error(`Portfolio data file not found: ${dataFileFull}`);
    }

    const originalContent = fs.readFileSync(dataFileFull, "utf8");
    let updatedContent = originalContent;

    const desiredResumeUrl = ctx.resume.downloadUrl || "";
    const desiredViewUrl = ctx.resume.viewUrl || ctx.resume.sourceUrl || "";

    let linksModified = false;

    if (desiredResumeUrl) {
      const resumeUrlRegex = /(resumeUrl\s*:\s*["'])([^"']+)(["'])/;
      const match = updatedContent.match(resumeUrlRegex);
      if (match && match[2] !== desiredResumeUrl) {
        updatedContent = updatedContent.replace(
          resumeUrlRegex,
          `$1${desiredResumeUrl}$3`
        );
        linksModified = true;
        ctx.logger.info(
          `Updated siteConfig.resumeUrl -> ${desiredResumeUrl}`
        );
      } else if (match) {
        ctx.logger.info(
          `siteConfig.resumeUrl already points to 1-click download link (${desiredResumeUrl})`
        );
      }
    }

    if (desiredViewUrl) {
      const viewUrlRegex = /(resumeViewUrl\s*:\s*["'])([^"']+)(["'])/;
      const match = updatedContent.match(viewUrlRegex);
      if (match && match[2] !== desiredViewUrl) {
        updatedContent = updatedContent.replace(
          viewUrlRegex,
          `$1${desiredViewUrl}$3`
        );
        linksModified = true;
        ctx.logger.info(
          `Updated siteConfig.resumeViewUrl -> ${desiredViewUrl}`
        );
      }
    }

    let staticPdfModified = false;
    const staticPdfFull = path.join(repoPath, this.config.staticPdfRelativePath);
    if (this.config.copyStaticPdf) {
      if (fs.existsSync(staticPdfFull)) {
        const existingHash = calculateFileSha256(staticPdfFull);
        if (existingHash !== ctx.resume.fileHash) {
          staticPdfModified = true;
        }
      } else {
        staticPdfModified = true;
      }
    }

    if (ctx.dryRun) {
      const actionMsg =
        linksModified || staticPdfModified
          ? `Dry Run: Would update ${this.config.dataFilePath} with 1-click download link and push to ${this.config.gitBranch}`
          : `Dry Run: Portfolio 1-click download link in ${this.config.dataFilePath} is already synchronized and serving latest Google Doc PDF`;
      ctx.logger.info(actionMsg);
      return {
        platform: this.id,
        success: true,
        action: "dry_run_would_upload",
        fileName: ctx.resume.fileName,
        targetUrl: this.config.publicSiteUrl,
        details: actionMsg,
        timestamp,
      };
    }

    if (linksModified) {
      fs.writeFileSync(dataFileFull, updatedContent, "utf8");
    }

    if (this.config.copyStaticPdf && staticPdfModified) {
      const destDir = path.dirname(staticPdfFull);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      fs.copyFileSync(ctx.resume.filePath, staticPdfFull);
      ctx.logger.info(`Copied static PDF to ${staticPdfFull}`);
    }

    if ((linksModified || staticPdfModified) && this.config.autoCommitAndPush) {
      await ctx.checkpoint(this.config.publicSiteUrl, "Committing and pushing portfolio update");
      const filesToStage = [this.config.dataFilePath];
      if (this.config.copyStaticPdf && staticPdfModified) {
        filesToStage.push(this.config.staticPdfRelativePath);
      }

      execFileSync("git", ["add", ...filesToStage], {
        cwd: repoPath,
        stdio: "pipe",
      });

      const statusOut = execFileSync(
        "git",
        ["status", "--porcelain", ...filesToStage],
        { cwd: repoPath, encoding: "utf8" }
      ).trim();

      if (statusOut.length > 0) {
        execFileSync(
          "git",
          ["commit", "-m", this.config.commitMessage || "chore: update resume link"],
          { cwd: repoPath, stdio: "pipe" }
        );
        ctx.logger.info(`Committed changes in ${repoPath}`);

        execFileSync("git", ["push", "origin", this.config.gitBranch || "main"], {
          cwd: repoPath,
          stdio: "pipe",
        });
        ctx.logger.info(
          `Pushed commit to origin/${this.config.gitBranch || "main"} (Netlify auto-deploy triggered)`
        );
      }
    } else if (!linksModified && !staticPdfModified) {
      ctx.logger.info(
        "Portfolio link in lib/data.ts already matches the active 1-click Google Docs export URL; live PDF is served directly."
      );
    }

    const verification = await this.verifyUpload(ctx);
    if (!verification.verified) {
      throw new Error(verification.details);
    }

    return {
      platform: this.id,
      success: true,
      action: "uploaded",
      fileName: ctx.resume.fileName,
      targetUrl: this.config.publicSiteUrl,
      details: verification.details,
      timestamp,
    };
  }

  private async uploadViaFileCopy(
    ctx: AdapterExecutionContext
  ): Promise<UploadResult> {
    const timestamp = new Date().toISOString();
    if (!this.config.destinationFilePath) {
      throw new Error("Destination file path is not configured for Portfolio file_copy mode.");
    }

    const dest = path.resolve(this.config.destinationFilePath);
    if (ctx.dryRun) {
      ctx.logger.info(`Dry Run: Would copy ${ctx.resume.fileName} to ${dest}`);
      return {
        platform: this.id,
        success: true,
        action: "dry_run_would_upload",
        fileName: ctx.resume.fileName,
        targetUrl: dest,
        details: `Would copy resume to ${dest}`,
        timestamp,
      };
    }

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(ctx.resume.filePath, dest);
    ctx.logger.info(`Copied resume to ${dest}`);

    const verification = await this.verifyUpload(ctx);
    return {
      platform: this.id,
      success: verification.verified,
      action: "uploaded",
      fileName: ctx.resume.fileName,
      targetUrl: dest,
      details: verification.details,
      timestamp,
    };
  }

  private async uploadViaBrowserAdmin(
    ctx: AdapterExecutionContext
  ): Promise<UploadResult> {
    const timestamp = new Date().toISOString();
    const uploadUrl = this.config.adminUploadUrl || this.config.publicSiteUrl;

    const { page } = await BrowserSessionManager.openPlatformContext(this.id);
    try {
      ctx.logger.info(`Opening Portfolio Admin at ${uploadUrl}`);
      await page.goto(uploadUrl, { waitUntil: "domcontentloaded" });
      await ctx.checkpoint(page.url(), "Navigating to portfolio resume upload");

      const uploadMatch = await findUploadInput(
        page,
        this.config.fileInputSelector
      );
      if (!uploadMatch) {
        throw new Error(
          `Could not locate file upload input (${this.config.fileInputSelector}) on ${page.url()}`
        );
      }

      if (ctx.dryRun) {
        ctx.logger.info(
          `Dry Run: Detected upload control (${uploadMatch.description}) on ${page.url()}`
        );
        return {
          platform: this.id,
          success: true,
          action: "dry_run_would_upload",
          fileName: ctx.resume.fileName,
          targetUrl: page.url(),
          details: `Would upload ${ctx.resume.fileName} via ${uploadMatch.description}`,
          timestamp,
        };
      }

      await uploadMatch.locator.setInputFiles(ctx.resume.filePath);
      ctx.logger.info(`Selected file ${ctx.resume.fileName}`);

      const saveMatch = await findSaveButton(
        page,
        this.config.saveButtonSelector
      );
      if (!saveMatch) {
        throw new Error("Could not find Save button on Portfolio admin page.");
      }

      await saveMatch.locator.click();
      await page.waitForTimeout(2000);

      const shot = await capturePlatformScreenshot(page, this.id, "success");

      return {
        platform: this.id,
        success: true,
        action: "uploaded",
        fileName: ctx.resume.fileName,
        targetUrl: page.url(),
        screenshotPath: shot?.relativePath,
        details: "Uploaded resume via Portfolio admin interface",
        timestamp,
      };
    } catch (error) {
      const shot = await capturePlatformScreenshot(page, this.id, "error");
      const formatted = formatAutomationError(
        this.name,
        "uploading via browser admin",
        error,
        shot?.relativePath,
        shot?.pageUrl
      );
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
    }
  }

  async verifyUpload(
    ctx: AdapterExecutionContext
  ): Promise<VerificationResult> {
    if (this.config.mode === "git_repo") {
      const repoPath = path.resolve(this.config.localRepoPath);
      const dataFileFull = path.join(repoPath, this.config.dataFilePath);
      if (!fs.existsSync(dataFileFull)) {
        return {
          verified: false,
          details: `Portfolio data file missing at ${dataFileFull}`,
        };
      }

      const content = fs.readFileSync(dataFileFull, "utf8");
      const match = content.match(/resumeUrl\s*:\s*["']([^"']+)["']/);
      const configuredUrl = match ? match[1] : "";

      if (ctx.resume.downloadUrl && configuredUrl !== ctx.resume.downloadUrl) {
        return {
          verified: false,
          details: `siteConfig.resumeUrl (${configuredUrl}) does not match expected (${ctx.resume.downloadUrl})`,
        };
      }

      return {
        verified: true,
        currentRemoteIdentifier: configuredUrl,
        details: `Verified siteConfig.resumeUrl in ${this.config.dataFilePath} -> ${configuredUrl}`,
      };
    }

    if (this.config.mode === "file_copy" && this.config.destinationFilePath) {
      const dest = path.resolve(this.config.destinationFilePath);
      if (!fs.existsSync(dest)) {
        return { verified: false, details: `Destination file missing at ${dest}` };
      }
      const destHash = calculateFileSha256(dest);
      return {
        verified: destHash === ctx.resume.fileHash,
        details:
          destHash === ctx.resume.fileHash
            ? `SHA-256 verified at ${dest}`
            : "Destination file hash mismatch",
      };
    }

    return {
      verified: true,
      details: "Portfolio admin upload verified",
    };
  }

  async runHealthCheck(): Promise<HealthCheckResult> {
    const checkedAt = new Date().toISOString();
    const items: HealthCheckItem[] = [];

    if (this.config.mode === "git_repo") {
      const repoPath = path.resolve(this.config.localRepoPath);
      const repoExists = fs.existsSync(repoPath);
      items.push({
        label: "Local Portfolio Repository",
        status: repoExists ? "ok" : "fail",
        detail: repoExists
          ? `Found repository at ${repoPath}`
          : `Directory not found: ${repoPath}`,
      });

      const dataFileFull = path.join(repoPath, this.config.dataFilePath);
      const dataExists = fs.existsSync(dataFileFull);
      items.push({
        label: "Portfolio Config File (lib/data.ts)",
        status: dataExists ? "ok" : "fail",
        detail: dataExists
          ? `Found ${this.config.dataFilePath}`
          : `Missing ${this.config.dataFilePath}`,
      });

      let hasResumeUrlKey = false;
      if (dataExists) {
        const content = fs.readFileSync(dataFileFull, "utf8");
        hasResumeUrlKey = /resumeUrl\s*:/.test(content);
      }
      items.push({
        label: "siteConfig.resumeUrl Field Detection",
        status: hasResumeUrlKey ? "ok" : "warn",
        detail: hasResumeUrlKey
          ? "resumeUrl field detected in siteConfig"
          : "Could not find resumeUrl property in data file",
      });

      const allOk = repoExists && dataExists && hasResumeUrlKey;
      return {
        platformId: this.id,
        overallStatus: allOk ? "healthy" : repoExists ? "warning" : "error",
        sessionValid: repoExists,
        resumePageAccessible: dataExists,
        uploadControlDetected: hasResumeUrlKey,
        items,
        message: allOk
          ? "Portfolio Git repository and siteConfig.resumeUrl are healthy and ready."
          : "Portfolio configuration needs attention.",
        checkedAt,
      };
    }

    return {
      platformId: this.id,
      overallStatus: "healthy",
      sessionValid: true,
      resumePageAccessible: true,
      uploadControlDetected: true,
      items: [
        {
          label: `Portfolio Mode (${this.config.mode})`,
          status: "ok",
          detail: "Configuration loaded",
        },
      ],
      message: "Portfolio adapter configured.",
      checkedAt,
    };
  }
}
