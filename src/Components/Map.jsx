import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { uwAvoids } from "./Stairs";

export default function MyMap() {
  const containerRef = useRef(null);
  const [avoidsShow, setAvoidsShow] = useState(true);
  const [avoidRoutes, setAvoidRoutes] = useState(true);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState(null);
  const mapRef = useRef(null);
  const mediaRef = useRef(null);
  const [fromLoc, setFromLoc] = useState(null);
  const [toLoc, setToLoc] = useState(null);

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

      const startCoord = matched?.start
        ? { lat: matched.start.latitude, lon: matched.start.longitude }
        : null;
      const endCoord = matched?.end
        ? { lat: matched.end.latitude, lon: matched.end.longitude }
        : null;

      console.log('Start Coordinates:', startCoord);
      console.log('End Coordinates:', endCoord);
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
        el.style.color = "#FFFFFF"; // White color for the "X"
        el.style.fontFamily = "Arial, sans-serif";
        el.style.fontWeight = "bolder";
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
      <div ref={containerRef} style={{ width: "100%", height: "94vh" }} />
      <div className="absolute top-10 left-10">
        <button
          onClick={startRecording}
          disabled={recording}
          className="px-4 py-2 bg-green-600 text-white rounded-md"
        >
          Record
        </button>
        <button
          onClick={stopRecording}
          disabled={!recording}
          className="px-4 py-2 bg-gray-300 text-black rounded-md ml-2"
        >
          Stop
        </button>
      </div>
    </div>
  );

  }
