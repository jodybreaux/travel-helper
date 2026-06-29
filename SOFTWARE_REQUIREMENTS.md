# Travel Helper Application

## Software Requirements Document

**Version:** 2.20  
**Date:** June 29, 2026  
**Status:** Prototype in progress  
**Prepared for:** Jody Breaux  
**Prepared by:** Cajun Travel Services project workspace  
**Distribution:** jodyjbreaux@gmail.com

## Document Control

| Field | Value |
|---|---|
| Document owner | Jody Breaux |
| Project | Travel Helper Application |
| Document type | Software Requirements Document |
| Current version | 2.20 |
| Current status | Prototype in progress |
| Last updated | June 29, 2026 |
| Primary implementation artifact | `index.html` |

## 1. Executive Summary

The Travel Helper Application is a web-based travel planning tool designed to consolidate freely
available information and provide users with travel route planning, resource recommendations, and
real-time or near-real-time travel information.

The application enables users to plan safer and more efficient trips by considering route options,
weather forecasts, dining options, gas stations, traffic conditions, and travel alerts.

### 1.1 Current Prototype Snapshot

| Area | Current Status |
|---|---|
| Primary travel mode | Car travel implemented with live routing |
| Route display | Leaflet/OpenStreetMap map with OSRM route geometry and turn-by-turn directions |
| Meal options | Live OpenStreetMap/Overpass restaurant, cafe, and fast-food recommendations within 2 miles of planned route stops |
| Gas stations | Live OpenStreetMap/Overpass recommendations within 2 miles of planned route stops |
| Weather | National Weather Service active-alert overlays for United States routes |
| User preferences | Theme, date format, timezone, gas toggle, and restaurant toggle UI in place |
| Remaining major gaps | Weather forecasts, real-time traffic incidents, public transit, flights, and full accessibility audit |

## 2. Project Overview

### 2.1 Purpose

Enable users to plan trips with intelligent route recommendations, information integration, and
personalized options for dining and fuel stops.

### 2.2 Scope

- Web-based application.
- Initial prototype focuses on car travel.
- Future support for car, train, bus, and airplane travel modes.
- Integration of freely available third-party APIs and public data sources where practical.
- User preference customization for theme, date format, timezone, restaurants, and gas stations.

### 2.3 Out of Scope For Initial Prototype

- Booking or purchasing tickets and reservations.
- Payment processing.
- User account management or authentication.
- Native mobile applications.
- Production-grade API key management.

## 3. User Input Requirements

### 3.1 Required User Inputs

| Input Field | Description | Format/Constraints | Prototype Status |
|---|---|---|---|
| Date of Departure from Origin | Start date of trip | Date picker | Implemented |
| Time of Departure from Origin | Start time of trip | Time picker | Implemented |
| Departure City/Address | Origin location | Text input with geocoding | Implemented with Nominatim |
| Location of Final Destination | Destination address | Text input with geocoding | Implemented with Nominatim |
| Departure Date from Final Destination | Date user leaves destination | Date picker | Implemented |
| Mode of Travel | Primary travel method | Car, Train, Bus, Airplane | UI implemented; car routing active |

### 3.2 User Preferences

| Preference | Options | Default | Prototype Status |
|---|---|---|---|
| Date Format | US or international standards | US Format | UI implemented |
| Time Zone | IANA timezone | Central Time | UI implemented |
| Theme | Light or Dark mode | Light | Implemented with localStorage |
| Gas Station Display | Toggle on/off | On | UI implemented with mock data |
| Restaurant Display | Toggle on/off | On | Implemented with live OSM restaurant data |

## 4. Functional Requirements

### 4.1 Input Validation

**REQ-4.1.1: Date Format Validation**  
The application shall validate all date inputs based on the user's selected date format preference.

Prototype status:
- Basic browser date validation implemented.
- Logical date ordering implemented.
- Full locale-specific date parsing remains future work.

**REQ-4.1.2: Address Validation**  
The application shall validate departure and destination addresses by attempting to geocode them.

Prototype status:
- Implemented using browser-side Nominatim geocoding.
- Bare 5-digit ZIP inputs are normalized as Texas ZIP searches for the current Austin-area prototype
  flow.
- Geocoding is biased toward central Texas and ranks Texas/Austin/postcode matches ahead of lower
  relevance results to avoid long incorrect routes for nearby ZIPs.
