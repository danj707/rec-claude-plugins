# rec-claude-plugins

## PS Quickstart — make a video in 3 steps

**One-time (5 min):**
1. Get GitHub read access to this repo (ask Dan).
2. Open [claude.ai/code](https://claude.ai/code). In your environment settings, set the network policy to allow `rec.us`, `*.rec.us`, and `*.railway.app` (or use the shared PS Videos environment if one exists).
3. In any session, run:
   ```
   /plugin marketplace add danj707/rec-claude-plugins
   /plugin install rec-video-guide@rec-claude-plugins
   ```

**Every time after that — just ask, in plain English:**

> Make me a video walkthrough of purchasing a membership for a resident, under 90 seconds, with narration.

Claude logs into the test org, maps the flow, records it with cursor + captions, narrates it with the Rec voice, and hands you the MP4 (and a GIF if you ask) right in the chat. New flows take ~10–20 minutes; no keys or credentials needed on your side. Full how-to for the PS team: see "Claude AI: Video Creation Process" in the Partner Success Notion space.

---

Claude Code plugins for Rec Technologies internal tooling. First (and so far only) plugin: **rec-video-guide** — a prompt-to-video generator that turns "make me a video walkthrough of X" into a narrated MP4 + GIF recorded live against the Rec product.

## Install (teammates)

In any Claude Code session:

```
/plugin marketplace add danj707/rec-claude-plugins
/plugin install rec-video-guide@rec-claude-plugins
```

Then just ask, in any session:

> Make me a video walkthrough of creating a new rental and building an invoice, keep it under 2 minutes, with voice narration.

Claude handles login, recon, recording (animated cursor, click ripples, caption bar, title cards), voice narration, MP4/GIF rendering, and hands you the files.

Alternatively, without plugins: add this repo to your session sources and the skill loads from `plugins/rec-video-guide/skills/`.

## Prerequisites (per environment — one-time setup)

The plugin is instructions; the environment needs three things:

| Requirement | How |
|---|---|
| Network access to the product | Claude Code environment network policy must allow `rec.us`, `*.rec.us`, and `api.elevenlabs.io` |
| A Rec **test-org** account | Set `REC_TEST_EMAIL` / `REC_TEST_PASSWORD` env vars in the environment (never a live customer org; never commit credentials) |
| ElevenLabs narration (recommended) | Set `ELEVENLABS_API_KEY` (a restricted key with Text-to-Speech access only). Optional `ELEVENLABS_VOICE_ID` to pick the brand voice. Without a key, the skill falls back to Piper, a free local TTS that works but sounds noticeably robotic. |

Everything else (Chromium, ffmpeg, Piper fallback, the TLS workaround for the cloud egress proxy) is handled by the skill at runtime.

## Safety model

- Records against **test orgs only** (defaults to the Niagara Falls test org).
- Write-flows end **hovering** the final Confirm — regenerating a video never mutates data.
- Credentials come from env vars or the user, never the repo.
- Videos contain only fake test-org data; the skill is instructed to bail if anything on screen looks like real PII.

## Repo layout

```
.claude-plugin/marketplace.json        ← marketplace manifest (add via /plugin marketplace add)
plugins/rec-video-guide/
  .claude-plugin/plugin.json           ← plugin manifest
  skills/video-guide/SKILL.md          ← the skill: workflow, product knowledge, quality bar
  skills/video-guide/assets/
    record-rig.js                      ← reusable Playwright rig (overlays, cues, popup handling)
    tts.js                             ← ElevenLabs-first narration synthesis, Piper fallback
    example-refund-video.js            ← complete worked example (refund walkthrough)
```

## Provenance

Built 7/26–7/27 in a Claude Code session: pilot videos ("Finding a User", "Refunding a Fee or Transaction"), the product click-map crawl, and the candidate list of help articles that deserve videos live in the Partner Success Notion space ("Video Guide Candidates — Help Article Cross-Reference").
