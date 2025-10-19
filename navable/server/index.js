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
    if (!req.file) {
      console.error('/api/elevenlab-stt - no file in request; headers:', req.headers);
      return res.status(400).json({ error: 'file required' });
    }
    // Log uploaded file metadata for debugging
    console.log('/api/elevenlab-stt - received file:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
    });
    console.log('/api/elevenlab-stt - request headers sample:', {
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent'],
    });
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
  // Example: https://api.geoapify.com/v1/routing?waypoints=lat1,lon1|lat2,lon2&mode=walk&apiKey=...
  const mode = 'walk';
    const waypoints = `${start.lat},${start.lon}|${end.lat},${end.lon}`;
    const url = `https://api.geoapify.com/v1/routing?waypoints=${encodeURIComponent(waypoints)}&mode=${mode}&apiKey=${GEOAPIFY_KEY}`;

    const geoResp = await axios.get(url);
    // If caller requested minimal output, return only the from/to name+coords (if available)
    // Support ?minimal=true on the request query string
    const minimal = req.query && (req.query.minimal === 'true' || req.query.minimal === true);
    if (minimal) {
      // Map waypoints -> simple start/end
      // geoResp.data.properties.waypoints is an array with order matching request
      const props = geoResp.data.properties || {};
      const wp = props.waypoints || [];
      const simple = {
        start: wp[0] ? { name: start.name || null, latitude: wp[0].lat ?? wp[0].location?.[1] ?? null, longitude: wp[0].lon ?? wp[0].location?.[0] ?? null } : null,
        end: wp[1] ? { name: end.name || null, latitude: wp[1].lat ?? wp[1].location?.[1] ?? null, longitude: wp[1].lon ?? wp[1].location?.[0] ?? null } : null,
      };
      return res.json(simple);
    }
    res.json(geoResp.data);
  } catch (err) {
    console.error(err?.response?.data || err.message || err);
    res.status(500).json({ error: 'routing_error', detail: err?.response?.data || err.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Simple placeholder for websocket path so browser logs are less noisy (no real WS implemented)
app.get('/ws', (req, res) => res.status(501).send('WebSocket endpoint not implemented')); 

// Add endpoints that use Gemini for parsing and geocoding
const { parseTextToCoords, geminiGeocode } = require('./gemini_parse');

app.post('/api/parse-with-gemini', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'text required' });
    const result = await parseTextToCoords(text);
    // result contains { raw, parsed }
    res.json(result);
  } catch (e) {
    console.error('parse-with-gemini error', e?.message || e);
    res.status(500).json({ error: 'parse_error', detail: e?.message || e });
  }
});

app.get('/api/geocode', async (req, res) => {
  try {
    const text = req.query.text;
    if (!text) return res.status(400).json({ error: 'text required' });
    const geocoded = await geminiGeocode(text);
    res.json(geocoded);
  } catch (e) {
    console.error('geocode error', e?.message || e);
    res.status(500).json({ error: 'geocode_error', detail: e?.message || e });
  }
});
