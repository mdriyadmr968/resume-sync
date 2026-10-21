"use client";

import React, { useEffect, useState } from "react";
import { Save, ShieldCheck, CheckCircle2, Loader2 } from "lucide-react";
import { AppSettings } from "@/core/config-schemas";

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>({
    confirmationMode: "ask_before_upload",
    dryRunDefault: false,
    screenshotOnSuccess: true,
    screenshotOnFailure: true,
    canonicalFileName: "Mohammad_Syied_Bin_Salim_Resume.pdf",
  });
  const [saving, setSaving] = useState(false);
  const [savedBanner, setSavedBanner] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.settings) setSettings(data.settings);
      });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSavedBanner(false);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (data.settings) setSettings(data.settings);
      setSavedBanner(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Application Settings
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Configure manual upload confirmation, screenshot capture, and local-first browser behavior.
        </p>
      </div>

      {savedBanner && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 px-4 py-3 text-xs text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          <span>Settings saved successfully.</span>
        </div>
      )}

      <form
        onSubmit={handleSave}
        className="rounded-2xl border border-slate-800 bg-[#0d111c] p-6 space-y-6"
      >
        {/* Manual Confirmation Mode (Section 26) */}
        <div className="space-y-3 border-b border-slate-800 pb-6">
          <h2 className="text-base font-semibold text-white">
            Automation Confirmation Mode
          </h2>
          <p className="text-xs text-slate-400">
            Choose whether the automation pauses to ask before uploading your resume to each platform.
          </p>

          <div className="space-y-2 pt-1 text-xs">
            <label className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 cursor-pointer">
              <input
                type="radio"
                name="confirmationMode"
                checked={settings.confirmationMode === "ask_before_upload"}
                onChange={() =>
                  setSettings({
                    ...settings,
                    confirmationMode: "ask_before_upload",
                  })
                }
              />
              <div>
                <div className="font-semibold text-white">
                  Ask before each upload (Recommended default)
                </div>
                <div className="text-slate-400">
                  Shows a confirmation modal with old vs. new resume details before uploading.
                </div>
              </div>
            </label>

            <label className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 cursor-pointer">
              <input
                type="radio"
                name="confirmationMode"
                checked={settings.confirmationMode === "ask_on_state_change"}
                onChange={() =>
                  setSettings({
                    ...settings,
                    confirmationMode: "ask_on_state_change",
                  })
                }
              />
              <div>
                <div className="font-semibold text-white">
                  Ask only when website state changes
                </div>
                <div className="text-slate-400">
                  Prompts when the resume hash differs from the last uploaded version.
                </div>
              </div>
            </label>

            <label className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 cursor-pointer">
              <input
                type="radio"
                name="confirmationMode"
                checked={settings.confirmationMode === "fully_automatic"}
                onChange={() =>
                  setSettings({
                    ...settings,
                    confirmationMode: "fully_automatic",
                  })
                }
              />
              <div>
                <div className="font-semibold text-white">Fully automatic</div>
                <div className="text-slate-400">
                  Uploads automatically without asking (still pauses if 2FA/CAPTCHA is needed).
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* File & Browser Preferences */}
        <div className="space-y-4 border-b border-slate-800 pb-6 text-xs">
          <h2 className="text-base font-semibold text-white">
            File & Screenshot Preferences
          </h2>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Canonical Resume Filename (for Google Docs PDF exports)
            </label>
            <input
              value={settings.canonicalFileName}
              onChange={(e) =>
                setSettings({ ...settings, canonicalFileName: e.target.value })
              }
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-white"
            />
          </div>

          <label className="flex items-center gap-2.5 text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.screenshotOnSuccess}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  screenshotOnSuccess: e.target.checked,
                })
              }
            />
            <span>Capture screenshot on successful upload</span>
          </label>

          <label className="flex items-center gap-2.5 text-slate-300 cursor-pointer">
            <input type="checkbox" checked={true} disabled />
            <span>
              Capture screenshot on failure (Mandatory per security/audit policy)
            </span>
          </label>

          <label className="flex items-center gap-2.5 text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.dryRunDefault}
              onChange={(e) =>
                setSettings({ ...settings, dryRunDefault: e.target.checked })
              }
            />
            <span>Enable Dry Run mode by default</span>
          </label>
        </div>

        {/* Security Assurance */}
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/15 p-4 text-xs space-y-1.5">
          <div className="flex items-center gap-2 font-semibold text-emerald-300">
            <ShieldCheck className="h-4 w-4" />
            <span>Strict Local-First Security Policy</span>
          </div>
          <ul className="list-disc pl-5 text-slate-300 space-y-1">
            <li>Passwords are never stored or logged anywhere in this application.</li>
            <li>
              Browser profiles live exclusively in local{" "}
              <code>data/browser-profiles/</code> (gitignored).
            </li>
            <li>
              CAPTCHA, 2FA, and security challenges are never bypassed — automation pauses for your manual completion.
            </li>
          </ul>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span>Save Settings</span>
          </button>
        </div>
      </form>
    </div>
  );
}
