export interface FormattedSyncError {
  friendlyMessage: string;
  possibleReasons: string[];
  technicalDetails: string;
  screenshotPath?: string;
  failureUrl?: string;
}

/**
 * Translates raw Playwright/Node errors into clear, human-understandable explanations
 * while retaining full technical details for expandable inspection (Section 43).
 */
export function formatAutomationError(
  platformName: string,
  stepDescription: string,
  error: unknown,
  screenshotPath?: string,
  failureUrl?: string
): FormattedSyncError {
  const rawMessage =
    error instanceof Error
      ? `${error.name}: ${error.message}\n${error.stack || ""}`
      : String(error);

  const shortMsg = error instanceof Error ? error.message : String(error);
  const lower = shortMsg.toLowerCase();

  let headline = `${platformName} encountered an error while ${stepDescription}.`;
  let reasons: string[] = [
    `${platformName} may have changed its page layout or selectors.`,
    "Your login session may have expired.",
    "The network connection timed out while loading the page.",
  ];

  if (lower.includes("timeout") && lower.includes("save")) {
    headline = `${platformName} could not find the Save button.`;
    reasons = [
      `${platformName} changed its page layout.`,
      "The resume section could not be opened.",
      "Your session may have expired.",
    ];
  } else if (lower.includes("timeout") && lower.includes("upload") || lower.includes("input")) {
    headline = `${platformName} could not locate the file upload control.`;
    reasons = [
      `${platformName} changed its resume upload page structure.`,
      "The upload modal or drawer did not open in time.",
      "Your browser session may require re-authentication.",
    ];
  } else if (lower.includes("target closed") || lower.includes("browser has been closed")) {
    headline = `The browser window for ${platformName} was closed before synchronization finished.`;
    reasons = [
      "The browser window was manually closed.",
      "Another process locked the browser profile directory.",
    ];
  } else if (lower.includes("session") || lower.includes("not logged in") || lower.includes("sign in")) {
    headline = `${platformName} login session is not active.`;
    reasons = [
      `Your ${platformName} session cookie expired.`,
      `Please click "Connect" on the ${platformName} configuration page to log in manually.`,
    ];
  } else if (lower.includes("git")) {
    headline = `${platformName} Git synchronization failed.`;
    reasons = [
      "The local repository path may not be a valid Git repository.",
      "Git push failed due to remote authentication or network connectivity.",
      "There may be uncommitted merge conflicts in the portfolio repository.",
    ];
  }

  const lines = [
    headline,
    "",
    "Possible reasons:",
    ...reasons.map((r) => `• ${r}`),
  ];

  if (screenshotPath) {
    lines.push("", `Screenshot:\n${screenshotPath}`);
  }

  return {
    friendlyMessage: lines.join("\n"),
    possibleReasons: reasons,
    technicalDetails: rawMessage.trim(),
    screenshotPath,
    failureUrl,
  };
}
