"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Settings2,
  ShieldCheck,
  Activity,
  Plus,
  Loader2,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { HealthCheckResult } from "@/core/types";

interface PlatformRow {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  connected: boolean;
  loginStatus: string;
  adapterVersion: string;
  url: string;
  healthStatus: string;
  healthDetailsJson: string | null;
  lastHealthCheckAt: string | null;
}

export default function PlatformsPage() {
  const [platforms, setPlatforms] = useState<PlatformRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customForm, setCustomForm] = useState({
    name: "",
    websiteUrl: "",
    loginUrl: "",
    resumePageUrl: "",
    uploadSelector: 'input[type="file"]',
    saveSelector: 'button:has-text("Save")',
    verificationSelector: ".resume-filename",
  });
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadPlatforms = useCallback(async () => {
    const res = await fetch("/api/platforms");
    const data = await res.json();
    if (data.platforms) setPlatforms(data.platforms);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPlatforms();
  }, [loadPlatforms]);

  async function toggleEnabled(platform: PlatformRow) {
    setBusyId(`toggle_${platform.id}`);
    try {
      await fetch(`/api/platforms/${platform.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !platform.enabled }),
      });
      await loadPlatforms();
    } finally {
      setBusyId(null);
    }
  }

  async function handleConnect(platformId: string) {
    setBusyId(`connect_${platformId}`);
    setFeedback(null);
    try {
      const res = await fetch(`/api/platforms/${platformId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect" }),
      });
      const data = await res.json();
      setFeedback(data.message || "Connection finished.");
      await loadPlatforms();
    } finally {
      setBusyId(null);
    }
  }

  async function handleHealthCheck(platformId: string) {
    setBusyId(`health_${platformId}`);
    setFeedback(null);
    try {
      const res = await fetch(`/api/platforms/${platformId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "health_check" }),
      });
      const data = await res.json();
      if (data.health) {
        setFeedback(`${platformId.toUpperCase()}: ${data.health.message}`);
      }
      await loadPlatforms();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeleteCustom(platformId: string) {
    setBusyId(`delete_${platformId}`);
    try {
      await fetch(`/api/platforms/${platformId}`, { method: "DELETE" });
      await loadPlatforms();
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreateCustom(e: React.FormEvent) {
    e.preventDefault();
    setBusyId("create_custom");
    try {
      const res = await fetch("/api/platforms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowAddCustom(false);
      setCustomForm({
        name: "",
        websiteUrl: "",
        loginUrl: "",
        resumePageUrl: "",
        uploadSelector: 'input[type="file"]',
        saveSelector: 'button:has-text("Save")',
        verificationSelector: ".resume-filename",
      });
      setFeedback(`Added custom platform: ${data.platform.name}`);
      await loadPlatforms();
    } catch (err) {
      setFeedback((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Platforms & Adapter Health
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Connect persistent browser profiles, verify page structure via Health Checks, and add custom job portals.
          </p>
        </div>

        <button
          onClick={() => setShowAddCustom(!showAddCustom)}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500"
        >
          <Plus className="h-4 w-4" />
          <span>Add Custom Website</span>
        </button>
      </div>

      {feedback && (
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/30 px-4 py-3 text-xs text-indigo-200 flex items-center justify-between">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="underline ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* Custom Website Adapter Form (Section 16) */}
      {showAddCustom && (
        <form
          onSubmit={handleCreateCustom}
          className="rounded-2xl border border-indigo-500/40 bg-[#0d111c] p-6 space-y-4"
        >
          <h2 className="text-base font-semibold text-white">
            Add Generic Custom Website Adapter
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Website Name *
              </label>
              <input
                required
                value={customForm.name}
                onChange={(e) =>
                  setCustomForm({ ...customForm, name: e.target.value })
                }
                placeholder="e.g. Indeed / Wellfound / My Job Portal"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Website URL *
              </label>
              <input
                required
                type="url"
                value={customForm.websiteUrl}
                onChange={(e) =>
                  setCustomForm({ ...customForm, websiteUrl: e.target.value })
                }
                placeholder="https://example.com"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Login URL
              </label>
              <input
                type="url"
                value={customForm.loginUrl}
                onChange={(e) =>
                  setCustomForm({ ...customForm, loginUrl: e.target.value })
                }
                placeholder="https://example.com/login"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Resume Page URL *
              </label>
              <input
                required
                type="url"
                value={customForm.resumePageUrl}
                onChange={(e) =>
                  setCustomForm({
                    ...customForm,
                    resumePageUrl: e.target.value,
                  })
                }
                placeholder="https://example.com/profile/resume"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Upload Selector
              </label>
              <input
                value={customForm.uploadSelector}
                onChange={(e) =>
                  setCustomForm({
                    ...customForm,
                    uploadSelector: e.target.value,
                  })
                }
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Save Button Selector
              </label>
              <input
                value={customForm.saveSelector}
                onChange={(e) =>
                  setCustomForm({ ...customForm, saveSelector: e.target.value })
                }
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAddCustom(false)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busyId !== null}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
            >
              Save Platform
            </button>
          </div>
        </form>
      )}

      {/* Platforms List */}
      {loading ? (
        <div className="text-sm text-slate-400">Loading platforms...</div>
      ) : (
        <div className="space-y-4">
          {platforms.map((platform) => {
            let parsedHealth: HealthCheckResult | null = null;
            if (platform.healthDetailsJson) {
              try {
                parsedHealth = JSON.parse(platform.healthDetailsJson);
              } catch {
                parsedHealth = null;
              }
            }

            return (
              <div
                key={platform.id}
                className="rounded-2xl border border-slate-800 bg-[#0d111c] p-6"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-white">
                        {platform.name}
                      </h3>
                      <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-300">
                        Adapter v{platform.adapterVersion}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          platform.enabled
                            ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {platform.enabled ? "Enabled ✓" : "Disabled"}
                      </span>
                    </div>
                    <a
                      href={platform.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-400"
                    >
                      {platform.url} <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => toggleEnabled(platform)}
                      disabled={busyId !== null}
                      className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                    >
                      {platform.enabled ? "Disable" : "Enable"}
                    </button>

                    {platform.type !== "portfolio" && (
                      <button
                        onClick={() => handleConnect(platform.id)}
                        disabled={busyId !== null}
                        className="flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-600/20 px-3 py-1.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-600/30"
                      >
                        {busyId === `connect_${platform.id}` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ShieldCheck className="h-3.5 w-3.5" />
                        )}
                        <span>
                          {platform.connected
                            ? "Reconnect Session"
                            : "Connect Login"}
                        </span>
                      </button>
                    )}

                    <button
                      onClick={() => handleHealthCheck(platform.id)}
                      disabled={busyId !== null}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
                    >
                      {busyId === `health_${platform.id}` ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Activity className="h-3.5 w-3.5 text-emerald-400" />
                      )}
                      <span>Health Check</span>
                    </button>

                    <Link
                      href={`/platforms/${platform.id}`}
                      className="flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                      <span>Configure</span>
                    </Link>

                    {platform.type === "custom" && (
                      <button
                        onClick={() => handleDeleteCustom(platform.id)}
                        className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-1.5 text-rose-400 hover:bg-rose-500/20"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Health Check Report (Section 37) */}
                {parsedHealth && (
                  <div className="mt-4 rounded-xl border border-slate-800/90 bg-slate-950/60 p-4 text-xs">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-slate-200">
                        Platform Health Report ({parsedHealth.message})
                      </span>
                      <span className="text-slate-500">
                        Checked:{" "}
                        {new Date(parsedHealth.checkedAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                      {parsedHealth.items.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-2 rounded-lg border border-slate-800/70 bg-slate-900/50 p-2.5"
                        >
                          {item.status === "ok" ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                          ) : item.status === "warn" ? (
                            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                          ) : (
                            <XCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <div className="font-medium text-slate-200">
                              {item.label}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {item.detail}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
