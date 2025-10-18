import React, { useState, useRef } from 'react';

type Props = {
  onLocations?: (start: { lat: number; lon: number } | null, end: { lat: number; lon: number } | null) => void;
  onParsed?: (startName: string | null, endName: string | null) => void;
};

/**
 * ElevenLabsSpeechToText
 * - Records audio in the browser (MediaRecorder)
 * - Sends recorded audio to a backend proxy at /api/elevenlab-stt (POST multipart/form-data) which must
 *   forward to ElevenLabs' speech-to-text endpoint using your ElevenLabs API key (server-side only).
 * - Receives JSON { text: string } and attempts to parse 'start' and 'end' location names.
 * - Resolves the place names using Geoapify Geocoding API (frontend call) and returns coordinates via onLocations.
 *
 * Security: ElevenLabs API key must NOT be present in frontend code. Implement a lightweight server endpoint
 * to proxy the audio file to ElevenLabs and return the transcribed text.
 */
export default function ElevenLabsSpeechToText({ onLocations, onParsed }: Props) {
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);

  async function startRecording() {
    setStatus('Requesting microphone...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      mr.ondataavailable = ev => chunks.push(ev.data);
      mr.onstop = async () => {
        setStatus('Sending audio to STT service...');
        const blob = new Blob(chunks, { type: 'audio/webm' });
        try {
          const fd = new FormData();
          fd.append('file', blob, 'recording.webm');
          // POST to your backend proxy which should call ElevenLabs STT server-side
          const resp = await fetch('/api/elevenlab-stt', { method: 'POST', body: fd });
          if (!resp.ok) throw new Error('STT proxy error');
          const data = await resp.json();
          const text: string = data.text ?? data.transcript ?? '';
          setTranscript(text);
          setStatus('Parsing locations...');
          const { startName, endName } = parseStartEnd(text);
          // Notify parent of parsed building names (before geocoding)
          onParsed?.(startName ?? null, endName ?? null);
          // resolve via Geoapify
          const geoKey = process.env.REACT_APP_GEOAPIFY_KEY;
          const startCoord = startName ? await geocodePlace(startName, geoKey) : null;
          const endCoord = endName ? await geocodePlace(endName, geoKey) : null;
          setStatus('Done');
          onLocations?.(startCoord, endCoord);
        } catch (e) {
          console.error(e);
          setStatus('Error calling STT service');
        }
      };
      mediaRef.current = mr;
      mr.start();
      setRecording(true);
      setStatus('Recording...');
    } catch (e) {
      console.error(e);
      setStatus('Microphone access denied');
    }
  }

  function stopRecording() {
    const mr = mediaRef.current;
    if (mr && mr.state !== 'inactive') {
      try {
        mr.stop();
      } catch (e) {}
    }
    setRecording(false);
  }

  function parseStartEnd(text: string) {
    // Simple heuristics:
    // - Look for "from X to Y", "start at X and end at Y", or first two proper nouns
    const lower = text.toLowerCase();
    let startName: string | null = null;
    let endName: string | null = null;

    // UW-specific building name and acronym map
    const uwMap: { [key: string]: string } = {
      'mary gates hall': 'Mary Gates Hall',
      'mgh': 'Mary Gates Hall',
      'cse1': 'CSE1 Building',
      'cse 1': 'CSE1 Building',
      'the hub': 'Husky Union Building',
      'hub': 'Husky Union Building',
      'husky union building': 'Husky Union Building',
      'suzzallo': 'Suzzallo Library',
      'suzzallo library': 'Suzzallo Library',
      'odegaard': 'Odegaard Undergraduate Library',
    };

    function mapUW(name: string) {
      const k = name.trim().toLowerCase();
      return uwMap[k] ?? null;
    }

    const fromTo = lower.match(/from\s+([^,]+?)\s+(to|->|towards)\s+(.+)/);
    if (fromTo) {
      // try mapping to UW names first
      startName = mapUW(fromTo[1].trim()) ?? capitalizeWords(fromTo[1].trim());
      endName = mapUW(fromTo[3].trim()) ?? capitalizeWords(fromTo[3].trim());
      return { startName, endName };
    }

    const match = lower.match(/(?:start(?:ing)?(?:at)?|from)\s+([^,]+?)\s*(?:and|,)\s*(?:end(?:ing)?(?:at)?|to)\s+(.+)/);
    if (match) {
      startName = mapUW(match[1].trim()) ?? capitalizeWords(match[1].trim());
      endName = mapUW(match[2].trim()) ?? capitalizeWords(match[2].trim());
      return { startName, endName };
    }

    // fallback: try to extract two place-like phrases by splitting on ' to ' or ' and '
    const parts = text.split(/\bto\b|\band\b/i).map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      startName = mapUW(parts[0]) ?? capitalizeWords(parts[0]);
      endName = mapUW(parts[1]) ?? capitalizeWords(parts[1]);
      return { startName, endName };
    }

    // last fallback: pick first two capitalized sequences
    const caps = Array.from(text.matchAll(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g)).map(m => m[0]);
    if (caps.length >= 2) {
      startName = mapUW(caps[0]) ?? caps[0];
      endName = mapUW(caps[1]) ?? caps[1];
    } else if (caps.length === 1) {
      startName = mapUW(caps[0]) ?? caps[0];
    }
    return { startName, endName };
  }

  function capitalizeWords(s: string) {
    return s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.substr(1).toLowerCase());
  }

  async function geocodePlace(name: string, geoKey?: string | null) {
    // Use server-side geocode proxy to avoid exposing API key
    const tryGeocode = async (q: string) => {
      try {
        const r = await fetch(`/api/geocode?text=${encodeURIComponent(q)}`);
        if (!r.ok) return null;
        const j = await r.json();
        const f = j.features && j.features[0];
        if (!f) return null;
        const [lon, lat] = f.geometry.coordinates;
        return { lat, lon };
      } catch (e) {
        console.error('geocode error for', q, e);
        return null;
      }
    };

    // Try the original name first, then common UW-expanded variants
    const variants = [
      name,
      // If mapping exists, try mapped canonical name (e.g., 'Odegaard Undergraduate Library')
      name + ' University of Washington',
      name + ' UW Seattle',
      name + ' Seattle',
    ];

    // Also if the parser maps to a canonical UW name, try that first
    const mapped = ((): string | null => {
      const k = name.trim().toLowerCase();
      const uwMap: { [key: string]: string } = {
        'mary gates hall': 'Mary Gates Hall',
        'mgh': 'Mary Gates Hall',
        'cse1': 'CSE1 Building',
        'cse 1': 'CSE1 Building',
        'the hub': 'Husky Union Building',
        'hub': 'Husky Union Building',
        'husky union building': 'Husky Union Building',
        'suzzallo': 'Suzzallo Library',
        'suzzallo library': 'Suzzallo Library',
        'odegaard': 'Odegaard Undergraduate Library',
      };
      return uwMap[k] ?? null;
    })();

    const tried = new Set<string>();
    if (mapped) variants.unshift(mapped);

    for (const q of variants) {
      if (!q || tried.has(q.toLowerCase())) continue;
      tried.add(q.toLowerCase());
      const result = await tryGeocode(q);
      if (result) return result;
    }

    // As a last resort, try adding 'University of Washington' to the canonical mapped name
    if (!mapped && name) {
      const q = name + ' University of Washington';
      const r = await tryGeocode(q);
      if (r) return r;
    }

    return null;
  }

  return (
    <div className="p-3 bg-white rounded-md shadow-sm">
      <h4 className="font-semibold">ElevenLabs STT (proxy)</h4>
      <p className="text-sm text-gray-500">Record voice for start and end location. Backend proxy required at <code>/api/elevenlab-stt</code>.</p>

      <div className="mt-3 flex gap-2">
        <button onClick={startRecording} disabled={recording} className="px-3 py-2 bg-green-600 text-white rounded-md">Record</button>
        <button onClick={stopRecording} disabled={!recording} className="px-3 py-2 bg-gray-200 rounded-md">Stop</button>
      </div>

      <div className="mt-3 text-sm">
        <div><strong>Status:</strong> {status ?? 'idle'}</div>
        <div className="mt-2"><strong>Transcript:</strong> {transcript ?? '—'}</div>
      </div>
    </div>
  );
}