- Unmatched locations produce a user-facing error.

**REQ-4.1.5: Default Trip Values**  
The application shall provide default origin and destination values for rapid prototype testing.

Prototype status:
- Origin defaults to `1105 San Augustine Dr, 78733`.
- Destination defaults to `13601 Golden Wave Loop, 78738`.
- Matching placeholders are kept in sync with the JavaScript default values.

**REQ-4.1.3: Date Logic Validation**  
The application shall validate logical date sequences:

- Departure date from origin must be today or in the future.
- Departure date from destination must be on or after departure date from origin.

Prototype status:
- Implemented for date sequence and future minimum dates.
- Default departure date is set to today.
- Default leave-destination date is set to tomorrow.
- Date fields cascade automatically so leave destination cannot be before departure.
- Arrival-at-destination and desired-return-home fields were removed from the prototype entry form.

**REQ-4.1.4: Mode Of Travel Validation**  
The application shall only calculate routes applicable to the selected transportation mode.

Prototype status:
- Car routes are active.
- Train, bus, and airplane modes show planned-support messaging.

### 4.2 Route Calculation and Display

**REQ-4.2.1: Route Options For Car Travel**  
When car travel is selected, the application shall display at least three route options:

1. Most time-efficient route.
2. Scenic or sightseeing route.
3. Balanced alternative route.

Each route shall display estimated travel time, distance, relevant highlights, and route details.

Prototype status:
- Three route cards are implemented.
- The fastest route card is labeled `Quickest Route`.
- Fastest route uses live OSRM distance and duration.
- Route geometry is displayed on a live Leaflet/OpenStreetMap map.
- Turn-by-turn driving directions are available in a directions panel behind a collapsed-by-default
  toggle so long instruction lists do not dominate the route view.
- Selecting a route hides the other two route cards and shows a link to restore all route options.
- Selecting an available alternate route redraws the map, directions, weather alerts, and meal
  recommendations for that route.
- The live map dynamically fits the selected route into view with an overview zoom cap so short trips
  do not open at an overly detailed street-level scale; users can still zoom in or out manually.
- Changes to trip inputs and user-selectable criteria automatically recalculate the preview.
- Scenic and balanced alternatives use route-specific OSRM geometry when the public routing service
  provides alternatives; if too few alternatives are returned, the prototype requests additional
  route geometries through calculated via-points near the route.

**REQ-4.2.2: Route Options For Train Travel**  
Display available train routes, schedules, stations, and nearby attractions.

Prototype status:
- Not implemented.

**REQ-4.2.3: Route Options For Bus Travel**  
Display available bus routes, schedules, stops, and nearby attractions.

Prototype status:
- Not implemented.

**REQ-4.2.4: Route Options For Airplane Travel**  
Display flight routes, flight times, layovers, airport locations, and weather.

Prototype status:
- Not implemented.

### 4.3 Dining Recommendations

**REQ-4.3.1: Meal Stop Detection**  
The application shall automatically plan recurring meal stops during travel.

Prototype status:
- Implemented for car routes using selected departure date, departure time, selected timezone, and
  OSRM step durations.
- Trips of two hours or less do not request food or gas recommendations.
- Trips over two hours but under four hours use one midpoint recommendation stop.
- Trips of four hours or longer estimate where the car will be every four hours of driving time since
  the trip start or previous stop and label each stop as `Suggested food stop`.
- Four-hour waypoint locations are interpolated by distance along OSRM step geometry so long highway
  segments produce more accurate stop locations.
- Each planned food stop adds one hour of stop time to later trip timing and route travel estimates.
- Each planned food stop includes approximate pass-through time, driving time into the trip including
  prior food stops, nearby road segment, and miles from the origin.

**REQ-4.3.2: Dining Prompts**  
When suggested food stops are detected, the application shall offer restaurant recommendations and
cuisine selection.

Prototype status:
- Restaurant toggle is implemented.
- Cuisine selector remains future work.
- Recommendations are automatically loaded from the calculated food/gas stop waypoints.
- Trips over two hours but shorter than four hours search near the route midpoint and display up to
  five food options when public OSM data is available.

**REQ-4.3.3: Restaurant Display**  
When restaurants are enabled, the application shall display restaurants along the route.

Prototype status:
- Implemented using OpenStreetMap restaurant, cafe, and fast-food data via Overpass.
- The app searches within 2 miles of each calculated waypoint rather than broadly sampling the whole
  route corridor.
