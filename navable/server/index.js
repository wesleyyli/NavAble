require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: path.join(__dirname, 'uploads/') });

const ELEVEN_API_KEY = process.env.ELEVENLABS_API_KEY;
const GEOAPIFY_KEY = process.env.GEOAPIFY_KEY;
const GEMINI_API_URL = process.env.GEMINI_API_URL; // e.g. your Gemini/LLM proxy endpoint
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Helper: normalize GEMINI_API_URL in case someone accidentally pasted a curl command
function normalizeGeminiUrl(raw) {
  if (!raw) return null;
  // If user pasted a curl command like: curl https://... -H 'Authorization: Bearer ...'
  // extract the first http(s) URL found
  const m = raw.match(/https?:\/\/[^\s'"\)]+/);
  if (m) return m[0];
  // If it's already a simple URL, return as-is
  if (/^https?:\/\//.test(raw)) return raw;
  return null;
}

if (!ELEVEN_API_KEY) {
  console.warn('Warning: ELEVENLABS_API_KEY is not set. /api/elevenlab-stt will fail.');
}
if (!GEOAPIFY_KEY) {
  console.warn('Warning: GEOAPIFY_KEY is not set. /api/route geocoding will fail if frontend does not provide coords.');
}

// POST /api/elevenlab-stt
// Accepts multipart/form-data with field 'file' (audio). Forwards to ElevenLabs STT endpoint.
app.post('/api/elevenlab-stt', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file required' });
    if (!ELEVEN_API_KEY) return res.status(500).json({ error: 'server not configured' });

    const filePath = req.file.path;
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    // ElevenLabs STT commonly requires a model identifier; allow override via env
  const STT_MODEL = process.env.ELEVENLABS_STT_MODEL || 'scribe_v1';
  form.append('model', STT_MODEL);
  // Some ElevenLabs endpoints expect 'model_id' instead of 'model'
  form.append('model_id', STT_MODEL);
    // Optional language override
    if (process.env.ELEVENLABS_STT_LANGUAGE) {
      form.append('language', process.env.ELEVENLABS_STT_LANGUAGE);
    }

    // ElevenLabs STT endpoint - note: adjust the URL based on ElevenLabs API docs and model availability
    const ELEVEN_STT_URL = process.env.ELEVENLABS_STT_URL || 'https://api.elevenlabs.io/v1/speech-to-text';

    let resp;
    try {
      resp = await axios.post(ELEVEN_STT_URL, form, {
        headers: {
          ...form.getHeaders(),
          'xi-api-key': ELEVEN_API_KEY,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
    } catch (e) {
      // Full debug log
      const util = require('util');
      console.error('Error calling ElevenLabs STT:', e.message);
      if (e.response) {
        console.error('Status:', e.response.status);
        console.error('Headers:', e.response.headers);
        console.error('Body (full):', util.inspect(e.response.data, { depth: null }));
      }

      // If 422, try alternative field name 'audio' (some STT endpoints expect this)
      if (e.response && e.response.status === 422) {
        try {
          console.error('Retrying ElevenLabs STT with alternative field name "audio"');
          const altForm = new FormData();
          altForm.append('audio', fs.createReadStream(filePath));
          altForm.append('model', STT_MODEL);
          if (process.env.ELEVENLABS_STT_LANGUAGE) altForm.append('language', process.env.ELEVENLABS_STT_LANGUAGE);

          const altResp = await axios.post(ELEVEN_STT_URL, altForm, {
            headers: { ...altForm.getHeaders(), 'xi-api-key': ELEVEN_API_KEY },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
          });
          // remove temp file
          try { fs.unlinkSync(filePath); } catch (err) {}
          const text2 = altResp.data?.text || altResp.data?.transcript || JSON.stringify(altResp.data);
          return res.json({ text: text2, note: 'retried_with_audio_field' });
        } catch (e2) {
          console.error('Retry with audio field failed:', e2.message);
          if (e2.response) console.error('Retry body:', util.inspect(e2.response.data, { depth: null }));
          try { fs.unlinkSync(filePath); } catch (err) {}
          return res.status(500).json({ error: 'elevenlab_call_failed_retry', detail: e2.response?.data || e2.message });
        }
      }

      // remove temp file
      try { fs.unlinkSync(filePath); } catch (err) {}
      return res.status(500).json({ error: 'elevenlab_call_failed', detail: e.response?.data || e.message });
    }

    // remove temp file
    fs.unlink(filePath, () => {});

    // The ElevenLabs response structure may vary; try to extract text
    const text = resp.data?.text || resp.data?.transcript || JSON.stringify(resp.data);
    res.json({ text });
  } catch (err) {
    console.error(err?.response?.data || err.message || err);
    res.status(500).json({ error: 'stt_error', detail: err?.response?.data || err.message });
  }
});

// POST /api/route
// Accepts JSON { start: {lat, lon}, end: {lat, lon}, accessibilityOptions }
// Proxies request to Geoapify Routing API and returns the route JSON.
app.post('/api/route', async (req, res) => {
  try {
    const { start, end, accessibilityOptions } = req.body;
    if (!start || !end) return res.status(400).json({ error: 'start and end required' });
    if (!GEOAPIFY_KEY) return res.status(500).json({ error: 'server not configured with GEOAPIFY_KEY' });

    // Build routing URL - using Geoapify directions API
    // Example: https://api.geoapify.com/v1/routing?waypoints=lat1,lon1|lat2,lon2&mode=foot&apiKey=...
    const mode = 'foot';
    const waypoints = `${start.lat},${start.lon}|${end.lat},${end.lon}`;
    const url = `https://api.geoapify.com/v1/routing?waypoints=${encodeURIComponent(waypoints)}&mode=${mode}&apiKey=${GEOAPIFY_KEY}`;

    const geoResp = await axios.get(url);
    res.json(geoResp.data);
  } catch (err) {
    console.error(err?.response?.data || err.message || err);
    res.status(500).json({ error: 'routing_error', detail: err?.response?.data || err.message });
  }
});

// GET /api/geocode
// Proxies geocoding requests to Geoapify using server-side key to avoid exposing it in the client.
app.get('/api/geocode', async (req, res) => {
  try {
    const text = req.query.text;
    if (!text) return res.status(400).json({ error: 'text query required' });
    if (!GEOAPIFY_KEY) return res.status(500).json({ error: 'server not configured with GEOAPIFY_KEY' });

    const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(text)}&apiKey=${GEOAPIFY_KEY}&limit=3`;
    try {
      const geoResp = await axios.get(url);
      res.json(geoResp.data);
      return;
    } catch (err) {
      console.error('Geocode proxy error:', err?.response?.data || err.message || err);
      // If Geoapify returns 401 or Not allowed, fall back to Nominatim (OpenStreetMap) for development
      const status = err?.response?.status;
      if (status === 401) {
        try {
          console.warn('Falling back to Nominatim due to Geoapify 401');
          const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(text)}&format=json&limit=3`;
          const nomResp = await axios.get(nomUrl, { headers: { 'User-Agent': 'NavAble/1.0 (dev)' } });
          const items = nomResp.data || [];
          const features = items.map((it) => ({
            type: 'Feature',
            geometry: { coordinates: [parseFloat(it.lon), parseFloat(it.lat)] },
            properties: { display_name: it.display_name }
          }));
          return res.json({ features, note: 'nominatim_fallback' });
        } catch (e2) {
          console.error('Nominatim fallback failed:', e2?.response?.data || e2.message || e2);
          return res.status(500).json({ error: 'geocode_error', detail: e2?.response?.data || e2.message });
        }
      }
      return res.status(500).json({ error: 'geocode_error', detail: err?.response?.data || err.message });
    }
  } catch (err) {
    console.error('Geocode proxy error:', err?.response?.data || err.message || err);
    res.status(500).json({ error: 'geocode_error', detail: err?.response?.data || err.message });
  }
});

