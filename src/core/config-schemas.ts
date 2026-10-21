import { z } from "zod";

export const PortfolioConfigSchema = z.object({
  mode: z.enum(["git_repo", "browser_admin", "file_copy"]).default("git_repo"),
  // Git Repo Mode (pre-configured for C:\Projects\react-portfolio)
  localRepoPath: z.string().default("C:/Projects/react-portfolio"),
  dataFilePath: z.string().default("lib/data.ts"),
  copyStaticPdf: z.boolean().default(false),
  staticPdfRelativePath: z.string().default("public/resume.pdf"),
  gitBranch: z.string().default("main"),
  autoCommitAndPush: z.boolean().default(true),
  commitMessage: z.string().default("chore: update resume link"),
  publicSiteUrl: z.string().default("https://syied.netlify.app"),
  // Browser Admin Mode
  adminLoginUrl: z.string().optional().default(""),
  adminUploadUrl: z.string().optional().default(""),
  fileInputSelector: z.string().optional().default('input[type="file"]'),
  saveButtonSelector: z.string().optional().default('button:has-text("Save")'),
  successSelector: z.string().optional().default(""),
  // File Copy Mode
  destinationFilePath: z.string().optional().default(""),
});

export type PortfolioConfig = z.infer<typeof PortfolioConfigSchema>;

export const LinkedInConfigSchema = z.object({
  syncTarget: z
    .enum(["both", "application_settings", "featured_section"])
    .default("both"),
  applicationSettingsUrl: z
    .string()
    .url()
    .default("https://www.linkedin.com/jobs/application-settings"),
  profileUrl: z.string().url().default("https://www.linkedin.com/in/me/"),
  featuredTitle: z.string().default("Mohammad Syied Bin Salim - Resume"),
  featuredDescription: z
    .string()
    .default("Software Engineer Resume (Full-Stack, Enterprise SaaS, Web3, AI)"),
  featuredSyncMode: z
    .enum(["upload_pdf", "external_link"])
    .default("upload_pdf"),
  deleteOldestIfFull: z.boolean().default(true),
  maxStoredResumes: z.number().int().min(1).max(4).default(4),
});

export type LinkedInConfig = z.infer<typeof LinkedInConfigSchema>;

export const BDJobsConfigSchema = z.object({
  loginUrl: z
    .string()
    .url()
    .default("https://mybdjobs.bdjobs.com/mybdjobs/signin.asp"),
  dashboardUrl: z
    .string()
    .url()
    .default("https://mybdjobs.bdjobs.com/mybdjobs/masterview.asp"),
  resumeUploadUrl: z
    .string()
    .url()
    .default("https://mybdjobs.bdjobs.com/mybdjobs/file_upload.asp"),
  alternateUploadUrl: z
    .string()
    .url()
    .default("https://mybdjobs.bdjobs.com/new_mybdjobs/step_01_view.asp"),
  maxFileSizeMB: z.number().positive().default(2),
  preferredFormat: z.enum(["pdf", "docx"]).default("pdf"),
});

export type BDJobsConfig = z.infer<typeof BDJobsConfigSchema>;

export const CustomWebsiteConfigSchema = z.object({
  websiteUrl: z.string().url(),
  loginUrl: z.string().url(),
  loggedInSelector: z.string().default("a[href*='logout'], button:has-text('Logout'), .user-profile"),
  resumePageUrl: z.string().url(),
  uploadSelector: z.string().default('input[type="file"]'),
  saveSelector: z.string().default('button[type="submit"], button:has-text("Save"), button:has-text("Update")'),
  verificationSelector: z.string().default(".resume-filename, .upload-success"),
  verificationText: z.string().optional().default(""),
  maxFileSizeMB: z.number().positive().default(5),
});

export type CustomWebsiteConfig = z.infer<typeof CustomWebsiteConfigSchema>;

export const AppSettingsSchema = z.object({
  confirmationMode: z
    .enum(["ask_before_upload", "fully_automatic", "ask_on_state_change"])
    .default("ask_before_upload"),
  dryRunDefault: z.boolean().default(false),
  screenshotOnSuccess: z.boolean().default(true),
  screenshotOnFailure: z.boolean().default(true),
  canonicalFileName: z
    .string()
    .min(1)
    .default("Mohammad_Syied_Bin_Salim_Resume.pdf"),
});

export type AppSettings = z.infer<typeof AppSettingsSchema>;

export function parsePlatformConfig(type: string, rawJson: string) {
  let parsed: unknown = {};
  try {
    parsed = JSON.parse(rawJson || "{}");
  } catch {
    parsed = {};
  }

  switch (type) {
    case "portfolio":
      return PortfolioConfigSchema.parse(parsed);
    case "linkedin":
      return LinkedInConfigSchema.parse(parsed);
    case "bdjobs":
      return BDJobsConfigSchema.parse(parsed);
    case "custom":
      return CustomWebsiteConfigSchema.partial().parse(parsed);
    default:
      return parsed;
  }
}
