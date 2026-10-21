import { execFile } from "child_process";
import { prisma, ensureSeeded, getAppSettings } from "./db";
import { getCurrentResume } from "./resume-manager";
import { syncBus } from "./interaction-gate";
import { createPlatformAdapter } from "@/automation/platforms/registry";
import { SyncLogger } from "@/automation/core/logger";
import { BrowserSessionManager } from "@/automation/core/browser-manager";
import { PlatformAdapter } from "@/automation/platforms/base/PlatformAdapter";

export interface RunSyncOptions {
  platformIds?: string[];
  dryRun?: boolean;
  force?: boolean;
  triggerSource?: "ui" | "cli";
  interactive?: boolean;
  customAdapterFactory?: (platformId: string) => PlatformAdapter | null;
}

function sendWindowsNotification(title: string, message: string) {
  if (process.env.TEST_MODE === "true") return;
  try {
    // Non-blocking native Windows notification via PowerShell BalloonTip / Toast fallback
    const psScript = `
      Add-Type -AssemblyName System.Windows.Forms
      $notify = New-Object System.Windows.Forms.NotifyIcon
      $notify.Icon = [System.Drawing.SystemIcons]::Information
      $notify.Visible = $true
      $notify.ShowBalloonTip(5000, '${title.replace(/'/g, "''")}', '${message.replace(/'/g, "''")}', [System.Windows.Forms.ToolTipIcon]::Info)
      Start-Sleep -Seconds 5
      $notify.Dispose()
    `;
    execFile(
      "powershell.exe",
      ["-NoProfile", "-WindowStyle", "Hidden", "-Command", psScript],
      { timeout: 10000 },
      () => {}
    );
  } catch {
    // Ignore desktop notification errors
  }
}

export async function getNextJobNumber(): Promise<number> {
  const agg = await prisma.syncJob.aggregate({
    _max: { jobNumber: true },
  });
  return (agg._max.jobNumber ?? 100) + 1;
}

