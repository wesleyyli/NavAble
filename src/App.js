import logo from './logo.svg';
import './App.css';

function App() {
  async function speak(text) {
    try {
      const response = await fetch('http://localhost:3001/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`TTS request failed: ${errorText}`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      const audio = new Audio(audioUrl);
      audio.play();

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl); // Clean up
      };
    } catch (error) {
      console.error('Error playing TTS:', error);
      alert('Failed to play speech. See console for details.');
    }
  }

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p className="text-3xl underline">
          Edit <code>src/App.js</code> and save to reload.
        </p>
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>

        {/* Speak Buttons */}
        <button
          onClick={() => speak('Turn left')}
          className="mt-4 p-2 bg-blue-500 rounded text-white"
          type="button"
        >
          Speak: "Turn left"
        </button>

        <button
          onClick={() => speak('Turn right')}
          className="mt-4 p-2 bg-green-500 rounded text-white ml-2"
          type="button"
        >
          Speak: "Turn right"
        </button>

        <button
          onClick={() => speak('Turn around')}
          className="mt-4 p-2 bg-red-500 rounded text-white ml-2"
          type="button"
        >
          Speak: "Turn around"
        </button>
      </header>
    </div>
  );
}

export default App;
