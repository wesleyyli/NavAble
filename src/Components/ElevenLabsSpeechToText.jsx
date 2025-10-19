import React, { useState, useRef } from 'react';

export default function ElevenLabsSpeechToText({ onLocations, onParsed }) {
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState(null);
  const [transcript, setTranscript] = useState(null);
  const mediaRef = useRef(null);

  async function startRecording() {
    setStatus('Requesting microphone...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks = [];
      mr.ondataavailable = ev => chunks.push(ev.data);
      mr.onstop = async () => {
        setStatus('Sending audio to STT service...');
        const blob = new Blob(chunks, { type: 'audio/webm' });
        try {
          const fd = new FormData();
          fd.append('file', blob, 'recording.webm');
          const resp = await fetch('/api/elevenlab-stt', { method: 'POST', body: fd });
          if (!resp.ok) throw new Error('STT proxy error');
          const data = await resp.json();
          const text = data.text ?? data.transcript ?? '';
          setTranscript(text);
          setStatus('Parsing locations via server (Gemini)...');
          try {
            const resp2 = await fetch('/api/parse-with-gemini', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text }),
            });
            if (!resp2.ok) throw new Error('parse-with-gemini failed');
            const data2 = await resp2.json();
            const raw = data2.raw || JSON.stringify(data2.parsed || data2.parsedNames || {});
            const parsed = data2.parsedNames || data2.parsed || { start: null, end: null };
            const matched = data2.matched || null;
            setStatus('Done');

            const startCoord = (matched && matched.start && (matched.start.latitude !== undefined && matched.start.longitude !== undefined))
              ? { lat: matched.start.latitude, lon: matched.start.longitude }
              : (matched && matched.start && (matched.start.lat !== undefined && matched.start.lon !== undefined))
                ? { lat: matched.start.lat, lon: matched.start.lon }
                : (parsed.start && parsed.start.lat && parsed.start.lon ? { lat: parsed.start.lat, lon: parsed.start.lon } : null);
            const endCoord = (matched && matched.end && (matched.end.latitude !== undefined && matched.end.longitude !== undefined))
              ? { lat: matched.end.latitude, lon: matched.end.longitude }
              : (matched && matched.end && (matched.end.lat !== undefined && matched.end.lon !== undefined))
                ? { lat: matched.end.lat, lon: matched.end.lon }
                : (parsed.end && parsed.end.lat && parsed.end.lon ? { lat: parsed.end.lat, lon: parsed.end.lon } : null);

            setTranscript(t => (t ?? '') + '\n\nGemini raw:\n' + raw);
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
      try { mr.stop(); } catch (e) {}
    }
    setRecording(false);
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