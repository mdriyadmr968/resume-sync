export type ResumeSourceType = "google_url" | "local_file";

export type PlatformType = "portfolio" | "linkedin" | "bdjobs" | "custom";

export type LoginStatus = "connected" | "expired" | "not_connected";

export type HealthStatus = "healthy" | "warning" | "error" | "unknown";

export type SyncTaskStatus =
  | "pending"
  | "running"
  | "success"
  | "skipped"
  | "failed"
  | "requires_user_action";

export type SyncJobStatus =
  | "running"
  | "paused"
  | "completed"
  | "stopped"
  | "failed";

export type ConfirmationMode =
  | "ask_before_upload"
  | "fully_automatic"
  | "ask_on_state_change";

export type UserDecision = "continue" | "upload" | "skip" | "stop";

export type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  platformId?: string;
  step?: string;
  message: string;
}

export interface GoogleUrlResolution {
  isValid: boolean;
  provider: "google_docs" | "google_drive" | "direct_url" | "unknown";
  fileId: string | null;
  originalUrl: string;
  downloadPdfUrl: string;
  downloadDocxUrl: string | null;
  viewUrl: string;
}

export interface UploadResult {
  platform: string;
  success: boolean;
  action:
    | "uploaded"
    | "already_up_to_date"
    | "dry_run_would_upload"
    | "skipped_by_user"
    | "failed";
  fileName: string;
  targetUrl?: string;
  failureUrl?: string;
  details?: string;
  screenshotPath?: string;
  friendlyError?: string;
  technicalError?: string;
  timestamp: string;
}

export interface VerificationResult {
  verified: boolean;
  details: string;
  currentRemoteIdentifier?: string;
  screenshotPath?: string;
}

export interface HealthCheckItem {
  label: string;
  status: "ok" | "warn" | "fail";
  detail: string;
}

export interface HealthCheckResult {
  platformId: string;
  overallStatus: HealthStatus;
  sessionValid: boolean;
  resumePageAccessible: boolean;
  uploadControlDetected: boolean;
  items: HealthCheckItem[];
  message: string;
  checkedAt: string;
}

export interface UserActionPrompt {
  id: string;
  syncJobId: string;
  platformId: string;
  platformName: string;
  type: "security_verification" | "upload_confirmation" | "login_required";
  title: string;
  message: string;
  currentResumeName?: string;
  newResumeName?: string;
  currentUrl?: string;
  options: Array<{
    id: "continue" | "upload" | "skip" | "stop";
    label: string;
    variant: "primary" | "secondary" | "danger";
  }>;
  createdAt: string;
}

export interface LiveBrowserState {
  isRunning: boolean;
  isPaused: boolean;
  syncJobId: string | null;
  jobNumber: number | null;
  dryRun: boolean;
  currentPlatformId: string | null;
  currentPlatformName: string | null;
  currentUrl: string | null;
  currentStep: string | null;
  activePrompt: UserActionPrompt | null;
  platformStates: Record<
    string,
    {
      platformId: string;
      platformName: string;
      status: SyncTaskStatus;
      step: string;
      message?: string;
      screenshotPath?: string;
    }
  >;
  logs: LogEntry[];
}
