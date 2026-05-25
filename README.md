# Climate Dashboard

Historical timeline dashboard for two Nest Learning Thermostat (4th Gen) units — Upstairs and Downstairs. Polls the Google Smart Device Management API every 5 minutes and stores readings in SQLite. Deployed at [climate.ingress.realmclick.com](https://climate.ingress.realmclick.com).

## What it shows

- Current temperature, set point, and humidity for each thermostat
- Interactive timeline charts (1H / 6H / 24H / 7D / 30D)
- Actual temperature vs. heat/cool set points as overlaid lines
- Red/blue background shading when the system is actively heating or cooling
- Humidity area chart below each temperature chart

---

## Credentials overview

| Variable | Where it comes from | Required |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Google Cloud Console → OAuth 2.0 client | Yes |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console → OAuth 2.0 client | Yes |
| `SDM_PROJECT_ID` | Nest Device Access Console | Yes |
| `GOOGLE_REFRESH_TOKEN` | In-app OAuth flow after first deploy | After deploy |
| `UPSTAIRS_DEVICE_ID` | `/api/devices` endpoint after auth | After deploy |
| `DOWNSTAIRS_DEVICE_ID` | `/api/devices` endpoint after auth | After deploy |
| `GITHUB_USER` | Your GitHub username | Yes (build) |
| `GITHUB_TOKEN` | GitHub → Settings → Personal access tokens | Yes (build) |

---

## Step 1: Google Cloud Console — OAuth 2.0 credentials

These are standard Google OAuth credentials. The same client is used for both
the Nest Device Access authorization and the token exchange.

1. Go to [console.cloud.google.com](https://console.cloud.google.com).

2. **Create or select a project.** Any project works — name it something like
   `climate-dashboard`.

3. **Enable the Smart Device Management API.**
   - In the left sidebar go to **APIs & Services → Library**.
   - Search for **Smart Device Management API**.
   - Click it and press **Enable**.

4. **Configure the OAuth consent screen** (required before creating credentials).
   - Go to **APIs & Services → OAuth consent screen**.
   - Choose **External** user type and click **Create**.
   - Fill in the App name (e.g. `Climate Dashboard`), your email for support and
     developer contact, then click **Save and Continue** through the remaining
     steps. You do not need to add scopes here.
   - On the **Test users** screen, add your Google account email address.
     (While the app is in "testing" mode, only listed test users can authorize it.)

5. **Create an OAuth 2.0 Client ID.**
   - Go to **APIs & Services → Credentials**.
   - Click **+ Create Credentials → OAuth client ID**.
   - Application type: **Web application**.
   - Name: `Climate Dashboard`.
   - Under **Authorized redirect URIs**, click **+ Add URI** and enter:
     ```
     https://climate.ingress.realmclick.com/api/auth/callback
     ```
   - Click **Create**.

6. A dialog shows your **Client ID** and **Client Secret**. Copy both into
   your `.env` file:
   ```
   GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxx
   ```

---

## Step 2: Nest Device Access Console — Project ID

Google's Nest Device Access program is separate from Google Cloud. It requires
a one-time $5 USD fee to create a project.

1. Go to [console.nest.google.com/device-access](https://console.nest.google.com/device-access).

2. Sign in with the **same Google account** that owns the Nest thermostats.

3. Accept the terms and pay the **$5 USD** registration fee (charged once per
   Google account, not per project).

4. Click **Create project**.
   - Give it a name, e.g. `Climate Dashboard`.
   - When prompted for an **OAuth client ID**, paste the `GOOGLE_CLIENT_ID`
     value you obtained in Step 1 (the `123456789-abc.apps.googleusercontent.com`
     string, without any quotes).
   - Click **Next**, then **Create project**.

5. You land on the project detail page. Copy the **Project ID** (a UUID like
   `abc12345-1234-1234-1234-abc123456789`) into your `.env` file:
   ```
   SDM_PROJECT_ID=abc12345-1234-1234-1234-abc123456789
   ```

---

## Step 3: GitHub token — for pushing the container image

The build script pushes the Docker image to GitHub Container Registry (ghcr.io)
and needs a Personal Access Token.

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens).
2. Click **Generate new token (classic)**.
3. Give it a note, e.g. `climate-dashboard ghcr push`.
4. Set **Expiration** as needed (no expiration for a personal project is fine).
5. Check these scopes:
   - `write:packages`
   - `read:packages`
6. Click **Generate token** and copy the value into your `.env`:
   ```
   GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
   ```

---

## Step 4: First deploy and authorize the app

`GOOGLE_REFRESH_TOKEN` is obtained through an OAuth browser flow. The app
handles this automatically — you just need to visit a URL after the first
deploy.

1. **Copy and fill in `.env`:**
   ```bash
   cp .env.example .env
   # Edit .env — fill in GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SDM_PROJECT_ID,
   # GITHUB_USER, GITHUB_TOKEN. Leave GOOGLE_REFRESH_TOKEN and device IDs blank.
   ```

2. **Run the build and deploy script:**
   ```bash
   ./build-push.sh
   ```
   This builds the image, pushes it to ghcr.io, and deploys all k8s manifests.
   It will print warnings for the empty optional variables — that is expected.

3. **Authorize via browser.**
   Once the pod is running, visit:
   ```
   https://climate.ingress.realmclick.com/api/auth/start
   ```
   You will be redirected to a Google consent screen. Sign in with the Google
   account that owns the Nest thermostats and click **Allow**.

4. After Google redirects you back, the app stores the refresh token in its
   SQLite database automatically. You will see the dashboard (or an empty state
   if device IDs aren't set yet).

5. **Persist the refresh token in the k8s secret** so it survives pod restarts.
   Retrieve it from the running pod:
   ```bash
   kubectl exec -n climate deployment/climate -- \
     sqlite3 /data/climate.db "SELECT value FROM config WHERE key='google_refresh_token';"
   ```
   Copy that value into your `.env`:
   ```
   GOOGLE_REFRESH_TOKEN=1//xxxxxxxxxxxxxxxxxxxx
   ```
   Then re-run `./build-push.sh` to sync it into the k8s secret.

---

## Step 5: Identify your thermostats

After authorizing, the app can see all thermostats on your account. Get their
IDs to assign the Upstairs / Downstairs labels.

```bash
curl -s https://climate.ingress.realmclick.com/api/devices | python3 -m json.tool
```

The response lists each thermostat with its `device_id` and `display_name`.
Identify which is upstairs and which is downstairs (use `display_name` or cross-
reference the Google Home app), then add them to your `.env`:

```
UPSTAIRS_DEVICE_ID=AVPHwEuxxxxxxxxxxxxxxxxxx
DOWNSTAIRS_DEVICE_ID=AVPHwEuyyyyyyyyyyyyyyyy
```

Run `./build-push.sh` one more time to sync the updated secret and restart the
pod. The panels will now be labeled **Upstairs** and **Downstairs**.

---

## Local development

```bash
# Backend
cd backend
pip install hatch
hatch dep show requirements | pip install -r /dev/stdin
DB_PATH=./climate.db GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... SDM_PROJECT_ID=... \
  uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev   # proxies /api → localhost:8000, opens at localhost:5173
```

---

## Deploying updates

Any time you change code or `.env` values, re-run:

```bash
./build-push.sh
```

The script is fully idempotent — it re-applies all k8s manifests and syncs
secrets on every run.

---

## Architecture

```
build-push.sh
  └── docker buildx build (linux/amd64)
        ├── node:20-alpine  →  npm run build  →  frontend/dist/
        └── python:3.11-slim
              ├── FastAPI (uvicorn :8000)
              │     ├── GET /api/health
              │     ├── GET /api/auth/start   → Google OAuth redirect
              │     ├── GET /api/auth/callback → token exchange + store
              │     ├── GET /api/devices       → latest reading per thermostat
              │     └── GET /api/history       → SQLite history (up to 30 days)
              ├── asyncio poll loop (every 5 min) → Google SDM API → SQLite
              └── StaticFiles → /static (React build)

k8s/
  ├── namespace.yaml      climate namespace
  ├── pvc.yaml            2Gi for /data/climate.db
  ├── deployment.yaml     1 replica, env from climate-secrets
  ├── service.yaml        ClusterIP :80 → :8000
  └── ingress.yaml        climate.ingress.realmclick.com, letsencrypt-prod TLS
```