- For trips over two hours but shorter than four hours, the app groups recommendations under a
  short-trip midpoint recommendation stop.
- Restaurants are grouped by detected four-hour suggested food stops in the meal panel with
  approximate pass-through time, driving time including prior food stops, miles from origin, nearby
  road segment, cuisine/address details where available, and approximate distance from the stop area.
- Meal search is limited to named restaurants, cafes, and fast-food options within 2 miles of each
  planned route stop.
- If no meal options are found at a planned stop, the app searches ahead in the direction of travel
  and displays the next available options found within 2 miles of a forward route point.
- Each food stop group also lists paired gas options immediately after the food options, and
  alternating group colors distinguish consecutive food/gas stops.
- Each restaurant card includes a clickable Google Maps place link, a Street View action with a
  picture-style icon, and a Google Maps driving-directions link to the restaurant coordinates.
- Restaurants are displayed as map markers.
- Ratings are not available from OSM and remain future work through another provider.

### 4.4 Weather Integration

**REQ-4.4.1: Weather Forecast Retrieval**  
The application shall retrieve weather forecasts for estimated travel dates and route locations.

Prototype status:
- Mock weather content only.

**REQ-4.4.2: Weather Display**  
Weather information shall include temperature, precipitation, wind, visibility, and alerts.

Prototype status:
- Active National Weather Service alerts are implemented for routes inside the United States.
- Alert polygons are drawn as a map overlay using severity-based colors.
- Alert event types and severity are summarized in the weather panel.
- Temperature, precipitation, wind, and visibility forecasts remain future work.

**REQ-4.4.4: Inclement Weather Map Overlay**  
The application shall visually indicate active inclement-weather areas that intersect or surround the
mapped route.

Prototype status:
- Implemented using the National Weather Service active alerts API.
- Alert areas are requested by sampling points along the active driving route.
- Extreme, severe, moderate, and minor alerts use distinct overlay colors and a map legend.
- Overlay support is currently limited to United States routes covered by the NWS API.

**REQ-4.4.3: Weather Impact On Route Calculation**  
The application shall consider weather when estimating travel time and recommending alternatives.

Prototype status:
- Not implemented.

### 4.5 Traffic And Incident Information

**REQ-4.5.1: Traffic Data Integration**  
The application shall identify accidents, incidents, closures, and delays along proposed routes.

Prototype status:
- Mock route highlight only.

**REQ-4.5.2: Traffic Display Format**  
Traffic and incident information shall be presented visually with severity and delay impact.

Prototype status:
- Not implemented.

### 4.6 Gas Station Integration

**REQ-4.6.1: Gas Station Toggle**  
The application shall provide a user-selectable button to toggle gas station display on/off.

Prototype status:
- Implemented as a UI toggle, enabled by default.
- Displays OpenStreetMap fuel station data grouped by the same four-hour route stops used for meal
  recommendations when public Overpass data is available.
- Fuel station search is limited to named fuel options within 2 miles of each planned route stop.
- If no fuel options are found at a planned stop, the app searches ahead in the direction of travel
  and displays the next available options found within 2 miles of a forward route point.
- Trips over two hours but shorter than four hours search near the route midpoint and display up to
  five gas options when public OSM data is available.
- Meal and fuel Overpass requests run independently with request timeouts so one slow lookup does not
  block the other from rendering.
- OpenStreetMap fuel stations without a public name, brand, or operator are displayed as `Fuel
  station` instead of being discarded.
- Forward fallback results show how far ahead of the planned stop they are.

**REQ-4.6.2: Gas Station Information**  
When displayed, gas stations shall show location, route distance, estimated prices, fuel types, and
hours where available.

Prototype status:
- Gas station options also appear immediately after food options in the meal recommendations panel.
- Fuel suggestions are loaded from OpenStreetMap fuel station data via Overpass around the same
  planned waypoint areas used for food recommendations.
- For trips over two hours but shorter than four hours, fuel suggestions are loaded near the route
  midpoint.
- Fuel options are grouped under the paired food stop and sorted near the displayed food options
  when restaurant data is available.
- Each fuel station card includes a clickable Google Maps place link, a Street View action with a
  picture-style icon, and a Google Maps driving-directions link to the station coordinates.

## 5. User Interface Requirements

### 5.1 Theme Support

