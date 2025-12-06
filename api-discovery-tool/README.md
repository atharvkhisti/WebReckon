# WebReckon – Browser API Inventory

Playwright-powered inventory: launch a real browser, watch network traffic (XHR/fetch/WebSocket/GraphQL), and build a tagged list of browser-visible APIs.

## Repo structure
- `backend/` – Express + Playwright capture service (POST `/discover`).
- `frontend/` – Next.js + Tailwind UI (Vercel-ready) that calls the backend.

## Prereqs
- Node 18+ recommended
- PowerShell (Windows) or bash (macOS/Linux)

## Run locally
Backend (defaults to port `5000`):
```powershell
cd backend
npm install
npx playwright install
node src/app.js
```

Frontend:
```powershell
cd frontend
npm install
$env:NEXT_PUBLIC_API_BASE_URL="http://localhost:5000"
npm run dev
```
Open http://localhost:3000 (Next.js will move to 3001 if 3000 is busy).

## How it works
- Watches network requests during the Playwright session and captures REST/GraphQL/WebSocket calls.
- Normalizes each endpoint (url, host, path, method, status, type, content type).
- Tags endpoints: purpose (auth/search/user/data/admin/payments/other), THIRD-PARTY (host differs), SENSITIVE? (auth/user/payments), SUSPICIOUS (status >= 400 or 0).
- Summarizes counts by host, method, type, purpose.

## Deploy
- **Frontend on Vercel**
  - Project root: `frontend`
  - Build: `npm run build`
  - Output: `.next`
  - Env var: `NEXT_PUBLIC_API_BASE_URL=https://<your-backend-host>`
- **Backend** (Playwright is not ideal for Vercel serverless). Host on a Node-compatible service (Render, Fly.io, Railway, AWS/GCP/Azure, or a VM). Expose `PORT` (defaults `5000`) and allow Playwright to download browsers (`npx playwright install`).

## Clean repo (for GitHub)
- Generated artifacts are removed (`backend/results`, `backend/src/results`, `frontend/.next`) and ignored via `.gitignore`.
- Keep only source, configs, and lockfiles under version control.

## Quick demo tips
- Choose a page that actually issues XHR/GraphQL calls (dashboards, explorers, authenticated flows).
- Run a scan and screenshot: summary cards + endpoint table (THIRD-PARTY, SENSITIVE?, SUSPICIOUS badges).

## Future ideas
- Run history + diff between scans
- Response key sniffing for PII-ish fields without storing bodies
- Charts for host/method/purpose distribution
- CLI mode for CI/CD runs
