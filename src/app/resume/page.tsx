"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  FileText,
  Link2,
  FolderOpen,
  CheckCircle2,
  History,
  ExternalLink,
  Copy,
  Check,
  Sparkles,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

interface ResumeRecord {
  id: string;
  version: number;
  sourceType: string;
  sourceUrl: string | null;
  googleFileId: string | null;
  downloadUrl: string | null;
  viewUrl: string | null;
  filePath: string;
  archivePath: string;
  fileName: string;
  fileHash: string;
  fileSize: number;
  modifiedAt: string;
  isCurrent: boolean;
  createdAt: string;
}

interface ValidationInfo {
  valid: boolean;
  format: string;
  fileSize: number;
  fileHash: string;
  error?: string;
}

export default function ResumePage() {
  const [current, setCurrent] = useState<ResumeRecord | null>(null);
  const [history, setHistory] = useState<ResumeRecord[]>([]);
  const [validation, setValidation] = useState<ValidationInfo | null>(null);
  const [googleUrl, setGoogleUrl] = useState(
    "https://docs.google.com/document/d/1IDR8jyGDgTUm3mcQZxaIggSls9belqTMcZmV-gbfjU8/edit?usp=sharing"
  );
  const [localPathInput, setLocalPathInput] = useState("");
  const [previewResolution, setPreviewResolution] = useState<{
    isValid: boolean;
    provider: string;
    fileId: string | null;
    downloadPdfUrl: string;
    downloadDocxUrl: string | null;
    viewUrl: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const loadResumeData = useCallback(async () => {
    const res = await fetch("/api/resume");
    const data = await res.json();
    if (data.currentResume) {
      setCurrent(data.currentResume);
      if (data.currentResume.sourceUrl) {
        setGoogleUrl(data.currentResume.sourceUrl);
      }
      setLocalPathInput(data.currentResume.filePath);
    }
    if (data.history) setHistory(data.history);
    if (data.validation) setValidation(data.validation);
  }, []);

  useEffect(() => {
    loadResumeData();
  }, [loadResumeData]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!googleUrl.trim()) {
        setPreviewResolution(null);
        return;
      }
      const res = await fetch("/api/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview_google_url", url: googleUrl }),
      });
      const data = await res.json();
      if (data.resolution) setPreviewResolution(data.resolution);
    }, 250);
    return () => clearTimeout(timer);
  }, [googleUrl]);

  async function handleSetFromGoogleUrl(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_google_url", url: googleUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage({
        type: "success",
        text: data.isNewVersion
          ? `Downloaded new Master Resume v${data.currentResume.version} and generated 1-click download link!`
          : `Verified Google Docs resume (matches active v${data.currentResume.version}).`,
      });
      await loadResumeData();
    } catch (err) {
      setMessage({ type: "error", text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }

  async function handlePickLocalFile() {
    setLoading(true);
    setMessage(null);
    try {
      const pickRes = await fetch("/api/system/pick-file", { method: "POST" });
      const pickData = await pickRes.json();
      if (pickData.cancelled || !pickData.filePath) return;

      setLocalPathInput(pickData.filePath);
      const res = await fetch("/api/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_local_file",
          filePath: pickData.filePath,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage({
        type: "success",
        text: `Master resume set to ${data.currentResume.fileName} (v${data.currentResume.version})`,
      });
      await loadResumeData();
    } catch (err) {
      setMessage({ type: "error", text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }

  async function handleSetManualLocalPath(e: React.FormEvent) {
    e.preventDefault();
    if (!localPathInput.trim()) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_local_file",
          filePath: localPathInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage({
        type: "success",
        text: `Loaded local file ${data.currentResume.fileName} (v${data.currentResume.version})`,
      });
      await loadResumeData();
    } catch (err) {
      setMessage({ type: "error", text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }

  async function handleActivateVersion(resumeId: string) {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate_version", resumeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage({
        type: "success",
        text: `Switched active Master Resume to v${data.currentResume.version}`,
      });
      await loadResumeData();
    } catch (err) {
      setMessage({ type: "error", text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }

  async function handleOpenFolder(filePath: string) {
    await fetch("/api/system/open-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath, mode: "select" }),
    });
  }

  function copyText(key: string, value: string) {
    navigator.clipboard.writeText(value);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 2000);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Master Resume & Version History
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Configure your canonical resume via a Google Docs / Google Drive share link (auto-converted to a 1-click PDF download) or a local file on your computer.
        </p>
      </div>

      {message && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-200"
              : "border-rose-500/40 bg-rose-950/40 text-rose-200"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Option A: Google Docs / Drive URL */}
        <div className="rounded-2xl border border-slate-800 bg-[#0d111c] p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <Link2 className="h-5 w-5 text-indigo-400" />
            <h2 className="text-base font-semibold text-white">
              1. Google Docs / Google Drive Share Link
            </h2>
          </div>
          <p className="text-xs text-slate-400">
            Paste your Google Docs or Google Drive URL. The app generates the 1-click direct download link for your portfolio and downloads the PDF locally for LinkedIn and BDJobs.
          </p>

          <form onSubmit={handleSetFromGoogleUrl} className="space-y-3">
            <input
              type="url"
              value={googleUrl}
              onChange={(e) => setGoogleUrl(e.target.value)}
              placeholder="https://docs.google.com/document/d/.../edit?usp=sharing"
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
            />

            {previewResolution && previewResolution.isValid && (
              <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-indigo-300">
                    Detected Provider: {previewResolution.provider.toUpperCase()}
                  </span>
                  {previewResolution.fileId && (
                    <span className="font-mono text-[11px] text-slate-400">
                      ID: {previewResolution.fileId.slice(0, 14)}...
                    </span>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                    Generated 1-Click PDF Download URL:
                  </span>
                  <div className="flex items-center justify-between gap-2 rounded bg-slate-950/80 px-2.5 py-1.5">
                    <span className="font-mono text-[11px] text-emerald-300 truncate">
                      {previewResolution.downloadPdfUrl}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        copyText("pdf", previewResolution.downloadPdfUrl)
                      }
                      className="text-slate-300 hover:text-white shrink-0"
                    >
                      {copiedField === "pdf" ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              <span>Fetch Latest PDF from Google & Set as Master Resume</span>
            </button>
          </form>
        </div>

        {/* Option B: Local Resume File */}
        <div className="rounded-2xl border border-slate-800 bg-[#0d111c] p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <FileText className="h-5 w-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-white">
              2. Local Resume File (PDF / DOCX)
            </h2>
          </div>
          <p className="text-xs text-slate-400">
            Select a file directly from your computer or enter its local path.
          </p>

          <button
            type="button"
            onClick={handlePickLocalFile}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/90 py-2.5 text-xs font-semibold text-white hover:bg-slate-700"
          >
            <FolderOpen className="h-4 w-4 text-emerald-400" />
            <span>Select / Replace Resume via Windows File Dialog</span>
          </button>

          <form onSubmit={handleSetManualLocalPath} className="flex gap-2">
            <input
              type="text"
              value={localPathInput}
              onChange={(e) => setLocalPathInput(e.target.value)}
              placeholder="C:\Users\Me\Documents\Resume\Mohammad_Syied_Bin_Salim_Resume.pdf"
              className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 font-mono"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
            >
              Load Path
            </button>
          </form>

          {/* Current File Metadata & Validation */}
          {current && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">
                  Current Active File Metadata (v{current.version})
                </span>
                {validation?.valid ? (
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                    <ShieldCheck className="h-3.5 w-3.5" /> Valid {validation.format}
                  </span>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-2 text-slate-400 pt-1">
                <div>
                  File Name: <span className="text-slate-200">{current.fileName}</span>
                </div>
                <div>
                  File Size:{" "}
                  <span className="text-slate-200">
                    {(current.fileSize / 1024).toFixed(1)} KB
                  </span>
                </div>
                <div className="col-span-2 font-mono text-[11px] text-slate-300 break-all">
                  SHA-256: {current.fileHash}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Resume Version History */}
      <div className="rounded-2xl border border-slate-800 bg-[#0d111c] p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <History className="h-5 w-5 text-indigo-400" />
            <h2 className="text-base font-semibold text-white">
              Resume Version History
            </h2>
          </div>
          <span className="text-xs text-slate-400">
            Old versions are archived locally and never deleted automatically
          </span>
        </div>

        {history.length === 0 ? (
          <p className="text-sm text-slate-400 py-4">
            No resume versions recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-3 px-3">Version</th>
                  <th className="py-3 px-3">File Name</th>
                  <th className="py-3 px-3">Source</th>
                  <th className="py-3 px-3">SHA-256</th>
                  <th className="py-3 px-3">Size</th>
                  <th className="py-3 px-3">Recorded At</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {history.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-900/40">
                    <td className="py-3 px-3 font-semibold text-white">
                      <span className="inline-flex items-center gap-1.5">
                        v{item.version}
                        {item.isCurrent && (
                          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-400">
                            Current
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-200">{item.fileName}</td>
                    <td className="py-3 px-3 text-slate-400">
                      {item.sourceType === "google_url"
                        ? "Google Docs/Drive"
                        : "Local File"}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-400">
                      {item.fileHash.slice(0, 12)}...
                    </td>
                    <td className="py-3 px-3 text-slate-400">
                      {(item.fileSize / 1024).toFixed(1)} KB
                    </td>
                    <td className="py-3 px-3 text-slate-400">
                      {new Date(item.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={`/api/system/view-resume?id=${item.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-200 hover:bg-slate-700"
                        >
                          View <ExternalLink className="h-3 w-3" />
                        </a>
                        <button
                          onClick={() => handleOpenFolder(item.archivePath)}
                          className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-200 hover:bg-slate-700"
                        >
                          Open
                        </button>
                        {!item.isCurrent && (
                          <button
                            onClick={() => handleActivateVersion(item.id)}
                            className="inline-flex items-center gap-1 rounded bg-indigo-600/20 border border-indigo-500/40 px-2.5 py-1 text-indigo-300 hover:bg-indigo-600/30 font-medium"
                          >
                            <RefreshCw className="h-3 w-3" /> Set as Current
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
