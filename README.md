# Resume Sync — Local-First Browser Automation Assistant

A local-first desktop/web automation tool built with **Next.js, TypeScript, Playwright, SQLite, and Prisma** that synchronizes your **Master Resume** (from a **Google Docs / Google Drive URL** or a **local PDF/DOCX file**) across:

1. **Personal Portfolio (`https://syied.netlify.app` / `C:\Projects\react-portfolio`)** — Converts your Google Docs/Drive URL into a 1-click downloadable PDF link (`export?format=pdf` or `uc?export=download`), updates `siteConfig.resumeUrl` & `siteConfig.resumeViewUrl` in `lib/data.ts`, commits, and pushes to trigger Netlify deployment.
2. **LinkedIn (`https://www.linkedin.com`)** — Updates **both** your **Job Application Settings** (Easy Apply / recruiter resume) and your **Profile Featured Section** using your persistent local browser session.
3. **BDJobs (`https://mybdjobs.bdjobs.com`)** — Uploads your latest PDF/DOCX resume to the **Personalized Resume** section.
4. **Custom Job Portals** — Add any future job board via configurable CSS/semantic selectors in the UI.

---

## 1. Installation & Quick Start

```bash
cd C:\Projects\resume-sync

# Install dependencies
pnpm install

# Generate Prisma Client & initialize local SQLite database
pnpm db:generate
pnpm db:push
pnpm db:seed

# Start the local web application (http://localhost:3050)
pnpm dev
```

---

## 2. First-Time Setup

1. **Start the application**: Run `pnpm dev` and open `http://localhost:3050`.
2. **Set Your Master Resume**:
   - **Option A (Google Docs / Drive URL)**: Paste your Google Docs or Google Drive share URL on the Dashboard or `/resume` page and click **Fetch & Convert Link**. The app automatically generates the 1-click PDF download URL, downloads the latest PDF locally to `data/resumes/Mohammad_Syied_Bin_Salim_Resume.pdf`, verifies its `%PDF-` signature, and computes its SHA-256 hash.
   - **Option B (Local File)**: Click **Select Local File** to open the native Windows file picker dialog.
3. **Connect LinkedIn & BDJobs**:
   - Go to `/platforms` (or click **Connect** on the Dashboard).
   - A visible Chromium browser window will open using an isolated persistent profile (`data/browser-profiles/linkedin` or `data/browser-profiles/bdjobs`).
   - Log in manually and complete any 2FA or CAPTCHA challenge.
   - Once logged in, the application detects your authenticated session and saves the profile locally so future runs reuse your session.
4. **Verify Portfolio Configuration**:
   - Pre-configured for `C:\Projects\react-portfolio` (`lib/data.ts`). You can customize the repo path, branch, or switch to Browser Admin / File Copy mode under `/platforms/portfolio`.

---

## 3. Running Synchronization

### Web UI
- Open `http://localhost:3050`.
- Click **Sync All** (or toggle **Dry Run** first to inspect what each adapter will do without making changes).
- Use the **Live Sync (`/sync`)** control panel to **Pause**, **Resume**, or **Stop** automation at any time, or respond to 2FA/CAPTCHA and Manual Upload Confirmation prompts.

### CLI Commands

```bash
# Check resume version & which platforms need synchronization
pnpm resume:check

# Pull latest resume from Google Docs and check platform statuses
pnpm resume:check --url "https://docs.google.com/document/d/1IDR8jyGDgTUm3mcQZxaIggSls9belqTMcZmV-gbfjU8/edit?usp=sharing"

# Run full synchronization across all enabled platforms
pnpm resume:sync

# Sync a specific platform only
pnpm resume:sync --platform linkedin
pnpm resume:sync --platform portfolio

# Dry-run mode from CLI
pnpm resume:sync --dry-run
```

---

## 4. Adding a New Platform Adapter

1. **No-Code (UI)**: Go to `/platforms` → click **Add Custom Website** and configure `Website URL`, `Login URL`, `Resume Page URL`, `Upload Selector`, and `Save Button Selector`.
2. **Code Adapter**:
   - Create `src/automation/platforms/<name>/<Name>Adapter.ts` extending `BasePlatformAdapter`.
   - Register it in `src/automation/platforms/registry.ts`.

---

## 5. Browser Session Management & Troubleshooting

- Persistent browser profiles are stored locally under:
  - `data/browser-profiles/linkedin/`
  - `data/browser-profiles/bdjobs/`
  - `data/browser-profiles/portfolio/`
- If a website changes its layout or a session expires, go to `/platforms` and click **Health Check** to verify:
  - `✓ Browser session valid`
  - `✓ Resume page accessible`
  - `✓ Upload control detected`
- Mandatory failure screenshots and structured logs are saved in `logs/YYYY-MM-DD/<platform>/` and can be inspected in `/history`.

---

## 6. Security Rules

- **No Passwords Stored**: The application never asks for, stores, or logs account passwords.
- **No Anti-Bot Evasion**: CAPTCHA, 2FA, and security checkpoints are never bypassed; automation pauses and prompts you to complete verification in the visible browser window.
- **Git-Ignored Local Data**: `data/`, `browser-profiles/`, `logs/`, and `.env*` are strictly excluded via `.gitignore`.