**REQ-5.1.1: Light And Dark Modes**  
The application shall support light and dark color schemes.

Prototype status:
- Implemented.
- Theme persists across sessions using localStorage.

### 5.2 Responsive Design

The application shall be mobile-first while remaining responsive and functional on desktop, tablet,
and laptop screens where practical.

Prototype status:
- Implemented with responsive CSS breakpoints.
- Trip input text boxes and selectors use compact mobile sizing and aligned field grids, with address
  fields kept full-width for readability.

### 5.3 Navigation And Layout

The application shall guide users through:

1. Input collection.
2. Route calculation and display.
3. Route selection and detailed planning.
4. Final itinerary or summary view.

Prototype status:
- Input collection, route display, map, directions, and detail panels are implemented.
- Landing-page buttons switch between route info, route selection, meals, and gas pages to avoid one
  long scrollable page.
- Landing-page navigation buttons are displayed as a left-side action rail.
- Route entry is shown only after the user selects the route info page.
- Route creation uses a `Create route` submit button that returns users to the route-selection page.
- The route information form is arranged in two columns: departure information on the left and
  destination information on the right, followed by mode of travel and timezone controls.
- Main hero title is `Route-Aware Trip Planning`.
- Footer branding displays `Cajun Travel Services` with app version `v2.11` and UTC build timestamp
  `2026-06-29 14:56 UTC`.
- Location text entry preserves the previous route while the user is typing and waits for field
  change/blur before recalculating route previews.
- Starting a new explicit route creation clears the previously displayed route, map, directions, meal
  recommendations, and gas recommendations before loading the new route.
- Final itinerary view remains future work.

### 5.4 Accessibility

The application shall be keyboard navigable, use semantic HTML, label inputs clearly, and provide
ARIA labels where needed.

Prototype status:
- Basic semantic structure and labels are implemented.
- Formal WCAG 2.1 AA audit remains future work.

## 6. Data Integration Requirements

| Data Need | Candidate Source | Prototype Source | Status |
|---|---|---|---|
| Map tiles | OpenStreetMap | OpenStreetMap via Leaflet | Implemented |
| Geocoding | Google Maps, OSM, similar | Nominatim | Implemented with central Texas ZIP/address bias |
| Driving route geometry | Google Maps, OSRM, similar | OSRM public demo server | Implemented |
| Turn-by-turn directions | Google Maps, OSRM, similar | OSRM public demo server | Implemented |
| Restaurants | Google Places, Yelp, OSM | Overpass / OpenStreetMap | Implemented |
| Weather alerts | National Weather Service, OpenWeatherMap, WeatherAPI | National Weather Service active alerts | Implemented for US routes |
| Weather forecast | OpenWeatherMap, WeatherAPI, similar | None | Future work |
| Traffic incidents | Google Maps, HERE, TomTom | None | Future work |
| Gas stations | Places API, OSM, similar | Overpass / OpenStreetMap | Implemented |
| Public transit | GTFS and transit APIs | None | Future work |
| Flights | Aviationstack or similar | None | Future work |

## 7. Technical Requirements

### 7.1 Current Prototype Stack

- Static HTML, CSS, and JavaScript.
- Leaflet for interactive map display.
- OpenStreetMap tiles.
- Nominatim for geocoding.
- OSRM public demo server for driving route geometry and directions.
- Overpass API for actual restaurant data.
- National Weather Service API for active weather alerts.
- Python static server for local preview.
- Node.js installed locally for JavaScript checks and future tooling.

### 7.2 Installed Development Tooling

- Node.js: v26.4.0
- npm: 11.17.0

### 7.3 Deployment Configuration

- The static prototype is published through GitHub Pages from the `docs/` folder on the `master`
  branch.
- A `docs/.nojekyll` file is used so GitHub Pages serves the static prototype directly without
  running Jekyll.
- Generated document exports are not published with the live static site; the source requirements
  document remains in `SOFTWARE_REQUIREMENTS.md`.

### 7.4 Performance Requirements

- Initial page load target: under 3 seconds.
- Route calculation target: under 5 seconds.
- API response target: under 2 seconds per call where practical.

Prototype note:
- Public free APIs may be slower or rate-limited. Production should use backend aggregation,
  caching, and paid or quota-managed providers where needed.

### 7.5 Security Requirements

