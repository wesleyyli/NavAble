import React, { useState } from 'react';
import SpeechToText from '../components/SpeechToText';

export default function SpeechDemo() {
  const [route, setRoute] = useState<any | null>(null);
  const [parsedStart, setParsedStart] = useState<string | null>(null);
  const [parsedEnd, setParsedEnd] = useState<string | null>(null);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Speech-to-Text Demo</h1>
      <p className="mb-4">Press Record, speak a start and end location (e.g., "from Suzzallo Library to Kane Hall"), then Stop.</p>
      <SpeechToText onRouteResult={d => setRoute(d)} onParsed={(s, e) => { setParsedStart(s); setParsedEnd(e); }} />

      <div className="mt-6">
        <h2 className="font-semibold">Parsed Locations</h2>
        <div className="bg-gray-50 p-3 rounded mt-2">
          <div><strong>Start:</strong> {parsedStart ?? '—'}</div>
          <div><strong>End:</strong> {parsedEnd ?? '—'}</div>
        </div>

        <h2 className="font-semibold mt-4">Route / Response</h2>
        <pre className="bg-gray-100 p-3 rounded mt-2 max-h-64 overflow-auto">{route ? JSON.stringify(route, null, 2) : 'No route data yet'}</pre>
      </div>
    </div>
  );
}
