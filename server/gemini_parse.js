require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');

// Gemini/GenAI client: prefer API key from GEMINI_API_KEY, otherwise fall back to ADC
const genaiOptions = {};
if (process.env.GEMINI_API_KEY) genaiOptions.apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI(genaiOptions);

// Load UW place list once from all .txt files in this directory
let UW_PLACES = null;
function loadUwPlaces() {
  if (UW_PLACES) return UW_PLACES;
  const dir = __dirname;
  const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.txt'));
  const places = [];
  for (const fname of files) {
    const p = path.join(dir, fname);
    let txt = '';
    try {
      txt = fs.readFileSync(p, 'utf8');
    } catch (e) {
      console.warn('Failed to read', fname, e.message);
      continue;
    }
    const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (/^Name\s+Latitude/i.test(line)) continue; // skip header
      const parts = line.split(/\s+/);
      if (parts.length < 3) continue;
      const lon = Number(parts[parts.length - 1]);
      const lat = Number(parts[parts.length - 2]);
      if (isNaN(lat) || isNaN(lon)) continue;
      const name = parts.slice(0, parts.length - 2).join(' ');
      places.push({ name: name.trim(), lat, lon, raw: line, source: fname });
    }
  }
  // dedupe by normalized name
  const seen = new Map();
  for (const p of places) {
    const key = p.name.toLowerCase();
    if (!seen.has(key)) seen.set(key, p);
  }
  UW_PLACES = Array.from(seen.values());
  return UW_PLACES;
}

// Simple fuzzy string score: normalized Levenshtein-like distance via character overlap
function similarityScore(a, b) {
  if (!a || !b) return 0;
  a = a.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  b = b.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (a === b) return 1;
  // token overlap
  const atoks = Array.from(new Set(a.split(/\s+/)));
  const btoks = Array.from(new Set(b.split(/\s+/)));
  const common = atoks.filter(t => btoks.includes(t)).length;
  const denom = Math.max(atoks.length, btoks.length);
  return denom === 0 ? 0 : common / denom;
}

// Find best match in UW places for a given placeName
function findBestMatch(placeName) {
  const places = loadUwPlaces();
  if (!places || places.length === 0) return null;
  let best = null;
  for (const p of places) {
    const score = similarityScore(placeName, p.name);
    // boost exact substring matches
    const lname = p.name.toLowerCase();
    if (lname.includes(placeName.toLowerCase()) || placeName.toLowerCase().includes(lname)) {
      // ensure score is high
      const adjusted = Math.max(score, 0.9);
      if (!best || adjusted > best.score) best = { place: p, score: adjusted };
      continue;
    }
    if (!best || score > best.score) best = { place: p, score };
  }
  return best;
}

async function parseTextToCoords(text) {
  // Prompt Gemini to extract up to two place names (start and end) mentioned by the user.
  // Return JSON exactly in this format (names only): {"start": {"name": "..."} , "end": {"name": "..."} }
  const prompt = 'From the following user text, extract up to two location names (a start and an end) that the user mentions. The locations are buildings or places on the University of Washington, Seattle campus. For each location return only its name, not coordinates. If a location is not mentioned, use null. Return only valid JSON exactly like: {"start": {"name":"Suzzallo Library"}, "end": {"name":"Kane Hall"} }. Do not include commentary. User text: ' + text;

  const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
  const raw = response?.text || (response?.candidates && response.candidates[0]?.content?.text) || '';
  console.log('Gemini raw (names):', raw);

  let parsedNames = { start: null, end: null };
  try {
    parsedNames = JSON.parse(raw);
  } catch (e) {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try { parsedNames = JSON.parse(m[0]); } catch (e2) { console.error('Failed to parse JSON from Gemini output (names)'); }
    }
  }

  // Now match the parsed names to UW place list
  const matched = { start: null, end: null };
  if (parsedNames.start && parsedNames.start.name) {
    const best = findBestMatch(parsedNames.start.name);
    if (best) matched.start = { name: best.place.name, latitude: best.place.lat, longitude: best.place.lon, score: best.score, source: best.place.source };
  }
  if (parsedNames.end && parsedNames.end.name) {
    const best = findBestMatch(parsedNames.end.name);
    if (best) matched.end = { name: best.place.name, latitude: best.place.lat, longitude: best.place.lon, score: best.score, source: best.place.source };
  }

  return { raw, parsedNames, matched };
}

// CLI: node gemini_parse.js "text to parse"
async function main() {
  const text = process.argv.slice(2).join(' ');
  if (!text) {
    console.error('Usage: node gemini_parse.js "text to parse"');
    process.exit(1);
  }
  const r = await parseTextToCoords(text);
  console.log('=== PARSED JSON ===');
  console.log(JSON.stringify(r.parsed, null, 2));
}

if (require.main === module) {
  main();
}

// Also export for use from server
async function geminiGeocode(place) {
  if (!place) return null;
  const prompt = `Provide precise latitude and longitude (decimal degrees) for the place named "${place}" located on or very near the University of Washington, Seattle campus. Reply with JSON exactly in this format: {"name":"${place}","lat":47.6558,"lon":-122.3059}. If you are unsure, give your best estimate within the UW Seattle area.`;
  const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
  const txt = response?.text || '';
  // parse JSON
  try {
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    const nums = txt.match(/-?\d+\.\d+/g);
    if (nums && nums.length >= 2) return { name: place, lat: Number(nums[0]), lon: Number(nums[1]) };
  } catch (e) {
    console.error('Error parsing Gemini geocode response', e?.message || e);
  }
  return null;
}

module.exports = { parseTextToCoords, geminiGeocode };
