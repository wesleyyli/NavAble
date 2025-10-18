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

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
