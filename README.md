# Health Check

The **Health Check** pings our web properties on a schedule and posts concise Slack alerts when any site fails to respond.  
It’s built as a lightweight Next.js service that uses fast `HEAD` requests, per-site configuration, and a one-click **Check Again** link to confirm recovery.

## 🧭 Overview

- **What it does:** Sweeps through a configured list of sites, pings each with `HEAD`, and reports **down** or **recovered** to Slack.
- **Where alerts go:** Our chosen Slack channel (e.g., `#cc-websites`) via incoming webhooks.
- **How often:** Every ~15 minutes (via our hosting scheduler or an external cron/uptime pinger).
- **Endpoints:**
  - `/check` — runs a full sweep and posts alerts for any sites that are down.
  - `/check?site=<Name>` — re-checks a single site by **name** and posts a **site is up** confirmation if recovered.
  - `/` — redirects to `/check`.

## ⚙️ Configuration

### 1) Sites to monitor

Sites are defined in code as an array of objects:

```ts
const sites = [
  {
    name: 'CC Home',
    url: 'https://centercentre.com',
    // Optional overrides per site:
    testUrl: 'https://asset.uie.com/pdf/example.pdf', // used for the actual HEAD request if present
    adminUrl: 'https://centercentre.com/wp-admin',     // shown in Slack
    dashboardUrl: 'https://panel.example.com/...'      // shown in Slack
  },
  // ...
];
```

- **`url`** is the public URL you care about.
- **`testUrl` (optional)** is a deeper URL that’s better at detecting real problems (e.g., a known asset or sub-page).
- **`adminUrl` / `dashboardUrl` (optional)** are convenience links included in the Slack alert to triage faster.

> The **name** field must be unique and stable; the **Check Again** link uses it as the lookup key.

### 2) Slack webhooks

Set two Slack Incoming Webhooks (or compatible endpoints):

- **Down webhook** (`SLACK_DOWN_WEBHOOK`) — receives “site is down” alerts.
- **Up webhook** (`SLACK_UP_WEBHOOK`) — receives “site is up again” confirmations.

**Payload shape sent by this service:**

```json
{
  "message": "500 Internal Server Error",    // or "No response", etc. (only on DOWN)
  "name": "PDF Service",
  "url": "https://pdf.centercentre.com",
  "adminUrl": "https://github.com/org/repo",
  "dashboardUrl": "https://app.netlify.com/projects/uie-pdf/overview",
  "tryUrl": "https://your-app.example.com/check?site=PDF%20Service"
}
```

> Your Slack app/workflow should format this into a rich message and render **Check Again** using `tryUrl`.

## 🔌 API

### `GET /check`
- Pings each configured site with a `HEAD` request:
  - `testUrl` if set, else `url`.
- For every **down** result, posts a payload to `SLACK_DOWN_WEBHOOK`.
- Returns:  
  ```json
  { "status": "ok", "message": "Health check passed" }
  ```

### `GET /check?site=<Name>`
- Re-checks only the named site (matching is case-insensitive).
- If the site is **up**, posts a confirmation payload to `SLACK_UP_WEBHOOK`.
- Useful for the **Check Again** button in Slack.

**Notes:**
- The service logs each probe: `[HEALTH-CHECK] <name> - <status code> <status text>`.
- Errors are caught; failed fetches are treated as “down”.

## 🚦 How it works

- Iterates `sites` and runs `fetch(testUrl || url, { method: 'HEAD' })`.
- Builds two lists:
  - **downSites** — any site with a thrown error or non-OK status.
  - **recoveries** — when a user triggers `?site=<Name>` and that site now responds OK.
- Posts Slack messages with useful links:
  - `url`, `adminUrl`, `dashboardUrl`, and `tryUrl` (the **Check Again** link).
- Adds a 1s delay between messages to avoid webhook rate limiting.

## 🏗️ Hosting

Currently hosted on Netlify (uses Next.js server/edge functions).  
New commits auto-publish. 
Edge functions provide high reliability independent of our infrastructure.

- **Any host works** as long as it can:
  - Serve a Next.js app
  - Run the `/check` endpoint reliably
  - Offer a scheduler or allow an external pinger

### Scheduling the sweep (every ~15 minutes)

Pick one of these:
- **Netlify Scheduled Functions** (or equivalent) to hit `/check`.
- **External cron** (e.g. GitHub Actions, Uptimerobot, healthchecks.io) that runs:
  ```bash
  curl -fsS https://your-app.example.com/check
  ```

## 🔐 Environment

Create a `.env` (or provider-specific secrets) in the project root:

```dotenv
# The public base URL of this service (used to build "Check Again" links)
APP_URL=https://your-app.example.com

# Slack incoming webhooks
SLACK_DOWN_WEBHOOK=https://hooks.slack.com/... (down alerts)
SLACK_UP_WEBHOOK=https://hooks.slack.com/...   (recovery confirmations)
```

> Any FTP-related variables from older examples are **not used** by the code shown here.

## 🧑‍💻 Local Setup

1) Clone & install
```bash
git clone https://github.com/yourname/health-check
cd health-check
npm install
```

2) Configure env
See [Notion documentation](https://www.notion.so/centercentre/Health-Check-285903316fdd80b78e35edefcff0320d?source=copy_link)

3) Run
```bash
npm run dev
# in another shell:
curl -s http://localhost:3000/check
```

## 🧪 Testing tips

- **Simulate a failure:** Temporarily point a site’s `testUrl` to a non-existent path; confirm a **down** alert appears.  
- **Confirm recovery:** Use the **Check Again** link (or `GET /check?site=<Name>`) to verify the **up** message posts.
- **Rate limits:** If the webhook has strict limits, keep the 1s delay between messages (present in the code).