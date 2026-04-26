# Feedback → Google Sheets — setup

The feedback form on the home page can write submissions directly into a Google
Sheet you own, via a free Google Apps Script web app. ~5 minutes to set up. No
third-party services. You own the data.

## What you'll end up with

- A Google Sheet titled "MAPGEN feedback" (or whatever you name it)
- A `feedback` tab inside it with one row per submission, columns:
  `timestamp · role · message · email · user_agent · referrer · ip_hash`
- A web-app URL like `https://script.google.com/macros/s/AKfy.../exec`
- That URL stored as a GitHub Actions secret named `PUBLIC_FEEDBACK_ENDPOINT`

When `PUBLIC_FEEDBACK_ENDPOINT` is set, the site builds with the endpoint baked
in. When it's missing, the form silently falls back to `mailto:` (current
behavior) — so you can roll back by deleting the secret.

---

## Setup (one-time, ~5 min)

### 1. Create the Sheet

1. Open https://sheets.new — a fresh blank Google Sheet
2. Rename it to something like **MAPGEN feedback**

### 2. Add the Apps Script

1. In the sheet menu: **Extensions → Apps Script**
2. The editor opens with a `Code.gs` file. Delete its contents.
3. Open `scripts/feedback-apps-script.gs` from this repo and paste the entire
   contents into the editor.
4. Click the **disk icon** (or Ctrl/Cmd-S) to save. Name the project
   "MAPGEN feedback receiver" or similar.

### 3. Deploy as a Web App

1. Click **Deploy → New deployment**
2. Click the gear icon next to "Select type" → choose **Web app**
3. Configure:
   - **Description**: `MAPGEN feedback v1`
   - **Execute as**: `Me (your-email@gmail.com)` ← important; the script
     writes to your sheet using your permissions
   - **Who has access**: `Anyone` ← required; the static site can't auth
4. Click **Deploy**
5. Google will prompt you to **Authorize access**. Click through — it will
   warn that the app is unverified (your own personal script), choose
   **Advanced → Go to MAPGEN feedback receiver (unsafe)** and accept.
6. After deploy, you'll see a **Web app URL** like:
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```
   **Copy this URL.**

### 4. (Optional) Verify the endpoint

In a terminal:
```bash
curl https://script.google.com/macros/s/YOUR-ID/exec
# → {"ok":true,"service":"mapgen-feedback"}

curl -X POST https://script.google.com/macros/s/YOUR-ID/exec \
  -H "Content-Type: text/plain" \
  -d '{"role":"funder","message":"test from curl","email":"test@example.com"}'
# → {"ok":true}
```

Then check the sheet — a new row should have appeared.

### 5. Add the URL as a GitHub Actions secret

1. Go to https://github.com/chandrasg/norms-in-cinema-demo/settings/secrets/actions
2. Click **New repository secret**
3. **Name**: `PUBLIC_FEEDBACK_ENDPOINT`
4. **Value**: paste the Web app URL
5. **Add secret**

### 6. Trigger a rebuild

Either push any commit, or go to
https://github.com/chandrasg/norms-in-cinema-demo/actions and re-run the
latest workflow. The build will now embed the endpoint and the site will
POST submissions to your Apps Script.

---

## Maintenance

### Updating the script

If you edit `feedback-apps-script.gs`:
1. Paste the new code into the Apps Script editor
2. Save
3. **Deploy → Manage deployments → pencil icon → Version: New version → Deploy**

The web app URL stays the same across versions, so no GitHub action change.

### Rotating the endpoint

If you suspect abuse:
1. **Deploy → Manage deployments → archive** the existing deployment
2. **Deploy → New deployment** to get a fresh URL
3. Update the GitHub secret with the new URL
4. Trigger a rebuild

### Spam control

The script already:
- Rejects empty messages
- Truncates message to 5000 chars, email to 256, role to 64
- Records the user agent and referrer for forensic analysis

If spam becomes a problem, options in order of effort:
1. Add a hidden honeypot field to the form (rejects bots that fill all fields)
2. Add a per-IP rate limit using `PropertiesService.getScriptProperties()` as a
   counter (Apps Script can't see client IPs but can rate-limit globally)
3. Switch to Cloudflare Turnstile or hCaptcha in the React component

---

## Privacy note

Submissions include user-agent and the page they were submitted from. That's
useful for debugging which dossier prompts the most engagement, but don't make
the sheet public — the user-agent string can deanonymize edge cases. Treat the
sheet like an inbox: keep sharing tight.

If you want stronger privacy: edit the Apps Script to drop user_agent and
referrer fields before appending.
