"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  AlertTriangle,
  CircleSlash,
  FileText,
  RefreshCw,
  FolderOpen,
  Play,
  Link2,
  Copy,
  Check,
  ExternalLink,
  Settings2,
  Sparkles,
  Loader2,
  ShieldCheck,
} from "lucide-react";

interface ResumeData {
  id: string;
  version: number;
  sourceType: string;
  sourceUrl: string | null;
  downloadUrl: string | null;
  viewUrl: string | null;
  filePath: string;
  fileName: string;
  fileHash: string;
  fileSize: number;
  modifiedAt: string;
}

interface PlatformData {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  connected: boolean;
  loginStatus: string;
  adapterVersion: string;
  url: string;
  lastSyncedHash: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  healthStatus: string;
  resumeStatus: "up_to_date" | "update_available" | "not_configured" | "disabled";
}

interface SyncJobSummary {
  id: string;
  jobNumber: number;
  status: string;
  dryRun: boolean;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  startedAt: string;
  completedAt: string | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const [resume, setResume] = useState<ResumeData | null>(null);
  const [platforms, setPlatforms] = useState<PlatformData[]>([]);
  const [lastSyncJob, setLastSyncJob] = useState<SyncJobSummary | null>(null);
  const [googleUrlInput, setGoogleUrlInput] = useState(
    "https://docs.google.com/document/d/1IDR8jyGDgTUm3mcQZxaIggSls9belqTMcZmV-gbfjU8/edit?usp=sharing"
  );
  const [dryRun, setDryRun] = useState(false);
  const [forceSync, setForceSync] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      const res = await fetch("/api/platforms");
      const data = await res.json();
      if (data.platforms) setPlatforms(data.platforms);
      if (data.currentResume) {
        setResume(data.currentResume);
        if (data.currentResume.sourceUrl) {
          setGoogleUrlInput(data.currentResume.sourceUrl);
        }
      }
      if (data.lastSyncJob) setLastSyncJob(data.lastSyncJob);
    } catch (err) {
      setErrorBanner((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  async function handleFetchGoogleUrl(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setErrorBanner(null);
    setSuccessBanner(null);
    setActionLoading("google_url");
    try {
      const res = await fetch("/api/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_google_url",
          url: googleUrlInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch Google Doc");
      setSuccessBanner(
        data.isNewVersion
          ? `Fetched new resume version v${data.currentResume.version} from Google Docs & generated 1-click PDF link!`
          : `Verified Google Docs resume (v${data.currentResume.version} — SHA-256 unchanged).`
      );
      await loadDashboard();
    } catch (err) {
      setErrorBanner((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePickLocalFile() {
    setErrorBanner(null);
    setSuccessBanner(null);
    setActionLoading("pick_file");
    try {
      const pickRes = await fetch("/api/system/pick-file", { method: "POST" });
      const pickData = await pickRes.json();
      if (pickData.cancelled || !pickData.filePath) return;

      const setRes = await fetch("/api/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_local_file",
          filePath: pickData.filePath,
        }),
      });
      const setData = await setRes.json();
      if (!setRes.ok) throw new Error(setData.error);
      setSuccessBanner(
        `Selected local Master Resume: ${setData.currentResume.fileName} (v${setData.currentResume.version})`
      );
      await loadDashboard();
    } catch (err) {
      setErrorBanner((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleOpenFolder() {
    if (!resume?.filePath) return;
    await fetch("/api/system/open-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath: resume.filePath, mode: "select" }),
    });
  }

  async function handleConnectPlatform(platformId: string) {
    setErrorBanner(null);
    setSuccessBanner(null);
    setActionLoading(`connect_${platformId}`);
    try {
      const res = await fetch(`/api/platforms/${platformId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Connect failed");
      if (data.connected) {
        setSuccessBanner(data.message);
      } else {
        setErrorBanner(data.message);
      }
      await loadDashboard();
    } catch (err) {
      setErrorBanner((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleStartSync(platformIds?: string[]) {
    setErrorBanner(null);
    setActionLoading(platformIds ? `sync_${platformIds[0]}` : "sync_all");
    try {
      // If no master resume is saved yet, automatically fetch the pre-filled Google Doc URL first!
      if (!resume && googleUrlInput.trim()) {
        const res = await fetch("/api/resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "set_google_url",
            url: googleUrlInput,
          }),
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "Please select a Master Resume first.");
        }
      }

      const syncRes = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platformIds,
          dryRun,
          force: forceSync,
        }),
      });
      const syncData = await syncRes.json();
      if (!syncRes.ok) throw new Error(syncData.error || "Failed to start sync");
      router.push("/sync");
    } catch (err) {
      setErrorBanner((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  function copyDownloadUrl() {
    if (!resume?.downloadUrl) return;
    navigator.clipboard.writeText(resume.downloadUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  const updateNeededCount = platforms.filter(
    (p) => p.enabled && p.resumeStatus === "update_available"
  ).length;

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800/80 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Resume Sync Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Share your Google Docs / Drive link or select a local file to synchronize your resume across Portfolio, LinkedIn (Application Settings + Featured), and BDJobs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-2 text-xs font-medium text-slate-300 hover:border-slate-700">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-950 text-indigo-600"
            />
            <span>Dry Run</span>
          </label>

          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-2 text-xs font-medium text-slate-300 hover:border-slate-700">
            <input
              type="checkbox"
              checked={forceSync}
              onChange={(e) => setForceSync(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-950 text-indigo-600"
            />
            <span>Force Re-upload</span>
          </label>

          <button
            onClick={() => handleStartSync()}
            disabled={actionLoading !== null}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 hover:bg-indigo-500 disabled:opacity-50 transition"
          >
            {actionLoading === "sync_all" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4 fill-current" />
            )}
            <span>{dryRun ? "Dry Run All" : "Sync All"}</span>
          </button>
        </div>
      </div>

      {errorBanner && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-200 flex items-center justify-between">
          <span>{errorBanner}</span>
          <button
            onClick={() => setErrorBanner(null)}
            className="text-xs underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {successBanner && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200 flex items-center justify-between">
          <span>{successBanner}</span>
          <button
            onClick={() => setSuccessBanner(null)}
            className="text-xs underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Master Resume Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7 rounded-2xl border border-slate-800/90 bg-[#0d111c] p-6 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <FileText className="h-5 w-5 text-indigo-400" />
              <h2 className="text-base font-semibold text-white">
                Master Resume Source
              </h2>
            </div>
            {resume && (
              <span className="rounded-full bg-indigo-500/15 border border-indigo-500/30 px-2.5 py-0.5 text-xs font-semibold text-indigo-300">
                v{resume.version} •{" "}
                {resume.sourceType === "google_url"
                  ? "Google Docs / Drive"
                  : "Local File"}
              </span>
            )}
          </div>

          {/* Google Docs / Drive Quick Sync Form */}
          <form onSubmit={handleFetchGoogleUrl} className="mt-4 space-y-3">
            <label className="block text-xs font-medium text-slate-300">
              Google Docs / Google Drive Resume Link (Auto-generates 1-Click PDF & Downloads Latest)
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Link2 className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  type="url"
                  value={googleUrlInput}
                  onChange={(e) => setGoogleUrlInput(e.target.value)}
                  placeholder="https://docs.google.com/document/d/.../edit?usp=sharing"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 pl-9 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={actionLoading !== null}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600/90 hover:bg-indigo-500 px-4 py-2 text-xs font-semibold text-white transition shrink-0 disabled:opacity-50"
              >
                {actionLoading === "google_url" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                <span>Fetch & Convert Link</span>
              </button>
            </div>
          </form>

          {/* Current Master Resume Details */}
          {resume ? (
            <div className="mt-5 rounded-xl border border-slate-800/90 bg-slate-950/60 p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-white">
                      {resume.fileName}
                    </span>
                    <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                      READY
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400 font-mono break-all">
                    {resume.filePath}
                  </p>
                </div>
                <div className="text-right text-xs text-slate-400">
                  <div>{(resume.fileSize / 1024).toFixed(1)} KB</div>
                  <div>
                    Modified: {new Date(resume.modifiedAt).toLocaleString()}
                  </div>
                </div>
              </div>

              {resume.downloadUrl && (
                <div className="rounded-lg border border-indigo-500/20 bg-indigo-950/20 p-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-300 block">
                      1-Click Downloadable PDF Link
                    </span>
                    <span className="text-xs font-mono text-slate-300 truncate block">
                      {resume.downloadUrl}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={copyDownloadUrl}
                    className="flex items-center gap-1 rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-indigo-200 hover:bg-indigo-500/20 shrink-0"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-400" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" /> Copy Link
                      </>
                    )}
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between border-t border-slate-800/80 pt-3 text-xs">
                <div className="font-mono text-slate-400">
                  SHA-256:{" "}
                  <span className="text-slate-200">
                    {resume.fileHash.slice(0, 20)}...
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePickLocalFile}
                    className="rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700"
                  >
                    Select Local File
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenFolder}
                    className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700"
                  >
                    <FolderOpen className="h-3 w-3" /> Open Folder
                  </button>
                  <a
                    href={`/api/system/view-resume?id=${resume.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700"
                  >
                    View PDF <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-5 text-center">
              <p className="text-sm text-slate-300">
                Click <strong>Fetch & Convert Link</strong> above to pull your resume from Google Docs, or select a local PDF/DOCX file.
              </p>
              <button
                type="button"
                onClick={handlePickLocalFile}
                className="mt-3 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
              >
                Or Select Local File from PC
              </button>
            </div>
          )}
        </div>

        {/* Summary & Quick Status Card */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-800/90 bg-[#0d111c] p-6 shadow-xl flex flex-col justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">
              Synchronization Summary
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              SHA-256 hash comparison prevents redundant uploads when a platform is already up to date.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-800/90 bg-slate-950/60 p-3.5">
                <span className="text-[11px] uppercase tracking-wider text-slate-400">
                  Platforms Needing Update
                </span>
                <p className="mt-1 text-2xl font-bold text-amber-400">
                  {updateNeededCount}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800/90 bg-slate-950/60 p-3.5">
                <span className="text-[11px] uppercase tracking-wider text-slate-400">
                  Active Master Version
                </span>
                <p className="mt-1 text-2xl font-bold text-indigo-400">
                  {resume ? `v${resume.version}` : "—"}
                </p>
              </div>
            </div>

            {lastSyncJob && (
              <div className="mt-4 rounded-xl border border-slate-800/90 bg-slate-950/50 p-3.5 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">
                    Last Sync Run #{lastSyncJob.jobNumber}
                    {lastSyncJob.dryRun ? " (Dry Run)" : ""}
                  </span>
                  <span className="text-slate-400">
                    {new Date(lastSyncJob.startedAt).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-slate-300 pt-1">
                  <span className="text-emerald-400">
                    ✓ {lastSyncJob.successCount} Successful
                  </span>
                  <span className="text-slate-400">
                    ○ {lastSyncJob.skippedCount} Skipped
                  </span>
                  <span className="text-rose-400">
                    ✗ {lastSyncJob.failedCount} Failed
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-slate-800/80 pt-4 text-xs text-slate-400">
            <Link
              href="/resume"
              className="text-indigo-400 hover:text-indigo-300 font-medium"
            >
              Manage Version History →
            </Link>
            <Link
              href="/history"
              className="text-slate-400 hover:text-slate-200"
            >
              View Full Logs & Screenshots →
            </Link>
          </div>
        </div>
      </div>

      {/* Platforms Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            Configured Platforms
          </h2>
          <Link
            href="/platforms"
            className="text-xs font-medium text-indigo-400 hover:text-indigo-300"
          >
            + Add Custom Website / Health Checks →
          </Link>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-800 bg-[#0d111c] p-8 text-center text-sm text-slate-400">
            Loading platforms...
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {platforms.map((platform) => {
              const isUpToDate = platform.resumeStatus === "up_to_date";
              const isNotConnected = !platform.connected && platform.type !== "portfolio";

              return (
                <div
                  key={platform.id}
                  className="flex flex-col justify-between rounded-2xl border border-slate-800/90 bg-[#0d111c] p-5 shadow-lg transition hover:border-slate-700"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-base text-white">
                            {platform.name}
                          </h3>
                          <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                            v{platform.adapterVersion}
                          </span>
                        </div>
                        <a
                          href={platform.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-0.5 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-400"
                        >
                          {platform.url}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>

                      {/* Sync Status Badge */}
                      {!platform.enabled ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-400">
                          <CircleSlash className="h-3.5 w-3.5" /> Disabled
                        </span>
                      ) : isUpToDate ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-xs font-medium text-emerald-300">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Up to date
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 text-xs font-medium text-amber-300">
                          <AlertTriangle className="h-3.5 w-3.5" /> Update available
                        </span>
                      )}
                    </div>

                    {/* Metadata Rows */}
                    <div className="mt-4 space-y-2 rounded-xl border border-slate-800/80 bg-slate-950/60 p-3 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Login Session:</span>
                        <span
                          className={`font-medium ${
                            platform.loginStatus === "connected"
                              ? "text-emerald-400"
                              : platform.loginStatus === "expired"
                                ? "text-rose-400"
                                : "text-amber-400"
                          }`}
                        >
                          {platform.type === "portfolio"
                            ? "Local Git Repo Connected"
                            : platform.loginStatus === "connected"
                              ? "Connected (Profile Saved)"
                              : platform.loginStatus === "expired"
                                ? "Session Expired"
                                : "Not Connected"}
                        </span>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-slate-400">Last Uploaded Hash:</span>
                        <span className="font-mono text-slate-300">
                          {platform.lastSyncedHash
                            ? `${platform.lastSyncedHash.slice(0, 10)}...`
                            : "Never"}
                        </span>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-slate-400">Last Sync Time:</span>
                        <span className="text-slate-300">
                          {platform.lastSyncedAt
                            ? new Date(platform.lastSyncedAt).toLocaleString()
                            : "—"}
                        </span>
                      </div>

                      {platform.id === "linkedin" && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">Target Sections:</span>
                          <span className="text-indigo-300 font-medium">
                            App Settings + Featured
                          </span>
                        </div>
                      )}

                      {platform.id === "portfolio" && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">Target Mode:</span>
                          <span className="text-indigo-300 font-medium">
                            react-portfolio (lib/data.ts)
                          </span>
                        </div>
                      )}
                    </div>

                    {platform.lastError && (
                      <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-950/30 p-2.5 text-[11px] text-rose-300 line-clamp-2">
                        {platform.lastError}
                      </div>
                    )}
                  </div>

                  {/* Card Actions */}
                  <div className="mt-4 flex items-center justify-between gap-2 pt-3 border-t border-slate-800/80">
                    <div className="flex items-center gap-2">
                      {platform.type !== "portfolio" && (
                        <button
                          onClick={() => handleConnectPlatform(platform.id)}
                          disabled={actionLoading !== null}
                          className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                            isNotConnected
                              ? "bg-amber-500/20 border border-amber-500/40 text-amber-200 hover:bg-amber-500/30"
                              : "border border-slate-700 bg-slate-800/80 text-slate-200 hover:bg-slate-700"
                          }`}
                        >
                          {actionLoading === `connect_${platform.id}` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ShieldCheck className="h-3.5 w-3.5" />
                          )}
                          <span>
                            {platform.connected ? "Reconnect" : "Connect"}
                          </span>
                        </button>
                      )}

                      <Link
                        href={`/platforms/${platform.id}`}
                        className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
                      >
                        <Settings2 className="h-3.5 w-3.5" /> Configure
                      </Link>
                    </div>

                    <button
                      onClick={() => handleStartSync([platform.id])}
                      disabled={actionLoading !== null || !platform.enabled}
                      className="flex items-center gap-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/40 px-3 py-1.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-600/30 disabled:opacity-40"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>Sync</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
