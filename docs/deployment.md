# Deployment Guide

Html2md utilizes a decentralized **Split Architecture** optimized for intensive background processing and static asset delivery.

| Component              | Platform     | Tech Stack             | Responsibility                      |
| :--------------------- | :----------- | :--------------------- | :---------------------------------- |
| **Frontend UI**        | Netlify      | Preact + Vite          | Global CDN, static UI delivery      |
| **Backend API**        | DigitalOcean | Docker + Caddy         | API Gateway, Process Management     |
| **Background Workers** | DigitalOcean | Node.js + Puppeteer    | Headless crawling, heavy conversion |
| **Queue DB**           | DigitalOcean | Valkey (Managed Redis) | Cross-container BullMQ job routing  |
| **Storage**            | AWS S3       | S3 Standard            | Stores ZIPs, serves presigned URLs  |

## Why a standalone DigitalOcean Droplet?
Puppeteer (headless Chromium) is severely memory-bound. A single Chrome instance generally consumes 500MB to 1GB of RAM depending on the DOM size of the crawled website. Serverless architectures like Netlify Functions (10s timeout, 50MB limit) or expensive managed App Platforms struggle to handle this cost-effectively.

We use a `$24/mo` DigitalOcean Droplet (`s-2vcpu-4gb`) running pure Docker Compose, which safely manages up to ~3 concurrent headless Chrome instances 24/7.

---

## 🚀 CI/CD Auto-Deployment 

Both the frontend and backend are automatically deployed when code is pushed to the `production` branch on GitHub.

### 1. Frontend (Netlify)
The frontend is built and published automatically by Netlify.
It reads the API location from the injected environment variable `VITE_API_BASE_URL`.

### 2. Backend (GitHub Actions → DigitalOcean)
The backend uses a GitHub Actions workflow (`.github/workflows/deploy-production.yml`).
When code merges to `production`:
1. GitHub Actions checks out the repository.
2. Automatically syncs code to the Droplet (`/opt/html2md`) via `scp`.
3. Executes `docker compose up -d --build` securely via SSH to rebuild the `api` and `worker` containers with zero downtime.

#### Required GitHub Secrets:
For auto-deployment to function, the repository must have these secrets configured:
- `DO_BACKEND_HOST`: The IP address of the Droplet.
- `DO_BACKEND_USER`: `root`
- `DO_BACKEND_SSH_KEY`: The private SSH key for Droplet access.

---

## Storage Layer (AWS S3)

Completed website crawls generate `.zip` archives. Instead of tying up the Droplet's outbound bandwidth serving multi-megabyte zips, the backend uploads finished artifacts synchronously to **AWS S3** (`2md-traylinx-production`).

When a client hits `GET /api/download/:site`, the API responds with an **HTTP 302 Redirect** to an S3 Presigned URL (expiring in 1 hour).

### S3 Lifecycle Rules
The S3 bucket is configured with a 7-day auto-expiry lifecycle rule to continuously prune stale `html2md` archives and save long-term storage costs.

---

## Local Development Environment

For local development, the system gracefully bypasses all complex cloud infrastructure.

```bash
# Clone repository
git clone https://github.com/traylinx/html2md.git

# Install dependencies
npm ci

# Start the API server & static frontend
npm start
```

### Magic Fallbacks:
- **No Redis?** Local development doesn't require Valkey/Redis. If `REDIS_URL` isn't found in `.env`, the job queue falls back to synchronous execution `spawn()`.
- **No S3?** If AWS credentials are missing, the storage layer ignores S3 and falls back to writing and serving ZIP files locally from `~/.2md/jobs/`.
