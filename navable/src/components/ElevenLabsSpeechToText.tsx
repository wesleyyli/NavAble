import React, { useState, useRef } from 'react';

type Props = {
  onLocations?: (start: { lat: number; lon: number } | null, end: { lat: number; lon: number } | null) => void;
  // Optional callback to receive parsed name objects (start, end) for debugging or UI
  onParsed?: (start: any, end: any) => void;
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
          setStatus('Parsing locations via server (Gemini)...');
          // Send transcript to server which calls Gemini and returns raw + parsed
          try {
            const resp = await fetch('/api/parse-with-gemini', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text }),
            });
            if (!resp.ok) throw new Error('parse-with-gemini failed');
            const data = await resp.json();
            // Support both old and new shapes. New minimal shape is { start:{name,longitude,latitude}, end:{...} }
            const parsedMinimal = data || {};
            const raw = data.raw || JSON.stringify(data.parsed || data.parsedNames || parsedMinimal || {});
            const parsed = data.parsedNames || data.parsed || parsedMinimal || { start: null, end: null };
            const matched = data.matched || null;
            setStatus('Done');

            // If matched contains coords (server matching uw.txt), prefer those
            // Prefer minimal parsed shape with longitude/latitude
            const startCoord = (parsed && parsed.start && parsed.start.latitude !== undefined && parsed.start.longitude !== undefined)
              ? { lat: parsed.start.latitude, lon: parsed.start.longitude }
              : (matched && matched.start && (matched.start.latitude !== undefined && matched.start.longitude !== undefined))
                ? { lat: matched.start.latitude, lon: matched.start.longitude }
                : (parsed && parsed.start && parsed.start.lat !== undefined && parsed.start.lon !== undefined)
                  ? { lat: parsed.start.lat, lon: parsed.start.lon }
                  : null;

            const endCoord = (parsed && parsed.end && parsed.end.latitude !== undefined && parsed.end.longitude !== undefined)
              ? { lat: parsed.end.latitude, lon: parsed.end.longitude }
              : (matched && matched.end && (matched.end.latitude !== undefined && matched.end.longitude !== undefined))
                ? { lat: matched.end.latitude, lon: matched.end.longitude }
                : (parsed && parsed.end && parsed.end.lat !== undefined && parsed.end.lon !== undefined)
                  ? { lat: parsed.end.lat, lon: parsed.end.lon }
                  : null;

            // store a debug transcript including raw Gemini output in the transcript field for visibility
            setTranscript(t => (t ?? '') + '\n\nGemini raw:\n' + raw);

            // Call onParsed with the parsed name objects (start, end) for consumers that want them
            onParsed?.(parsed.start ?? null, parsed.end ?? null);

            onLocations?.(startCoord, endCoord);
          } catch (err) {
            console.error('Error calling parse-with-gemini', err);
            setStatus('Error parsing locations');
          }
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

    const fromTo = lower.match(/from\s+([^,]+?)\s+(to|->|towards)\s+(.+)/);
    if (fromTo) {
      startName = capitalizeWords(fromTo[1].trim());
      endName = capitalizeWords(fromTo[3].trim());
      return { startName, endName };
    }

    const match = lower.match(/(?:start(?:ing)?(?:at)?|from)\s+([^,]+?)\s*(?:and|,)\s*(?:end(?:ing)?(?:at)?|to)\s+(.+)/);
    if (match) {
      startName = capitalizeWords(match[1].trim());
      endName = capitalizeWords(match[2].trim());
      return { startName, endName };
    }

    // fallback: try to extract two place-like phrases by splitting on ' to ' or ' and '
    const parts = text.split(/\bto\b|\band\b/i).map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      startName = capitalizeWords(parts[0]);
      endName = capitalizeWords(parts[1]);
      return { startName, endName };
    }

    // last fallback: pick first two capitalized sequences
    const caps = Array.from(text.matchAll(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g)).map(m => m[0]);
    if (caps.length >= 2) {
      startName = caps[0];
      endName = caps[1];
    } else if (caps.length === 1) {
      startName = caps[0];
    }
    return { startName, endName };
  }

  function capitalizeWords(s: string) {
    return s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.substr(1).toLowerCase());
  }

  async function geocodePlace(name: string, geoKey?: string | null) {
    // Client-side geocoding removed - server now provides verified coordinates via Gemini/Nominatim.
    console.warn('geocodePlace called but client-side geocoding has been disabled. Use server parse endpoint instead.');
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
