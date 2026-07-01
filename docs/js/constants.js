export const ROUTE_TEMPLATES = [
  {
    type: "Fastest",
    title: "Quickest Route",
    score: "Best time",
    time: "7h 12m",
    distance: "472 mi",
    summary: "Prioritizes major highways and avoids known construction near metro areas.",
    highlights: ["Low delay", "2 weather checks", "Food + gas stops"],
  },
  {
    type: "Scenic",
    title: "River & Landmarks",
    score: "Most POIs",
    time: "8h 05m",
    distance: "498 mi",
    summary: "Adds landmark-rich segments and a more relaxed suggested food stop near a downtown district.",
    highlights: ["6 attractions", "Food + gas stops", "Photo stops"],
  },
  {
    type: "Balanced",
    title: "Smart Alternate",
    score: "Recommended",
    time: "7h 34m",
    distance: "486 mi",
    summary: "Balances arrival time, traffic exposure, weather conditions, and attractions.",
    highlights: ["4 attractions", "Avoids delays", "Food + gas stops"],
  },
];

export const ROUTE_RECOMMENDATION_SEARCH_RADIUS_METERS = 3219;
export const ROUTE_RECOMMENDATION_SEARCH_RADIUS_MILES = 2;
export const TRIP_STOP_INTERVAL_SECONDS = 4 * 60 * 60;
export const FOOD_STOP_DURATION_SECONDS = 60 * 60;
export const FORWARD_RECOMMENDATION_INTERVAL_SECONDS = 15 * 60;
export const FORWARD_RECOMMENDATION_LOOKAHEAD_SECONDS = 2 * 60 * 60;
export const FORWARD_RECOMMENDATION_RETRY_POINTS = 2;
export const FOOD_FORWARD_RECOMMENDATION_LOOKAHEAD_MILES = 50;
export const OVERPASS_REQUEST_TIMEOUT_MS = 12000;
export const OVERPASS_RESULT_LIMIT = 40;
export const MAX_RESTAURANTS_PER_STOP = 3;
export const MAX_FUEL_STATIONS_PER_STOP = 3;
export const SHORT_TRIP_RECOMMENDATION_LIMIT = 5;
export const ROUTE_OPTION_COUNT = ROUTE_TEMPLATES.length;
export const MAX_SYNTHETIC_ROUTE_ATTEMPTS = 12;
export const ROUTE_OVERVIEW_MAX_ZOOM = 11;
export const ROUTE_OVERVIEW_PADDING = [48, 48];

export const DEFAULT_ORIGIN = "1105 San Augustine Dr, 78733";
export const DEFAULT_DESTINATION = "13601 Golden Wave Loop, 78738";
export const CENTRAL_TEXAS_VIEWBOX = "-98.25,30.75,-97.25,30.0";

export const APP_VERSION = "v2.35";
export const APP_BUILD = "2026-07-01 22:15 UTC";

export const RECENT_ROUTE_LIMIT = 10;
export const NEAR_ME_SEARCH_RADIUS_METERS = 8047;
export const NEAR_ME_SEARCH_RADIUS_MILES = 5;
export const NEAR_ME_FOOD_LIMIT = 10;
export const NEAR_ME_FUEL_LIMIT = 3;