// POST /api/parse-with-gemini
// Accepts { text: string }
// Sends prompt to configured LLM (Gemini) to extract UW campus 'from' and 'to' locations.
// The LLM may return coordinates or building names; server will geocode names if coords missing.
app.post('/api/parse-with-gemini', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'text required' });
    const normalizedGemini = normalizeGeminiUrl(GEMINI_API_URL);
    if (!normalizedGemini || !GEMINI_API_KEY) {
      console.error('Gemini not configured correctly. GEMINI_API_URL:', GEMINI_API_URL);
      return res.status(500).json({ error: 'gemini_not_configured', detail: 'GEMINI_API_URL must be a valid http(s) URL (not a curl command) and GEMINI_API_KEY must be set' });
    }

    // Craft prompt: ask the LLM to return strict JSON
    const prompt = `You are provided a user utterance describing navigation. Only look for two locations on the University of Washington Seattle campus. Return strictly JSON with either the building names or coordinates.
Respond with one of these two JSON shapes (no extra text):
1) {"from_name":"<name>","to_name":"<name>"}
2) {"from_name":"<name>","to_name":"<name>","from_coord":{"lat":<number>,"lon":<number>},"to_coord":{"lat":<number>,"lon":<number>}}

User utterance: ${text}
If the utterance mentions only one location, set to_name to null. Only include locations that are on the University of Washington (Seattle) campus. Do not hallucinate coordinates if you are unsure; prefer returning names only.`;

    // Call the configured LLM endpoint (generic POST with JSON {prompt})
    // Prepare headers and URL depending on whether GEMINI_API_KEY looks like a Google API key (starts with 'AIza')
    let targetUrl = normalizedGemini;
    const headers = { 'Content-Type': 'application/json' };
    if (GEMINI_API_KEY && typeof GEMINI_API_KEY === 'string') {
      // Prefer sending API key in Authorization header; also include x-api-key as some endpoints accept it
      headers['Authorization'] = `Bearer ${GEMINI_API_KEY}`;
      headers['x-api-key'] = GEMINI_API_KEY;
      console.log('Using GEMINI API key in Authorization and x-api-key headers.');
    }

  // Send request to LLM
  let llmResp;
  let llmError = null;
  try {
      if (targetUrl.includes('generativelanguage.googleapis.com')) {
        // Google Generative Language may expect different endpoint verbs and request shapes depending on version.
        // Build candidate endpoint URLs by trying alternative method suffixes.
        const candidateUrls = new Set();
        candidateUrls.add(targetUrl);
        try {
          const u = new URL(targetUrl);
          // strip query
          const base = `${u.origin}${u.pathname}`;
          // If user provided model:generateContent, try other common method names
          if (base.includes(':')) {
            // split at the last ':' so we keep the full model path (which may contain https://)
            const idx = base.lastIndexOf(':');
            const modelPath = base.substring(0, idx);
            const verb = base.substring(idx + 1);
            ['generateMessage', 'generateText', 'generate', 'generateContent'].forEach((v) => candidateUrls.add(`${modelPath}:${v}`));
          } else {
            // try adding common verbs
            ['generateMessage', 'generateText', 'generate', 'generateContent'].forEach((v) => candidateUrls.add(`${base}:${v}`));
          }
        } catch (e) {
          // ignore URL parse errors
          candidateUrls.add(targetUrl);
        }

        const googleBodies = [
          { prompt: { messages: [{ author: 'user', content: [{ type: 'text', text: prompt }] }] }, maxOutputTokens: 512 },
          { messages: [{ author: 'user', content: [{ type: 'text', text: prompt }] }], maxOutputTokens: 512 },
          { prompt: { text: prompt }, maxOutputTokens: 512 },
          { input: { text: prompt }, maxOutputTokens: 512 },
          { instances: [{ content: prompt }] },
          // minimal direct text body
          { text: prompt, maxOutputTokens: 512 },
        ];

        let lastErr = null;
        // Try each candidate URL, and for each try body shapes
        for (const cUrl of candidateUrls) {
          for (const body of googleBodies) {
            try {
              console.log('Trying Google endpoint:', cUrl, 'body keys:', Object.keys(body));
              const resp = await axios.post(cUrl, body, { headers, timeout: 20000 });
              if (resp && resp.status >= 200 && resp.status < 300) {
                llmResp = resp;
                break;
              }
            } catch (gErr) {
              lastErr = gErr;
              console.warn('Attempt failed for endpoint', cUrl, 'shape', Object.keys(body), gErr?.response?.status || gErr.message || gErr);
            }
          }
          if (llmResp) break;
        }
        if (!llmResp) {
          console.error('All Google endpoint/body shape attempts failed. Last error:', lastErr?.response?.data || lastErr?.message || lastErr);
          throw lastErr || new Error('google_llm_all_shapes_failed');
        }
      } else {
        // Non-Google LLMs (OpenAI-like) expect { prompt, max_tokens }
        llmResp = await axios.post(targetUrl, { prompt: prompt, max_tokens: 512 }, { headers, timeout: 20000 });
      }
    } catch (llmErr) {
      // Capture the LLM error and proceed to a heuristic fallback parse below
      console.error('LLM request failed:', llmErr?.response?.status, llmErr?.response?.data || llmErr.message || llmErr);
      llmError = llmErr;
    }

    if (llmResp) {
      console.log('LLM response status:', llmResp.status);
      // Optionally log truncated response for debugging
      try {
        const inspect = require('util').inspect;
        console.log('LLM response data (truncated):', inspect(llmResp.data, { depth: 2, maxArrayLength: 5 }));
      } catch (e) {}
    } else {
      console.warn('No LLM response received; proceeding to parse fallback or handle LLM error.');
    }

    // Extract text from response - flexible to different LLM shapes
    let llmText = '';
    if (llmResp.data) {
      if (typeof llmResp.data === 'string') llmText = llmResp.data;
      else if (llmResp.data.output_text) llmText = llmResp.data.output_text;
      else if (llmResp.data.text) llmText = llmResp.data.text;
      else llmText = JSON.stringify(llmResp.data);
    }

    // Attempt to parse JSON from LLM output (if we got one)
    let parsed = null;
    if (llmResp && llmText) {
      try {
        // find first JSON object in text
        const m = llmText.match(/\{[\s\S]*\}/);
        if (m) parsed = JSON.parse(m[0]);
      } catch (e) {
        console.error('Failed to parse LLM JSON:', e.message, llmText);
      }
    }

    // If LLM failed or parsing failed, run a simple heuristic parser on the original text
    const heuristicParse = async (utterance) => {
      // Try common patterns: "from X to Y", "X to Y", or "go to Y from X"
      const lower = (utterance || '').trim();
      let fromName = null;
      let toName = null;

      // from ... to ...
      let m = lower.match(/from\s+(.+?)\s+to\s+(.+)/i);
      if (m) {
        fromName = m[1].trim();
        toName = m[2].trim();
      } else {
        // try "(.+) to (.+)"
        m = lower.match(/(.+?)\s+to\s+(.+)/i);
        if (m) {
          fromName = m[1].trim();
          toName = m[2].trim();
        } else {
          // try "go to Y from X"
          m = lower.match(/go\s+to\s+(.+?)\s+from\s+(.+)/i);
          if (m) {
            toName = m[1].trim();
            fromName = m[2].trim();
          }
        }
      }

      // Capitalize heuristically for geocoding
      const capitalize = (s) => s ? s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : s;
      fromName = fromName ? capitalize(fromName) : null;
      toName = toName ? capitalize(toName) : null;

      // Resolve names to coordinates using geocodeName
      let finalFrom = null;
      let finalTo = null;
      if (fromName) {
        const g = await geocodeName(fromName);
        if (g) finalFrom = { lat: g.lat, lon: g.lon, name: g.name };
      }
      if (toName) {
        const g = await geocodeName(toName);
        if (g) finalTo = { lat: g.lat, lon: g.lon, name: g.name };
      }
      return { from: finalFrom, to: finalTo, parsedNames: { fromName, toName } };
    };

    if ((!parsed || (!parsed.from_name && !parsed.to_name && !parsed.from_coord && !parsed.to_coord)) && llmError) {
      console.warn('LLM failed or returned nothing parseable; falling back to heuristic parser. LLM error:', llmError?.response?.data || llmError?.message || llmError);
      const fallback = await heuristicParse(text);
      return res.json({ from: fallback.from, to: fallback.to, raw: { error: 'llm_failed', detail: llmError?.response?.data || llmError?.message, heuristic: fallback.parsedNames } });
    }

    // Normalize into names and coords
    const fromName = parsed?.from_name ?? null;
    const toName = parsed?.to_name ?? null;
    const fromCoord = parsed?.from_coord ? { lat: parsed.from_coord.lat, lon: parsed.from_coord.lon } : null;
    const toCoord = parsed?.to_coord ? { lat: parsed.to_coord.lat, lon: parsed.to_coord.lon } : null;

    // Helper to geocode name if needed using internal geocode proxy
    const geocodeName = async (n) => {
      try {
        const r = await axios.get(`http://localhost:${process.env.PORT || 4000}/api/geocode`, { params: { text: n } });
        const features = r.data.features || [];
        if (features.length === 0) return null;
        const f = features[0];
        const [lon, lat] = f.geometry.coordinates;
        return { lat, lon, name: n };
      } catch (e) {
        console.error('geocodeName error', n, e?.response?.data || e.message);
        return null;
      }
    };

    // Resolve names to coords if coords missing
    let finalFrom = fromCoord ? { ...fromCoord, name: fromName } : null;
    let finalTo = toCoord ? { ...toCoord, name: toName } : null;
    if (!finalFrom && fromName) {
      const g = await geocodeName(fromName);
      if (g) finalFrom = { lat: g.lat, lon: g.lon, name: g.name };
    }
    if (!finalTo && toName) {
      const g = await geocodeName(toName);
      if (g) finalTo = { lat: g.lat, lon: g.lon, name: g.name };
    }

    return res.json({ from: finalFrom, to: finalTo, raw: parsed ?? llmText });
  } catch (err) {
    console.error('parse-with-gemini error:', err?.response?.data || err.message || err);
    return res.status(500).json({ error: 'parse_error', detail: err?.response?.data || err.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
