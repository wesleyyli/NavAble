require('dotenv').config();
const axios = require('axios');

const rawUrl = process.env.GEMINI_API_URL;
const key = process.env.GEMINI_API_KEY;
if (!rawUrl) {
  console.error('GEMINI_API_URL not set in .env');
  process.exit(2);
}
if (!key) {
  console.error('GEMINI_API_KEY not set in .env');
  process.exit(2);
}

function normalize(raw) {
  const m = raw.match(/https?:\/\/[^\s'"\)]+/);
  if (m) return m[0];
  return raw;
}

const baseUrl = normalize(rawUrl);
console.log('Testing base URL:', baseUrl);

let target = baseUrl;
const headers = { 'Content-Type': 'application/json' };
if (key.startsWith('AIza')) {
  const sep = target.includes('?') ? '&' : '?';
  target = `${target}${sep}key=${encodeURIComponent(key)}`;
  console.log('Using API key via query param');
} else {
  headers['Authorization'] = `Bearer ${key}`;
  console.log('Using Bearer token for Authorization');
}

const candidateUrls = new Set();
candidateUrls.add(target);
try {
  const u = new URL(target);
  const base = `${u.origin}${u.pathname}`;
  if (base.includes(':')) {
    const [modelPath] = base.split(':');
    ['generateMessage', 'generateText', 'generate', 'generateContent'].forEach((v) => candidateUrls.add(`${modelPath}:${v}`));
  } else {
    ['generateMessage', 'generateText', 'generate', 'generateContent'].forEach((v) => candidateUrls.add(`${base}:${v}`));
  }
} catch (e) {}

const bodies = [
  { prompt: { messages: [{ author: 'user', content: [{ type: 'text', text: 'Parse: from Mary Gates Hall to Odegaard' }] }] }, maxOutputTokens: 512 },
  { messages: [{ author: 'user', content: [{ type: 'text', text: 'Parse: from Mary Gates Hall to Odegaard' }] }], maxOutputTokens: 512 },
  { prompt: { text: 'Parse: from Mary Gates Hall to Odegaard' }, maxOutputTokens: 512 },
  { input: { text: 'Parse: from Mary Gates Hall to Odegaard' }, maxOutputTokens: 512 },
  { instances: [{ content: 'Parse: from Mary Gates Hall to Odegaard' }] },
  { text: 'Parse: from Mary Gates Hall to Odegaard', maxOutputTokens: 512 },
  { prompt: 'Parse: from Mary Gates Hall to Odegaard' },
];

(async () => {
  for (const cUrl of candidateUrls) {
    for (const body of bodies) {
      try {
        console.log('\n--- Trying URL:', cUrl, 'body keys:', Object.keys(body));
        const resp = await axios.post(cUrl, body, { headers, timeout: 20000 });
        console.log('SUCCESS', resp.status);
        console.log('Response data:', JSON.stringify(resp.data, null, 2));
        process.exit(0);
      } catch (err) {
        console.error('FAIL', err?.response?.status || err.message);
        if (err?.response?.data) console.error('Body:', JSON.stringify(err.response.data, null, 2));
      }
    }
  }
  console.error('\nAll attempts failed');
  process.exit(1);
})();
