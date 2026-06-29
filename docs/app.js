const routes = [
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

const ROUTE_RECOMMENDATION_SEARCH_RADIUS_METERS = 3219;
const ROUTE_RECOMMENDATION_SEARCH_RADIUS_MILES = 2;
const TRIP_STOP_INTERVAL_SECONDS = 4 * 60 * 60;
const FOOD_STOP_DURATION_SECONDS = 60 * 60;
const FORWARD_RECOMMENDATION_INTERVAL_SECONDS = 15 * 60;
const FORWARD_RECOMMENDATION_LOOKAHEAD_SECONDS = 2 * 60 * 60;
const FORWARD_RECOMMENDATION_RETRY_POINTS = 2;
const OVERPASS_REQUEST_TIMEOUT_MS = 18000;
const MAX_RESTAURANTS_PER_STOP = 3;
const MAX_FUEL_STATIONS_PER_STOP = 3;
const SHORT_TRIP_RECOMMENDATION_LIMIT = 5;
const ROUTE_OPTION_COUNT = routes.length;
const MAX_SYNTHETIC_ROUTE_ATTEMPTS = 12;
const ROUTE_OVERVIEW_MAX_ZOOM = 11;
const ROUTE_OVERVIEW_PADDING = [48, 48];

const DEFAULT_ORIGIN = "1105 San Augustine Dr, 78733";
const DEFAULT_DESTINATION = "13601 Golden Wave Loop, 78738";
const CENTRAL_TEXAS_VIEWBOX = "-98.25,30.75,-97.25,30.0";

const root = document.documentElement;
const themeToggle = document.querySelector("#themeToggle");
const themeLabel = document.querySelector("#themeLabel");
const tripForm = document.querySelector("#tripForm");
const formMessage = document.querySelector("#formMessage");
const pageButtons = document.querySelectorAll("[data-page-target]");
const appPages = document.querySelectorAll("[data-page]");
const routeGrid = document.querySelector("#routeGrid");
const gasToggle = document.querySelector("#gasToggle");
const restaurantToggle = document.querySelector("#restaurantToggle");
const restaurantList = document.querySelector("#restaurantList");
const gasPanel = document.querySelector("#gasPanel");
const mapStatus = document.querySelector("#mapStatus");
const routeSummary = document.querySelector("#routeSummary");
const directionsToggle = document.querySelector("#directionsToggle");
const directionsList = document.querySelector("#directionsList");
const weatherList = document.querySelector("#weatherList");

let map;
let routeLayer;
let originMarker;
let destinationMarker;
let restaurantMarkers;
let weatherAlertLayer;
let activeRestaurants = [];
let activeFuelStations = [];
let activeTripStops = [];
let activeRouteOptions = [];
let activeOrigin;
let activeDestination;
let activeDepartureAt;
let selectedRouteIndex = null;
let previewRequestId = 0;
let recommendationLoading = {
  restaurants: false,
  fuel: false,
};

function setTheme(theme) {
  root.dataset.theme = theme;
  localStorage.setItem("travel-helper-theme", theme);
  themeLabel.textContent = theme === "dark" ? "Light" : "Dark";
}

function getToday() {
  return new Date().toISOString().split("T")[0];
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

function ensureDateAtLeast(input, minValue) {
  input.min = minValue;
  if (!input.value || input.value < minValue) {
    input.value = minValue;
  }
}

function setDefaultDates() {
  const today = getToday();
  const tomorrowValue = addDays(today, 1);
  const defaults = {
    departDate: today,
    returnDate: tomorrowValue,
  };

  Object.entries(defaults).forEach(([id, value]) => {
    const input = document.querySelector(`#${id}`);
    input.value = value;
    input.min = today;
  });

  syncDateSequence();
}

function setDefaultTripValues() {
  document.querySelector("#origin").value = DEFAULT_ORIGIN;
  document.querySelector("#destination").value = DEFAULT_DESTINATION;
}

function showPage(pageName, { scroll = true } = {}) {
  appPages.forEach((page) => {
    page.classList.toggle("active", page.dataset.page === pageName);
  });

  pageButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.pageTarget === pageName);
  });

  if (pageName === "routes" && map) {
    setTimeout(() => map.invalidateSize(), 0);
  }

  if (scroll) {
    document.querySelector(`[data-page="${pageName}"]`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }
}

function syncDateSequence(changedId = "") {
  const departDate = document.querySelector("#departDate");
  const returnDate = document.querySelector("#returnDate");
  const today = getToday();

  ensureDateAtLeast(departDate, today);
  ensureDateAtLeast(returnDate, departDate.value);

  if (changedId === "departDate") {
    ensureDateAtLeast(returnDate, departDate.value);
  }
}

function debounce(callback, delay = 300) {
  let timeoutId;

  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => callback(...args), delay);
  };
}

function normalizeLocationQuery(query) {
  const trimmed = query.trim();
  return /^\d{5}$/.test(trimmed) ? `${trimmed}, Texas, United States` : trimmed;
}

function getGeocodeScore(result, originalQuery) {
  const address = result.address || {};
  const displayName = (result.display_name || "").toLowerCase();
  const query = originalQuery.trim();
  let score = 0;

  if (address.state === "Texas") score += 50;
  if (address.city === "Austin" || address.town === "Austin" || address.village === "Austin") score += 20;
  if (address.postcode && query.length >= 5 && address.postcode.startsWith(query.slice(0, 5))) score += 40;
  if (displayName.includes("austin")) score += 10;
  if (displayName.includes("texas")) score += 10;

  return score + Number(result.importance || 0);
}

function getBestGeocodeResult(results, originalQuery) {
  return [...results].sort((a, b) => getGeocodeScore(b, originalQuery) - getGeocodeScore(a, originalQuery))[0];
}

function initMap() {
  if (!window.L) {
    mapStatus.textContent = "Map library did not load. Check your internet connection and refresh.";
    return;
  }

  map = L.map("drivingMap", {
    scrollWheelZoom: false,
  }).setView([39.5, -88.5], 6);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  restaurantMarkers = L.layerGroup().addTo(map);
  weatherAlertLayer = L.layerGroup().addTo(map);
  addWeatherLegend();
}

