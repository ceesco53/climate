# Climate Dashboard

Historical timeline dashboard for two Nest Learning Thermostat (4th Gen) units — Upstairs and Downstairs. Polls the Google Smart Device Management API every 5 minutes and stores readings in SQLite. Deployed at [climate.ingress.realmclick.com](https://climate.ingress.realmclick.com).

## Design: credentials live in the database, not in env vars or k8s secrets

All Google / Nest credentials (`client_id`, `client_secret`, `sdm_project_id`, `refresh_token`, device IDs) are stored in the app's own SQLite database on the persistent volume. They are entered through the dashboard's Settings panel after first deploy and are never written to environment variables, k8s Secrets, or config files.

The only values that live outside the database are non-sensitive deployment parameters set directly in the pod spec:

| Env var | Value | Purpose |
| --- | --- | --- |
| `DB_PATH` | `/data/climate.db` | Where the SQLite file lives |
| `APP_HOST` | `https://climate.ingress.realmclick.com` | OAuth redirect URI base |
| `POLL_INTERVAL_SECONDS` | `300` | How often to poll Nest API |

The `.env` file (only needed to run `build-push.sh`) contains only two values: `GITHUB_USER` and `GITHUB_TOKEN`.

---

## What it shows

- Current temperature, set point, and humidity for each thermostat
- Interactive timeline charts (1H / 6H / 24H / 7D / 30D)
- Actual temperature vs. heat/cool set points as overlaid lines
- Red/blue background shading when the system is actively heating or cooling
- Humidity area chart below each temperature chart

---

## Prerequisites: Google Cloud + Nest Device Access

### Step 1 — Google Cloud Console: create OAuth 2.0 credentials

1. Go to [console.cloud.google.com](https://console.cloud.google.com).

2. Create or select a project (name it anything, e.g. `climate-dashboard`).

3. **Enable the Smart Device Management API.**
   - Go to **APIs & Services → Library**.
   - Search for **Smart Device Management API** and click **Enable**.

4. **Configure the OAuth consent screen.**
   - Go to **APIs & Services → OAuth consent screen**.
   - Choose **External**, click **Create**.
   - Fill in App name, support email, and developer contact email.
   - Skip the Scopes step.
   - On the **Test users** screen, add the Google account that owns the Nest thermostats.

5. **Create an OAuth 2.0 Client ID.**
   - Go to **APIs & Services → Credentials → + Create Credentials → OAuth client ID**.
   - Application type: **Web application**.
   - Name: `Climate Dashboard`.
   - Authorized redirect URIs — add:

     ```text
     https://climate.ingress.realmclick.com/api/auth/callback
     ```

   - Click **Create** and copy the **Client ID** and **Client Secret**.

### Step 2 — Nest Device Access Console: get your project ID

1. Go to [console.nest.google.com/device-access](https://console.nest.google.com/device-access).
2. Sign in with the Google account that **owns the Nest thermostats**.
3. Accept the terms and pay the **one-time $5 USD** registration fee.
4. Click **Create project**.
   - Give it a name (e.g. `Climate Dashboard`).
   - When prompted for an OAuth client ID, paste your **Client ID** from Step 1.
5. Copy the resulting **Project ID** (a UUID).

### Step 3 — GitHub token: for pushing the container image

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens) → **Generate new token (classic)**.
2. Scopes needed: `write:packages`, `read:packages`.
3. Copy the token.

---

## Deploy

### 1. Create `.env`

```bash
cp .env.example .env
```

Edit `.env` — fill in `GITHUB_USER` and `GITHUB_TOKEN` only.

### 2. Build and deploy

```bash
./build-push.sh
```

This builds the `linux/amd64` image, pushes to `ghcr.io/ceesco53/climate`, and applies all k8s manifests. No Google credentials are needed at this step.

### 3. Enter credentials in the dashboard

Visit **[climate.ingress.realmclick.com](https://climate.ingress.realmclick.com)** and click **Open Settings**. Enter:

- **Google Client ID** — from Step 1
- **Google Client Secret** — from Step 1
- **SDM Project ID** — from Step 2

Click **Save credentials**.

### 4. Authorize Google Nest

Click **Connect Google Nest →** in the Settings panel. You will be redirected to Google's consent screen. Sign in with the account that owns the thermostats and click **Allow**. The app stores the refresh token in SQLite automatically and redirects back to the dashboard.

### 5. Assign thermostat labels

Back in Settings (⚙ icon, top-right), scroll to **Thermostat Labels**. Select which thermostat is Upstairs and which is Downstairs from the dropdowns and click **Save labels**.

---

## Deploying updates

Any time you change code, re-run:

```bash
./build-push.sh
```

Credentials stored in the database on the PVC are not affected by redeployment.

---

## Local development

```bash
# Backend
cd backend
pip install hatch
hatch dep show requirements | pip install -r /dev/stdin
DB_PATH=./climate.db APP_HOST=http://localhost:8000 \
  uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev   # proxies /api → localhost:8000, opens at localhost:5173
```

Enter credentials via the local Settings panel at `http://localhost:5173`.

---

## Architecture

```text
build-push.sh              needs only GITHUB_USER + GITHUB_TOKEN
  └── docker buildx build (linux/amd64)
        ├── node:20-alpine  →  npm run build  →  frontend/dist/
        └── python:3.11-slim
              ├── FastAPI (uvicorn :8000)
              │     ├── GET  /api/health
              │     ├── GET  /api/config/status   → which keys are set (not values)
              │     ├── POST /api/config           → save credentials to SQLite
              │     ├── GET  /api/auth/start       → redirect to Google OAuth
              │     ├── GET  /api/auth/callback    → exchange code, store refresh token
              │     ├── GET  /api/auth/status      → credentials_configured + authenticated
              │     ├── GET  /api/devices          → latest reading per thermostat
              │     └── GET  /api/history          → SQLite history (up to 30 days)
              ├── app/config.py  ← all credentials read from SQLite with 60s TTL cache
              ├── asyncio poll loop (every 5 min) → Google SDM API → SQLite
              └── StaticFiles → /static (React build)

k8s/
  ├── namespace.yaml      climate namespace
  ├── pvc.yaml            2Gi PVC at /data  (SQLite + all credentials)
  ├── deployment.yaml     1 replica, 3 plain env vars (DB_PATH, APP_HOST, POLL_INTERVAL_SECONDS)
  ├── service.yaml        ClusterIP :80 → :8000
  └── ingress.yaml        climate.ingress.realmclick.com, letsencrypt-prod TLS
```
