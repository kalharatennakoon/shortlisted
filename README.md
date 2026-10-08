# Shortlisted

Shortlisted (formerly Shortlistd and Job Tracker) tracks your job applications on a status board, like a Notion tracker but
with your own account.
Built with React + Vite, Supabase (auth + Postgres) and hosted on GitHub Pages.

## Setup

### 1. Supabase
1. Create a free project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run each file in `supabase/migrations/` in order (oldest first).
3. Under **Authentication → URL Configuration**, set **Site URL** to your Pages URL
   (e.g. `https://<username>.github.io/shortlisted/`) and add `http://localhost:5173` to **Redirect URLs**.
4. Copy the **Project URL** and **anon public key** from **Project Settings → API**.

### 2. Run locally
```bash
cp .env.example .env   # fill in the two values
npm install
npm run dev
```

### 3. Deploy to GitHub Pages
1. In the repo, go to **Settings → Secrets and variables → Actions** and add
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
2. Go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Push to `main`. The workflow builds and deploys automatically.

## Security
All data access happens from the browser with the public anon key. Row Level Security policies in the
migration make sure each user can only read and write their own applications.
