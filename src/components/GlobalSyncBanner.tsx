"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { LiveBrowserState } from "@/core/types";
import {
  AlertTriangle,
  Loader2,
  Pause,
  Play,
  Square,
  ExternalLink,
  ShieldAlert,
  CheckCircle2,
} from "lucide-react";

export function GlobalSyncBanner() {
  const [liveState, setLiveState] = useState<LiveBrowserState | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const es = new EventSource("/api/sync/stream");
    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as LiveBrowserState;
        setLiveState(parsed);
      } catch {
        // ignore
      }
    };
    return () => {
      es.close();
    };
  }, []);

  async function sendControl(
    command: "pause" | "resume" | "stop" | "decision",
    decision?: "continue" | "upload" | "skip" | "stop"
  ) {
    setSubmitting(true);
    try {
      await fetch("/api/sync/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, decision }),
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (!liveState) return null;

  const { isRunning, isPaused, activePrompt, currentPlatformName, currentStep, jobNumber, dryRun } =
    liveState;

  return (
    <>
      {/* Top Running Automation Bar */}
      {isRunning && (
        <div className="bg-indigo-950/80 border-b border-indigo-500/30 px-4 py-2.5">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-xs">
              <Loader2
                className={`h-4 w-4 text-indigo-400 ${isPaused ? "" : "animate-spin"}`}
              />
              <span className="font-semibold text-white">
                Sync #{jobNumber} {dryRun ? "(Dry Run)" : ""}:
              </span>
              {currentPlatformName && (
                <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-indigo-200 font-medium">
                  {currentPlatformName}
                </span>
              )}
              <span className="text-slate-300">{currentStep}</span>
            </div>

            <div className="flex items-center gap-2">
              {!isPaused ? (
                <button
                  onClick={() => sendControl("pause")}
                  disabled={submitting}
                  className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700"
                >
                  <Pause className="h-3 w-3" /> Pause
                </button>
              ) : (
                <button
                  onClick={() => sendControl("resume")}
                  disabled={submitting}
                  className="flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-600/20 px-2.5 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-600/30"
                >
                  <Play className="h-3 w-3" /> Resume
                </button>
              )}

              <button
                onClick={() => sendControl("stop")}
                disabled={submitting}
                className="flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-600/20 px-2.5 py-1 text-xs font-medium text-rose-300 hover:bg-rose-600/30"
              >
                <Square className="h-3 w-3" /> Stop
              </button>

              <Link
                href="/sync"
                className="flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500"
              >
                Open Control Panel <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Human-in-the-Loop Interactive Modal (2FA/CAPTCHA or Manual Confirmation) */}
      {activePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-amber-500/40 bg-[#111624] p-6 shadow-2xl">
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
                {activePrompt.type === "security_verification" ? (
                  <ShieldAlert className="h-5 w-5" />
                ) : activePrompt.type === "upload_confirmation" ? (
                  <CheckCircle2 className="h-5 w-5 text-indigo-400" />
                ) : (
                  <AlertTriangle className="h-5 w-5" />
                )}
              </div>
              <div className="flex-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">
                  {activePrompt.type === "security_verification"
                    ? "Human Action Required in Browser"
                    : "Manual Upload Confirmation"}
                </span>
                <h3 className="mt-0.5 text-lg font-semibold text-white">
                  {activePrompt.title}
                </h3>
                <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                  {activePrompt.message}
                </p>

                {activePrompt.type === "upload_confirmation" && (
                  <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 text-xs space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Platform:</span>
                      <span className="font-medium text-white">
                        {activePrompt.platformName}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Previous state:</span>
                      <span className="font-mono text-slate-300">
                        {activePrompt.currentResumeName}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">New master resume:</span>
                      <span className="font-medium text-emerald-400">
                        {activePrompt.newResumeName}
                      </span>
                    </div>
                  </div>
                )}

                {activePrompt.currentUrl && (
                  <p className="mt-3 truncate text-xs text-slate-400 font-mono">
                    URL: {activePrompt.currentUrl}
                  </p>
                )}

                <div className="mt-6 flex flex-wrap items-center justify-end gap-2.5">
                  {activePrompt.options.map((opt) => {
                    const btnStyle =
                      opt.variant === "primary"
                        ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                        : opt.variant === "danger"
                          ? "border border-rose-500/40 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300"
                          : "border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200";
                    return (
                      <button
                        key={opt.id}
                        disabled={submitting}
                        onClick={() => sendControl("decision", opt.id)}
                        className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${btnStyle}`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
