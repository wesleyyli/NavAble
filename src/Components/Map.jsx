import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { uwAvoids } from "./Stairs";
import mic from "../Assets/Mic.png";
import cross from "../Assets/cross.png";
import logo from "../Assets/WhiteNavable.png";
import send from "../Assets/send.png"


export default function MyMap({setPage}) {
  const containerRef = useRef(null);
  const [avoidsShow, setAvoidsShow] = useState(true);
  const [avoidRoutes, setAvoidRoutes] = useState(true);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState(null);
  const [textInput, setTextInput] = useState('');
  const mapRef = useRef(null);
  const mediaRef = useRef(null);
  const [fromLoc, setFromLoc] = useState(null);
  const [toLoc, setToLoc] = useState(null);
  const [fromName, setFromName] = useState(null);
  const [toName, setToName] = useState(null);

  const apiKey = process.env.REACT_APP_GEOAPIFY_KEY;
    if (!apiKey) {
      console.error("Geoapify key missing. Add REACT_APP_GEOAPIFY_KEY to .env and restart the dev server.");
    }

  // Function to handle search (process audio file)
  const handleSearch = async (audioBlob) => {
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.webm');
  
      const response = await fetch('/api/elevenlab-stt', {
        method: 'POST',
        body: formData,
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        console.error("Error from ElevenLabs STT:", errorData);
        return;
      }
  
      const data = await response.json();
      console.log("Transcription result:", data);
  
      if (data && data.text) {
        setStatus("Parsing transcription...");
        await handleParsing(data.text);
      } else {
        setStatus("No transcription text found");
      }
    } catch (error) {
      console.error("Error during STT or parsing:", error);
      setStatus("Error during STT or parsing");
    }
  };
  const handleParsing = async (text) => {
    try {
      const response = await fetch('/api/parse-with-gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        console.error('Error from Gemini parsing API');
        setStatus('Error parsing transcription');
        return;
      }

      const data = await response.json();
      console.log('Parsed locations:', data);

      const parsed = data.parsedNames || data.parsed || { start: null, end: null };
      const matched = data.matched || null;

      // Store location names
      setFromName(matched?.start?.name || parsed.start || null);
      setToName(matched?.end?.name || parsed.end || null);

      const startCoord = matched?.start
        ? { lat: matched.start.latitude, lon: matched.start.longitude }
        : null;
      const endCoord = matched?.end
        ? { lat: matched.end.latitude, lon: matched.end.longitude }
        : null;

      console.log('Start Coordinates:', startCoord);
      console.log('End Coordinates:', endCoord);
      
      // Check if either location is null
      if (!startCoord || !endCoord) {
        setStatus('Invalid Location');
        setFromName(null);
        setToName(null);
        return;
      }
      
      handleLocations(startCoord, endCoord);
      setStatus('Done');
    } catch (error) {
      console.error('Error during parsing:', error);
      setStatus('Error during parsing');
    }
  };

  const handleLocations = (startCoord, endCoord) => {
    console.log('Start Coordinates:', startCoord);
    console.log('End Coordinates:', endCoord);

    if (startCoord && endCoord) {
      // Plot the start point
      setFromLoc(startCoord);
      setToLoc(endCoord);
      
      // Fetch route from Geoapify Directions API
      let url = `https://api.geoapify.com/v1/routing?waypoints=${startCoord.lat},${startCoord.lon}|${endCoord.lat},${endCoord.lon}&mode=walk`;
      if (avoidRoutes && uwAvoids.length > 0) {
        url += `&avoid=`;
        url += uwAvoids.map((loc) => `location:` + loc.join(',')).join('|');
      }
      url += `&details=route_details&apiKey=${apiKey}`;
      console.log(url);

      fetch(url)
      .then((response) => response.json())
      .then((data) => {
        if (data.features && data.features.length > 0) {
          const route = data.features[0]; // Get the first route feature

          // Check if the source already exists
          if (mapRef.current.getSource("route")) {
            // Update the existing source's data
            mapRef.current.getSource("route").setData(route.geometry);
          } else {
            // Add the route as a GeoJSON source
            mapRef.current.addSource("route", {
              type: "geojson",
              data: route.geometry,
            });
          }

          // Add a line layer to display the route
          mapRef.current.addLayer({
            id: "route",
            type: "line",
            source: "route",
            layout: {
              "line-join": "round",
              "line-cap": "round",
            },
            paint: {
              "line-color": "#007AFF", // Blue color for the route
              "line-width": 4,
            },
          });
        } else {
          console.error("No route found in the response.");
        }
      })
      .catch((error) => {
        console.error("Error fetching route:", error);
      });  
    }
  };

  async function handleTextSubmit() {
    if (!textInput.trim()) {
      setStatus('Please enter a navigation request');
      return;
    }

    setStatus('Parsing locations via Gemini...');

    try {
      await handleParsing(textInput);
    } catch (error) {
      console.error('Error processing text input:', error);
      setStatus('Error processing text input');
    }
  }

  async function startRecording() {
    setStatus('Requesting microphone...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      const chunks = [];

      mediaRecorder.ondataavailable = (event) => {
        console.log('Audio chunk received:', event.data.size);
        chunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        setStatus('Processing audio...');
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        console.log('Audio Blob Size:', audioBlob.size);

        if (audioBlob.size === 0) {
          console.error('The audio file is empty.');
          setStatus('The audio file is empty.');
          return;
        }

        handleSearch(audioBlob);
      };

      mediaRef.current = mediaRecorder;
      mediaRecorder.start();
      setRecording(true);
      setStatus('Recording...');
    } catch (error) {
      console.error('Microphone access denied:', error);
      setStatus('Microphone access denied');
    }
  }

  function stopRecording() {
    const mediaRecorder = mediaRef.current;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach((track) => track.stop()); // Stop the microphone stream
      setRecording(false);
      setStatus('Stopping recording...');
    }
  }

  const handleToggle = () => {
    setAvoidsShow(prev => !prev);
    setAvoidRoutes(prev => !prev);
  };


  useEffect(() => {
    handleLocations(fromLoc, toLoc);
  }, [avoidRoutes]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const styleUrl = `https://maps.geoapify.com/v1/styles/osm-liberty/style.json?apiKey=${apiKey}`;

    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: [237.692, 47.654],
      zoom: 16.5,
      pitch: 60,           // tilt the camera to reveal 3D
      bearing: 20,        // slight rotation looks better
      antialias: true,     // smoother edges on extrusions
    });

    mapRef.current.addControl(new maplibregl.NavigationControl(), "top-right");

    // STAIRS AVOID
    if (avoidsShow) {
      uwAvoids.forEach((marker) => {
        const el = document.createElement("div");
        el.className = "uw-avoid";
        el.style.backgroundColor = "#FF0000";
        el.style.width = "20px";
        el.style.height = "20px";
        el.style.borderRadius = "50%";
        el.style.cursor = "pointer";
        el.style.display = "flex";
        el.style.alignItems = "center";
        el.style.justifyContent = "center";
        el.style.color = "#FFFFFF"; // White color for the "shairs"
        el.style.fontFamily = "Arial, sans-serif";
        el.style.fontWeight = "black";
        el.style.fontSize = "14px";
        el.textContent = "𓊍";
  
        new maplibregl.Marker({element: el})
          .setLngLat([marker[1], marker[0]])
          .setPopup(new maplibregl.Popup().setText("Stairs")) // Add popup
          .addTo(mapRef.current);
      });
    }

    // Start and End Markers
    if (fromLoc && toLoc) {
      // Start Marker
      new maplibregl.Marker({ color: "green" })
        .setLngLat([fromLoc.lon, fromLoc.lat])
        .setPopup(new maplibregl.Popup().setText("Start"))
        .addTo(mapRef.current);
  
      // End Marker
      new maplibregl.Marker({ color: "red" })
        .setLngLat([toLoc.lon, toLoc.lat])
        .setPopup(new maplibregl.Popup().setText("End"))
        .addTo(mapRef.current);
    }

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [fromLoc, toLoc, avoidRoutes, avoidsShow]);

  return (<div>
    {/* Text Input Section */}
      <div className='App-header'>
          <img 
            className="h-12 m-4" 
            src={logo} 
            alt="Navable logo"
            onClick={() => setPage("welcome")}></img>
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleTextSubmit()}
              placeholder="e.g., from HUB to Mary Gates Hall"
              className="px-3 m-2 w-1/2 h-10 py-2 border text-sm text-black bg-gray-100 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button 
              onClick={handleTextSubmit}
              className="px-4 py-2 h-10 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <img className="h-6 invert" src={send} alt="send button"></img>
            </button>
      </div>
      <div ref={containerRef} style={{ width: "100%", height: "94vh" }} />
      {/* Route Display Banner */}
      {fromName && toName && (
        <div className="absolute top-12 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-6 py-3 rounded-lg shadow-lg z-10">
          <p className="text-sm font-semibold">
            Currently Displaying: <span className="font-bold">{fromName}</span> to <span className="font-bold">{toName}</span>
          </p>
        </div>
      )}
      
      {/* Error Banner */}
      {status === 'Invalid Location' && (
        <div className="absolute top-12 left-1/2 transform -translate-x-1/2 bg-red-600 text-white px-6 py-3 rounded-lg shadow-lg z-10">
          <p className="text-sm font-semibold">
            Sorry, we couldn't quite catch that. Please try again.
          </p>
        </div>
      )}
      {/* Voice Input Section */}
      <div className="fixed bottom-6 left-6 p-4 text-white">
        <button
          onClick={startRecording}
          disabled={recording}
          className=
          {!recording 
            ? "px-4 py-2 bg-sky-300 text-black w-[7em] h-[7em] rounded-full ml-2"
            : "hidden"}
        >
          <img src={mic} alt="microphone icon"></img>
        </button>
        <button
          onClick={stopRecording}
          disabled={!recording}
          className={!recording 
            ? "hidden" 
            : "px-4 py-2 bg-gray-300 text-black w-[7em] h-[7em] rounded-full ml-2"}
        >
          <img src={cross} alt="X icon"></img>
        </button>
      </div>


      <div className="absolute top-[10.5em] right-[0.75em] flex flex-col space-y-2 bg-white p-1 rounded-md shadow-lg ">
        <button 
        className={avoidsShow ? "w-10 h-10 bg-red-500 rounded-md font-black" : "w-10 h-10 rounded-md bg-gray-500 font-black"} 
        onClick={handleToggle}>𓊍</button>
      </div>
        {/* Status Display */}
        {status && (
          <div className="text-sm text-gray-700 mt-2">
            <strong>Status:</strong> {status}
          </div>
        )}
      </div>
  );

  }
