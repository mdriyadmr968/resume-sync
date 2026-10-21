import type { Locator, Page } from "playwright";

export interface SelectorCandidate {
  description: string;
  locate: (page: Page) => Locator;
}

/**
 * Semantic selector helper: tries accessible roles, labels, text, and fallback CSS selectors
 * in priority order and returns the first visible/attached element.
 */
export async function resolveFirstMatchingLocator(
  page: Page,
  candidates: SelectorCandidate[],
  timeoutMs = 5000,
  requireVisible = true
): Promise<{ locator: Locator; description: string } | null> {
  const perCandidateTimeout = Math.max(800, Math.floor(timeoutMs / Math.max(1, candidates.length)));

  for (const candidate of candidates) {
    try {
      const locator = candidate.locate(page).first();
      await locator.waitFor({
        state: requireVisible ? "visible" : "attached",
        timeout: perCandidateTimeout,
      });
      return { locator, description: candidate.description };
    } catch {
      // Try next fallback candidate
    }
  }
  return null;
}

/**
 * Helper to locate file upload inputs (<input type="file"> are often hidden by custom UI buttons,
 * so we check "attached" state rather than strictly "visible").
 */
export async function findUploadInput(
  page: Page,
  customSelector?: string
): Promise<{ locator: Locator; description: string } | null> {
  const candidates: SelectorCandidate[] = [];

  if (customSelector) {
    candidates.push({
      description: `Configured upload selector (${customSelector})`,
      locate: (p) => p.locator(customSelector),
    });
  }

  candidates.push(
    {
      description: 'File input labeled "Upload resume"',
      locate: (p) => p.getByLabel(/upload\s*resume|resume\s*upload|choose\s*file/i),
    },
    {
      description: 'Standard PDF/DOCX file input (input[type="file"])',
      locate: (p) => p.locator('input[type="file"][accept*="pdf"], input[type="file"][accept*="doc"], input[type="file"]'),
    }
  );

  return resolveFirstMatchingLocator(page, candidates, 6000, false);
}

/**
 * Helper to locate a Save / Submit / Update / Apply button using accessible roles first.
 */
export async function findSaveButton(
  page: Page,
  customSelector?: string
): Promise<{ locator: Locator; description: string } | null> {
  const candidates: SelectorCandidate[] = [];

  if (customSelector) {
    candidates.push({
      description: `Configured save selector (${customSelector})`,
      locate: (p) => p.locator(customSelector),
    });
  }

  candidates.push(
    {
      description: 'Button with role "Save" / "Submit" / "Upload" / "Update"',
      locate: (p) =>
        p.getByRole("button", {
          name: /^(save|save changes|submit|upload|update|done|apply)$/i,
        }),
    },
    {
      description: "Button containing Save/Upload text",
      locate: (p) =>
        p.locator(
          'button:has-text("Save"), button:has-text("Upload"), input[type="submit"][value*="Save" i], input[type="submit"][value*="Upload" i]'
        ),
    }
  );

  return resolveFirstMatchingLocator(page, candidates, 5000, true);
}

/**
 * Helper to locate the Resume / CV section or trigger button on a profile page.
 */
export async function findResumeSection(
  page: Page,
  customSelector?: string
): Promise<{ locator: Locator; description: string } | null> {
  const candidates: SelectorCandidate[] = [];

  if (customSelector) {
    candidates.push({
      description: `Configured resume section (${customSelector})`,
      locate: (p) => p.locator(customSelector),
    });
  }

  candidates.push(
    {
      description: 'Button or Link named "Upload resume" / "Add resume"',
      locate: (p) =>
        p.getByRole("button", { name: /upload\s*resume|add\s*resume|replace\s*resume/i }),
    },
    {
      description: 'Heading or section containing "Resume" / "CV"',
      locate: (p) => p.getByText(/manage your resumes|upload resume|personalized resume/i),
    }
  );

  return resolveFirstMatchingLocator(page, candidates, 5000, true);
}

/**
 * Detects whether the current page is showing a CAPTCHA, 2FA, or security verification challenge.
 * We NEVER bypass these; we pause and ask the user to complete them in the visible browser.
 */
export async function detectSecurityChallenge(
  page: Page
): Promise<{ detected: boolean; reason: string }> {
  try {
    const url = page.url().toLowerCase();
    if (
      url.includes("/checkpoint/challenge") ||
      url.includes("/checkpoint/lg/login-submit") ||
      url.includes("security-verification") ||
      url.includes("two-step-verification") ||
      url.includes("captcha")
    ) {
      return {
        detected: true,
        reason: "Security checkpoint or 2FA challenge URL detected.",
      };
    }

    const challengeTextLocator = page.getByText(
      /let's do a quick security check|verify your identity|enter the verification code|two-step verification|complete the security check/i
    );
    if ((await challengeTextLocator.count()) > 0) {
      const visible = await challengeTextLocator.first().isVisible().catch(() => false);
      if (visible) {
        return {
          detected: true,
          reason: "Security verification or 2FA prompt detected on page.",
        };
      }
    }

    return { detected: false, reason: "" };
  } catch {
    return { detected: false, reason: "" };
  }
}
