import React, { useEffect, useRef, useState } from 'react';

type AccessibilityOptions = {
	mobility: boolean;
	vision: boolean;
	cognitive: boolean;
};

type Props = {
	value?: AccessibilityOptions;
	onChange?: (v: AccessibilityOptions) => void;
	/** Called when speech input finishes. role is 'start' or 'end' (for start/end location). */
	onSpeechResult?: (role: 'start' | 'end', text: string) => void;
};

const defaultOptions: AccessibilityOptions = {
	mobility: false,
	vision: false,
	cognitive: false,
};

export default function AssessibiltySelector({ value, onChange, onSpeechResult }: Props) {
	const [options, setOptions] = useState<AccessibilityOptions>(value ?? defaultOptions);
	const [listeningFor, setListeningFor] = useState<'start' | 'end' | null>(null);
	const [lastSpoken, setLastSpoken] = useState<{ start?: string; end?: string }>({});
	const recognitionRef = useRef<any | null>(null);
	const supportsSpeech = typeof window !== 'undefined' && (!!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition);

	useEffect(() => {
		// keep local state in sync when parent controls value
		if (value) setOptions(value);
	}, [value]);

	useEffect(() => {
		onChange?.(options);
	}, [options]);

	function toggle(key: keyof AccessibilityOptions) {
		setOptions(prev => ({ ...prev, [key]: !prev[key] }));
	}

	function createRecognition() {
		if (!supportsSpeech) return null;
		const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
		try {
			const r = new SpeechRecognition();
			r.lang = 'en-US';
			r.interimResults = false;
			r.maxAlternatives = 1;
			return r;
		} catch (e) {
			return null;
		}
	}

	function startListening(role: 'start' | 'end') {
		if (!supportsSpeech) {
			// fallback handled in UI
			return;
		}
		const r = createRecognition();
		if (!r) return;
		recognitionRef.current = r;
		setListeningFor(role);

		r.onresult = (evt: any) => {
			const transcript = Array.from(evt.results)
				.map((res: any) => res[0].transcript)
				.join('')
				.trim();
			setLastSpoken(prev => ({ ...prev, [role]: transcript }));
			setListeningFor(null);
			onSpeechResult?.(role, transcript);
		};

		r.onerror = () => {
			setListeningFor(null);
		};

		r.onend = () => {
			setListeningFor(null);
		};

		try {
			r.start();
		} catch (e) {
			setListeningFor(null);
		}
	}

	function stopListening() {
		const r = recognitionRef.current;
		if (r) {
			try {
				r.stop();
			} catch (e) {}
			recognitionRef.current = null;
		}
		setListeningFor(null);
	}

	return (
		<section className="p-4 bg-white rounded-md shadow-sm">
			<h3 className="text-lg font-semibold mb-3">Accessibility Options</h3>

			<div className="flex gap-2 flex-wrap">
				<button
					type="button"
					role="switch"
					aria-checked={options.mobility}
					onClick={() => toggle('mobility')}
					className={`px-3 py-2 rounded-md border focus:outline-none focus:ring-2 focus:ring-offset-1 ${options.mobility ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-200'}`}>
					Mobility
				</button>

				<button
					type="button"
					role="switch"
					aria-checked={options.vision}
					onClick={() => toggle('vision')}
					className={`px-3 py-2 rounded-md border focus:outline-none focus:ring-2 focus:ring-offset-1 ${options.vision ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-200'}`}>
					Vision
				</button>

				<button
					type="button"
					role="switch"
					aria-checked={options.cognitive}
					onClick={() => toggle('cognitive')}
					className={`px-3 py-2 rounded-md border focus:outline-none focus:ring-2 focus:ring-offset-1 ${options.cognitive ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-200'}`}>
					Cognitive
				</button>
			</div>

			<div className="mt-4">
				<h4 className="font-medium">Speech input (start / end)</h4>
				<p className="text-sm text-gray-500">Use your microphone to say a place name; confirm the result before routing.</p>

				<div className="mt-3 flex gap-2">
					<button
						type="button"
						onClick={() => startListening('start')}
						disabled={!supportsSpeech || listeningFor !== null}
						className="px-3 py-2 rounded-md bg-green-600 text-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-1">
						{listeningFor === 'start' ? 'Listening...' : 'Speak Start'}
					</button>

					<button
						type="button"
						onClick={() => startListening('end')}
						disabled={!supportsSpeech || listeningFor !== null}
						className="px-3 py-2 rounded-md bg-blue-600 text-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-1">
						{listeningFor === 'end' ? 'Listening...' : 'Speak End'}
					</button>

					<button
						type="button"
						onClick={stopListening}
						disabled={listeningFor === null}
						className="px-3 py-2 rounded-md bg-gray-200 text-gray-800 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-1">
						Stop
					</button>
				</div>

				{!supportsSpeech && (
					<div className="mt-2 text-sm text-yellow-700">Speech recognition not supported in this browser — fallback to text input will be required.</div>
				)}

				<div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
					<div>
						<label className="block text-sm font-medium text-gray-700">Last recognized (start)</label>
						<div className="mt-1 text-sm text-gray-900 min-h-[38px] p-2 border rounded-md bg-gray-50">{lastSpoken.start ?? '—'}</div>
					</div>
					<div>
						<label className="block text-sm font-medium text-gray-700">Last recognized (end)</label>
						<div className="mt-1 text-sm text-gray-900 min-h-[38px] p-2 border rounded-md bg-gray-50">{lastSpoken.end ?? '—'}</div>
					</div>
				</div>
			</div>

			<div className="sr-only" aria-live="polite">
				{listeningFor ? `Listening for ${listeningFor} location` : 'Not listening'}
			</div>
		</section>
	);
}
