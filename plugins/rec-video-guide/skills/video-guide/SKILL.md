---
name: video-guide
description: "Generate narrated in-product video walkthroughs and GIF guides of the Rec platform (rec.us) by driving the real UI with Playwright. Use whenever someone asks for a video walkthrough, video guide, training video, narrated demo, screen recording, or animated GIF of a Rec flow — e.g. 'Make me a video walkthrough of creating a rental and building an invoice, under 2 minutes, with voice narration'. Handles login, recording with cursor/caption overlays, ElevenLabs voice narration (local Piper TTS fallback), MP4/GIF rendering, and delivery back to the user."
---

# Rec Video Guide Generator

Turn a one-line request into a polished, narrated MP4 (plus optional GIF cuts) of a real flow in the Rec product, recorded live against a test org. Videos are **regenerable**: keep the script, re-run it after UI changes, get a fresh video.

## What the user gives you

- **The flow** ("creating a rental and building an invoice") — may span several screens.
- Optional: **length cap** ("under 2 minutes"), **narration** (voice / captions-only), **formats** (MP4, GIF, both), **audience** (admin / resident / front desk).

Defaults when unspecified: captioned MP4 **with** voice narration, 60–120s, 1440×900, plus one 10–20s GIF of the money moment.

## Hard rules

1. **Test org only.** Record against the Niagara Falls test org (`/organizations/city-of-niagara-falls`, org id `a976a11a-5303-4785-838a-1b281ca77678`) or another org the user explicitly names as a test/sandbox org. Never a live customer org.
2. **Credentials are never hardcoded or committed.** Use `REC_TEST_EMAIL` / `REC_TEST_PASSWORD` env vars if set; otherwise ask the user for a test account.
3. **Stop before destructive confirms.** End write-flows hovering the final *Confirm/Submit* with a caption+narration explaining it — so re-renders never mutate data. Only click the real confirm if the user explicitly asks and the data is disposable.
4. **No real PII on screen.** Test-org data is fake; if anything looks real, reframe or pick different records.
5. **Recon before recording.** Dry-run every selector read-only first. Never debug selectors inside a recording run.

## Environment setup (each session)

- **Chromium**: `executablePath: '/opt/pw-browsers/chromium'` (Playwright preinstalled in Claude Code cloud sessions; never `playwright install`).
- **Outbound proxy (cloud sessions)**: launch args MUST include
  `[`--proxy-server=${process.env.HTTPS_PROXY}`, '--ssl-version-max=tls1.2']`
  — the egress proxy's TLS interception fails on Chromium's TLS 1.3 handshake; TLS 1.2 works and certificate verification stays on. If `www.rec.us` is unreachable (curl exit 56 / CONNECT 403), the environment's network policy must allow `rec.us` and `*.rec.us` (and `api.elevenlabs.io` for narration) — ask the user to update it; don't work around. On a local machine (no HTTPS_PROXY), drop both args.
- **ffmpeg**: `npm install -g ffmpeg-static` → binary at `$(npm root -g)/ffmpeg-static/ffmpeg` (apt often unavailable).
- **TTS** — see `assets/tts.js`, which implements this logic:
  - **Primary: ElevenLabs** when `ELEVENLABS_API_KEY` is set. `POST https://api.elevenlabs.io/v1/text-to-speech/{voiceId}?output_format=mp3_44100_128` with header `xi-api-key`, body `{"text": ..., "model_id": "eleven_multilingual_v2"}`. Voice: `ELEVENLABS_VOICE_ID` env var, else Rachel (`21m00Tcm4TlvDq8ikWAM`). If the key is missing, ask the user before silently downgrading the voice.
  - **Fallback: Piper (local neural TTS)** — no key, no cost, noticeably robotic:
    ```bash
    curl -sL -o piper.tgz https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz && tar xzf piper.tgz
    curl -sL -o voice.tar.gz https://github.com/rhasspy/piper/releases/download/v0.0.2/voice-en-us-lessac-medium.tar.gz && tar xzf voice.tar.gz
    ```
- Work in the session scratchpad, not a repo checkout.

