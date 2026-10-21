import { NextResponse } from "next/server";
import { execFileSync } from "child_process";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const psScript = `
      Add-Type -AssemblyName System.Windows.Forms
      $f = New-Object System.Windows.Forms.OpenFileDialog
      $f.Title = "Select Master Resume (PDF or DOCX)"
      $f.Filter = "Resume Files (*.pdf;*.docx)|*.pdf;*.docx|All Files (*.*)|*.*"
      $form = New-Object System.Windows.Forms.Form
      $form.TopMost = $true
      $result = $f.ShowDialog($form)
      if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
        Write-Output $f.FileName
      }
    `;

    const selected = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-Sta", "-Command", psScript],
      { encoding: "utf8", timeout: 120000 }
    ).trim();

    if (!selected) {
      return NextResponse.json({ cancelled: true, filePath: null });
    }

    return NextResponse.json({ cancelled: false, filePath: selected });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to open native file dialog: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}
