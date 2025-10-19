import { useState } from 'react';
import './App.css';
import Welcome from './pages/Welcome';
import Map from './Components/Map';
import SpeechDemo from './pages/SpeechDemo';
import logo from './Assets/WhiteNavable.png'

function App() {
  const [page, setPage] = useState("welcome");

  if (page === "welcome") {
    return (
      <div>
        <Welcome setPage={setPage}/>
      </div>
    );
  }
  else if (page === "map") {
    return (
      <div>
        <div className='App-header'>
            <img className="h-12 m-4" src={logo} alt="Navable logo"></img>
        </div>
        <Map setPage={setPage}/>
      </div>
    );
  }
  else if (page === "speechdemo") {
    return (
      <div>
        <SpeechDemo/>
      </div>
    );
  }
  else {
    return (
      <div className='text-6xl'>
        Page does not exist!
      </div>
    );
  }
}

export async function speak(text) {
  try {
    const response = await fetch('http://localhost:3002/speak', {
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
      URL.revokeObjectURL(audioUrl);
    };
  } catch (error) {
    console.error('Error playing TTS:', error);
    alert('Failed to play speech. See console for details.');
  }
}


export default App;