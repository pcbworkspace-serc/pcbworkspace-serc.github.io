# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

This repository is configured for GitHub Pages from the `main` branch using the `/docs` folder.

Automatic deploy is enabled via GitHub Actions workflow in `.github/workflows/auto-build-docs.yml`.
After this file is pushed, any push to `main` (except docs-only changes) rebuilds `docs/` and commits it automatically.

1. Build the site:

```sh
npm run pages
```

2. Commit and push your source changes:

```sh
git add .
git commit -m "Update site"
git push origin main
```

3. In GitHub repo settings, confirm **Pages Source** is set to:
	- Branch: `main`
	- Folder: `/docs`

## One-time code backend setup (Supabase)

New account registration now requires a one-time access code validated by Supabase.

1. Create a `.env` file from `.env.example` and fill in:

```sh
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

2. In Supabase SQL editor, run:

```sql
-- see full script
supabase/access_codes.sql
```

3. Add buyer codes in `access_codes` table.

4. Share codes only from `spaceroboticscreations@outlook.com`.

Without these env vars, new signups are blocked and users are asked to contact support.

## Welcome email setup (SERC)

On successful new registration, the app can send a welcome email through a webhook.

Set these in `.env` (and in GitHub Actions environment/secrets for production):

```sh
VITE_WELCOME_EMAIL_WEBHOOK_URL=...
VITE_PCB_WORKSPACE_ACCESS_VIDEO_URL=...
VITE_SUPPORT_EMAIL=spaceroboticscreations@outlook.com
```

Email content is generated in `src/lib/welcomeEmail.ts` with:
- A welcoming message from SERC
- The same `PCB Workspace Access` video link (from `VITE_PCB_WORKSPACE_ACCESS_VIDEO_URL`)
- Support contact email

Webhook payload format:

```json
{
	"to": "buyer@example.com",
	"subject": "Welcome to PCB Workspace Access — SERC",
	"text": "...",
	"html": "..."
}
```

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