## Product knowledge that saves you an hour

- **Login**: org page → *Log in* button → email+password inputs → submit. No MFA on test accounts. **Sessions don't survive browser restarts** — script the login at the start of every run (~10s; also makes a free "logging in" scene).
- **Admin entry**: account-menu avatar (`[aria-label="Open account menu"]` — pick the *visible* one; there's a hidden mobile duplicate) → *Admin Dashboard* → lands on `/admin/o/{orgId}/users`.
- **Row-level ⋯ menus** (transactions, bookings): items are plain `<button>`s inside `div[role="menu"]`, NOT Radix menuitems — click via `p.locator('[role="menu"] button').filter({ hasText: 'Manage' })`. **"Manage" opens a NEW TAB** (`/orders/{id}/manage`). For a single-video recording use the rig's `clickPopupInline()` — it catches the popup, closes it, and navigates the recorded page to the same URL. Looks seamless.
- **Manage Order wizard**: step 1 *Select Items* (Refund ☑ / Waive Payment Plan) → *Continue* → step 2 *Review & Confirm* (amount, method, customer note textarea) → *Confirm*.
- **Admin nav map** (28 destinations): Home · Users (Search/Visitor log/Groups; household profile has 8 tabs: Bookings, Waitlist, Transactions, Profiles, Memberships & Passes, Balance Due, Payment Plans, Activity) · Calendar · Store · Seb (AI) · Facility Insights · Programming (Sections/Bookings/Templates) · Seasons · Instructors · Events · Facilities (Rentals/Applications/Balance Due/Site Reservations/Deposits) · Competitions · Memberships · Marketing (Messages/Segments/Newsletters/Website/Promotions) · Reports (Library/Dashboard) · Accounting (General Ledger) · Automations. Creator actions are consistently "New X" top-right of list pages.

## Workflow

1. **Parse the request** → list of scenes. Budget narration: ~2.5 spoken words/sec; a 2-minute cap ≈ 250 narration words across ~8–12 cues.
2. **Recon** (no recording): drive the flow, screenshot each state, verify selectors, note popups. Read the matching help article (help.rec.us / Rec U Training Center) so narration uses the product's own vocabulary.
3. **Write narration lines** to `narr/lines.json` (`[{id, text}]`), synthesize with `assets/tts.js`, which also measures durations and writes them back.
4. **Record** using `assets/record-rig.js` (copy to scratchpad, `require` it). Structure: title card → scenes, each scene = `cue(id, caption, dur)` → actions → `finishCue(id)` (waits out the narration). The rig injects the cursor, click ripples, and caption bar into the page so they render into the video, and logs cue timestamps.
5. **Mux**: overlay each narration clip at its cue timestamp:
   `adelay=<ms>|<ms>` per input → `amix=inputs=N:normalize=0` → `-c:v libx264 -pix_fmt yuv420p -crf 22 -c:a aac -b:a 160k -ac 2 -ar 48000 -movflags +faststart`. **Always encode audio as stereo 48kHz** — mono tracks play silent in some inline players.
6. **GIF cut** (if wanted): pick the key segment from cue timestamps:
   `ffmpeg -ss <start> -t <len> -i video.webm -vf "fps=12,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" out.gif`
7. **Verify before delivering**: extract 2–3 frames (`-ss N -frames:v 1`) and eyeball them; run `volumedetect` and confirm `max_volume` ≈ 0dB.
8. **Deliver** the MP4 (+ GIF) to the user, captioned with length, what it covers, and the stop-before-confirm note. Offer to publish into the matching help article.

## Quality bar

- Human pacing: eased cursor moves (the rig does this), ~60ms/keystroke typing, ≥1s settle after page loads.
- Captions ≤ 60 chars, imperative voice ("Check Refund, then click Continue"); narration is the longer conversational version of the same beat.
- Title card at open (flow name + duration), outro card pointing at help.rec.us.
- If a run fails mid-recording, fix the selector in recon mode and re-record from scratch — never ship a video with a visible mistake/backtrack.

See `assets/example-refund-video.js` for a complete production script (the refund walkthrough), with credentials scrubbed.