function formatDistance(meters) {
  return `${(meters / 1609.344).toFixed(0)} mi`;
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatMealTime(date) {
  const timezone = document.querySelector("#timezone").value;

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(date);
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function addWeatherLegend() {
  const legend = L.control({ position: "bottomright" });

  legend.onAdd = () => {
    const container = L.DomUtil.create("div", "weather-legend");
    container.innerHTML = `
      <strong>Weather Alerts</strong>
      <span><i style="background:#7f1d1d"></i>Extreme</span>
      <span><i style="background:#dc2626"></i>Severe</span>
      <span><i style="background:#f59e0b"></i>Moderate</span>
      <span><i style="background:#facc15"></i>Minor</span>
    `;
    return container;
  };

  legend.addTo(map);
}

async function geocodeLocation(query) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "us");
  url.searchParams.set("viewbox", CENTRAL_TEXAS_VIEWBOX);
  url.searchParams.set("q", normalizeLocationQuery(query));

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not geocode ${query}.`);
  }

  const results = await response.json();
  if (!results.length) {
    throw new Error(`No location found for "${query}".`);
  }

  const bestResult = getBestGeocodeResult(results, query);

  return {
    name: bestResult.display_name,
    lat: Number(bestResult.lat),
    lon: Number(bestResult.lon),
  };
}

async function fetchAddressSuggestions(query) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "us");
  url.searchParams.set("viewbox", CENTRAL_TEXAS_VIEWBOX);
  url.searchParams.set("q", normalizeLocationQuery(query));

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Address suggestions are unavailable right now.");
  }

  return response.json();
}

function renderAddressSuggestions(datalist, suggestions) {
  datalist.innerHTML = suggestions
    .map((suggestion) => `<option value="${escapeHtml(suggestion.display_name)}"></option>`)
    .join("");
}

function setupAddressAutocomplete(inputSelector, datalistSelector) {
  const input = document.querySelector(inputSelector);
  const datalist = document.querySelector(datalistSelector);
  let requestId = 0;

  input.addEventListener(
    "input",
    debounce(async () => {
      const query = input.value.trim();
      const currentRequestId = ++requestId;

      datalist.innerHTML = "";
      if (query.length < 3) return;

      try {
        const suggestions = await fetchAddressSuggestions(query);
        if (currentRequestId !== requestId) return;
        renderAddressSuggestions(datalist, suggestions);
      } catch {
        datalist.innerHTML = "";
      }
    }),
  );
}

function buildRouteCoordinates(points) {
  return points.map((point) => `${point.lon},${point.lat}`).join(";");
}

async function fetchOsrmRoutes(points, alternatives = "3") {
  const coordinates = buildRouteCoordinates(points);
  const url = new URL(`https://router.project-osrm.org/route/v1/driving/${coordinates}`);
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("steps", "true");
  url.searchParams.set("alternatives", alternatives);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Driving directions could not be calculated.");
  }

  const data = await response.json();
  if (data.code !== "Ok" || !data.routes.length) {
    throw new Error("No driving route found for those locations.");
  }

  return data.routes;
}

function getRouteCoordinateAtFraction(route, fraction) {
  const coordinates = route.geometry?.coordinates || [];
  if (!coordinates.length) return null;

  const index = Math.max(0, Math.min(coordinates.length - 1, Math.round((coordinates.length - 1) * fraction)));
  const [lon, lat] = coordinates[index];
  return { lon, lat };
}

function getRouteSignature(route) {
  return [0.12, 0.3, 0.5, 0.7, 0.88]
    .map((fraction) => {
      const point = getRouteCoordinateAtFraction(route, fraction);
      return point ? `${point.lon.toFixed(3)},${point.lat.toFixed(3)}` : "";
    })
    .join("|");
}

function addUniqueRoutes(routeOptions, candidates) {
  const signatures = new Set(routeOptions.map(getRouteSignature));

  candidates.forEach((route) => {
    const signature = getRouteSignature(route);
    if (!signature || signatures.has(signature)) return;

    signatures.add(signature);
    routeOptions.push(route);
  });
}

function getSyntheticWaypoint(route, attemptIndex) {
  const routeFractions = [0.4, 0.6, 0.5, 0.3, 0.7];
  const fraction = routeFractions[Math.floor(attemptIndex / 2) % routeFractions.length];
  const offsetScale = 1 + Math.floor(attemptIndex / (routeFractions.length * 2)) * 0.75;
  const start = getRouteCoordinateAtFraction(route, 0.25);
  const mid = getRouteCoordinateAtFraction(route, fraction);
  const end = getRouteCoordinateAtFraction(route, 0.75);
  if (!start || !mid || !end) return null;

  const deltaLon = end.lon - start.lon;
  const deltaLat = end.lat - start.lat;
  const length = Math.hypot(deltaLon, deltaLat) || 1;
  const routeMiles = (route.distance || 0) / 1609.344;
  const offsetDegrees = Math.min(0.22, Math.max(0.006, routeMiles / 2400) * offsetScale);
  const direction = attemptIndex % 2 === 0 ? 1 : -1;

  return {
    lon: mid.lon + (-deltaLat / length) * offsetDegrees * direction,
    lat: mid.lat + (deltaLon / length) * offsetDegrees * direction,
  };
}

async function fetchDrivingRoute(origin, destination) {
  const routeOptions = [];
  const directRoutes = await fetchOsrmRoutes([origin, destination], "3");
  addUniqueRoutes(routeOptions, directRoutes);

  for (
    let attemptIndex = 0;
    routeOptions.length < ROUTE_OPTION_COUNT && attemptIndex < MAX_SYNTHETIC_ROUTE_ATTEMPTS;
    attemptIndex += 1
  ) {
    const waypoint = getSyntheticWaypoint(routeOptions[0], attemptIndex);
    if (!waypoint) break;

    try {
      const waypointRoutes = await fetchOsrmRoutes([origin, waypoint, destination], "false");
      addUniqueRoutes(routeOptions, waypointRoutes);
    } catch {
      // Try another side of the route before giving up on additional route choices.
    }
  }

  return routeOptions.slice(0, ROUTE_OPTION_COUNT);
}

function getStepInstruction(step) {
  const maneuver = step.maneuver || {};
  const action = [maneuver.modifier, maneuver.type].filter(Boolean).join(" ");
  const road = step.name ? ` onto ${step.name}` : "";
  return `${action || "Continue"}${road}`.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function setDirectionsExpanded(isExpanded) {
  directionsToggle.hidden = directionsList.children.length === 0;
  directionsToggle.textContent = isExpanded ? "Hide detailed turns" : "Show detailed turns";
  directionsToggle.setAttribute("aria-expanded", String(isExpanded));
  directionsList.hidden = !isExpanded;
}

function clearDirections() {
  directionsList.innerHTML = "";
  setDirectionsExpanded(false);
}

function renderDirections(route) {
  clearDirections();

  route.legs.flatMap((leg) => leg.steps).forEach((step) => {
    const item = document.createElement("li");
    item.textContent = `${getStepInstruction(step)} · ${formatDistance(step.distance)} · ${formatDuration(step.duration)}`;
    directionsList.appendChild(item);
  });

  setDirectionsExpanded(false);
}

function buildRestaurantQuery(points) {
  const searches = points
    .map(
      (point) => {
        const [lon, lat] = Array.isArray(point) ? point : [point.lon, point.lat];
        return `node["amenity"~"^(restaurant|fast_food|cafe)$"](around:${ROUTE_RECOMMENDATION_SEARCH_RADIUS_METERS},${lat},${lon});way["amenity"~"^(restaurant|fast_food|cafe)$"](around:${ROUTE_RECOMMENDATION_SEARCH_RADIUS_METERS},${lat},${lon});relation["amenity"~"^(restaurant|fast_food|cafe)$"](around:${ROUTE_RECOMMENDATION_SEARCH_RADIUS_METERS},${lat},${lon});`;
      },
    )
    .join("");

  return `[out:json][timeout:25];(${searches});out center 80;`;
}

function buildFuelQuery(points) {
  const searches = points
    .map(
      (point) => {
        const [lon, lat] = Array.isArray(point) ? point : [point.lon, point.lat];
        return `nwr["amenity"="fuel"](around:${ROUTE_RECOMMENDATION_SEARCH_RADIUS_METERS},${lat},${lon});`;
      },
    )
    .join("");

  return `[out:json][timeout:25];(${searches});out center 80;`;
}

async function fetchOverpassData(query, errorMessage) {
  const body = new URLSearchParams({
    data: query,
  });
  const endpoints = [
    "https://z.overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];

  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), OVERPASS_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Accept: "application/json",
        },
        body,
        signal: controller.signal,
      });

      if (response.ok) return response.json();
    } catch {
      // Try the next public Overpass endpoint before showing a user-facing error.
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  throw new Error(errorMessage);
}

function getSelectedTimezone() {
  return document.querySelector("#timezone").value;
}

function getHourOfDay(date) {
  const timezone = getSelectedTimezone();
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
    timeZone: timezone,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);

  return hour + minute / 60;
}

