import React, { useState } from 'react';
import ElevenLabsSpeechToText from './ElevenLabsSpeechToText';

export default function SpeechToText({ onRouteResult, accessibilityOptions }) {
  const [status, setStatus] = useState(null);

  async function handleLocations(start, end) {
    if (!start || !end) {
      setStatus('Missing start or end coordinates');
      return;
    }
    setStatus('Requesting route from backend...');
    try {
      const resp = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start, end, accessibilityOptions }),
      });
      if (!resp.ok) throw new Error(`route proxy error: ${resp.status}`);
      const data = await resp.json();
      setStatus('Route received');
      onRouteResult?.(data);
    } catch (e) {
      console.error(e);
      setStatus('Error requesting route');
    }
  }

  return (
    <div>
      <ElevenLabsSpeechToText onLocations={handleLocations} />
      <div className="mt-2 text-sm text-gray-700">{status}</div>
    </div>
  );
}