- API keys shall not be exposed in frontend code.
- HTTPS shall be used for data transmission.
- Input shall be sanitized to prevent XSS.
- CORS policies shall be configured appropriately.

Prototype status:
- No private API keys are used.
- External API data rendered into HTML is escaped where needed.
- Production backend remains future work.

## 8. Assumptions And Dependencies

### 8.1 Assumptions

- Users have a reliable internet connection.
- Public APIs remain available during prototype use.
- Trip planning is initially focused on car travel.
- Mobile-responsive web design is preferred over native mobile apps.

### 8.2 External Dependencies

- Leaflet CDN.
- OpenStreetMap tile servers.
- Nominatim geocoding.
- OSRM public demo server.
- Overpass API.
- National Weather Service API.

Production note:
- Public demo and community APIs are suitable for prototype validation but should not be treated as
  production SLA-backed services.

## 9. Acceptance Criteria

### 9.1 Functional Acceptance Criteria

- [x] Application accepts required user inputs.
- [x] Application validates basic date sequence logic.
- [x] Application cascades date changes through dependent trip dates.
- [x] Application geocodes origin and destination addresses.
- [x] Application resolves nearby Austin ZIP trips such as `78733` to `78738` as local routes.
- [x] Application calculates and displays a live car route.
- [x] Application displays route geometry on a map.
- [x] Application displays turn-by-turn driving directions.
- [x] Application defaults detailed driving turns to hidden and lets the user toggle them open or
      closed.
- [x] Application recalculates route details when user-selectable trip criteria change.
- [x] Application collapses route choices to the selected route with a link to restore all options.
- [x] Application redraws route-specific map and detail data when an alternate route is selected.
- [x] Application clears prior route results when the user creates a different route from the route
      information screen.
- [x] Application frames the full selected route on the map without over-zooming short trips.
- [x] Application displays actual restaurants, cafes, and fast-food options along the route.
- [x] Application targets meal recommendations every four hours of driving time for trips of four
      hours or longer.
- [x] Application uses one midpoint recommendation stop for trips over two hours but shorter than four
      hours.
- [x] Application limits meal and gas recommendation searches to within 2 miles of the active route
      waypoint.
- [x] Application displays up to five food and five gas recommendations for trips under four hours
      when available from public OSM data.
- [x] Application ties restaurant and gas recommendations to shared route stops with approximate
      pass-through times, one-hour food-stop timing, and miles from origin.
- [x] Application provides clickable place links, Street View links, and driving-directions links for
      displayed restaurant and gas station cards.
- [x] Application displays active inclement-weather alert overlays for US routes.
- [x] Application displays gas stations when toggle is enabled.
- [x] Application coordinates gas station suggestions with the same four-hour stop areas used for
      food choices instead of repeating a static station list.
- [x] Application calculates and displays up to three route-specific live car route geometries,
      using calculated via-points to fill missing alternatives when the public OSRM service returns
      too few direct alternatives.
- [ ] Application displays weather forecasts for travel dates and locations.
- [ ] Application identifies and displays real-time traffic incidents.
- [ ] Application supports live train, bus, and airplane modes.
- [ ] All dates display in user-selected format.
- [ ] All times display in user-selected timezone.
- [x] Light and dark themes are functional and visually distinct.

### 9.2 Non-Functional Acceptance Criteria

- [ ] Application loads in under 3 seconds on 4G connection.
- [ ] Route calculations complete in under 5 seconds.
- [x] Application is responsive on mobile, tablet, and desktop devices.
- [ ] Application meets WCAG 2.1 AA accessibility standards.
- [x] No API keys are exposed in frontend code.
- [x] External data transmission uses HTTPS.

## 10. Running Progress Log

### June 25, 2026

- Created project at `/Users/breaux/travel-helper`.
- Initialized git repository.
- Built dependency-free static prototype with `index.html`, `styles.css`, and `app.js`.
- Added responsive trip input form, route cards, theme toggle, mock weather, mock gas stations, and
  restaurant preference toggle.
- Started local preview server at `http://localhost:5173`.
- Added Leaflet/OpenStreetMap map section.
- Added Nominatim geocoding for origin and destination.
- Added OSRM driving route calculation, route geometry, and turn-by-turn directions.
- Added actual restaurant lookup along the route using Overpass/OpenStreetMap data.
- Added restaurant markers to the map.
- Added National Weather Service active-alert overlay for inclement weather on the map.
- Added weather severity legend and weather-alert summary panel.
- Added departure time input.
- Updated restaurant recommendations to use actual restaurants near route areas encountered during
  breakfast, lunch, or dinner windows based on route timing.
