import { PrismaClient } from "@prisma/client";
import {
  PortfolioConfigSchema,
  LinkedInConfigSchema,
  BDJobsConfigSchema,
  AppSettingsSchema,
} from "./config-schemas";
import { getDataDir } from "./paths";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  seeded: boolean | undefined;
};

// Ensure data directory exists before opening SQLite
getDataDir();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.LOG_LEVEL === "debug" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export async function ensureSeeded(): Promise<void> {
  if (globalForPrisma.seeded) return;

  try {
    const count = await prisma.platform.count();
    if (count === 0) {
      const portfolioConfig = PortfolioConfigSchema.parse({
        mode: "git_repo",
        localRepoPath: process.env.PORTFOLIO_REPO_PATH || "C:/Projects/react-portfolio",
        dataFilePath: "lib/data.ts",
        copyStaticPdf: false,
        staticPdfRelativePath: "public/resume.pdf",
        gitBranch: "main",
        autoCommitAndPush: true,
        commitMessage: "chore: update resume link",
        publicSiteUrl: "https://syied.netlify.app",
      });

      const linkedinConfig = LinkedInConfigSchema.parse({
        syncTarget: "both",
        applicationSettingsUrl: "https://www.linkedin.com/jobs/application-settings",
        profileUrl: "https://www.linkedin.com/in/me/",
        featuredTitle: "Mohammad Syied Bin Salim - Resume",
        featuredDescription:
          "Software Engineer Resume (Full-Stack, Enterprise SaaS, Web3, AI)",
        featuredSyncMode: "upload_pdf",
        deleteOldestIfFull: true,
        maxStoredResumes: 4,
      });

      const bdjobsConfig = BDJobsConfigSchema.parse({
        loginUrl: "https://mybdjobs.bdjobs.com/mybdjobs/signin.asp",
        dashboardUrl: "https://mybdjobs.bdjobs.com/mybdjobs/masterview.asp",
        resumeUploadUrl: "https://mybdjobs.bdjobs.com/mybdjobs/file_upload.asp",
        alternateUploadUrl: "https://mybdjobs.bdjobs.com/new_mybdjobs/step_01_view.asp",
        maxFileSizeMB: 2,
        preferredFormat: "pdf",
      });

      await prisma.platform.createMany({
        data: [
          {
            id: "portfolio",
            name: "Portfolio",
            type: "portfolio",
            enabled: true,
            connected: true,
            loginStatus: "connected",
            adapterVersion: "1.2.0",
            url: "https://syied.netlify.app",
            configJson: JSON.stringify(portfolioConfig),
            healthStatus: "healthy",
            sortOrder: 1,
          },
          {
            id: "linkedin",
            name: "LinkedIn",
            type: "linkedin",
            enabled: true,
            connected: false,
            loginStatus: "not_connected",
            adapterVersion: "1.2.0",
            url: "https://www.linkedin.com",
            configJson: JSON.stringify(linkedinConfig),
            healthStatus: "unknown",
            sortOrder: 2,
          },
          {
            id: "bdjobs",
            name: "BDJobs",
            type: "bdjobs",
            enabled: true,
            connected: false,
            loginStatus: "not_connected",
            adapterVersion: "1.0.0",
            url: "https://mybdjobs.bdjobs.com",
            configJson: JSON.stringify(bdjobsConfig),
            healthStatus: "unknown",
            sortOrder: 3,
          },
        ],
      });
    }

    const existingSettings = await prisma.setting.findUnique({
      where: { key: "app_settings" },
    });
    if (!existingSettings) {
      const defaults = AppSettingsSchema.parse({});
      await prisma.setting.create({
        data: {
          key: "app_settings",
          value: JSON.stringify(defaults),
        },
      });
    }

    globalForPrisma.seeded = true;
  } catch (err) {
    // Database might not be pushed yet during build
    console.warn("Database seed check skipped:", (err as Error).message);
  }
}

export async function getAppSettings() {
  await ensureSeeded();
  const row = await prisma.setting.findUnique({
    where: { key: "app_settings" },
  });
  if (!row) {
    return AppSettingsSchema.parse({});
  }
  try {
    return AppSettingsSchema.parse(JSON.parse(row.value));
  } catch {
    return AppSettingsSchema.parse({});
  }
}

export async function updateAppSettings(partial: Record<string, unknown>) {
  const current = await getAppSettings();
  const merged = AppSettingsSchema.parse({ ...current, ...partial });
  await prisma.setting.upsert({
    where: { key: "app_settings" },
    update: { value: JSON.stringify(merged) },
    create: { key: "app_settings", value: JSON.stringify(merged) },
  });
  return merged;
}
