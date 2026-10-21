import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { PortfolioAdapter } from "@/automation/platforms/portfolio/PortfolioAdapter";
import { AdapterExecutionContext } from "@/automation/platforms/base/PlatformAdapter";
import { SyncLogger } from "@/automation/core/logger";

describe("PortfolioAdapter", () => {
  let tempDir: string;
  let repoDir: string;
  let dataFile: string;
  let staticPdfPath: string;
  let mockResumeFile: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-adapter-test-"));
    repoDir = path.join(tempDir, "react-portfolio");
    fs.mkdirSync(path.join(repoDir, "lib"), { recursive: true });
    fs.mkdirSync(path.join(repoDir, "public"), { recursive: true });

    dataFile = path.join(repoDir, "lib", "data.ts");
    staticPdfPath = path.join(repoDir, "public", "resume.pdf");

    // Dummy initial data.ts matching react-portfolio
    const initialContent = `
export const siteConfig = {
  name: "Mohammad Syied Bin Salim",
  resumeUrl: "https://old-link.com/resume.pdf",
  resumeViewUrl: "https://old-link.com/view",
};
`;
    fs.writeFileSync(dataFile, initialContent, "utf8");

    // Dummy valid PDF
    mockResumeFile = path.join(tempDir, "master.pdf");
    fs.writeFileSync(mockResumeFile, "%PDF-1.4\nTest Resume Binary Content\n%%EOF");
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("updates resumeUrl and resumeViewUrl for Google Docs resume", async () => {
    const adapter = new PortfolioAdapter(
      "portfolio",
      "Portfolio",
      JSON.stringify({
        mode: "git_repo",
        localRepoPath: repoDir,
        dataFilePath: "lib/data.ts",
        autoCommitAndPush: false,
      })
    );

    const logger = new SyncLogger("portfolio");
    const ctx: AdapterExecutionContext = {
      resume: {
        id: "res-1",
        version: 2,
        sourceType: "google_url",
        sourceUrl: "https://docs.google.com/document/d/xyz/edit?usp=sharing",
        googleFileId: "xyz",
        downloadUrl: "https://docs.google.com/document/d/xyz/export?format=pdf",
        viewUrl: "https://docs.google.com/document/d/xyz/edit?usp=sharing",
        filePath: mockResumeFile,
        archivePath: mockResumeFile,
        fileName: "resume.pdf",
        fileHash: "hash123",
        fileSize: 100,
        modifiedAt: new Date(),
        isCurrent: true,
        createdAt: new Date(),
      },
      dryRun: false,
      syncJobId: "job-1",
      logger,
      checkpoint: async () => {},
      requestSecurityVerification: async () => "continue",
    };

    const result = await adapter.uploadResume(ctx);
    expect(result.success).toBe(true);

    const updated = fs.readFileSync(dataFile, "utf8");
    expect(updated).toContain(
      'resumeUrl: "https://docs.google.com/document/d/xyz/export?format=pdf"'
    );
    expect(updated).toContain(
      'resumeViewUrl: "https://docs.google.com/document/d/xyz/edit?usp=sharing"'
    );
  });

  it("handles local file resumes by copying static PDF and pointing resumeUrl to /resume.pdf", async () => {
    const adapter = new PortfolioAdapter(
      "portfolio",
      "Portfolio",
      JSON.stringify({
        mode: "git_repo",
        localRepoPath: repoDir,
        dataFilePath: "lib/data.ts",
        staticPdfRelativePath: "public/resume.pdf",
        autoCommitAndPush: false,
      })
    );

    const crypto = await import("crypto");
    const fileHash = crypto
      .createHash("sha256")
      .update(fs.readFileSync(mockResumeFile))
      .digest("hex");

    const logger = new SyncLogger("portfolio");
    const ctx: AdapterExecutionContext = {
      resume: {
        id: "res-2",
        version: 1,
        sourceType: "local_file",
        sourceUrl: null,
        googleFileId: null,
        downloadUrl: null,
        viewUrl: null,
        filePath: mockResumeFile,
        archivePath: mockResumeFile,
        fileName: "master.pdf",
        fileHash,
        fileSize: 100,
        modifiedAt: new Date(),
        isCurrent: true,
        createdAt: new Date(),
      },
      dryRun: false,
      syncJobId: "job-2",
      logger,
      checkpoint: async () => {},
      requestSecurityVerification: async () => "continue",
    };

    const result = await adapter.uploadResume(ctx);
    expect(result.success).toBe(true);

    // Verify static PDF was copied
    expect(fs.existsSync(staticPdfPath)).toBe(true);
    expect(fs.readFileSync(staticPdfPath, "utf8")).toBe(
      fs.readFileSync(mockResumeFile, "utf8")
    );

    // Verify lib/data.ts points to /resume.pdf
    const updated = fs.readFileSync(dataFile, "utf8");
    expect(updated).toContain('resumeUrl: "/resume.pdf"');
  });

  it("passes health check when repo and data.ts are present", async () => {
    const adapter = new PortfolioAdapter(
      "portfolio",
      "Portfolio",
      JSON.stringify({
        mode: "git_repo",
        localRepoPath: repoDir,
        dataFilePath: "lib/data.ts",
      })
    );

    const health = await adapter.runHealthCheck();
    expect(health.overallStatus).toBe("healthy");
    expect(health.sessionValid).toBe(true);
    expect(health.resumePageAccessible).toBe(true);
    expect(health.uploadControlDetected).toBe(true);
  });
});
