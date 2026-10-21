import fs from "fs";
import path from "path";
import { GoogleUrlResolution } from "./types";
import { getResumesDir } from "./paths";

/**
 * Resolves any Google Docs or Google Drive URL into:
 * - File ID
 * - 1-Click Direct PDF Download Link (for Portfolio & PDF downloads)
 * - 1-Click Direct DOCX Download Link (for Google Docs)
 * - View/Edit URL
 */
export function resolveGoogleResumeUrl(rawUrl: string): GoogleUrlResolution {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return {
      isValid: false,
      provider: "unknown",
      fileId: null,
      originalUrl: trimmed,
      downloadPdfUrl: "",
      downloadDocxUrl: null,
      viewUrl: "",
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    return {
      isValid: false,
      provider: "unknown",
      fileId: null,
      originalUrl: trimmed,
      downloadPdfUrl: "",
      downloadDocxUrl: null,
      viewUrl: "",
    };
  }

  // Case 1: Google Docs URL
  // e.g. https://docs.google.com/document/d/1IDR8jyGDgTUm3mcQZxaIggSls9belqTMcZmV-gbfjU8/edit?usp=sharing
  // or   https://docs.google.com/document/d/1IDR8jyGDgTUm3mcQZxaIggSls9belqTMcZmV-gbfjU8/export?format=pdf
  const docsMatch = trimmed.match(
    /docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]{15,})/
  );
  if (docsMatch && docsMatch[1]) {
    const fileId = docsMatch[1];
    return {
      isValid: true,
      provider: "google_docs",
      fileId,
      originalUrl: trimmed,
      downloadPdfUrl: `https://docs.google.com/document/d/${fileId}/export?format=pdf`,
      downloadDocxUrl: `https://docs.google.com/document/d/${fileId}/export?format=docx`,
      viewUrl: `https://docs.google.com/document/d/${fileId}/edit?usp=sharing`,
    };
  }

  // Case 2: Google Drive File URL
  // e.g. https://drive.google.com/file/d/1IDR8jyGDgTUm3mcQZxaIggSls9belqTMcZmV-gbfjU8/view?usp=sharing
  const driveFileMatch = trimmed.match(
    /drive\.google\.com\/file\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]{15,})/
  );
  if (driveFileMatch && driveFileMatch[1]) {
    const fileId = driveFileMatch[1];
    return {
      isValid: true,
      provider: "google_drive",
      fileId,
      originalUrl: trimmed,
      downloadPdfUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
      downloadDocxUrl: null,
      viewUrl: `https://drive.google.com/file/d/${fileId}/view?usp=sharing`,
    };
  }

  // Case 3: Google Drive ?id= query parameter
  // e.g. https://drive.google.com/open?id=1IDR8jy... or https://drive.google.com/uc?export=download&id=1IDR8jy...
  if (parsedUrl.hostname.includes("drive.google.com")) {
    const idParam = parsedUrl.searchParams.get("id");
    if (idParam && /^[a-zA-Z0-9_-]{15,}$/.test(idParam)) {
      return {
        isValid: true,
        provider: "google_drive",
        fileId: idParam,
        originalUrl: trimmed,
        downloadPdfUrl: `https://drive.google.com/uc?export=download&id=${idParam}`,
        downloadDocxUrl: null,
        viewUrl: `https://drive.google.com/file/d/${idParam}/view?usp=sharing`,
      };
    }
  }

  // Case 4: Generic direct PDF URL
  if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
    return {
      isValid: true,
      provider: "direct_url",
      fileId: null,
      originalUrl: trimmed,
      downloadPdfUrl: trimmed,
      downloadDocxUrl: null,
      viewUrl: trimmed,
    };
  }

  return {
    isValid: false,
    provider: "unknown",
    fileId: null,
    originalUrl: trimmed,
    downloadPdfUrl: "",
    downloadDocxUrl: null,
    viewUrl: "",
  };
}

export interface DownloadedResumeResult {
  filePath: string;
  fileName: string;
  fileSize: number;
  resolution: GoogleUrlResolution;
}

/**
 * Downloads the PDF from a Google Docs / Google Drive / Direct URL,
 * validates the %PDF- magic header (catching private link login redirects),
 * and writes it to data/resumes/<canonicalFileName>.
 */
export async function downloadResumeFromGoogleUrl(
  rawUrl: string,
  canonicalFileName = "Mohammad_Syied_Bin_Salim_Resume.pdf"
): Promise<DownloadedResumeResult> {
  const resolution = resolveGoogleResumeUrl(rawUrl);
  if (!resolution.isValid || !resolution.downloadPdfUrl) {
    throw new Error(
      "Invalid Google Docs or Google Drive URL. Please provide a valid share link (e.g. https://docs.google.com/document/d/.../edit?usp=sharing)."
    );
  }

  const response = await fetch(resolution.downloadPdfUrl, {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to download resume from Google (HTTP ${response.status}). Make sure link sharing is set to "Anyone with the link can view".`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length < 100) {
    throw new Error(
      `Downloaded file is too small (${buffer.length} bytes). Please verify the Google Docs/Drive link.`
    );
  }

  // Check if Google returned an HTML login page instead of a PDF or DOCX
  const headerAscii = buffer.subarray(0, 15).toString("utf8");
  const isPdf = headerAscii.startsWith("%PDF-");
  const isZipDocx = buffer[0] === 0x50 && buffer[1] === 0x4b; // PK zip header for .docx

  if (!isPdf && !isZipDocx) {
    if (
      headerAscii.includes("<!DOCTYPE") ||
      headerAscii.includes("<html") ||
      headerAscii.includes("<HTML")
    ) {
      throw new Error(
        'Google returned a Sign-In / HTML page instead of your resume PDF. Please ensure the Google Doc/Drive file permission is set to "Anyone with the link".'
      );
    }
    throw new Error(
      "Downloaded content is not a valid PDF or DOCX document."
    );
  }

  const safeName = canonicalFileName.endsWith(".pdf") || canonicalFileName.endsWith(".docx")
    ? canonicalFileName
    : `${canonicalFileName}.pdf`;

  const targetPath = path.join(getResumesDir(), safeName);
  fs.writeFileSync(targetPath, buffer);

  return {
    filePath: targetPath,
    fileName: safeName,
    fileSize: buffer.length,
    resolution,
  };
}