- Added default Austin-area test addresses for origin and destination.
- Added central Texas ZIP/address geocoding bias to prevent nearby Austin ZIP trips from resolving
  to distant routes.
- Added nearby food fallback for short local trips that do not cross a standard meal window.
- Updated hero/footer copy, route labels, date defaults, route-selection display, and automatic
  recalculation on user criteria changes.
- Added guided route info, route selection, meals, and gas pages.
- Added cascading date updates and fixed-time breakfast, lunch, and dinner route-location meal
  targeting.
- Updated landing navigation to a left-side action rail and made route entry its own selectable page.
- Updated alternate route selection to redraw the map and route-specific details.
- Installed Node.js and npm through Homebrew.
- Verified `node --check app.js`.
- Created this dedicated requirements file and made it the ongoing place for SRD updates.
- Tuned the trip input form for mobile-first field sizing and alignment while preserving desktop and
  tablet layouts.
- Refined meal recommendations to focus on detected breakfast, lunch, and dinner route positions,
  group restaurant options by meal stop, and avoid generic nearby-food fallback suggestions.
- Reworked trip-stop planning to calculate shared food and gas stops every four hours of driving and
  display each stop's approximate mileage from the origin.
- Added one-hour food-stop time to trip timing, renamed food groups to `Suggested food stop`, paired
  gas options under each food stop, and alternated food/gas group colors.
- Improved location entry resilience so partial typing does not clear the current route and
  geocoding failures keep the previous successful route visible.
- Added route-refresh recovery so each route card is backed by its own route geometry where possible,
  alternate selections redraw the map from route-specific data, and browser cache-busting asset
  versions force the latest frontend script and styles to load.
- Added Street View picture-icon links and driving-directions links to each shared food/gas stop
  area, with cache-busting asset versions for the published frontend.
- Moved map actions onto each displayed restaurant and gas station card, with clickable Google Maps
  place links and place-specific Street View/directions targets.
- Replaced the repeating mock fuel list with Overpass/OpenStreetMap fuel station lookup near the
  same four-hour food-stop areas and sorted gas options near displayed food choices when available.

### June 29, 2026

- Renamed the route options section heading to `Trip Options`.
- Capped the automatic live route map overview zoom while continuing to fit the full selected trip in
  view and leaving manual zoom controls available.
- Added a collapsed-by-default toggle for detailed turn-by-turn driving instructions.
- Added food and gas recommendations for trips under four hours using a route-midpoint search, with
  up to five options of each when available.
- Removed `Arrival at destination` and `Desired return home` from the trip entry form and renamed
  `Transportation` to `Mode of Travel`.
- Added a footer build stamp showing app version `v2.10` and build timestamp
  `2026-06-29 14:41 UTC`.
- Refined this SRD into a distribution-ready professional format with document-control metadata and
  a current prototype status snapshot.
- Limited meal and gas recommendations to results within 2 miles of the active route stop area.
- Renamed the route form submit button to `Create route` and kept the submit flow on the route
  selection screen.
- Reorganized the route information form into departure and destination columns with mode of travel
  and timezone controls below.
- Updated frontend asset cache-busting and footer stamp to app version `v2.11`.
- Added `.nojekyll` deployment configuration so GitHub Pages serves the static app directly.
- Removed generated document exports from the published branch to keep the GitHub Pages build focused
  on the static prototype.
- Fixed stale route results so creating a different route immediately clears the prior route display
  before loading the new results.
- Updated frontend asset cache-busting and footer stamp to app version `v2.12`.
- Moved GitHub Pages publishing to a clean `docs/` static-site folder to avoid legacy Pages build
  failures from repository support files.
- Updated meal and gas lookups to search sampled points along the route corridor instead of only the
  active midpoint or four-hour stop point.
- Expanded meal lookup to include OpenStreetMap restaurants, cafes, and fast-food locations.
- Updated frontend asset cache-busting and footer stamp to app version `v2.13`.
- Revised meal and gas lookup logic to search only the planned waypoint locations: a midpoint stop for
  trips over two hours and under four hours, and recurring four-hour driving stops for longer trips.
- Improved waypoint placement by interpolating distance along route geometry instead of selecting an
  approximate coordinate by geometry-array position.
