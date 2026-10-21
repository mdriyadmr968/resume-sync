import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  calculateFileSha256,
  validateResumeFile,
} from "@/core/resume-manager";

describe("Resume File Validation & SHA-256 Hashing", () => {
  let tempDir: string;
  let validPdfPath: string;
  let fakePdfPath: string;
  let unsupportedTxtPath: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "resume-sync-test-"));

    validPdfPath = path.join(tempDir, "Test_Resume.pdf");
    const pdfPayload = Buffer.concat([
      Buffer.from("%PDF-1.7\n"),
      Buffer.alloc(256, "A"),
    ]);
    fs.writeFileSync(validPdfPath, pdfPayload);

    fakePdfPath = path.join(tempDir, "Fake_Login_Redirect.pdf");
    fs.writeFileSync(
      fakePdfPath,
      "<!DOCTYPE html><html><body>Sign in to Google Accounts for access... padding to exceed 100 bytes...................................</body></html>"
    );

    unsupportedTxtPath = path.join(tempDir, "Resume.txt");
    fs.writeFileSync(unsupportedTxtPath, "A".repeat(200));
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("validates a genuine PDF file and computes deterministic SHA-256 hash", () => {
    const result = validateResumeFile(validPdfPath);
    expect(result.valid).toBe(true);
    expect(result.format).toBe("PDF");
    expect(result.fileHash).toHaveLength(64);
    expect(result.fileHash).toBe(calculateFileSha256(validPdfPath));
  });

  it("rejects a .pdf file that actually contains an HTML login page", () => {
    const result = validateResumeFile(fakePdfPath);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("%PDF-");
  });

  it("rejects unsupported file extensions", () => {
    const result = validateResumeFile(unsupportedTxtPath);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Unsupported extension");
  });
});
