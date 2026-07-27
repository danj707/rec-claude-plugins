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

async function elevenlabs(text, outFile) {
  const voice = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // Rachel
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
  const useEleven = !!process.env.ELEVENLABS_API_KEY;
  for (const l of lines) {
    const file = path.join(outDir, `${l.id}.${useEleven ? 'mp3' : 'wav'}`);
    if (useEleven) await elevenlabs(l.text, file); else piper(l.text, file);
    l.file = file;
    l.dur = durationOf(file);
  }
  fs.writeFileSync(path.join(outDir, 'lines.json'), JSON.stringify(lines, null, 1));
  return lines;
}

module.exports = { synthesizeAll, durationOf };
