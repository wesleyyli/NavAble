import { useState } from 'react';
import './App.css';
import { speak } from './App';
import background from './Videos/welcome_fixed.mp4'

function Welcome({setPage}) {

  return (
    <>
    <div className="App">
      <header className="overflow-hidden h-screen">
        <video height="100vh" autoPlay muted loop playsInline
        className="absolute top-0 left-0 w-full h-full object-cover">
            <source src={background} type="video/mp4"/>
            Your browser does not support the background video.
        </video>
        <div
            className="absolute top-0 left-0 w-full h-full object-cover bg-black animate-fadeOut">
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center ">
            <p className="text-[100px] font-bold text-black animate-slideIn">NavAble</p>
            <button
            onClick={() => speak('Turn left')}
            className="mt-4 p-2 bg-blue-500 rounded text-white"
            type="button"
            >
            Start Mapping!
            </button>
        </div>
        
        

      </header>


    </div>
    </>
  );
}

export default Welcome;