export async function runSyncJob(options: RunSyncOptions = {}) {
  await ensureSeeded();

  if (syncBus.getState().isRunning) {
    throw new Error(
      "A synchronization job is already running. Please wait or stop the current job."
    );
  }

  const settings = await getAppSettings();
  const dryRun = options.dryRun ?? settings.dryRunDefault ?? false;
  const triggerSource = options.triggerSource ?? "ui";
  const interactive = options.interactive ?? triggerSource === "ui";

  // Refresh/fetch latest resume (if Google Docs URL, re-exports latest PDF to detect changes!)
  const resume = await getCurrentResume({
    refreshFromGoogle: process.env.TEST_MODE !== "true",
  });

  if (!resume) {
    throw new Error(
      "No Master Resume is configured yet. Please select a local file or paste a Google Docs/Drive link first."
    );
  }

  const allPlatforms = await prisma.platform.findMany({
    orderBy: { sortOrder: "asc" },
  });

  const targetPlatforms = allPlatforms.filter((p) => {
    if (options.platformIds && options.platformIds.length > 0) {
      return options.platformIds.includes(p.id);
    }
    return p.enabled;
  });

  if (targetPlatforms.length === 0) {
    throw new Error("No enabled platforms selected for synchronization.");
  }

  const jobNumber = await getNextJobNumber();
  const syncJob = await prisma.syncJob.create({
    data: {
      jobNumber,
      resumeId: resume.id,
      status: "running",
      dryRun,
      triggerSource,
    },
  });

  syncBus.startJob(
    syncJob.id,
    jobNumber,
    dryRun,
    targetPlatforms.map((p) => ({ id: p.id, name: p.name }))
  );

  const globalLogger = new SyncLogger(undefined, (entry) =>
    syncBus.appendLog(entry)
  );
  globalLogger.info(
    `Starting Resume Sync #${jobNumber}${dryRun ? " (DRY RUN)" : ""}`
  );
  globalLogger.info(`Master Resume: ${resume.fileName} (v${resume.version})`);
  globalLogger.info(`SHA-256 calculated: ${resume.fileHash.slice(0, 16)}...`);

  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let attentionCount = 0;

  try {
    for (const platform of targetPlatforms) {
      if (syncBus.isStopRequested()) {
        break;
      }

      const adapter =
        options.customAdapterFactory?.(platform.id) ??
        createPlatformAdapter(platform);

      const record = await prisma.syncRecord.create({
        data: {
          syncJobId: syncJob.id,
          platformId: platform.id,
          resumeId: resume.id,
          adapterVersion: adapter.version,
          status: "running",
          targetUrl: platform.url,
        },
      });

      const platformLogger = new SyncLogger(platform.id, (entry) =>
        syncBus.appendLog(entry)
      );

      syncBus.updatePlatformStep(
        platform.id,
        platform.name,
        "running",
        `Checking ${platform.name}...`,
        platform.url
      );

      const startedMs = Date.now();

      try {
        await syncBus.checkpoint(platform.url, `Checking ${platform.name} status`);

        // Step 1: Compare SHA-256 hash unless forced
        const isAlreadyUpToDate =
          !options.force &&
          Boolean(platform.lastSyncedHash) &&
          platform.lastSyncedHash === resume.fileHash;

        if (isAlreadyUpToDate) {
          const msg = `${platform.name} is already up to date (SHA-256 matches v${resume.version}). Skipping upload.`;
          platformLogger.info(msg);
          skippedCount++;

          await prisma.syncRecord.update({
            where: { id: record.id },
            data: {
              status: "skipped",
              action: "already_up_to_date",
              logsJson: JSON.stringify(platformLogger.getEntries()),
              durationMs: Date.now() - startedMs,
              completedAt: new Date(),
            },
          });

          syncBus.updatePlatformStep(
            platform.id,
            platform.name,
            "skipped",
            "Already up to date",
            platform.url
          );
          continue;
        }

        // Step 2: Check Manual Confirmation Mode (Section 26)
        const needsConfirmation =
          interactive &&
          !dryRun &&
          (settings.confirmationMode === "ask_before_upload" ||
            (settings.confirmationMode === "ask_on_state_change" &&
              platform.lastSyncedHash !== resume.fileHash));

        if (needsConfirmation) {
          platformLogger.info(
            `Waiting for user confirmation before uploading to ${platform.name}...`
          );
          const decision = await syncBus.requestUserAction({
            syncJobId: syncJob.id,
            platformId: platform.id,
            platformName: platform.name,
            type: "upload_confirmation",
            title: `Confirm Upload to ${platform.name}`,
            message: `Ready to upload ${resume.fileName} (v${resume.version}) to ${platform.name}. Proceed with upload?`,
            currentResumeName: platform.lastSyncedHash
              ? `Hash ${platform.lastSyncedHash.slice(0, 8)}...`
              : "Not previously synced",
            newResumeName: `${resume.fileName} (v${resume.version})`,
            currentUrl: platform.url,
            options: [
              { id: "upload", label: "Upload", variant: "primary" },
              { id: "skip", label: "Skip", variant: "secondary" },
              { id: "stop", label: "Stop Sync", variant: "danger" },
            ],
          });

          if (decision === "stop") {
            syncBus.stop();
            throw new Error("Sync stopped by user.");
          }

          if (decision === "skip") {
            platformLogger.info(`Skipped ${platform.name} by user choice.`);
            skippedCount++;
            await prisma.syncRecord.update({
              where: { id: record.id },
              data: {
                status: "skipped",
                action: "skipped_by_user",
                logsJson: JSON.stringify(platformLogger.getEntries()),
                durationMs: Date.now() - startedMs,
                completedAt: new Date(),
              },
            });
            syncBus.updatePlatformStep(
              platform.id,
              platform.name,
              "skipped",
              "Skipped by user",
              platform.url
            );
            continue;
          }
        }

        // Step 3: Execute Adapter Upload
        syncBus.updatePlatformStep(
          platform.id,
          platform.name,
          "running",
          dryRun ? "Running dry-run inspection..." : "Uploading resume...",
          platform.url
        );

        const result = await adapter.uploadResume({
          resume,
          dryRun,
          syncJobId: syncJob.id,
          logger: platformLogger,
          checkpoint: async (url, stepLabel) => {
            syncBus.updatePlatformStep(
              platform.id,
              platform.name,
              "running",
              stepLabel || "Running...",
              url
            );
            await syncBus.checkpoint(url, stepLabel);
          },
          requestSecurityVerification: async (reason, currentUrl) => {
            attentionCount++;
            await prisma.syncRecord.update({
              where: { id: record.id },
              data: { status: "requires_user_action" },
            });
            return syncBus.requestUserAction({
              syncJobId: syncJob.id,
              platformId: platform.id,
              platformName: platform.name,
              type: "security_verification",
              title: `${platform.name} Requires Verification`,
              message: reason,
              currentUrl,
              options: [
                { id: "continue", label: "Continue", variant: "primary" },
                { id: "skip", label: "Skip Platform", variant: "secondary" },
                { id: "stop", label: "Stop Sync", variant: "danger" },
              ],
            });
          },
        });

        const durationMs = Date.now() - startedMs;

        if (result.success) {
          successCount++;
          await prisma.syncRecord.update({
            where: { id: record.id },
            data: {
              status: "success",
              action: result.action,
              targetUrl: result.targetUrl || platform.url,
              screenshotPath: result.screenshotPath,
              logsJson: JSON.stringify(platformLogger.getEntries()),
              durationMs,
              completedAt: new Date(),
            },
          });

          if (!dryRun) {
            await prisma.platform.update({
              where: { id: platform.id },
              data: {
                connected: true,
                loginStatus: "connected",
                lastSyncedHash: resume.fileHash,
                lastSyncedAt: new Date(),
                lastError: null,
                healthStatus: "healthy",
              },
            });
          }

          syncBus.updatePlatformStep(
            platform.id,
            platform.name,
            "success",
            dryRun
              ? result.details || "Dry run verified"
              : "Resume updated successfully",
            result.targetUrl || platform.url,
            result.screenshotPath
          );
        } else if (result.action === "skipped_by_user") {
          skippedCount++;
          await prisma.syncRecord.update({
            where: { id: record.id },
            data: {
              status: "skipped",
              action: "skipped_by_user",
              logsJson: JSON.stringify(platformLogger.getEntries()),
              durationMs,
              completedAt: new Date(),
            },
          });
          syncBus.updatePlatformStep(
            platform.id,
            platform.name,
            "skipped",
            "Skipped by user",
            result.targetUrl || platform.url
          );
        } else {
          failedCount++;
          const isSessionIssue =
            (result.friendlyError || "").toLowerCase().includes("session") ||
            (result.friendlyError || "").toLowerCase().includes("login");
          if (isSessionIssue) {
            attentionCount++;
          }

          await prisma.syncRecord.update({
            where: { id: record.id },
            data: {
              status: "failed",
              action: "failed",
              failureUrl: result.failureUrl || platform.url,
              friendlyError: result.friendlyError || "Upload failed",
              technicalError: result.technicalError,
              screenshotPath: result.screenshotPath,
              logsJson: JSON.stringify(platformLogger.getEntries()),
              durationMs,
              completedAt: new Date(),
            },
          });

          await prisma.platform.update({
            where: { id: platform.id },
            data: {
              loginStatus: isSessionIssue ? "expired" : platform.loginStatus,
              lastError: result.friendlyError || "Upload failed",
              healthStatus: "error",
            },
          });

          syncBus.updatePlatformStep(
            platform.id,
            platform.name,
            "failed",
            result.friendlyError?.split("\n")[0] || "Failed to update resume",
            result.failureUrl || platform.url,
            result.screenshotPath
          );
        }
      } catch (err) {
        const errMsg = (err as Error).message || "Unexpected error";
        if (errMsg === "Sync stopped by user.") {
          await prisma.syncRecord.update({
            where: { id: record.id },
            data: {
              status: "skipped",
              action: "skipped_by_user",
              friendlyError: "Sync stopped by user.",
              logsJson: JSON.stringify(platformLogger.getEntries()),
              durationMs: Date.now() - startedMs,
              completedAt: new Date(),
            },
          });
          break;
        }

        failedCount++;
        platformLogger.error(errMsg);
        await prisma.syncRecord.update({
          where: { id: record.id },
          data: {
            status: "failed",
            action: "failed",
            friendlyError: errMsg,
            technicalError: (err as Error).stack,
            logsJson: JSON.stringify(platformLogger.getEntries()),
            durationMs: Date.now() - startedMs,
            completedAt: new Date(),
          },
        });

        await prisma.platform.update({
          where: { id: platform.id },
          data: {
            lastError: errMsg,
            healthStatus: "error",
          },
        });

        syncBus.updatePlatformStep(
          platform.id,
          platform.name,
          "failed",
          errMsg,
          platform.url
        );
      }
    }

    const wasStopped = syncBus.isStopRequested();
    const finalStatus = wasStopped
      ? "stopped"
      : failedCount > 0 && successCount === 0
        ? "failed"
        : "completed";

    const updatedJob = await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: finalStatus,
        successCount,
        failedCount,
        skippedCount,
        attentionCount,
        completedAt: new Date(),
      },
      include: {
        resume: true,
        records: {
          include: { platform: true },
        },
      },
    });

    const summaryMsg = wasStopped
      ? "Sync stopped by user."
      : `Sync Complete: ${successCount} updated, ${skippedCount} skipped, ${failedCount} failed.`;

    globalLogger.info(summaryMsg);
    syncBus.finishJob(summaryMsg);

    sendWindowsNotification(
      wasStopped ? "Resume Sync Stopped" : "Resume Sync Complete",
      `${successCount} platforms updated successfully. ${failedCount > 0 ? `${failedCount} failed.` : ""}`
    );

    return updatedJob;
  } finally {
    await BrowserSessionManager.closeAllContexts();
  }
}
