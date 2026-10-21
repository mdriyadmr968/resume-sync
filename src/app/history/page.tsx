"use client";

import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  ExternalLink,
} from "lucide-react";
import { LogEntry } from "@/core/types";

interface SyncRecordItem {
  id: string;
  status: string;
  action: string | null;
  adapterVersion: string;
  targetUrl: string | null;
  failureUrl: string | null;
  friendlyError: string | null;
  technicalError: string | null;
  screenshotPath: string | null;
  logsJson: string;
  durationMs: number | null;
  startedAt: string;
  completedAt: string | null;
  platform: {
    id: string;
    name: string;
    url: string;
  };
  resume: {
    version: number;
    fileName: string;
    fileHash: string;
  };
  syncJob: {
    jobNumber: number;
    dryRun: boolean;
  };
}

export default function HistoryPage() {
  const [records, setRecords] = useState<SyncRecordItem[]>([]);
  const [selected, setSelected] = useState<SyncRecordItem | null>(null);
  const [showTechError, setShowTechError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/sync")
      .then((r) => r.json())
      .then((data) => {
        if (data.records) setRecords(data.records);
      })
      .finally(() => setLoading(false));
  }, []);

  let parsedLogs: LogEntry[] = [];
  if (selected?.logsJson) {
    try {
      parsedLogs = JSON.parse(selected.logsJson);
    } catch {
      parsedLogs = [];
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Sync History & Audit Trail
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Click any synchronization record to inspect its resume version, SHA-256 hash, duration, captured screenshot, and logs.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Table of Sync Records */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-800 bg-[#0d111c] p-6">
          {loading ? (
            <p className="text-sm text-slate-400">Loading sync history...</p>
          ) : records.length === 0 ? (
            <p className="text-sm text-slate-400">
              No sync records yet. Run a synchronization from the Dashboard.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-3 px-2.5">Date</th>
                    <th className="py-3 px-2.5">Run</th>
                    <th className="py-3 px-2.5">Platform</th>
                    <th className="py-3 px-2.5">Resume</th>
                    <th className="py-3 px-2.5">Status</th>
                    <th className="py-3 px-2.5 text-right">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {records.map((rec) => {
                    const isSelected = selected?.id === rec.id;
                    return (
                      <tr
                        key={rec.id}
                        onClick={() => {
                          setSelected(rec);
                          setShowTechError(false);
                        }}
                        className={`cursor-pointer transition ${
                          isSelected
                            ? "bg-indigo-600/15"
                            : "hover:bg-slate-900/60"
                        }`}
                      >
                        <td className="py-3 px-2.5 text-slate-300">
                          {new Date(rec.startedAt).toLocaleString()}
                        </td>
                        <td className="py-3 px-2.5 font-mono text-slate-400">
                          #{rec.syncJob.jobNumber}
                          {rec.syncJob.dryRun ? " (Dry)" : ""}
                        </td>
                        <td className="py-3 px-2.5 font-semibold text-white">
                          {rec.platform.name}
                        </td>
                        <td className="py-3 px-2.5 text-slate-400">
                          v{rec.resume.version}
                        </td>
                        <td className="py-3 px-2.5">
                          {rec.status === "success" ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Success
                            </span>
                          ) : rec.status === "failed" ? (
                            <span className="inline-flex items-center gap-1 text-rose-400 font-medium">
                              <XCircle className="h-3.5 w-3.5" /> Failed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-slate-400">
                              <Clock className="h-3.5 w-3.5" /> {rec.status}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-2.5 text-right font-mono text-slate-400">
                          {rec.durationMs
                            ? `${(rec.durationMs / 1000).toFixed(1)}s`
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Detailed Record Inspector (Section 24 & 43) */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-800 bg-[#0d111c] p-6">
          {!selected ? (
            <div className="py-12 text-center text-sm text-slate-400">
              Select a record from the table to inspect full execution details, screenshots, and error diagnostics.
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h2 className="text-base font-semibold text-white">
                    {selected.platform.name} — Run #{selected.syncJob.jobNumber}
                  </h2>
                  <p className="text-slate-400">
                    Adapter v{selected.adapterVersion} •{" "}
                    {new Date(selected.startedAt).toLocaleString()}
                  </p>
                </div>
                <span className="rounded-full bg-slate-800 px-2.5 py-1 font-semibold uppercase text-slate-200">
                  {selected.action || selected.status}
                </span>
              </div>

              <div className="space-y-1.5 rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">Resume Version:</span>
                  <span className="font-medium text-white">
                    v{selected.resume.version} ({selected.resume.fileName})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">File SHA-256:</span>
                  <span className="font-mono text-slate-300">
                    {selected.resume.fileHash.slice(0, 16)}...
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Duration:</span>
                  <span className="text-slate-300">
                    {selected.durationMs
                      ? `${(selected.durationMs / 1000).toFixed(2)}s`
                      : "—"}
                  </span>
                </div>
                {(selected.failureUrl || selected.targetUrl) && (
                  <div className="pt-1 border-t border-slate-800/80">
                    <span className="text-slate-400 block">URL:</span>
                    <a
                      href={selected.failureUrl || selected.targetUrl || "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-indigo-400 hover:underline break-all inline-flex items-center gap-1"
                    >
                      {selected.failureUrl || selected.targetUrl}
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  </div>
                )}
              </div>

              {/* Friendly Error & Technical Details (Section 43) */}
              {selected.friendlyError && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-4 space-y-2">
                  <div className="font-semibold text-rose-300">
                    Diagnostic Summary
                  </div>
                  <pre className="whitespace-pre-wrap font-sans text-xs text-rose-100 leading-relaxed">
                    {selected.friendlyError}
                  </pre>

                  {selected.technicalError && (
                    <div className="pt-2 border-t border-rose-500/20">
                      <button
                        type="button"
                        onClick={() => setShowTechError(!showTechError)}
                        className="flex items-center gap-1 text-[11px] font-semibold text-rose-300 hover:text-white"
                      >
                        {showTechError ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                        <span>Show technical details</span>
                      </button>
                      {showTechError && (
                        <pre className="mt-2 max-h-40 overflow-y-auto rounded bg-black/50 p-2.5 font-mono text-[10px] text-rose-200 whitespace-pre-wrap">
                          {selected.technicalError}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Captured Screenshot (Section 20) */}
              {selected.screenshotPath && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                      <ImageIcon className="h-4 w-4 text-indigo-400" />
                      Captured Screenshot
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {selected.screenshotPath}
                    </span>
                  </div>
                  <a
                    href={`/api/system/screenshot?path=${encodeURIComponent(selected.screenshotPath)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block overflow-hidden rounded-xl border border-slate-800 bg-black"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/system/screenshot?path=${encodeURIComponent(selected.screenshotPath)}`}
                      alt="Automation screenshot"
                      className="max-h-56 w-full object-contain"
                    />
                  </a>
                </div>
              )}

              {/* Execution Logs */}
              <div className="space-y-1.5">
                <span className="font-semibold text-slate-200 block">
                  Step Logs ({parsedLogs.length})
                </span>
                <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-800 bg-[#07090e] p-3 font-mono text-[11px] space-y-1">
                  {parsedLogs.map((l, i) => (
                    <div key={i} className="text-slate-300">
                      <span className="text-slate-500">[{l.timestamp}]</span>{" "}
                      <span className="text-indigo-400">{l.level}</span>{" "}
                      {l.message}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
