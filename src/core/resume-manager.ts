import fs from "fs";
import path from "path";
import crypto from "crypto";
import { prisma, ensureSeeded, getAppSettings } from "./db";
import { getResumeHistoryDir } from "./paths";
import {
  downloadResumeFromGoogleUrl,
  resolveGoogleResumeUrl,
} from "./google-drive";

export interface FileValidationResult {
  valid: boolean;
  filePath: string;
  fileName: string;
  extension: string;
  fileSize: number;
  modifiedAt: Date;
  fileHash: string;
  format: "PDF" | "DOCX" | "UNKNOWN";
  error?: string;
}

export function calculateFileSha256(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function calculateBufferSha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function validateResumeFile(filePath: string): FileValidationResult {
  const resolvedPath = path.resolve(filePath);
  const fileName = path.basename(resolvedPath);
  const ext = path.extname(fileName).toLowerCase();

  if (!fs.existsSync(resolvedPath)) {
    return {
      valid: false,
      filePath: resolvedPath,
      fileName,
      extension: ext,
      fileSize: 0,
      modifiedAt: new Date(0),
      fileHash: "",
      format: "UNKNOWN",
      error: `File does not exist at path: ${resolvedPath}`,
    };
  }

  const stat = fs.statSync(resolvedPath);
  if (!stat.isFile()) {
    return {
      valid: false,
      filePath: resolvedPath,
      fileName,
      extension: ext,
      fileSize: 0,
      modifiedAt: stat.mtime,
      fileHash: "",
      format: "UNKNOWN",
      error: "Selected path is not a regular file.",
    };
  }

  if (stat.size < 100) {
    return {
      valid: false,
      filePath: resolvedPath,
      fileName,
      extension: ext,
      fileSize: stat.size,
      modifiedAt: stat.mtime,
      fileHash: "",
      format: "UNKNOWN",
      error: `File is too small (${stat.size} bytes) to be a valid resume.`,
    };
  }

  if (ext !== ".pdf" && ext !== ".docx") {
    return {
      valid: false,
      filePath: resolvedPath,
      fileName,
      extension: ext,
      fileSize: stat.size,
      modifiedAt: stat.mtime,
      fileHash: "",
      format: "UNKNOWN",
      error: `Unsupported extension "${ext}". Only .pdf and .docx are supported.`,
    };
  }

  const buffer = fs.readFileSync(resolvedPath);
  const headerAscii = buffer.subarray(0, 8).toString("utf8");
  const isPdfHeader = headerAscii.startsWith("%PDF-");
  const isDocxHeader = buffer[0] === 0x50 && buffer[1] === 0x4b; // PK zip signature

  if (ext === ".pdf" && !isPdfHeader) {
    return {
      valid: false,
      filePath: resolvedPath,
      fileName,
      extension: ext,
      fileSize: stat.size,
      modifiedAt: stat.mtime,
      fileHash: "",
      format: "UNKNOWN",
      error: "File has .pdf extension but is missing the %PDF- binary signature.",
    };
  }

  if (ext === ".docx" && !isDocxHeader) {
    return {
      valid: false,
      filePath: resolvedPath,
      fileName,
      extension: ext,
      fileSize: stat.size,
      modifiedAt: stat.mtime,
      fileHash: "",
      format: "UNKNOWN",
      error: "File has .docx extension but is not a valid OpenXML (ZIP) archive.",
    };
  }

  const fileHash = calculateBufferSha256(buffer);

  return {
    valid: true,
    filePath: resolvedPath,
    fileName,
    extension: ext,
    fileSize: stat.size,
    modifiedAt: stat.mtime,
    fileHash,
    format: ext === ".pdf" ? "PDF" : "DOCX",
  };
}

function archiveResumeSnapshot(
  sourceFilePath: string,
  version: number,
  fileHash: string,
  fileName: string
): string {
  const historyDir = getResumeHistoryDir();
  const shortHash = fileHash.slice(0, 10);
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const archiveFileName = `v${version}_${shortHash}_${safeName}`;
  const archivePath = path.join(historyDir, archiveFileName);
  fs.copyFileSync(sourceFilePath, archivePath);
  return archivePath;
}

export async function getNextResumeVersion(): Promise<number> {
  const agg = await prisma.resume.aggregate({
    _max: { version: true },
  });
  return (agg._max.version ?? 0) + 1;
}

/**
 * Sets or updates the Master Resume from a Google Docs / Google Drive URL.
 * Downloads the latest exported PDF locally, computes SHA-256, and stores version history.
 */
export async function setMasterResumeFromGoogleUrl(
  rawUrl: string,
  customFileName?: string
) {
  await ensureSeeded();
  const settings = await getAppSettings();
  const targetFileName =
    customFileName?.trim() ||
    settings.canonicalFileName ||
    "Mohammad_Syied_Bin_Salim_Resume.pdf";

  const downloaded = await downloadResumeFromGoogleUrl(rawUrl, targetFileName);
  const validation = validateResumeFile(downloaded.filePath);

  if (!validation.valid) {
    throw new Error(validation.error || "Downloaded resume failed validation.");
  }

  // Check if an identical hash version already exists
  const existingByHash = await prisma.resume.findFirst({
    where: { fileHash: validation.fileHash },
    orderBy: { version: "desc" },
  });

  await prisma.resume.updateMany({
    where: { isCurrent: true },
    data: { isCurrent: false },
  });

  if (existingByHash) {
    const updated = await prisma.resume.update({
      where: { id: existingByHash.id },
      data: {
        isCurrent: true,
        sourceType: "google_url",
        sourceUrl: downloaded.resolution.originalUrl,
        googleFileId: downloaded.resolution.fileId,
        downloadUrl: downloaded.resolution.downloadPdfUrl,
        viewUrl: downloaded.resolution.viewUrl,
        filePath: validation.filePath,
        fileName: validation.fileName,
        fileSize: validation.fileSize,
        modifiedAt: validation.modifiedAt,
      },
    });
    return { resume: updated, isNewVersion: false };
  }

  const nextVersion = await getNextResumeVersion();
  const archivePath = archiveResumeSnapshot(
    validation.filePath,
    nextVersion,
    validation.fileHash,
    validation.fileName
  );

  const created = await prisma.resume.create({
    data: {
      version: nextVersion,
      sourceType: "google_url",
      sourceUrl: downloaded.resolution.originalUrl,
      googleFileId: downloaded.resolution.fileId,
      downloadUrl: downloaded.resolution.downloadPdfUrl,
      viewUrl: downloaded.resolution.viewUrl,
      filePath: validation.filePath,
      archivePath,
      fileName: validation.fileName,
      fileHash: validation.fileHash,
      fileSize: validation.fileSize,
      modifiedAt: validation.modifiedAt,
      isCurrent: true,
    },
  });

  return { resume: created, isNewVersion: true };
}

/**
 * Sets or updates the Master Resume from a local file path on the computer.
 */
export async function setMasterResumeFromLocalFile(localFilePath: string) {
  await ensureSeeded();
  const validation = validateResumeFile(localFilePath);
  if (!validation.valid) {
    throw new Error(validation.error || "Selected file is not a valid resume.");
  }

  const existingByHash = await prisma.resume.findFirst({
    where: { fileHash: validation.fileHash },
    orderBy: { version: "desc" },
  });

  await prisma.resume.updateMany({
    where: { isCurrent: true },
    data: { isCurrent: false },
  });

  if (existingByHash) {
    const updated = await prisma.resume.update({
      where: { id: existingByHash.id },
      data: {
        isCurrent: true,
        sourceType: "local_file",
        filePath: validation.filePath,
        fileName: validation.fileName,
        fileSize: validation.fileSize,
        modifiedAt: validation.modifiedAt,
      },
    });
    return { resume: updated, isNewVersion: false };
  }

  const nextVersion = await getNextResumeVersion();
  const archivePath = archiveResumeSnapshot(
    validation.filePath,
    nextVersion,
    validation.fileHash,
    validation.fileName
  );

  const created = await prisma.resume.create({
    data: {
      version: nextVersion,
      sourceType: "local_file",
      sourceUrl: null,
      googleFileId: null,
      downloadUrl: null,
      viewUrl: null,
      filePath: validation.filePath,
      archivePath,
      fileName: validation.fileName,
      fileHash: validation.fileHash,
      fileSize: validation.fileSize,
      modifiedAt: validation.modifiedAt,
      isCurrent: true,
    },
  });

  return { resume: created, isNewVersion: true };
}

/**
 * Gets the current active Master Resume.
 * If stored as a local file and modified on disk, automatically registers the new version.
 */
export async function getCurrentResume(options?: {
  refreshFromGoogle?: boolean;
}) {
  await ensureSeeded();
  const current = await prisma.resume.findFirst({
    where: { isCurrent: true },
    orderBy: { version: "desc" },
  });

  if (!current) {
    return null;
  }

  if (current.sourceType === "google_url" && current.sourceUrl) {
    if (options?.refreshFromGoogle) {
      const res = await setMasterResumeFromGoogleUrl(
        current.sourceUrl,
        current.fileName
      );
      return res.resume;
    }
    // Ensure local file still exists; if deleted from data/resumes, re-download or restore from archive
    if (!fs.existsSync(current.filePath) && fs.existsSync(current.archivePath)) {
      fs.copyFileSync(current.archivePath, current.filePath);
    }
    return current;
  }

  // Local file: check if the user updated the file in place on disk
  if (fs.existsSync(current.filePath)) {
    const validation = validateResumeFile(current.filePath);
    if (validation.valid && validation.fileHash !== current.fileHash) {
      const updated = await setMasterResumeFromLocalFile(current.filePath);
      return updated.resume;
    }
  } else if (fs.existsSync(current.archivePath)) {
    // Fallback to archive if original moved
    return current;
  }

  return current;
}

/**
 * Sets an older version from Resume History as the current active Master Resume.
 */
export async function activateHistoricalResume(resumeId: string) {
  await ensureSeeded();
  const target = await prisma.resume.findUnique({ where: { id: resumeId } });
  if (!target) {
    throw new Error("Resume version not found.");
  }

  // Restore snapshot to active filePath if needed
  if (fs.existsSync(target.archivePath)) {
    const dir = path.dirname(target.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.copyFileSync(target.archivePath, target.filePath);
  }

  await prisma.resume.updateMany({
    where: { isCurrent: true },
    data: { isCurrent: false },
  });

  return prisma.resume.update({
    where: { id: target.id },
    data: { isCurrent: true },
  });
}

export async function getResumeHistory() {
  await ensureSeeded();
  return prisma.resume.findMany({
    orderBy: { version: "desc" },
  });
}

export { resolveGoogleResumeUrl };
