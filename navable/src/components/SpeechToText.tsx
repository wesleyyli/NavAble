import React, { useState } from 'react';
import ElevenLabsSpeechToText from './ElevenLabsSpeechToText';

type Coord = { lat: number; lon: number } | null;

type Props = {
  /** Called when the backend returns routing data for the provided start/end coords */
  onRouteResult?: (routeData: any) => void;
  /** Optional accessibility options forwarded to the backend routing request */
  accessibilityOptions?: { mobility?: boolean; vision?: boolean; cognitive?: boolean };
};

export default function SpeechToText({ onRouteResult, accessibilityOptions }: Props) {
  const [status, setStatus] = useState<string | null>(null);

  async function handleLocations(start: Coord, end: Coord) {
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

