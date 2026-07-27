// Narration synthesis: ElevenLabs primary, Piper (local neural TTS) fallback.
// Usage:
//   const { synthesizeAll } = require('./tts');
//   const lines = await synthesizeAll(require('./narr/lines.json'), { outDir: 'narr' });
//   // each line gains { file, dur }; lines.json is rewritten with durations.
//
// Env:
//   ELEVENLABS_API_KEY   — enables ElevenLabs (ask the user before silently falling back)
//   ELEVENLABS_VOICE_ID  — optional; defaults to Rachel (21m00Tcm4TlvDq8ikWAM)
//   PIPER_DIR            — dir containing piper/piper + en-us-lessac-medium.onnx (fallback)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FF = process.env.FFMPEG_PATH
  || (() => { try { return require.resolve('ffmpeg-static'); } catch { return null; } })()
  || execSync('echo "$(npm root -g)/ffmpeg-static/ffmpeg"').toString().trim();

function durationOf(file) {
  const out = execSync(`${FF} -i ${JSON.stringify(file)} 2>&1 | grep Duration || true`, { shell: '/bin/bash' }).toString();
  const m = out.match(/Duration: (\d+):(\d+):([\d.]+)/);
  return m ? (+m[1] * 3600 + +m[2] * 60 + +m[3]) : 0;
}

// Preferred: Rec's own TTS relay (no secrets needed client-side).
// URL from TTS_RELAY_URL env or config.json ttsRelayUrl.
function relayUrl() {
  if (process.env.TTS_RELAY_URL) return process.env.TTS_RELAY_URL;
  try { return require('./config.json').ttsRelayUrl || ''; } catch { return ''; }
}

async function relay(text, outFile) {
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.TTS_RELAY_TOKEN) headers.Authorization = `Bearer ${process.env.TTS_RELAY_TOKEN}`;
  const resp = await fetch(`${relayUrl().replace(/\/$/, '')}/tts`, {
    method: 'POST', headers,
    body: JSON.stringify({ text, voice: process.env.ELEVENLABS_VOICE_ID || undefined }),
  });
  if (!resp.ok) throw new Error(`relay ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  fs.writeFileSync(outFile, Buffer.from(await resp.arrayBuffer()));
}

async function elevenlabs(text, outFile) {
  const voice = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'; // Sarah (premade — works on free plan)
  const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
  });
  if (!resp.ok) throw new Error(`ElevenLabs ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  fs.writeFileSync(outFile, Buffer.from(await resp.arrayBuffer()));
}

function piper(text, outFile) {
  const dir = process.env.PIPER_DIR || '.';
  execSync(
    `echo ${JSON.stringify(text)} | ${dir}/piper/piper --model ${dir}/en-us-lessac-medium.onnx --length_scale 1.05 --output_file ${JSON.stringify(outFile)}`,
    { shell: '/bin/bash', stdio: 'pipe' },
  );
}

// NOTE (cloud sessions): Node's fetch needs NODE_USE_ENV_PROXY=1 to honor
// HTTPS_PROXY. Run scripts using this module with that env var set, or the
// ElevenLabs call will bypass the egress proxy and fail.
async function synthesizeAll(lines, { outDir = 'narr' } = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  // Priority: Rec TTS relay (zero-setup) → direct ElevenLabs key → local Piper.
  const mode = relayUrl() ? 'relay' : (process.env.ELEVENLABS_API_KEY ? 'eleven' : 'piper');
  for (const l of lines) {
    const file = path.join(outDir, `${l.id}.${mode === 'piper' ? 'wav' : 'mp3'}`);
    if (mode === 'relay') await relay(l.text, file);
    else if (mode === 'eleven') await elevenlabs(l.text, file);
    else piper(l.text, file);
    l.file = file;
    l.dur = durationOf(file);
  }
  fs.writeFileSync(path.join(outDir, 'lines.json'), JSON.stringify(lines, null, 1));
  return lines;
}

module.exports = { synthesizeAll, durationOf };
