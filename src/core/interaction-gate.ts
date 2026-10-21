import { EventEmitter } from "events";
import {
  LiveBrowserState,
  LogEntry,
  SyncTaskStatus,
  UserActionPrompt,
} from "./types";

export type UserDecision = "continue" | "upload" | "skip" | "stop";

class SyncCoordinationBus extends EventEmitter {
  private state: LiveBrowserState = {
    isRunning: false,
    isPaused: false,
    syncJobId: null,
    jobNumber: null,
    dryRun: false,
    currentPlatformId: null,
    currentPlatformName: null,
    currentUrl: null,
    currentStep: null,
    activePrompt: null,
    platformStates: {},
    logs: [],
  };

  private stopRequested = false;
  private pendingPromptResolver: ((decision: UserDecision) => void) | null =
    null;
  private pauseResolvers: Array<() => void> = [];

  getState(): LiveBrowserState {
    return {
      ...this.state,
      platformStates: { ...this.state.platformStates },
      logs: [...this.state.logs],
    };
  }

  startJob(jobId: string, jobNumber: number, dryRun: boolean, platforms: Array<{ id: string; name: string }>) {
    this.stopRequested = false;
    const platformStates: LiveBrowserState["platformStates"] = {};
    for (const p of platforms) {
      platformStates[p.id] = {
        platformId: p.id,
        platformName: p.name,
        status: "pending",
        step: "Waiting in queue",
      };
    }

    this.state = {
      isRunning: true,
      isPaused: false,
      syncJobId: jobId,
      jobNumber,
      dryRun,
      currentPlatformId: null,
      currentPlatformName: null,
      currentUrl: null,
      currentStep: "Initializing sync job",
      activePrompt: null,
      platformStates,
      logs: [],
    };
    this.broadcast();
  }

  updatePlatformStep(
    platformId: string,
    platformName: string,
    status: SyncTaskStatus,
    step: string,
    url?: string,
    screenshotPath?: string
  ) {
    this.state.currentPlatformId = platformId;
    this.state.currentPlatformName = platformName;
    this.state.currentStep = step;
    if (url !== undefined) {
      this.state.currentUrl = url;
    }

    const prev = this.state.platformStates[platformId];
    this.state.platformStates[platformId] = {
      platformId,
      platformName,
      status,
      step,
      screenshotPath: screenshotPath ?? prev?.screenshotPath,
    };
    this.broadcast();
  }

  appendLog(entry: LogEntry) {
    this.state.logs.push(entry);
    if (this.state.logs.length > 500) {
      this.state.logs.shift();
    }
    this.broadcast();
  }

  finishJob(finalStep = "Sync completed") {
    this.state.isRunning = false;
    this.state.isPaused = false;
    this.state.currentStep = finalStep;
    this.state.activePrompt = null;
    this.broadcast();
  }

  /**
   * Pauses automation before the next step.
   */
  pause() {
    if (!this.state.isRunning || this.state.isPaused) return;
    this.state.isPaused = true;
    this.state.currentStep = "Paused by user";
    this.broadcast();
  }

  /**
   * Resumes automation if paused.
   */
  resume() {
    if (!this.state.isPaused) return;
    this.state.isPaused = false;
    this.state.currentStep = "Resuming automation...";
    const resolvers = [...this.pauseResolvers];
    this.pauseResolvers = [];
    for (const resolve of resolvers) {
      resolve();
    }
    this.broadcast();
  }

  /**
   * Safely stops automation and resolves any pending human-in-the-loop prompt with "stop".
   */
  stop() {
    this.stopRequested = true;
    this.state.isPaused = false;
    this.state.currentStep = "Sync stopped by user.";

    const resolvers = [...this.pauseResolvers];
    this.pauseResolvers = [];
    for (const resolve of resolvers) {
      resolve();
    }

    if (this.pendingPromptResolver) {
      const resolve = this.pendingPromptResolver;
      this.pendingPromptResolver = null;
      this.state.activePrompt = null;
      resolve("stop");
    }

    this.broadcast();
  }

  isStopRequested(): boolean {
    return this.stopRequested;
  }

  /**
   * Called by adapters/orchestrator at step boundaries to respect Pause and Stop controls.
   */
  async checkpoint(currentUrl?: string, stepLabel?: string): Promise<void> {
    if (currentUrl) this.state.currentUrl = currentUrl;
    if (stepLabel) this.state.currentStep = stepLabel;
    this.broadcast();

    if (this.stopRequested) {
      throw new Error("Sync stopped by user.");
    }

    if (this.state.isPaused) {
      await new Promise<void>((resolve) => {
        this.pauseResolvers.push(resolve);
      });
    }

    if (this.stopRequested) {
      throw new Error("Sync stopped by user.");
    }
  }

  /**
   * Pauses automation and displays an interactive prompt in the UI (e.g. 2FA/CAPTCHA Continue
   * or Manual Upload Confirmation [Upload] / [Skip]).
   */
  async requestUserAction(
    prompt: Omit<UserActionPrompt, "id" | "createdAt">
  ): Promise<UserDecision> {
    if (this.stopRequested) return "stop";

    const fullPrompt: UserActionPrompt = {
      ...prompt,
      id: `prompt_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };

    this.state.activePrompt = fullPrompt;
    if (this.state.platformStates[prompt.platformId]) {
      this.state.platformStates[prompt.platformId].status =
        "requires_user_action";
      this.state.platformStates[prompt.platformId].step = prompt.title;
    }
    this.broadcast();

    return new Promise<UserDecision>((resolve) => {
      this.pendingPromptResolver = (decision: UserDecision) => {
        this.state.activePrompt = null;
        this.pendingPromptResolver = null;
        this.broadcast();
        resolve(decision);
      };
    });
  }

  /**
   * Resolves the currently active user prompt from the UI.
   */
  respondToPrompt(decision: UserDecision): boolean {
    if (!this.pendingPromptResolver) return false;
    const resolver = this.pendingPromptResolver;
    resolver(decision);
    return true;
  }

  private broadcast() {
    this.emit("state", this.getState());
  }
}

const globalForBus = globalThis as unknown as {
  syncBus: SyncCoordinationBus | undefined;
};

export const syncBus = globalForBus.syncBus ?? new SyncCoordinationBus();
export type { SyncCoordinationBus };

if (process.env.NODE_ENV !== "production") {
  globalForBus.syncBus = syncBus;
}
