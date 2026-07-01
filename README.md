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

GitHub Pages serves the static app from the `docs/` folder on `master`. Keep the root app files
and their copies in `docs/` in sync before publishing.

### Geoapify Places API (food and gas)

Food and gas lookups use the [Geoapify Places API](https://www.geoapify.com/places-api/) free tier
(3,000 credits/day) for fast nearby results, with Overpass as fallback when no key is configured.

1. Create a free API key at [Geoapify MyProjects](https://myprojects.geoapify.com/).
2. Restrict the key to your GitHub Pages URL (for example, `https://jodybreaux.github.io/travel-helper/*`).
3. Add the key to both `js/places-config.js` and `docs/js/places-config.js`:

```javascript
export const GEOAPIFY_API_KEY = "your-geoapify-api-key";
```

4. Push to `master`.

Optional: add `.github/workflows/deploy-pages.yml` and a `GEOAPIFY_API_KEY` repository secret so the
key is injected at deploy time instead of being committed to git. Switch GitHub Pages to the
**GitHub Actions** source after adding the workflow.