- Added Overpass request timeouts and parallel meal/fuel lookups so recommendation panels do not stay
  stuck behind a slow public API response.
- Updated frontend asset cache-busting and footer stamp to app version `v2.14`.
- Kept unnamed OSM fuel station records visible with a generic `Fuel station` label.
- Updated frontend asset cache-busting and footer stamp to app version `v2.15`.
- Added forward fallback searches so empty planned stops can use the next available food or fuel
  options in the direction of travel.
- Updated frontend asset cache-busting and footer stamp to app version `v2.16`.

## 11. Glossary

- **API:** Application Programming Interface.
- **CORS:** Cross-Origin Resource Sharing.
- **GTFS:** General Transit Feed Specification.
- **IANA Timezone:** Internet Assigned Numbers Authority timezone identifier.
- **Nominatim:** OpenStreetMap geocoding service.
- **OSM:** OpenStreetMap.
- **OSRM:** Open Source Routing Machine.
- **Overpass:** Query API for OpenStreetMap data.
- **POI:** Point of Interest.
- **WCAG:** Web Content Accessibility Guidelines.
- **XSS:** Cross-Site Scripting.

## Document History

| Version | Date | Changes |
|---|---|---|
| 1.0 | June 25, 2026 | Initial SRD provided by user |
| 1.1 | June 25, 2026 | Added prototype status, implementation decisions, data integrations, and progress log |
| 1.2 | June 25, 2026 | Added active inclement-weather map overlay requirement and implementation status |
| 1.3 | June 25, 2026 | Added departure time and time-aware meal-window restaurant recommendations |
| 1.4 | June 25, 2026 | Added default address, Austin-area ZIP geocoding, and short-trip restaurant fallback status |
| 1.5 | June 25, 2026 | Added route-selection collapse, automatic recalculation, date defaults, and branding updates |
| 1.6 | June 25, 2026 | Added guided pages, cascading dates, and fixed-time meal targeting status |
| 1.7 | June 25, 2026 | Added alternate route redraw and landing action rail status |
| 1.8 | June 25, 2026 | Added mobile-first form field sizing and alignment status |
| 1.9 | June 25, 2026 | Refined breakfast, lunch, and dinner route-position restaurant recommendations |
| 2.0 | June 25, 2026 | Added four-hour shared food and gas stops with mileage from origin |
| 2.1 | June 25, 2026 | Added one-hour food-stop timing, paired gas listings, and alternating stop colors |
| 2.2 | June 25, 2026 | Improved route-entry resilience during location edits and geocoding failures |
| 2.3 | June 25, 2026 | Added via-point route fallback generation and static asset cache busting |
| 2.4 | June 25, 2026 | Added Street View and driving-directions links for shared food/gas stops |
| 2.5 | June 25, 2026 | Moved map and Street View actions to displayed food and gas place cards |
| 2.6 | June 25, 2026 | Replaced repeating mock fuel options with coordinated live OSM fuel suggestions |
| 2.7 | June 29, 2026 | Added capped route overview zoom and updated route options heading copy |
| 2.8 | June 29, 2026 | Defaulted detailed turn-by-turn directions to a collapsed toggle |
| 2.9 | June 29, 2026 | Added short-trip food/gas recommendations and simplified trip entry fields |
| 2.10 | June 29, 2026 | Added footer app version and UTC build timestamp |
| 2.11 | June 29, 2026 | Added professional document-control formatting and current prototype status snapshot |
| 2.12 | June 29, 2026 | Added two-mile meal/gas search radius, route creation copy, and two-column route form layout |
| 2.13 | June 29, 2026 | Added GitHub Pages `.nojekyll` deployment configuration |
| 2.14 | June 29, 2026 | Removed generated document exports from published static site branch |
| 2.15 | June 29, 2026 | Fixed stale route results when creating a different route |
| 2.16 | June 29, 2026 | Moved GitHub Pages publishing source to `docs/` |
| 2.17 | June 29, 2026 | Updated meal and gas lookups to sample the 2-mile route corridor |
| 2.18 | June 29, 2026 | Revised meal and gas lookups to use planned stop waypoints only |
| 2.19 | June 29, 2026 | Added Overpass timeout handling and unnamed fuel station fallback |
| 2.20 | June 29, 2026 | Added forward fallback lookup for planned stops without nearby food or fuel |
