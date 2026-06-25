# Software Requirements Document

## Travel Helper Application

**Version:** 1.1  
**Date:** June 25, 2026  
**Status:** Draft, prototype in progress  

## 1. Executive Summary

The Travel Helper Application is a web-based travel planning tool designed to consolidate freely
available information and provide users with travel route planning, resource recommendations, and
real-time or near-real-time travel information.

The application enables users to plan safer and more efficient trips by considering route options,
weather forecasts, dining options, gas stations, traffic conditions, and travel alerts.

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
| Departure City/Address | Origin location | Text input with geocoding | Implemented with Nominatim |
| Date(s) at Final Destination | Arrival date at destination | Date picker | Implemented |
| Location of Final Destination | Destination address | Text input with geocoding | Implemented with Nominatim |
| Departure Date from Final Destination | Date user leaves destination | Date picker | Implemented |
| Desired Arrival Date at Origin | Target return date | Date picker | Implemented |
| Mode of Transportation | Primary travel method | Car, Train, Bus, Airplane | UI implemented; car routing active |

### 3.2 User Preferences

| Preference | Options | Default | Prototype Status |
|---|---|---|---|
| Date Format | US or international standards | US Format | UI implemented |
| Time Zone | IANA timezone | Central Time | UI implemented |
| Theme | Light or Dark mode | Light | Implemented with localStorage |
| Gas Station Display | Toggle on/off | Off | UI implemented with mock data |
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
- Unmatched locations produce a user-facing error.

**REQ-4.1.3: Date Logic Validation**  
The application shall validate logical date sequences:

- Departure date from origin must be before arrival date at destination.
- Departure date from destination must be after arrival date at destination.
- Arrival date at origin must be after departure date from destination.
- All dates must be today or in the future.

Prototype status:
- Implemented for date sequence and future minimum dates.

**REQ-4.1.4: Transportation Mode Validation**  
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
- Fastest route uses live OSRM distance and duration.
- Route geometry is displayed on a live Leaflet/OpenStreetMap map.
- Turn-by-turn driving directions are displayed in a directions panel.
- Scenic and balanced alternatives currently use mock supplemental route data.

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

**REQ-4.3.1: Meal Time Detection**  
The application shall automatically detect standard meal-time windows during travel.

Prototype status:
- UI copy currently indicates meal-window detection.
- Time-based detection logic remains future work.

**REQ-4.3.2: Dining Prompts**  
When meal times are detected, the application shall offer restaurant recommendations and cuisine
selection.

Prototype status:
- Restaurant toggle is implemented.
- Cuisine selector remains future work.

**REQ-4.3.3: Restaurant Display**  
When restaurants are enabled, the application shall display restaurants along the route.

Prototype status:
- Implemented using OpenStreetMap restaurant data via Overpass.
- The app samples points along the calculated driving route and fetches nearby named restaurants.
- Restaurants are listed in the meal panel and displayed as map markers.
- Ratings are not available from OSM and remain future work through another provider.

### 4.4 Weather Integration

**REQ-4.4.1: Weather Forecast Retrieval**  
The application shall retrieve weather forecasts for estimated travel dates and route locations.

Prototype status:
- Mock weather content only.

**REQ-4.4.2: Weather Display**  
Weather information shall include temperature, precipitation, wind, visibility, and alerts.

Prototype status:
- Mock weather content only.

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
- Implemented as a UI toggle.
- Currently displays mock gas station data.

**REQ-4.6.2: Gas Station Information**  
When displayed, gas stations shall show location, route distance, estimated prices, fuel types, and
hours where available.

Prototype status:
- Mock data only.

## 5. User Interface Requirements

### 5.1 Theme Support

**REQ-5.1.1: Light And Dark Modes**  
The application shall support light and dark color schemes.

Prototype status:
- Implemented.
- Theme persists across sessions using localStorage.

### 5.2 Responsive Design

The application shall be responsive and functional on desktop, tablet, and smaller screens where
practical.

Prototype status:
- Implemented with responsive CSS breakpoints.

### 5.3 Navigation And Layout

The application shall guide users through:

1. Input collection.
2. Route calculation and display.
3. Route selection and detailed planning.
4. Final itinerary or summary view.

Prototype status:
- Input collection, route display, map, directions, and detail panels are implemented.
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
| Geocoding | Google Maps, OSM, similar | Nominatim | Implemented |
| Driving route geometry | Google Maps, OSRM, similar | OSRM public demo server | Implemented |
| Turn-by-turn directions | Google Maps, OSRM, similar | OSRM public demo server | Implemented |
| Restaurants | Google Places, Yelp, OSM | Overpass / OpenStreetMap | Implemented |
| Weather | OpenWeatherMap, WeatherAPI, similar | None | Future work |
| Traffic incidents | Google Maps, HERE, TomTom | None | Future work |
| Gas stations | Places API, OSM, similar | Mock data | Future work |
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
- Python static server for local preview.
- Node.js installed locally for JavaScript checks and future tooling.

### 7.2 Installed Development Tooling

- Node.js: v26.4.0
- npm: 11.17.0

### 7.3 Performance Requirements

- Initial page load target: under 3 seconds.
- Route calculation target: under 5 seconds.
- API response target: under 2 seconds per call where practical.

Prototype note:
- Public free APIs may be slower or rate-limited. Production should use backend aggregation,
  caching, and paid or quota-managed providers where needed.

### 7.4 Security Requirements

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

Production note:
- Public demo and community APIs are suitable for prototype validation but should not be treated as
  production SLA-backed services.

## 9. Acceptance Criteria

### 9.1 Functional Acceptance Criteria

- [x] Application accepts required user inputs.
- [x] Application validates basic date sequence logic.
- [x] Application geocodes origin and destination addresses.
- [x] Application calculates and displays a live car route.
- [x] Application displays route geometry on a map.
- [x] Application displays turn-by-turn driving directions.
- [x] Application displays actual restaurants along the route.
- [x] Application displays gas stations when toggle is enabled.
- [ ] Application calculates three fully distinct live car routes.
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
- Installed Node.js and npm through Homebrew.
- Verified `node --check app.js`.
- Created this dedicated requirements file and made it the ongoing place for SRD updates.

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
