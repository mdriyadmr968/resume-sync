"use client";

import React, { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  ShieldCheck,
  Activity,
  Loader2,
  CheckCircle2,
} from "lucide-react";

export default function PlatformDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [platform, setPlatform] = useState<{
    id: string;
    name: string;
    type: string;
    enabled: boolean;
    connected: boolean;
    loginStatus: string;
    adapterVersion: string;
    url: string;
  } | null>(null);
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    const res = await fetch(`/api/platforms/${id}`);
    const data = await res.json();
    if (data.platform) setPlatform(data.platform);
    if (data.config) setConfig(data.config);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!platform) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/platforms/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: platform.name,
          url: platform.url,
          enabled: platform.enabled,
          config,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setFeedback("Configuration saved successfully.");
      await loadDetail();
    } catch (err) {
      setFeedback(`Error: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleAction(action: "connect" | "health_check") {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/platforms/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      setFeedback(
        data.message || data.health?.message || "Completed successfully."
      );
      await loadDetail();
    } finally {
      setSaving(false);
    }
  }

  if (loading || !platform) {
    return <div className="text-sm text-slate-400">Loading platform...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/platforms"
            className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-slate-300 hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-white">
                {platform.name} Configuration
              </h1>
              <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-400">
                Adapter v{platform.adapterVersion}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Platform ID: <code className="text-slate-300">{platform.id}</code>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {platform.type !== "portfolio" && (
            <button
              type="button"
              onClick={() => handleAction("connect")}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-xl border border-indigo-500/40 bg-indigo-600/20 px-3.5 py-2 text-xs font-semibold text-indigo-200 hover:bg-indigo-600/30"
            >
              <ShieldCheck className="h-4 w-4" />
              <span>
                {platform.connected ? "Reconnect Browser" : "Connect Browser"}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => handleAction("health_check")}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
          >
            <Activity className="h-4 w-4 text-emerald-400" />
            <span>Run Health Check</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-4 py-3 text-xs text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      <form
        onSubmit={handleSave}
        className="rounded-2xl border border-slate-800 bg-[#0d111c] p-6 space-y-6"
      >
        {/* General Settings */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 border-b border-slate-800 pb-6">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Display Name
            </label>
            <input
              value={platform.name}
              onChange={(e) =>
                setPlatform({ ...platform, name: e.target.value })
              }
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Platform URL
            </label>
            <input
              value={platform.url}
              onChange={(e) =>
                setPlatform({ ...platform, url: e.target.value })
              }
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={platform.enabled}
                onChange={(e) =>
                  setPlatform({ ...platform, enabled: e.target.checked })
                }
                className="h-4 w-4 rounded border-slate-700 bg-slate-950"
              />
              <span>Enable this platform during &ldquo;Sync All&rdquo; runs</span>
            </label>
          </div>
        </div>

        {/* Portfolio Adapter Config */}
        {platform.type === "portfolio" && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-indigo-300">
              Portfolio Synchronization Workflow
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Workflow Type
                </label>
                <select
                  value={String(config.mode || "git_repo")}
                  onChange={(e) =>
                    setConfig({ ...config, mode: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white"
                >
                  <option value="git_repo">
                    Git-based Local Repo (Updates lib/data.ts 1-Click Link + Git Push)
                  </option>
                  <option value="browser_admin">
                    Custom Admin Dashboard (Playwright Upload)
                  </option>
                  <option value="file_copy">Direct Local File Copy</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Local Portfolio Git Repository Path
                </label>
                <input
                  value={String(config.localRepoPath || "")}
                  onChange={(e) =>
                    setConfig({ ...config, localRepoPath: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Config File Relative Path (updates resumeUrl & resumeViewUrl)
                </label>
                <input
                  value={String(config.dataFilePath || "lib/data.ts")}
                  onChange={(e) =>
                    setConfig({ ...config, dataFilePath: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Git Branch
                </label>
                <input
                  value={String(config.gitBranch || "main")}
                  onChange={(e) =>
                    setConfig({ ...config, gitBranch: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-white"
                />
              </div>
              <div className="sm:col-span-2 flex flex-col gap-2 pt-1">
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={Boolean(config.autoCommitAndPush ?? true)}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        autoCommitAndPush: e.target.checked,
                      })
                    }
                  />
                  <span>
                    Automatically run <code>git commit</code> and{" "}
                    <code>git push</code> when the resume link or static PDF changes
                  </span>
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={Boolean(config.copyStaticPdf ?? false)}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        copyStaticPdf: e.target.checked,
                      })
                    }
                  />
                  <span>
                    Also copy downloaded PDF into <code>public/resume.pdf</code> inside the portfolio repo
                  </span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* LinkedIn Adapter Config */}
        {platform.type === "linkedin" && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-indigo-300">
              LinkedIn Dual-Target Settings
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Sections to Update on Sync
                </label>
                <select
                  value={String(config.syncTarget || "both")}
                  onChange={(e) =>
                    setConfig({ ...config, syncTarget: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white"
                >
                  <option value="both">
                    Update Both: Job Application Settings + Profile Featured Section
                  </option>
                  <option value="application_settings">
                    Job Application Settings Only (Easy Apply)
                  </option>
                  <option value="featured_section">
                    Profile Featured Section Only
                  </option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Featured Section Sync Mode
                </label>
                <select
                  value={String(config.featuredSyncMode || "upload_pdf")}
                  onChange={(e) =>
                    setConfig({ ...config, featuredSyncMode: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white"
                >
                  <option value="upload_pdf">
                    Upload Downloaded Resume PDF as Media
                  </option>
                  <option value="external_link">
                    Add 1-Click Google Docs / Drive Link
                  </option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Job Application Settings URL
                </label>
                <input
                  value={String(config.applicationSettingsUrl || "")}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      applicationSettingsUrl: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Featured Item Title
                </label>
                <input
                  value={String(config.featuredTitle || "")}
                  onChange={(e) =>
                    setConfig({ ...config, featuredTitle: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={Boolean(config.deleteOldestIfFull ?? true)}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        deleteOldestIfFull: e.target.checked,
                      })
                    }
                  />
                  <span>
                    Automatically delete oldest stored resume in Job Application Settings if LinkedIn&apos;s 4-resume limit is reached
                  </span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* BDJobs Adapter Config */}
        {platform.type === "bdjobs" && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-indigo-300">
              BDJobs Personalized Resume Settings
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Login URL
                </label>
                <input
                  value={String(config.loginUrl || "")}
                  onChange={(e) =>
                    setConfig({ ...config, loginUrl: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Personalized Resume Upload URL
                </label>
                <input
                  value={String(config.resumeUploadUrl || "")}
                  onChange={(e) =>
                    setConfig({ ...config, resumeUploadUrl: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Max Allowed File Size (MB)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={Number(config.maxFileSizeMB || 2)}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      maxFileSizeMB: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white"
                />
              </div>
            </div>
          </div>
        )}

        {/* Custom Website Adapter Config */}
        {platform.type === "custom" && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-indigo-300">
              Custom Website Selectors
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Login URL
                </label>
                <input
                  value={String(config.loginUrl || "")}
                  onChange={(e) =>
                    setConfig({ ...config, loginUrl: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Resume Page URL
                </label>
                <input
                  value={String(config.resumePageUrl || "")}
                  onChange={(e) =>
                    setConfig({ ...config, resumePageUrl: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Upload Input Selector
                </label>
                <input
                  value={String(config.uploadSelector || "")}
                  onChange={(e) =>
                    setConfig({ ...config, uploadSelector: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Save Button Selector
                </label>
                <input
                  value={String(config.saveSelector || "")}
                  onChange={(e) =>
                    setConfig({ ...config, saveSelector: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-white"
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-4 border-t border-slate-800">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span>Save Configuration</span>
          </button>
        </div>
      </form>
    </div>
  );
}
