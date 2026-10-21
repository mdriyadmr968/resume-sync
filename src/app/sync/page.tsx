"use client";

import React, { useEffect, useState } from "react";
import { LiveBrowserState } from "@/core/types";
import {
  Play,
  Pause,
  Square,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  Terminal,
  Globe,
} from "lucide-react";

export default function SyncPage() {
  const [liveState, setLiveState] = useState<LiveBrowserState | null>(null);
  const [dryRun, setDryRun] = useState(false);
  const [force, setForce] = useState(false);
  const [logFilter, setLogFilter] = useState<"ALL" | "INFO" | "WARN" | "ERROR">(
    "ALL"
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const es = new EventSource("/api/sync/stream");
    es.onmessage = (event) => {
      try {
        setLiveState(JSON.parse(event.data));
      } catch {
        // ignore
      }
    };
    return () => es.close();
  }, []);

  async function startSync() {
    setBusy(true);
    try {
      await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun, force }),
      });
    } finally {
      setBusy(false);
    }
  }

  async function sendControl(command: "pause" | "resume" | "stop") {
    setBusy(true);
    try {
      await fetch("/api/sync/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
    } finally {
      setBusy(false);
    }
  }

  const platformList = liveState
    ? Object.values(liveState.platformStates)
    : [];

  const filteredLogs = (liveState?.logs || []).filter((l) =>
    logFilter === "ALL" ? true : l.level === logFilter
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Browser Automation Control Panel
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Monitor sequential platform execution, pause or stop browser sessions safely, and inspect real-time logs.
          </p>
        </div>

        {!liveState?.isRunning && (
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
              />
              <span>Dry Run</span>
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={force}
                onChange={(e) => setForce(e.target.checked)}
              />
              <span>Force Re-upload</span>
            </label>
            <button
              onClick={startSync}
              disabled={busy}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              <Play className="h-4 w-4 fill-current" />
              <span>{dryRun ? "Start Dry Run" : "Start Sync All"}</span>
            </button>
          </div>
        )}
      </div>

      {/* Browser Control Panel Card (Section 28) */}
      <div className="rounded-2xl border border-slate-800 bg-[#0d111c] p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <Globe className="h-5 w-5 text-indigo-400" />
              <span className="text-base font-semibold text-white">
                Browser Automation Status:{" "}
                <span
                  className={
                    liveState?.isRunning
                      ? liveState.isPaused
                        ? "text-amber-400"
                        : "text-emerald-400"
                      : "text-slate-400"
                  }
                >
                  {liveState?.isRunning
                    ? liveState.isPaused
                      ? "Paused"
                      : "Running"
                    : "Idle"}
                </span>
              </span>
              {liveState?.jobNumber && (
                <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-mono text-slate-300">
                  Sync #{liveState.jobNumber}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Current platform:{" "}
              <strong className="text-slate-200">
                {liveState?.currentPlatformName || "—"}
              </strong>{" "}
              • Step:{" "}
              <strong className="text-indigo-300">
                {liveState?.currentStep || "Ready"}
              </strong>
            </p>
            {liveState?.currentUrl && (
              <p className="text-xs font-mono text-slate-500 truncate max-w-2xl">
                Current URL: {liveState.currentUrl}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => sendControl("pause")}
              disabled={!liveState?.isRunning || liveState.isPaused || busy}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-40"
            >
              <Pause className="h-3.5 w-3.5" /> Pause
            </button>
            <button
              onClick={() => sendControl("resume")}
              disabled={!liveState?.isRunning || !liveState.isPaused || busy}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-600/20 px-4 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-600/30 disabled:opacity-40"
            >
              <Play className="h-3.5 w-3.5" /> Resume
            </button>
            <button
              onClick={() => sendControl("stop")}
              disabled={!liveState?.isRunning || busy}
              className="flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-600/20 px-4 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-600/30 disabled:opacity-40"
            >
              <Square className="h-3.5 w-3.5" /> Stop
            </button>
          </div>
        </div>

        {/* Sequential Execution Pipeline */}
        {platformList.length > 0 && (
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {platformList.map((item) => (
              <div
                key={item.platformId}
                className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 flex items-start gap-3"
              >
                {item.status === "success" ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                ) : item.status === "failed" ? (
                  <XCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                ) : item.status === "running" ? (
                  <Loader2 className="h-5 w-5 text-indigo-400 animate-spin shrink-0 mt-0.5" />
                ) : item.status === "requires_user_action" ? (
                  <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                ) : (
                  <Clock className="h-5 w-5 text-slate-500 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-white">
                      {item.platformName}
                    </span>
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-slate-300">
                      {item.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400 line-clamp-2">
                    {item.step}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Structured Logs Console (Section 21) */}
      <div className="rounded-2xl border border-slate-800 bg-[#0d111c] p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-white">
              Structured Automation Logs
            </h2>
          </div>

          <div className="flex items-center gap-1">
            {(["ALL", "INFO", "WARN", "ERROR"] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setLogFilter(lvl)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${
                  logFilter === lvl
                    ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                    : "text-slate-400 hover:bg-slate-800"
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        <div className="h-96 overflow-y-auto rounded-xl border border-slate-800/90 bg-[#07090e] p-4 font-mono text-xs space-y-1.5">
          {filteredLogs.length === 0 ? (
            <p className="text-slate-500">
              No log entries yet. Start a sync run to stream structured events.
            </p>
          ) : (
            filteredLogs.map((entry, idx) => (
              <div key={idx} className="flex items-start gap-2.5 leading-relaxed">
                <span className="text-slate-500 shrink-0">
                  [{entry.timestamp}]
                </span>
                <span
                  className={`shrink-0 font-semibold ${
                    entry.level === "ERROR"
                      ? "text-rose-400"
                      : entry.level === "WARN"
                        ? "text-amber-400"
                        : "text-indigo-400"
                  }`}
                >
                  {entry.level}
                </span>
                {entry.platformId && (
                  <span className="rounded bg-slate-800/80 px-1.5 py-0.2 text-[10px] text-slate-300 shrink-0">
                    {entry.platformId}
                  </span>
                )}
                <span className="text-slate-200 whitespace-pre-wrap break-all">
                  {entry.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
