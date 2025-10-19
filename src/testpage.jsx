import { useState } from 'react';
import logo from './logo.svg';
import './App.css';
import { speak } from './App';

function TestPage({ setPage }) {
  
  return (
    <>
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
        <button
          onClick={() => speak('Turn left')}
          className="mt-4 p-2 bg-blue-500 rounded text-white"
          type="button"
        >
          Speak: "Turn left"
        </button>
        <button
        className="mt-4 p-2 bg-blue-500 rounded text-white"
        onClick={() => setPage("welcome")}
        > 
          change page 
        </button>

      </header>


    </div>
    </>
  );
}

export default TestPage;