function getDistanceMiles(a, b) {
  const radiusMiles = 3958.8;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

  return 2 * radiusMiles * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function getCoordinateAtDistance(coordinates, targetDistanceMeters) {
  if (!coordinates.length) return null;
  if (coordinates.length === 1) return coordinates[0];

  let traversedMeters = 0;

  for (let index = 1; index < coordinates.length; index += 1) {
    const [previousLon, previousLat] = coordinates[index - 1];
    const [lon, lat] = coordinates[index];
    const segmentMeters = getDistanceMiles(
      { lat: previousLat, lon: previousLon },
      { lat, lon },
    ) * 1609.344;

    if (traversedMeters + segmentMeters >= targetDistanceMeters) {
      const segmentFraction = segmentMeters
        ? (targetDistanceMeters - traversedMeters) / segmentMeters
        : 0;
      return [
        previousLon + (lon - previousLon) * segmentFraction,
        previousLat + (lat - previousLat) * segmentFraction,
      ];
    }

    traversedMeters += segmentMeters;
  }

  return coordinates.at(-1);
}

function getRoutePositionAtElapsed(route, elapsedTargetSeconds) {
  let elapsedSeconds = 0;
  let distanceMeters = 0;
  const steps = route.legs.flatMap((leg) => leg.steps);

  for (const step of steps) {
    const duration = step.duration || 0;
    const distance = step.distance || 0;
    const nextElapsedSeconds = elapsedSeconds + duration;
    const coordinates = step.geometry?.coordinates || [];

    if (elapsedTargetSeconds <= nextElapsedSeconds) {
      const fraction = duration ? (elapsedTargetSeconds - elapsedSeconds) / duration : 0;
      const distanceFromOriginMiles = (distanceMeters + distance * fraction) / 1609.344;

      if (coordinates.length) {
        const [lon, lat] = getCoordinateAtDistance(coordinates, distance * fraction);
        return { lon, lat, road: step.name || "route segment", distanceFromOriginMiles };
      }

      const [lon, lat] = step.maneuver?.location || [];
      if (lon != null && lat != null) {
        return { lon, lat, road: step.name || "route segment", distanceFromOriginMiles };
      }
    }

    elapsedSeconds = nextElapsedSeconds;
    distanceMeters += distance;
  }

  const [lon, lat] = route.geometry.coordinates.at(-1) || [];
  return lon != null && lat != null
    ? { lon, lat, road: "route area", distanceFromOriginMiles: (route.distance || distanceMeters) / 1609.344 }
    : null;
}

function getTripStopCount(route) {
  return Math.floor((route.duration || 0) / TRIP_STOP_INTERVAL_SECONDS);
}

function getRouteDurationWithStops(route) {
  return (route.duration || 0) + getTripStopCount(route) * FOOD_STOP_DURATION_SECONDS;
}

function getFourHourTripStops(route, departureAt) {
  const stopCount = getTripStopCount(route);
  const tripStops = [];

  for (let stopNumber = 1; stopNumber <= stopCount; stopNumber += 1) {
    const elapsedSeconds = stopNumber * TRIP_STOP_INTERVAL_SECONDS;
    const priorStopSeconds = (stopNumber - 1) * FOOD_STOP_DURATION_SECONDS;
    const passTime = new Date(departureAt.getTime() + (elapsedSeconds + priorStopSeconds) * 1000);
    const location = getRoutePositionAtElapsed(route, elapsedSeconds);
    if (!location) continue;

    tripStops.push({
      id: `stop-${stopNumber}-${passTime.toISOString()}`,
      stopNumber,
      label: "Suggested food stop",
      passTime,
      elapsedSeconds,
      elapsedWithStopsSeconds: elapsedSeconds + priorStopSeconds,
      stopDurationSeconds: FOOD_STOP_DURATION_SECONDS,
      colorClass: stopNumber % 2 === 0 ? "stop-theme-b" : "stop-theme-a",
      ...location,
    });
  }

  return tripStops;
}

function getShortTripRecommendationStops(route, departureAt) {
  if ((route.duration || 0) <= 0 || (route.duration || 0) >= TRIP_STOP_INTERVAL_SECONDS) {
    return [];
  }

  const elapsedSeconds = Math.max(0, Math.floor((route.duration || 0) / 2));
  const location = getRoutePositionAtElapsed(route, elapsedSeconds);
  if (!location) return [];

  const passTime = new Date(departureAt.getTime() + elapsedSeconds * 1000);

  return [
    {
      id: `short-trip-${passTime.toISOString()}`,
      stopNumber: 1,
      label: "Short trip recommendations",
      passTime,
      elapsedSeconds,
      elapsedWithStopsSeconds: elapsedSeconds,
      stopDurationSeconds: 0,
      colorClass: "stop-theme-a",
      isShortTrip: true,
      ...location,
    },
  ];
}

function getTripRecommendationStops(route, departureAt) {
  const fourHourStops = getFourHourTripStops(route, departureAt);
  return fourHourStops.length ? fourHourStops : getShortTripRecommendationStops(route, departureAt);
}

function getForwardRecommendationSearchPoints(route, tripStops = []) {
  const searchPoints = [];

  tripStops.forEach((tripStop, index) => {
    searchPoints.push({
      ...tripStop,
      anchorTripStopId: tripStop.id,
      isForwardFallback: false,
      distanceAheadMiles: 0,
    });

    const nextStopElapsed = tripStops[index + 1]?.elapsedSeconds ?? route.duration ?? tripStop.elapsedSeconds;
    const maxElapsed = Math.min(
      route.duration || nextStopElapsed,
      tripStop.elapsedSeconds + FORWARD_RECOMMENDATION_LOOKAHEAD_SECONDS,
      nextStopElapsed,
    );

    for (
      let elapsedSeconds = tripStop.elapsedSeconds + FORWARD_RECOMMENDATION_INTERVAL_SECONDS;
      elapsedSeconds <= maxElapsed;
      elapsedSeconds += FORWARD_RECOMMENDATION_INTERVAL_SECONDS
    ) {
      const location = getRoutePositionAtElapsed(route, elapsedSeconds);
      if (!location) continue;

      searchPoints.push({
        ...location,
        id: `${tripStop.id}-forward-${elapsedSeconds}`,
        anchorTripStopId: tripStop.id,
        isForwardFallback: true,
        distanceAheadMiles: Math.max(0, location.distanceFromOriginMiles - tripStop.distanceFromOriginMiles),
      });
    }
  });

  return searchPoints;
}

function preferDirectRecommendations(items = []) {
  const preferred = [];
  const groupedByStop = new Map();

  items.forEach((item) => {
    if (!groupedByStop.has(item.tripStopId)) groupedByStop.set(item.tripStopId, []);
    groupedByStop.get(item.tripStopId).push(item);
  });

  groupedByStop.forEach((group) => {
    const directItems = group.filter((item) => !item.isForwardFallback);
    if (directItems.length) {
      preferred.push(...directItems);
      return;
    }

    const nextDistanceAhead = Math.min(...group.map((item) => item.distanceAheadMiles || 0));
    preferred.push(
      ...group.filter((item) => Math.abs((item.distanceAheadMiles || 0) - nextDistanceAhead) < 0.1),
    );
  });

  return preferred;
}

function getMissingRecommendationStopIds(tripStops, items) {
  return new Set(
    tripStops
      .filter((tripStop) => !items.some((item) => item.tripStopId === tripStop.id))
      .map((tripStop) => tripStop.id),
  );
}

function getDepartureDateTime(formData) {
  const date = formData.get("departDate") || document.querySelector("#departDate").value;
  const time = formData.get("departTime") || document.querySelector("#departTime").value || "08:00";

  return new Date(`${date}T${time}`);
}

function normalizeRestaurant(element, tripStops = [], searchPoints = tripStops) {
  const tags = element.tags || {};
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;

  if (!tags.name || lat == null || lon == null) return null;

  const location = { lat, lon };
  const searchPoint = searchPoints
    .map((point) => ({
      ...point,
      distanceMiles: getDistanceMiles(location, point),
    }))
    .sort((a, b) => a.distanceMiles - b.distanceMiles)[0];
  const tripStop = tripStops.find((point) => point.id === searchPoint?.anchorTripStopId) || searchPoint;
  const cuisine = tags.cuisine ? tags.cuisine.replaceAll(";", ", ") : "Cuisine not listed";
  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  const city = tags["addr:city"];
  const address = [street, city].filter(Boolean).join(", ");
  const hours = tags.opening_hours ? ` · ${tags.opening_hours}` : "";

  return {
    id: `${element.type}-${element.id}`,
    name: tags.name,
    cuisine,
    tripStopId: tripStop?.id,
    label: tripStop?.label || "Suggested food stop",
    passTime: tripStop?.passTime,
    road: searchPoint?.road || tripStop?.road || "route area",
    distanceFromOriginMiles: tripStop?.distanceFromOriginMiles,
    distanceMiles: searchPoint?.distanceMiles,
    isForwardFallback: Boolean(searchPoint?.isForwardFallback),
    distanceAheadMiles: searchPoint?.distanceAheadMiles || 0,
    isShortTrip: Boolean(tripStop?.isShortTrip),
    details: `${cuisine}${address ? ` · ${address}` : ""}${hours}`,
    lat,
    lon,
  };
}

async function fetchRestaurantsAlongRoute(route, departureAt) {
  const tripStops = activeTripStops.length ? activeTripStops : getTripRecommendationStops(route, departureAt);
  activeTripStops = tripStops;

  if (!tripStops.length) {
    return [];
  }

  const restaurantsById = new Map();
  const directSearchPoints = tripStops.map((tripStop) => ({
    ...tripStop,
    anchorTripStopId: tripStop.id,
    isForwardFallback: false,
    distanceAheadMiles: 0,
  }));

  try {
    const data = await fetchOverpassData(buildRestaurantQuery(directSearchPoints), "Restaurant lookup is unavailable right now.");
    data.elements
      .map((element) => normalizeRestaurant(element, tripStops, directSearchPoints))
      .filter((restaurant) => restaurant && restaurant.distanceMiles <= ROUTE_RECOMMENDATION_SEARCH_RADIUS_MILES)
      .forEach((restaurant) => {
        restaurantsById.set(restaurant.id, restaurant);
      });
  } catch {
    // Continue to the forward fallback query where possible.
  }

  const missingStopIds = getMissingRecommendationStopIds(tripStops, [...restaurantsById.values()]);

  if (missingStopIds.size) {
    const fallbackSearchPoints = getForwardRecommendationSearchPoints(route, tripStops)
      .filter((point) => point.isForwardFallback && missingStopIds.has(point.anchorTripStopId));

    try {
      if (!fallbackSearchPoints.length) return preferDirectRecommendations([...restaurantsById.values()]);

      const data = await fetchOverpassData(buildRestaurantQuery(fallbackSearchPoints), "Restaurant lookup is unavailable right now.");
      preferDirectRecommendations(
        data.elements
          .map((element) => normalizeRestaurant(element, tripStops, fallbackSearchPoints))
          .filter((restaurant) => restaurant && restaurant.distanceMiles <= ROUTE_RECOMMENDATION_SEARCH_RADIUS_MILES),
      ).forEach((restaurant) => {
        restaurantsById.set(restaurant.id, restaurant);
      });
    } catch {
      // Leave missing stops as clear no-result states.
    }
  }

  const retryStopIds = getMissingRecommendationStopIds(tripStops, [...restaurantsById.values()]);
  for (const tripStopId of retryStopIds) {
    const retrySearchPoints = getForwardRecommendationSearchPoints(route, tripStops)
      .filter((point) => point.isForwardFallback && point.anchorTripStopId === tripStopId)
      .slice(0, FORWARD_RECOMMENDATION_RETRY_POINTS);

    for (const searchPoint of retrySearchPoints) {
      try {
        const data = await fetchOverpassData(buildRestaurantQuery([searchPoint]), "Restaurant lookup is unavailable right now.");
        const matches = data.elements
          .map((element) => normalizeRestaurant(element, tripStops, [searchPoint]))
          .filter((restaurant) => restaurant && restaurant.distanceMiles <= ROUTE_RECOMMENDATION_SEARCH_RADIUS_MILES);

        if (matches.length) {
          matches.forEach((restaurant) => {
            restaurantsById.set(restaurant.id, restaurant);
          });
          break;
        }
      } catch {
        // Continue to the next point ahead; public endpoints can fail intermittently.
      }
    }
  }

  return preferDirectRecommendations([...restaurantsById.values()])
    .sort((a, b) => {
      const timeOrder = (a.passTime?.getTime() || 0) - (b.passTime?.getTime() || 0);
      return timeOrder || a.distanceAheadMiles - b.distanceAheadMiles || a.distanceMiles - b.distanceMiles;
    })
    .filter((restaurant, index, restaurants) => {
      const stopCount = restaurants.slice(0, index).filter((item) => item.tripStopId === restaurant.tripStopId).length;
      return stopCount < getFoodRecommendationLimit(restaurant);
    });
}

function normalizeFuelStation(element, tripStops = [], searchPoints = tripStops) {
  const tags = element.tags || {};
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  const name = tags.name || tags.brand || tags.operator || "Fuel station";

  if (lat == null || lon == null) return null;

  const location = { lat, lon };
  const searchPoint = searchPoints
    .map((point) => ({
      ...point,
      distanceMiles: getDistanceMiles(location, point),
    }))
    .sort((a, b) => a.distanceMiles - b.distanceMiles)[0];
  const tripStop = tripStops.find((point) => point.id === searchPoint?.anchorTripStopId) || searchPoint;
  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  const city = tags["addr:city"];
  const address = [street, city].filter(Boolean).join(", ");
  const fuelTypes = [
    tags["fuel:diesel"] === "yes" ? "diesel" : "",
    tags["fuel:electricity"] === "yes" ? "EV charging" : "",
    tags["fuel:octane_87"] === "yes" ? "regular" : "",
  ].filter(Boolean);
  const hours = tags.opening_hours ? ` · ${tags.opening_hours}` : "";
  const fuelDetails = fuelTypes.length ? ` · ${fuelTypes.join(", ")}` : "";

  return {
    id: `${element.type}-${element.id}`,
    name,
    tripStopId: tripStop?.id,
    label: tripStop?.label || "Suggested food stop",
    passTime: tripStop?.passTime,
    road: searchPoint?.road || tripStop?.road || "route area",
    distanceFromOriginMiles: tripStop?.distanceFromOriginMiles,
    distanceMiles: searchPoint?.distanceMiles,
    isForwardFallback: Boolean(searchPoint?.isForwardFallback),
    distanceAheadMiles: searchPoint?.distanceAheadMiles || 0,
    isShortTrip: Boolean(tripStop?.isShortTrip),
    details: `${address || "Address not listed"}${fuelDetails}${hours}`,
    lat,
    lon,
  };
}

async function fetchFuelStationsAlongRoute(route, departureAt) {
  const tripStops = activeTripStops.length ? activeTripStops : getTripRecommendationStops(route, departureAt);
  activeTripStops = tripStops;

  if (!tripStops.length) {
    return [];
  }

  const stationsById = new Map();
  const directSearchPoints = tripStops.map((tripStop) => ({
    ...tripStop,
    anchorTripStopId: tripStop.id,
    isForwardFallback: false,
    distanceAheadMiles: 0,
  }));

  try {
    const data = await fetchOverpassData(buildFuelQuery(directSearchPoints), "Fuel station lookup is unavailable right now.");
    data.elements
      .map((element) => normalizeFuelStation(element, tripStops, directSearchPoints))
      .filter((station) => station && station.distanceMiles <= ROUTE_RECOMMENDATION_SEARCH_RADIUS_MILES)
      .forEach((station) => {
        stationsById.set(station.id, station);
      });
  } catch {
    // Continue to forward fallback points before showing no fuel options.
  }

  const missingStopIds = getMissingRecommendationStopIds(tripStops, [...stationsById.values()]);

  if (missingStopIds.size) {
    const fallbackSearchPoints = getForwardRecommendationSearchPoints(route, tripStops)
      .filter((point) => point.isForwardFallback && missingStopIds.has(point.anchorTripStopId));

    try {
      if (!fallbackSearchPoints.length) return preferDirectRecommendations([...stationsById.values()]);

      const data = await fetchOverpassData(buildFuelQuery(fallbackSearchPoints), "Fuel station lookup is unavailable right now.");
      preferDirectRecommendations(
        data.elements
          .map((element) => normalizeFuelStation(element, tripStops, fallbackSearchPoints))
          .filter((station) => station && station.distanceMiles <= ROUTE_RECOMMENDATION_SEARCH_RADIUS_MILES),
      ).forEach((station) => {
        stationsById.set(station.id, station);
      });
    } catch {
      // Leave missing stops as clear no-result states.
    }
  }

  const retryStopIds = getMissingRecommendationStopIds(tripStops, [...stationsById.values()]);
  for (const tripStopId of retryStopIds) {
    const retrySearchPoints = getForwardRecommendationSearchPoints(route, tripStops)
      .filter((point) => point.isForwardFallback && point.anchorTripStopId === tripStopId)
      .slice(0, FORWARD_RECOMMENDATION_RETRY_POINTS);

    for (const searchPoint of retrySearchPoints) {
      try {
        const data = await fetchOverpassData(buildFuelQuery([searchPoint]), "Fuel station lookup is unavailable right now.");
        const matches = data.elements
          .map((element) => normalizeFuelStation(element, tripStops, [searchPoint]))
          .filter((station) => station && station.distanceMiles <= ROUTE_RECOMMENDATION_SEARCH_RADIUS_MILES);

        if (matches.length) {
          matches.forEach((station) => {
            stationsById.set(station.id, station);
          });
          break;
        }
      } catch {
        // Continue to the next point ahead; public endpoints can fail intermittently.
      }
    }
  }

  return preferDirectRecommendations([...stationsById.values()])
    .sort((a, b) => {
      const timeOrder = (a.passTime?.getTime() || 0) - (b.passTime?.getTime() || 0);
      return timeOrder || a.distanceAheadMiles - b.distanceAheadMiles || a.distanceMiles - b.distanceMiles;
    });
}

function drawRestaurantMarkers(restaurants) {
  if (!restaurantMarkers) return;

  restaurantMarkers.clearLayers();

  if (!restaurantToggle.checked) return;

  restaurants.forEach((restaurant) => {
    L.marker([restaurant.lat, restaurant.lon])
      .addTo(restaurantMarkers)
      .bindPopup(`<strong>${escapeHtml(restaurant.name)}</strong><br>${escapeHtml(restaurant.label)} near ${escapeHtml(restaurant.road)}<br>${escapeHtml(restaurant.cuisine)}`);
  });
}

function getWeatherSeverityColor(severity = "") {
  const colors = {
    Extreme: "#7f1d1d",
    Severe: "#dc2626",
    Moderate: "#f59e0b",
    Minor: "#facc15",
    Unknown: "#64748b",
  };

  return colors[severity] || colors.Unknown;
}

function renderWeatherAlerts(alerts) {
  if (!weatherList) return;

  if (!alerts.length) {
    weatherList.innerHTML = "<li><strong>No active NWS alerts:</strong> No inclement-weather alerts found within the mapped route area.</li>";
    return;
  }

  weatherList.innerHTML = alerts
    .slice(0, 5)
    .map((alert) => {
      const properties = alert.properties || {};
      const event = escapeHtml(properties.event || "Weather alert");
      const severity = escapeHtml(properties.severity || "Unknown");
      const area = escapeHtml(properties.areaDesc || "Route area");
      return `<li><strong>${event}:</strong> ${severity} severity near ${area}</li>`;
    })
    .join("");
}

function drawWeatherAlertOverlay(alerts) {
  if (!weatherAlertLayer) return;

  weatherAlertLayer.clearLayers();

  alerts.forEach((alert) => {
    if (!alert.geometry) return;

    const severity = alert.properties?.severity || "Unknown";
    const color = getWeatherSeverityColor(severity);
    const layer = L.geoJSON(alert, {
      style: {
        color,
        fillColor: color,
        fillOpacity: 0.22,
        opacity: 0.9,
        weight: 2,
      },
    });
    const event = escapeHtml(alert.properties?.event || "Weather alert");
    const headline = escapeHtml(alert.properties?.headline || alert.properties?.areaDesc || "Active alert");

    layer.bindPopup(`<strong>${event}</strong><br>${headline}`);
    weatherAlertLayer.addLayer(layer);
  });
}

async function fetchWeatherAlertsAtPoint([lon, lat]) {
  const url = new URL("https://api.weather.gov/alerts/active");
  url.searchParams.set("status", "actual");
  url.searchParams.set("message_type", "alert");
  url.searchParams.set("point", `${lat.toFixed(4)},${lon.toFixed(4)}`);

  const response = await fetch(url, {
    headers: {
      Accept: "application/geo+json",
    },
  });

  if (!response.ok) {
    throw new Error("Weather alerts are unavailable right now.");
  }

  const data = await response.json();
  return data.features || [];
}

async function loadWeatherAlerts(route, requestId = previewRequestId) {
  if (!route) return;

  weatherList.innerHTML = "<li>Checking for active inclement-weather alerts along the route...</li>";
  weatherAlertLayer?.clearLayers();

  try {
    const alertResults = await Promise.all(getRestaurantSearchPoints(route).map(fetchWeatherAlertsAtPoint));
    const alertsById = new Map();

    alertResults.flat().forEach((alert) => {
      const id = alert.id || alert.properties?.id || alert.properties?.headline;
      if (id) alertsById.set(id, alert);
    });

    const alerts = [...alertsById.values()];
    if (requestId !== previewRequestId) return;
    drawWeatherAlertOverlay(alerts);
    renderWeatherAlerts(alerts);
  } catch (error) {
    if (requestId !== previewRequestId) return;
    weatherList.innerHTML = `<li><strong>Weather overlay unavailable:</strong> ${escapeHtml(error.message)}</li>`;
  }
}

function drawRoute(route, origin, destination) {
  if (!map) return;

  const points = route.geometry.coordinates.map(([lon, lat]) => [lat, lon]);

  if (routeLayer) routeLayer.remove();
  if (originMarker) originMarker.remove();
  if (destinationMarker) destinationMarker.remove();

  routeLayer = L.polyline(points, {
    color: "#2563eb",
    opacity: 0.9,
    weight: 6,
  }).addTo(map);

  originMarker = L.marker([origin.lat, origin.lon]).addTo(map).bindPopup("Origin");
  destinationMarker = L.marker([destination.lat, destination.lon]).addTo(map).bindPopup("Destination");

  map.fitBounds(routeLayer.getBounds(), {
    padding: ROUTE_OVERVIEW_PADDING,
    maxZoom: ROUTE_OVERVIEW_MAX_ZOOM,
  });
}

function updateRouteCardStats(routeOptions = activeRouteOptions) {
  routeOptions.slice(0, routes.length).forEach((route, index) => {
    routes[index].time = formatDuration(getRouteDurationWithStops(route));
    routes[index].distance = formatDistance(route.distance);
  });
}

function clearRouteResultsForNewRequest(originQuery, destinationQuery) {
  selectedRouteIndex = null;
  activeRouteOptions = [];
  activeRestaurants = [];
  activeFuelStations = [];
  activeTripStops = [];
  recommendationLoading = {
    restaurants: false,
    fuel: false,
  };

  if (routeLayer) {
    routeLayer.remove();
    routeLayer = null;
  }
  if (originMarker) {
    originMarker.remove();
    originMarker = null;
  }
  if (destinationMarker) {
    destinationMarker.remove();
    destinationMarker = null;
  }

  clearDirections();
  drawRestaurantMarkers([]);
  weatherAlertLayer?.clearLayers();
  routeSummary.textContent = "Creating a fresh route...";
  mapStatus.textContent = `Finding a driving route from ${originQuery} to ${destinationQuery}...`;
  routeGrid.innerHTML = `<div class="empty-state">Creating a fresh route from ${escapeHtml(originQuery)} to ${escapeHtml(destinationQuery)}...</div>`;
  restaurantList.innerHTML = `<div class="empty-state">Food recommendations will load after the new route is ready.</div>`;
  gasPanel.className = "empty-state";
  gasPanel.innerHTML = "Gas recommendations will load after the new route is ready.";
}

function displayRouteSelection(index, requestId = previewRequestId) {
  const route = activeRouteOptions[index];
  if (!route || !activeOrigin || !activeDestination) return;
  const departureAt = activeDepartureAt || getDepartureDateTime(new FormData(tripForm));

  selectedRouteIndex = index;
  renderRoutes(index);
  drawRoute(route, activeOrigin, activeDestination);
  renderDirections(route);
  loadWeatherAlerts(route, requestId);
  routeSummary.textContent = `${formatDistance(route.distance)} · ${formatDuration(getRouteDurationWithStops(route))} with food stops · ${formatDuration(route.duration)} driving · ${route.legs[0].steps.length} driving steps`;

  activeRestaurants = [];
  activeFuelStations = [];
  activeTripStops = getTripRecommendationStops(route, departureAt);
  recommendationLoading = {
    restaurants: restaurantToggle.checked && activeTripStops.length > 0,
    fuel: gasToggle.checked && activeTripStops.length > 0,
  };
  drawRestaurantMarkers([]);
  renderRestaurants();
  renderGasStations();

  if (restaurantToggle.checked) {
    fetchRestaurantsAlongRoute(route, departureAt)
      .then((restaurants) => {
        if (requestId !== previewRequestId) return;
        activeRestaurants = restaurants;
        recommendationLoading.restaurants = false;
        renderRestaurants();
      })
      .catch((restaurantError) => {
        if (requestId !== previewRequestId) return;
        recommendationLoading.restaurants = false;
        restaurantList.innerHTML = `<div class="empty-state">${escapeHtml(restaurantError.message)}</div>`;
      });
  }

  if (gasToggle.checked) {
    fetchFuelStationsAlongRoute(route, departureAt)
      .then((stations) => {
        if (requestId !== previewRequestId) return;
        activeFuelStations = stations;
        recommendationLoading.fuel = false;
        renderGasStations();
        if (restaurantToggle.checked) renderRestaurants();
      })
      .catch((fuelError) => {
        if (requestId !== previewRequestId) return;
        recommendationLoading.fuel = false;
        gasPanel.className = "empty-state";
        gasPanel.innerHTML = escapeHtml(fuelError.message);
        if (restaurantToggle.checked) renderRestaurants();
      });
  }
}

async function loadDrivingDirections(originQuery, destinationQuery, departureAt = getDepartureDateTime(new FormData(tripForm)), requestId = previewRequestId) {
  if (!map) return;

  mapStatus.textContent = `Finding a driving route from ${originQuery} to ${destinationQuery}...`;

  try {
    const [origin, destination] = await Promise.all([
      geocodeLocation(originQuery),
      geocodeLocation(destinationQuery),
    ]);
    const routeOptions = await fetchDrivingRoute(origin, destination);
    if (requestId !== previewRequestId) return;

    routeSummary.textContent = "Calculating route...";
    clearDirections();
    activeRestaurants = [];
    activeFuelStations = [];
    activeTripStops = [];
    if (restaurantToggle.checked) {
      restaurantList.innerHTML = `<div class="empty-state">Checking within ${ROUTE_RECOMMENDATION_SEARCH_RADIUS_MILES} miles of the route for food recommendations...</div>`;
    }
    if (gasToggle.checked) {
      gasPanel.className = "empty-state";
      gasPanel.innerHTML = `Checking within ${ROUTE_RECOMMENDATION_SEARCH_RADIUS_MILES} miles of the route for gas recommendations...`;
    }
    drawRestaurantMarkers([]);

    activeOrigin = origin;
    activeDestination = destination;
    activeDepartureAt = departureAt;
    activeRouteOptions = routeOptions.slice(0, routes.length);
    updateRouteCardStats(activeRouteOptions);

    mapStatus.textContent = `Driving route ready from ${originQuery} to ${destinationQuery}.`;
    displayRouteSelection(0, requestId);
  } catch (error) {
    if (requestId !== previewRequestId) return;
    mapStatus.textContent = error.message;
    formMessage.textContent = "Route preview paused until both locations can be found.";
    routeSummary.textContent = activeRouteOptions.length
      ? "Showing the previous route. Try a more specific city, state, or street address."
      : "Try a more specific city, state, or street address.";
  }
}

function renderRoutes(selectedIndex = selectedRouteIndex) {
  const availableRoutes = activeRouteOptions.length
    ? routes.filter((_, index) => activeRouteOptions[index])
    : routes;
  const routesToRender = selectedIndex == null ? availableRoutes : [routes[selectedIndex]];

  routeGrid.innerHTML = routesToRender
    .map(
      (route) => {
        const index = routes.indexOf(route);

        return `
        <article class="route-card ${index === selectedIndex ? "selected" : ""}">
          <div class="route-topline">
            <span class="route-type">${route.type}</span>
            <span class="route-score">${route.score}</span>
          </div>
          <div>
            <h3>${route.title}</h3>
            <p>${route.summary}</p>
          </div>
          <div class="route-stats" aria-label="${route.title} stats">
            <div>
              <strong>${route.time}</strong>
              <span>Travel with stops</span>
            </div>
            <div>
              <strong>${route.distance}</strong>
              <span>Total distance</span>
            </div>
          </div>
          <ul class="tag-list">
            ${route.highlights.map((highlight) => `<li>${highlight}</li>`).join("")}
          </ul>
          ${
            selectedIndex == null
              ? `<button class="button button-secondary" type="button" data-route="${index}">Select route</button>`
              : `<span class="route-score">Selected</span>`
          }
        </article>
      `;
      },
    )
    .join("");

  if (selectedIndex != null) {
    routeGrid.insertAdjacentHTML(
      "beforeend",
      `<a class="route-link" href="#routes" data-show-routes>Show all route options</a>`,
    );
  }

  routeGrid.querySelectorAll("[data-route]").forEach((button) => {
    button.addEventListener("click", () => {
      displayRouteSelection(Number(button.dataset.route));
      formMessage.textContent = `${routes[selectedRouteIndex].title} selected for detailed planning.`;
    });
  });

  routeGrid.querySelector("[data-show-routes]")?.addEventListener("click", (event) => {
    event.preventDefault();
    selectedRouteIndex = null;
    renderRoutes();
    formMessage.textContent = "Showing all route options.";
  });
}

function renderRecommendationLoadingState(message) {
  return `<div class="empty-state loading-state" role="status">${escapeHtml(message)}</div>`;
}

function renderRestaurants() {
  if (!restaurantToggle.checked) {
    restaurantList.innerHTML = `<div class="empty-state">Restaurant recommendations are off.</div>`;
    drawRestaurantMarkers([]);
    return;
  }

  if (!activeTripStops.length) {
    restaurantList.innerHTML = `<div class="empty-state">No route recommendation point is available for food suggestions yet.</div>`;
    return;
  }

  restaurantList.innerHTML = activeTripStops
    .map(
      (tripStop) => {
        const options = activeRestaurants.filter((restaurant) => restaurant.tripStopId === tripStop.id);
        const gasOptions = getGasSuggestionsForStop(tripStop);
        const optionMarkup = options.length
          ? options
              .map(
                (stop) => `
                  <div class="stop-card">
                    <strong>${renderPlaceLink(stop)}</strong>
                    ${renderStreetViewThumbnail(stop, "restaurant")}
                    <span>${escapeHtml(stop.details)}${Number.isFinite(stop.distanceMiles) ? ` · ${escapeHtml(getRecommendationDistanceText(stop))}` : ""}</span>
                    ${renderPlaceMapActions(stop, "restaurant")}
                  </div>
                `,
              )
              .join("")
          : recommendationLoading.restaurants
            ? renderRecommendationLoadingState(`Looking for viable food options within ${ROUTE_RECOMMENDATION_SEARCH_RADIUS_MILES} miles of this stop area.`)
          : `<div class="empty-state">${tripStop.isShortTrip ? `No named restaurants found within ${ROUTE_RECOMMENDATION_SEARCH_RADIUS_MILES} miles of this route yet.` : `No named restaurants found within ${ROUTE_RECOMMENDATION_SEARCH_RADIUS_MILES} miles of this four-hour stop.`}</div>`;
        const gasMarkup = gasOptions
          .map(
            (station) => `
              <div class="stop-card">
                <strong>${renderPlaceLink(station)}</strong>
                ${renderStreetViewThumbnail(station, "gas station")}
                <span>${escapeHtml(station.details)}</span>
                ${renderPlaceMapActions(station, "gas station")}
              </div>
            `,
          )
          .join("") || (recommendationLoading.fuel
            ? renderRecommendationLoadingState(`Looking for viable gas options within ${ROUTE_RECOMMENDATION_SEARCH_RADIUS_MILES} miles of this stop area.`)
            : `<div class="empty-state">${tripStop.isShortTrip ? `No named fuel stations found within ${ROUTE_RECOMMENDATION_SEARCH_RADIUS_MILES} miles of this route yet.` : `No named fuel stations found within ${ROUTE_RECOMMENDATION_SEARCH_RADIUS_MILES} miles of this food stop yet.`}</div>`);

        return `
          <section class="meal-stop-card ${tripStop.colorClass}" aria-label="${escapeHtml(tripStop.label)} food and gas options">
            <div class="meal-stop-heading">
              <strong>${escapeHtml(tripStop.label)} around ${escapeHtml(formatMealTime(tripStop.passTime))}</strong>
              <span>${escapeHtml(getTripStopTimingText(tripStop))}</span>
            </div>
            <div class="meal-stop-options">
              <span class="stop-section-label">Food options</span>
              ${optionMarkup}
              <span class="stop-section-label">Gas options</span>
              ${gasMarkup}
            </div>
          </section>
        `;
      },
    )
    .join("");
  drawRestaurantMarkers(activeRestaurants);
}

function getStreetViewUrl(point) {
  const url = new URL("https://www.google.com/maps/@");
  url.searchParams.set("api", "1");
  url.searchParams.set("map_action", "pano");
  url.searchParams.set("viewpoint", `${point.lat},${point.lon}`);
  return url.toString();
}

function getStreetViewEmbedUrl(point) {
  const url = new URL("https://www.google.com/maps");
  url.searchParams.set("layer", "c");
  url.searchParams.set("cbll", `${point.lat},${point.lon}`);
  url.searchParams.set("cbp", "11,0,0,0,0");
  url.searchParams.set("output", "svembed");
  return url.toString();
}

function getPlaceMapUrl(place) {
  const url = new URL("https://www.google.com/maps/search/");
  const query = [place.name, place.lat, place.lon].filter((value) => value != null).join(" ");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", query);
  return url.toString();
}

function getDrivingDirectionsUrl(point) {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("destination", `${point.lat},${point.lon}`);
  url.searchParams.set("travelmode", "driving");
  return url.toString();
}

function renderPlaceLink(place) {
  const placeUrl = escapeHtml(getPlaceMapUrl(place));
  const placeName = escapeHtml(place.name);

  return `<a class="place-name-link" href="${placeUrl}" target="_blank" rel="noopener" aria-label="Open ${placeName} in Google Maps">${placeName}</a>`;
}

function renderStreetViewThumbnail(place, placeType) {
  const streetViewUrl = escapeHtml(getStreetViewUrl(place));
  const embedUrl = escapeHtml(getStreetViewEmbedUrl(place));
  const placeLabel = escapeHtml(`${place.name} ${placeType}`);

  return `
    <div class="street-view-thumbnail" aria-label="Street View thumbnail for ${placeLabel}">
      <iframe
        title="Street View thumbnail for ${placeLabel}"
        src="${embedUrl}"
        loading="lazy"
        referrerpolicy="no-referrer-when-downgrade"
      ></iframe>
      <a href="${streetViewUrl}" target="_blank" rel="noopener" aria-label="Open full Street View for ${placeLabel}">Open Street View</a>
    </div>
  `;
}

function renderPlaceMapActions(place, placeType) {
  const placeUrl = escapeHtml(getPlaceMapUrl(place));
  const streetViewUrl = escapeHtml(getStreetViewUrl(place));
  const directionsUrl = escapeHtml(getDrivingDirectionsUrl(place));
  const placeLabel = escapeHtml(`${place.name} ${placeType}`);

  return `
    <div class="stop-map-actions place-map-actions" aria-label="Map actions for ${placeLabel}">
      <a class="stop-map-link" href="${placeUrl}" target="_blank" rel="noopener" aria-label="Open ${placeLabel} in Google Maps">
        Open place
      </a>
      <a class="stop-map-link street-view-link" href="${streetViewUrl}" target="_blank" rel="noopener" aria-label="Open Street View for ${placeLabel}">
        <span class="street-view-icon" aria-hidden="true">
          <span></span>
        </span>
        Street View
      </a>
      <a class="stop-map-link" href="${directionsUrl}" target="_blank" rel="noopener" aria-label="Open driving directions to ${placeLabel}">
        Driving directions
      </a>
    </div>
  `;
}

function getFoodRecommendationLimit(item) {
  return item?.isShortTrip ? SHORT_TRIP_RECOMMENDATION_LIMIT : MAX_RESTAURANTS_PER_STOP;
}

function getFuelRecommendationLimit(item) {
  return item?.isShortTrip ? SHORT_TRIP_RECOMMENDATION_LIMIT : MAX_FUEL_STATIONS_PER_STOP;
}

function getRecommendationDistanceText(item, directLabel = "stop area") {
  if (item.isForwardFallback) {
    return `${item.distanceMiles.toFixed(1)} mi from option area · ${item.distanceAheadMiles.toFixed(0)} mi ahead of planned stop`;
  }

  return `${item.distanceMiles.toFixed(1)} mi from ${directLabel}`;
}

function getTripStopTimingText(tripStop) {
  const distanceText = `${tripStop.distanceFromOriginMiles.toFixed(0)} mi from origin`;
  const elapsedText = `${formatDuration(tripStop.elapsedWithStopsSeconds)} into the trip`;

  if (tripStop.isShortTrip) {
    return `${distanceText} · ${elapsedText} · near ${tripStop.road}`;
  }

  return `${distanceText} · ${elapsedText}, including prior food stops · near ${tripStop.road}`;
}

function getNearestRestaurantDistance(station, tripStop) {
  const restaurants = activeRestaurants.filter((restaurant) => restaurant.tripStopId === tripStop.id);
  if (!restaurants.length) return Number.POSITIVE_INFINITY;

  return Math.min(...restaurants.map((restaurant) => getDistanceMiles(station, restaurant)));
}

function getGasSuggestionsForStop(tripStop) {
  const seenStationNames = new Set();

  return activeFuelStations
    .filter((station) => station.tripStopId === tripStop.id)
    .map((station) => ({
      ...station,
      foodDistanceMiles: getNearestRestaurantDistance(station, tripStop),
    }))
    .sort((a, b) => {
      const foodOrder = a.foodDistanceMiles - b.foodDistanceMiles;
      return foodOrder || a.distanceMiles - b.distanceMiles;
    })
    .filter((station) => {
      const stationKey = station.name === "Fuel station"
        ? `${station.name}-${station.lat.toFixed(5)}-${station.lon.toFixed(5)}`
        : station.name.trim().toLowerCase();
      if (seenStationNames.has(stationKey)) return false;

      seenStationNames.add(stationKey);
      return true;
    })
    .slice(0, getFuelRecommendationLimit(tripStop))
    .map((station) => {
      const distanceText = Number.isFinite(station.distanceMiles)
        ? getRecommendationDistanceText(station)
        : "near stop area";
      const foodText = Number.isFinite(station.foodDistanceMiles)
        ? ` · ${station.foodDistanceMiles.toFixed(1)} mi from food options`
        : "";

      return {
        ...station,
        details: `${distanceText}${foodText} · ${station.details}`,
      };
    });
}

function renderGasStations() {
  if (!gasToggle.checked) {
    gasPanel.className = "empty-state";
    gasPanel.innerHTML = "Gas station display is off.";
    return;
  }

  if (!activeTripStops.length) {
    gasPanel.className = "empty-state";
    gasPanel.innerHTML = "No route recommendation point is available for gas suggestions yet.";
    return;
  }

  gasPanel.className = "restaurant-list";
  gasPanel.innerHTML = activeTripStops
    .map(
      (tripStop) => {
        const stationMarkup = getGasSuggestionsForStop(tripStop)
          .map(
            (station) => `
              <div class="stop-card">
                <strong>${renderPlaceLink(station)}</strong>
                ${renderStreetViewThumbnail(station, "gas station")}
                <span>${escapeHtml(station.details)}</span>
                ${renderPlaceMapActions(station, "gas station")}
              </div>
            `,
          )
          .join("") || (recommendationLoading.fuel
            ? renderRecommendationLoadingState(`Looking for viable gas options within ${ROUTE_RECOMMENDATION_SEARCH_RADIUS_MILES} miles of this stop area.`)
            : `<div class="empty-state">${tripStop.isShortTrip ? `No named fuel stations found within ${ROUTE_RECOMMENDATION_SEARCH_RADIUS_MILES} miles of this route yet.` : `No named fuel stations found within ${ROUTE_RECOMMENDATION_SEARCH_RADIUS_MILES} miles of this four-hour stop.`}</div>`);

        return `
          <section class="meal-stop-card ${tripStop.colorClass}" aria-label="${escapeHtml(tripStop.label)} gas options">
            <div class="meal-stop-heading">
              <strong>Gas near ${escapeHtml(tripStop.label.toLowerCase())}</strong>
              <span>${escapeHtml(getTripStopTimingText(tripStop))}</span>
            </div>
            <div class="meal-stop-options">
              ${stationMarkup}
            </div>
          </section>
        `;
      },
    )
    .join("");
}

function validateDates(formData) {
  const depart = new Date(formData.get("departDate"));
  const leave = new Date(formData.get("returnDate"));

  if (depart > leave) {
    return "Leaving the destination must be on or after departure from origin.";
  }

  return "";
}

async function previewTrip({ scrollToRoutes = false } = {}) {
  const formData = new FormData(tripForm);
  const error = validateDates(formData);
  const mode = formData.get("mode");
  const origin = formData.get("origin")?.trim();
  const destination = formData.get("destination")?.trim();
  const departureAt = getDepartureDateTime(formData);
  const requestId = ++previewRequestId;

  if (error) {
    formMessage.textContent = error;
    return;
  }

  if (!origin || !destination) {
    formMessage.textContent = "Enter both an origin and destination to create a route.";
    return;
  }

  if (mode !== "Car") {
    formMessage.textContent = `${mode} support is planned. This prototype currently creates car routes.`;
    return;
  }

  if (scrollToRoutes) {
    showPage("routes");
    clearRouteResultsForNewRequest(origin, destination);
  }

  formMessage.textContent = `Creating car routes from ${origin} to ${destination}.`;
  await loadDrivingDirections(origin, destination, departureAt, requestId);
}

const scheduleTripPreview = debounce(() => {
  previewTrip();
}, 700);

function scheduleTextFieldPreview(control) {
  if (control.value.trim().length >= 3) {
    scheduleTripPreview();
  }
}

function setupAutoPreview() {
  tripForm.querySelectorAll("input, select").forEach((control) => {
    if (control === gasToggle || control === restaurantToggle) return;

    if (control.type === "text") {
      control.addEventListener("change", () => scheduleTextFieldPreview(control));
      control.addEventListener("blur", () => scheduleTextFieldPreview(control));
      return;
    }

    control.addEventListener("change", () => {
      if (control.type === "date") {
        syncDateSequence(control.id);
      }
      scheduleTripPreview();
    });
  });
}

themeToggle.addEventListener("click", () => {
  setTheme(root.dataset.theme === "dark" ? "light" : "dark");
});

pageButtons.forEach((button) => {
  button.addEventListener("click", () => {
    showPage(button.dataset.pageTarget);
  });
});

directionsToggle.addEventListener("click", () => {
  setDirectionsExpanded(directionsList.hidden);
});

tripForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await previewTrip({ scrollToRoutes: true });
});

gasToggle.addEventListener("change", () => {
  renderGasStations();
  scheduleTripPreview();
});

restaurantToggle.addEventListener("change", () => {
  renderRestaurants();
  scheduleTripPreview();
});

setTheme(localStorage.getItem("travel-helper-theme") || "light");
setDefaultDates();
setDefaultTripValues();
setupAddressAutocomplete("#origin", "#originSuggestions");
setupAddressAutocomplete("#destination", "#destinationSuggestions");
setupAutoPreview();
initMap();
renderRoutes();
renderRestaurants();
renderGasStations();
previewTrip();
