# Travel Helper Prototype

A dependency-free static prototype for the Travel Helper Application requirements.

## Run Locally

```bash
python3 -m http.server 5173
```

Then open `http://localhost:5173`.

If another process is already using or wedging port `5173`, use another static-server port:

```bash
python3 -m http.server 5174
```

## Included

- Multi-page layout with separate HTML files for home, route info, routes, meals, and gas
- Trip input form with date logic validation
- Live driving map using Leaflet and OpenStreetMap tiles
- Browser-side geocoding with Nominatim
- Driving route geometry and directions from the public OSRM demo server
- Suggested food and gas stops near route waypoints using Geoapify Places (free tier) with OpenStreetMap Overpass fallback
- Active inclement-weather alert overlay from the National Weather Service
- Mock supplemental route recommendations
- Theme toggle with `localStorage` persistence
- Restaurant and gas station toggles
- Responsive layout for desktop, tablet, and smaller screens

The current prototype uses live map, routing, restaurant, gas station, and weather-alert data plus
mock supplemental data for traffic and POIs so the product flow can be reviewed before full API
integration.

## Publish

GitHub Pages deploys the static app from the `docs/` folder on `master` through GitHub Actions.
Keep the root app files and their copies in `docs/` in sync before publishing.

### Geoapify Places API (food and gas)

Food and gas lookups use the [Geoapify Places API](https://www.geoapify.com/places-api/) free tier
(3,000 credits/day) for fast nearby results, with Overpass as fallback when no key is configured.

1. Create a free API key at [Geoapify MyProjects](https://myprojects.geoapify.com/).
2. Restrict the key to your GitHub Pages URL (for example, `https://jodybreaux.github.io/travel-helper/*`).
3. Add the key as a repository secret:

```bash
gh secret set GEOAPIFY_API_KEY
```

4. Push to `master`. The deploy workflow injects the key into the published `docs/js/places-config.js`
   artifact without committing it to git.

For local development, copy `js/places-config.example.js` to `js/places-config.js` and add your key.
