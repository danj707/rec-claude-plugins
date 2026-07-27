// Rec TTS relay — holds the ElevenLabs key server-side so the video-guide
// plugin needs zero secrets. Deploy as its OWN Railway project (not part of
// rental-report or rec-dashboard).
//
// Env vars (set in Railway, never committed):
//   ELEVENLABS_API_KEY   required
//   DEFAULT_VOICE_ID     optional (default: Rachel)
//   RELAY_TOKEN          optional shared token; if set, requests need
//                        Authorization: Bearer <token>
//   MAX_CHARS            optional per-request text cap (default 1000)
const http = require('http');

const PORT = process.env.PORT || 3000;
const KEY = process.env.ELEVENLABS_API_KEY;
const VOICE = process.env.DEFAULT_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';
const TOKEN = process.env.RELAY_TOKEN || '';
const MAX = parseInt(process.env.MAX_CHARS || '1000', 10);

http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') { res.end('ok'); return; }
  if (req.method !== 'POST' || !req.url.startsWith('/tts')) { res.statusCode = 404; res.end('not found'); return; }
  if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) { res.statusCode = 401; res.end('unauthorized'); return; }
  if (!KEY) { res.statusCode = 500; res.end('ELEVENLABS_API_KEY not configured'); return; }

  let body = '';
  req.on('data', c => { body += c; if (body.length > 64 * 1024) req.destroy(); });
  req.on('end', async () => {
    try {
      const { text, voice } = JSON.parse(body || '{}');
      if (!text || typeof text !== 'string') { res.statusCode = 400; res.end('text required'); return; }
      if (text.length > MAX) { res.statusCode = 400; res.end(`text exceeds ${MAX} chars`); return; }
      const r = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voice || VOICE}?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
        },
      );
      if (!r.ok) { res.statusCode = 502; res.end(`elevenlabs ${r.status}: ${(await r.text()).slice(0, 300)}`); return; }
      res.setHeader('Content-Type', 'audio/mpeg');
      res.end(Buffer.from(await r.arrayBuffer()));
      console.log(`[tts] ${text.length} chars → ok`);
    } catch (e) {
      res.statusCode = 500; res.end('error: ' + e.message);
    }
  });
}).listen(PORT, () => console.log(`rec-tts-relay on :${PORT} (token gate: ${TOKEN ? 'on' : 'off'})`));
