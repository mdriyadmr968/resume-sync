import { ensureSeeded, prisma } from "../core/db";
import {
  getCurrentResume,
  setMasterResumeFromGoogleUrl,
  setMasterResumeFromLocalFile,
} from "../core/resume-manager";
import { runSyncJob } from "../core/sync-orchestrator";

function parseArgs(argv: string[]) {
  const command = argv[2] || "check";
  const flags: Record<string, string | boolean> = {};

  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      flags.dryRun = true;
    } else if (arg === "--force") {
      flags.force = true;
    } else if (arg === "--platform" && argv[i + 1]) {
      flags.platform = argv[++i];
    } else if (arg === "--url" && argv[i + 1]) {
      flags.url = argv[++i];
    } else if (arg === "--file" && argv[i + 1]) {
      flags.file = argv[++i];
    }
  }

  return { command, flags };
}

async function runCheck(flags: Record<string, string | boolean>) {
  await ensureSeeded();

  if (typeof flags.url === "string") {
    console.log(`Fetching Master Resume from Google URL: ${flags.url}`);
    await setMasterResumeFromGoogleUrl(flags.url);
  } else if (typeof flags.file === "string") {
    console.log(`Loading Master Resume from local file: ${flags.file}`);
    await setMasterResumeFromLocalFile(flags.file);
  }

  const resume = await getCurrentResume({
    refreshFromGoogle: process.env.TEST_MODE !== "true",
  });

  const platforms = await prisma.platform.findMany({
    orderBy: { sortOrder: "asc" },
  });

  console.log("\nResume Sync — Status Check");
  console.log("──────────────────────────────────────────────");

  if (!resume) {
    console.log("Master Resume: Not configured yet.");
    console.log(
      'Tip: Run `pnpm resume:check --url "https://docs.google.com/document/d/.../edit?usp=sharing"`'
    );
  } else {
    console.log(`Master Resume: ${resume.fileName} (v${resume.version})`);
    console.log(`SHA-256:       ${resume.fileHash}`);
    if (resume.downloadUrl) {
      console.log(`1-Click PDF:   ${resume.downloadUrl}`);
    }
  }

  console.log("\nPlatforms:");
  for (const p of platforms) {
    if (!p.enabled) {
      console.log(`○ ${p.name.padEnd(14)} Disabled`);
      continue;
    }
    const upToDate =
      resume && p.lastSyncedHash && p.lastSyncedHash === resume.fileHash;
    if (upToDate) {
      console.log(`✓ ${p.name.padEnd(14)} Up to date`);
    } else {
      console.log(`⚠ ${p.name.padEnd(14)} Update available`);
    }
  }
  console.log("");
}

async function runSync(flags: Record<string, string | boolean>) {
  await ensureSeeded();

  if (typeof flags.url === "string") {
    console.log(`Updating Master Resume from Google URL: ${flags.url}`);
    await setMasterResumeFromGoogleUrl(flags.url);
  } else if (typeof flags.file === "string") {
    console.log(`Updating Master Resume from local file: ${flags.file}`);
    await setMasterResumeFromLocalFile(flags.file);
  }

  const platformIds =
    typeof flags.platform === "string"
      ? flags.platform.split(",").map((s) => s.trim())
      : undefined;

  const dryRun = Boolean(flags.dryRun);
  const force = Boolean(flags.force);

  console.log(
    `\nStarting Resume Sync${dryRun ? " (DRY RUN)" : ""}${
      platformIds ? ` for [${platformIds.join(", ")}]` : " for all enabled platforms"
    }...`
  );

  const job = await runSyncJob({
    platformIds,
    dryRun,
    force,
    triggerSource: "cli",
    interactive: false,
  });

  console.log(`\nSync #${job.jobNumber} Completed (${job.status.toUpperCase()})`);
  console.log("──────────────────────────────────────────────");
  for (const rec of job.records) {
    const icon =
      rec.status === "success"
        ? "✓"
        : rec.status === "skipped"
          ? "○"
          : "✗";
    console.log(
      `${icon} ${rec.platform.name.padEnd(14)} ${rec.status.toUpperCase()} (${rec.action || ""})`
    );
    if (rec.friendlyError) {
      console.log(`    ${rec.friendlyError.split("\n")[0]}`);
    }
  }
  console.log("──────────────────────────────────────────────");
  console.log(`Successful:      ${job.successCount}`);
  console.log(`Failed:          ${job.failedCount}`);
  console.log(`Skipped:         ${job.skippedCount}`);
  console.log(`Needs attention: ${job.attentionCount}\n`);
}

async function main() {
  const { command, flags } = parseArgs(process.argv);
  try {
    if (command === "check") {
      await runCheck(flags);
    } else if (command === "sync") {
      await runSync(flags);
    } else {
      console.error(`Unknown CLI command: ${command}. Use "check" or "sync".`);
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("CLI Error:", (err as Error).message);
  process.exit(1);
});
