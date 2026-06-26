# Travel Helper Prototype

A dependency-free static prototype for the Travel Helper Application requirements.

## Run Locally

```bash
python3 -m http.server 5173
```

Then open `http://localhost:5173`.

## Included

- Trip input form with date logic validation
- Live driving map using Leaflet and OpenStreetMap tiles
- Browser-side geocoding with Nominatim
- Driving route geometry and directions from the public OSRM demo server
- Four-hour suggested food stops with restaurant recommendations from OpenStreetMap via Overpass
- Active inclement-weather alert overlay from the National Weather Service
- Mock supplemental route recommendations
- Theme toggle with `localStorage` persistence
- Restaurant and gas station toggles
- Responsive layout for desktop, tablet, and smaller screens

The current prototype uses live map/routing/restaurant/weather-alert data and mock supplemental data
for gas stations, traffic, and POIs so the product flow can be reviewed before full API
integration.
