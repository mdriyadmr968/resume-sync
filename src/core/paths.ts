import path from "path";
import fs from "fs";

const PROJECT_ROOT = process.cwd();

export function getDataDir(): string {
  const envDir = process.env.APP_DATA_DIR || "./data";
  const resolved = path.isAbsolute(envDir)
    ? envDir
    : path.resolve(PROJECT_ROOT, envDir);
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
  }
  return resolved;
}

export function getResumesDir(): string {
  const dir = path.join(getDataDir(), "resumes");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getResumeHistoryDir(): string {
  const dir = path.join(getDataDir(), "resume-history");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getBrowserProfilesDir(): string {
  const dir = path.join(getDataDir(), "browser-profiles");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getPlatformProfileDir(platformId: string): string {
  const safeId = platformId.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  const dir = path.join(getBrowserProfilesDir(), safeId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getLogsBaseDir(): string {
  const dir = path.resolve(PROJECT_ROOT, "logs");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getPlatformLogDir(platformId: string, date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const dateFolder = `${yyyy}-${mm}-${dd}`;
  const safePlatform = platformId.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  const dir = path.join(getLogsBaseDir(), dateFolder, safePlatform);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}
