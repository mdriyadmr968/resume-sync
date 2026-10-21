import { describe, it, expect } from "vitest";
import { resolveGoogleResumeUrl } from "@/core/google-drive";

describe("Google Docs & Google Drive 1-Click URL Resolver", () => {
  it("converts a Google Docs edit/share URL into a 1-click PDF & DOCX download URL", () => {
    const url =
      "https://docs.google.com/document/d/1IDR8jyGDgTUm3mcQZxaIggSls9belqTMcZmV-gbfjU8/edit?usp=sharing";
    const res = resolveGoogleResumeUrl(url);

    expect(res.isValid).toBe(true);
    expect(res.provider).toBe("google_docs");
    expect(res.fileId).toBe("1IDR8jyGDgTUm3mcQZxaIggSls9belqTMcZmV-gbfjU8");
    expect(res.downloadPdfUrl).toBe(
      "https://docs.google.com/document/d/1IDR8jyGDgTUm3mcQZxaIggSls9belqTMcZmV-gbfjU8/export?format=pdf"
    );
    expect(res.downloadDocxUrl).toBe(
      "https://docs.google.com/document/d/1IDR8jyGDgTUm3mcQZxaIggSls9belqTMcZmV-gbfjU8/export?format=docx"
    );
    expect(res.viewUrl).toBe(
      "https://docs.google.com/document/d/1IDR8jyGDgTUm3mcQZxaIggSls9belqTMcZmV-gbfjU8/edit?usp=sharing"
    );
  });

  it("converts a Google Drive file view URL into a 1-click uc?export=download URL", () => {
    const url =
      "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz123456/view?usp=drive_link";
    const res = resolveGoogleResumeUrl(url);

    expect(res.isValid).toBe(true);
    expect(res.provider).toBe("google_drive");
    expect(res.fileId).toBe("1AbCdEfGhIjKlMnOpQrStUvWxYz123456");
    expect(res.downloadPdfUrl).toBe(
      "https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOpQrStUvWxYz123456"
    );
  });

  it("rejects empty or malformed strings", () => {
    expect(resolveGoogleResumeUrl("").isValid).toBe(false);
    expect(resolveGoogleResumeUrl("not-a-url").isValid).toBe(false);
  });
});
