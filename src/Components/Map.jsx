import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export default function MyMap() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const apiKey = process.env.REACT_APP_GEOAPIFY_KEY;
    if (!apiKey) {
      console.error("Geoapify key missing. Add REACT_APP_GEOAPIFY_KEY to .env and restart the dev server.");
      return;
    }

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

    const uwMarkers = [
      { title: "Husky Stadium", coordinates: [-122.3017, 47.6501] },
      { title: "Drumheller Fountain", coordinates: [-122.3078, 47.6536] },
      { title: "The Quad", coordinates: [-122.3080, 47.6553] },
      { title: "UW Suzzallo Library", coordinates: [-122.3074, 47.6561] },
      { title: "Burke Museum", coordinates: [-122.3104, 47.6602] },
    ];

    uwMarkers.forEach((marker) => {
      const el = document.createElement("div");
      el.className = "uw-marker";
      el.style.backgroundColor = "#4CAF50";
      el.style.width = "12px";
      el.style.height = "12px";
      el.style.borderRadius = "50%";
      el.style.cursor = "pointer";

      new maplibregl.Marker(el)
        .setLngLat(marker.coordinates)
        .setPopup(new maplibregl.Popup().setText(marker.title)) // Add popup
        .addTo(mapRef.current);
    });

    uwMarkers.forEach((marker) => {
      marker.coordinates.reverse();
    });

    const fromLoc = uwMarkers[1].coordinates;
    const toLoc = uwMarkers[2].coordinates;

    const url = `https://api.geoapify.com/v1/routing?waypoints=${fromLoc.join(',')}|${toLoc.join(',')}&mode=walk&details=instruction_details&apiKey=${apiKey}`;
    //const url = `https://api.geoapify.com/v1/routing?waypoints=47.6501,-122.3017|47.6536,-122.3078&mode=walk&apiKey=${apiKey}`;

    fetch(url)
    .then((response) => response.json())
    .then((data) => {
      if (data.features && data.features.length > 0) {
        const route = data.features[0]; // Get the first route feature

        // Add the route as a GeoJSON source
        mapRef.current.addSource("route", {
          type: "geojson",
          data: route.geometry,
        });

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

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return <div ref={containerRef} style={{ width: "100%", height: "100vh" }} />;
}
