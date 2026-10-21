import fs from "fs";
import path from "path";
import { LogEntry, LogLevel } from "@/core/types";
import { getPlatformLogDir } from "@/core/paths";

const SENSITIVE_PATTERNS = [
  /password\s*[:=]\s*["']?[^"'\s&]+/gi,
  /li_at=[^;\s]+/gi,
  /JSESSIONID=[^;\s]+/gi,
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
];

export function sanitizeLogMessage(message: string): string {
  let clean = message;
  for (const regex of SENSITIVE_PATTERNS) {
    clean = clean.replace(regex, "[REDACTED]");
  }
  return clean;
}

export function formatTimeShort(date = new Date()): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export class SyncLogger {
  private entries: LogEntry[] = [];
  private platformId?: string;
  private onLogCallback?: (entry: LogEntry) => void;

  constructor(platformId?: string, onLog?: (entry: LogEntry) => void) {
    this.platformId = platformId;
    this.onLogCallback = onLog;
  }

  private write(level: LogLevel, message: string, step?: string) {
    const now = new Date();
    const cleanMessage = sanitizeLogMessage(message);
    const entry: LogEntry = {
      timestamp: formatTimeShort(now),
      level,
      platformId: this.platformId,
      step,
      message: cleanMessage,
    };

    this.entries.push(entry);

    if (this.platformId) {
      try {
        const logDir = getPlatformLogDir(this.platformId, now);
        const logFile = path.join(logDir, "sync.log");
        const line = `[${entry.timestamp}] [${entry.level}] ${cleanMessage}\n`;
        fs.appendFileSync(logFile, line, "utf8");
      } catch {
        // Ignore filesystem logging errors
      }
    }

    if (this.onLogCallback) {
      this.onLogCallback(entry);
    }
  }

  info(message: string, step?: string) {
    this.write("INFO", message, step);
  }

  warn(message: string, step?: string) {
    this.write("WARN", message, step);
  }

  error(message: string, step?: string) {
    this.write("ERROR", message, step);
  }

  debug(message: string, step?: string) {
    if (process.env.LOG_LEVEL?.toLowerCase() === "debug") {
      this.write("DEBUG", message, step);
    }
  }

  getEntries(): LogEntry[] {
    return [...this.entries];
  }
}
