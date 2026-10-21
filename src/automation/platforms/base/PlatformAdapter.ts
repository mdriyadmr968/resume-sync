import fs from "fs";
import path from "path";
import type { Resume } from "@prisma/client";
import type {
  HealthCheckResult,
  UploadResult,
  UserDecision,
  VerificationResult,
} from "@/core/types";
import type { SyncLogger } from "@/automation/core/logger";

export interface AdapterExecutionContext {
  resume: Resume;
  dryRun: boolean;
  syncJobId: string;
  logger: SyncLogger;
  checkpoint: (currentUrl?: string, stepLabel?: string) => Promise<void>;
  requestSecurityVerification: (
    reason: string,
    currentUrl: string
  ) => Promise<UserDecision>;
}

export interface FileConstraints {
  maxFileSizeMB: number;
  allowedExtensions: string[];
}

export interface PlatformAdapter {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly constraints: FileConstraints;

  validateFileConstraints(filePath: string): {
    valid: boolean;
    reason?: string;
  };

  checkLogin(): Promise<boolean>;

  login(): Promise<{ connected: boolean; message: string }>;

  uploadResume(ctx: AdapterExecutionContext): Promise<UploadResult>;

  verifyUpload(ctx: AdapterExecutionContext): Promise<VerificationResult>;

  runHealthCheck(): Promise<HealthCheckResult>;
}

export abstract class BasePlatformAdapter implements PlatformAdapter {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly version: string;

  readonly constraints: FileConstraints = {
    maxFileSizeMB: 10,
    allowedExtensions: [".pdf", ".docx"],
  };

  validateFileConstraints(filePath: string): {
    valid: boolean;
    reason?: string;
  } {
    if (!fs.existsSync(filePath)) {
      return {
        valid: false,
        reason: `Resume file does not exist at ${filePath}`,
      };
    }

    const ext = path.extname(filePath).toLowerCase();
    if (!this.constraints.allowedExtensions.includes(ext)) {
      return {
        valid: false,
        reason: `${this.name} only supports ${this.constraints.allowedExtensions.join(", ")} files (got ${ext}).`,
      };
    }

    const stat = fs.statSync(filePath);
    const maxBytes = this.constraints.maxFileSizeMB * 1024 * 1024;
    if (stat.size > maxBytes) {
      const sizeMB = (stat.size / (1024 * 1024)).toFixed(2);
      return {
        valid: false,
        reason: `Resume file size (${sizeMB} MB) exceeds ${this.name}'s maximum limit of ${this.constraints.maxFileSizeMB} MB.`,
      };
    }

    return { valid: true };
  }

  abstract checkLogin(): Promise<boolean>;

  abstract login(): Promise<{ connected: boolean; message: string }>;

  abstract uploadResume(ctx: AdapterExecutionContext): Promise<UploadResult>;

  abstract verifyUpload(
    ctx: AdapterExecutionContext
  ): Promise<VerificationResult>;

  abstract runHealthCheck(): Promise<HealthCheckResult>;
}
