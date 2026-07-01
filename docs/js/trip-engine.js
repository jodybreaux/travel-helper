import {
  ROUTE_RECOMMENDATION_SEARCH_RADIUS_METERS,
  ROUTE_RECOMMENDATION_SEARCH_RADIUS_MILES,
  TRIP_STOP_INTERVAL_SECONDS,
  FOOD_STOP_DURATION_SECONDS,
  FORWARD_RECOMMENDATION_INTERVAL_SECONDS,
  FORWARD_RECOMMENDATION_LOOKAHEAD_SECONDS,
  FORWARD_RECOMMENDATION_RETRY_POINTS,
  FOOD_FORWARD_RECOMMENDATION_LOOKAHEAD_MILES,
  OVERPASS_REQUEST_TIMEOUT_MS,
  MAX_RESTAURANTS_PER_STOP,
  MAX_FUEL_STATIONS_PER_STOP,
  SHORT_TRIP_RECOMMENDATION_LIMIT,
  ROUTE_OPTION_COUNT,
  MAX_SYNTHETIC_ROUTE_ATTEMPTS,
  ROUTE_OVERVIEW_MAX_ZOOM,
  ROUTE_OVERVIEW_PADDING,
  ROUTE_TEMPLATES,
  DEFAULT_ORIGIN,
  DEFAULT_DESTINATION,
  CENTRAL_TEXAS_VIEWBOX,
} from "./constants.js";
import {
  getState,
  patchState,
  saveFormFromControls,
  loadFormIntoForm,
  getTimezone,
  isRestaurantEnabled,
  isGasEnabled,
} from "./trip-store.js";
import { ui } from "./ui.js";
import {
  fetchWeatherAlertsForRoute,
  getWeatherSeverityColor,
} from "./weather.js";

let routes = [];

function getTripForm() {
  return ui.tripForm;
}

function getGasToggle() {
  return getTripForm()?.querySelector("#gasToggle");
}

function getRestaurantToggle() {
  return getTripForm()?.querySelector("#restaurantToggle");
}

function gasToggleChecked() {
  const toggle = getGasToggle();
  return toggle ? toggle.checked : isGasEnabled();
}

function restaurantToggleChecked() {
  const toggle = getRestaurantToggle();
  return toggle ? toggle.checked : isRestaurantEnabled();
}

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
  restaurantStopIds: new Set(),
  fuelStopIds: new Set(),
  townStopIds: new Set(),
};

function serializeRecommendationLoading(loadingState) {
  return {
    restaurants: loadingState.restaurants,
    fuel: loadingState.fuel,
    restaurantStopIds: [...loadingState.restaurantStopIds],
    fuelStopIds: [...loadingState.fuelStopIds],
    townStopIds: [...loadingState.townStopIds],
  };
}

function reviveRecommendationLoading(raw = {}) {
  return {
    restaurants: Boolean(raw.restaurants),
    fuel: Boolean(raw.fuel),
    restaurantStopIds: new Set(raw.restaurantStopIds || []),
    fuelStopIds: new Set(raw.fuelStopIds || []),
    townStopIds: new Set(raw.townStopIds || []),
  };
}

function serializeTripStop(stop) {
  return {
    ...stop,
    passTime: stop.passTime instanceof Date ? stop.passTime.toISOString() : stop.passTime,
  };
}

function reviveTripStop(stop) {
  return {
    ...stop,
    passTime: stop.passTime ? new Date(stop.passTime) : null,
  };
}

function serializeRecommendation(item) {
  return {
    ...item,
    passTime: item.passTime instanceof Date ? item.passTime.toISOString() : item.passTime,
  };
}

function reviveRecommendation(item) {
  return {
    ...item,
    passTime: item.passTime ? new Date(item.passTime) : null,
  };
}

export function persistTripState() {
  patchState({
    routeTemplates: routes.map((route) => ({ ...route })),
    activeRouteOptions,
    activeOrigin,
    activeDestination,
    activeDepartureAt: activeDepartureAt ? activeDepartureAt.toISOString() : null,
    selectedRouteIndex,
    previewRequestId,
    activeRestaurants: activeRestaurants.map(serializeRecommendation),
    activeFuelStations: activeFuelStations.map(serializeRecommendation),
    activeTripStops: activeTripStops.map(serializeTripStop),
    recommendationLoading: serializeRecommendationLoading(recommendationLoading),
  });
}

export function hydrateTripState() {
  const state = getState();
  routes = state.routeTemplates?.length
    ? state.routeTemplates.map((route) => ({ ...route }))
    : ROUTE_TEMPLATES.map((route) => ({ ...route }));
  activeRouteOptions = state.activeRouteOptions || [];
  activeOrigin = state.activeOrigin || null;
  activeDestination = state.activeDestination || null;
  activeDepartureAt = state.activeDepartureAt ? new Date(state.activeDepartureAt) : null;
  selectedRouteIndex = state.selectedRouteIndex;
  previewRequestId = state.previewRequestId || 0;
  activeRestaurants = (state.activeRestaurants || []).map(reviveRecommendation);
  activeFuelStations = (state.activeFuelStations || []).map(reviveRecommendation);
  activeTripStops = (state.activeTripStops || []).map(reviveTripStop);
  recommendationLoading = reviveRecommendationLoading(state.recommendationLoading);
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
    if (ui.mapStatus) {
      ui.mapStatus.textContent = "Map library did not load. Check your internet connection and refresh.";
    }
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
  const timezone = getTimezone();

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
  if (!ui.directionsToggle || !ui.directionsList) return;
  ui.directionsToggle.hidden = ui.directionsList.children.length === 0;
  ui.directionsToggle.textContent = isExpanded ? "Hide detailed turns" : "Show detailed turns";
  ui.directionsToggle.setAttribute("aria-expanded", String(isExpanded));
  ui.directionsList.hidden = !isExpanded;
}

function clearDirections() {
  if (!ui.directionsList) return;
  ui.directionsList.innerHTML = "";
  setDirectionsExpanded(false);
}

function renderDirections(route) {
  if (!ui.directionsList) return;
  clearDirections();

  route.legs.flatMap((leg) => leg.steps).forEach((step) => {
    const item = document.createElement("li");
    item.textContent = `${getStepInstruction(step)} · ${formatDistance(step.distance)} · ${formatDuration(step.duration)}`;
    ui.directionsList.appendChild(item);
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
  return getTimezone();
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

function getForwardRecommendationSearchPointsWithinMiles(route, tripStops = [], maxDistanceAheadMiles) {
  const searchPoints = [];

  tripStops.forEach((tripStop, index) => {
    const addForwardPoint = (location, elapsedSeconds) => {
      if (!location) return false;

      const distanceAheadMiles = Math.max(0, location.distanceFromOriginMiles - tripStop.distanceFromOriginMiles);
      if (distanceAheadMiles > maxDistanceAheadMiles) return false;
      if (distanceAheadMiles <= 0) return true;
      if (searchPoints.some((point) => point.anchorTripStopId === tripStop.id && Math.abs((point.distanceAheadMiles || 0) - distanceAheadMiles) < 0.1)) {
        return true;
      }

      searchPoints.push({
        ...location,
        id: `${tripStop.id}-forward-${elapsedSeconds}`,
        anchorTripStopId: tripStop.id,
        isForwardFallback: true,
        distanceAheadMiles,
      });
      return true;
    };

    searchPoints.push({
      ...tripStop,
      anchorTripStopId: tripStop.id,
      isForwardFallback: false,
      distanceAheadMiles: 0,
    });

    const nextStopElapsed = tripStops[index + 1]?.elapsedSeconds ?? route.duration ?? tripStop.elapsedSeconds;
    const maxElapsed = Math.min(route.duration || nextStopElapsed, nextStopElapsed);

    for (
      let elapsedSeconds = tripStop.elapsedSeconds + FORWARD_RECOMMENDATION_INTERVAL_SECONDS;
      elapsedSeconds <= maxElapsed;
      elapsedSeconds += FORWARD_RECOMMENDATION_INTERVAL_SECONDS
    ) {
      const location = getRoutePositionAtElapsed(route, elapsedSeconds);
      if (!addForwardPoint(location, elapsedSeconds)) break;
    }

    if (maxElapsed > tripStop.elapsedSeconds) {
      addForwardPoint(getRoutePositionAtElapsed(route, maxElapsed), maxElapsed);
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
  const date = formData.get("departDate") || ui.tripForm?.elements.departDate?.value || getState().form.departDate;
  const time = formData.get("departTime") || ui.tripForm?.elements.departTime?.value || getState().form.departTime || "08:00";

  return new Date(`${date}T${time}`);
}

function getNearbyTownName(address = {}) {
  return address.city
    || address.town
    || address.village
    || address.hamlet
    || address.suburb
    || address.municipality
    || address.county
    || "";
}

async function fetchNearbyTownName(point) {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", point.lat);
  url.searchParams.set("lon", point.lon);
  url.searchParams.set("zoom", "10");
  url.searchParams.set("addressdetails", "1");

  const response = await fetch(url);
  if (!response.ok) return "";

  const data = await response.json();
  return getNearbyTownName(data.address || {});
}

function mergeRecommendations(existingItems, newItems) {
  const itemsById = new Map();
  existingItems.forEach((item) => {
    itemsById.set(item.id, item);
  });
  newItems.forEach((item) => {
    itemsById.set(item.id, item);
  });
  return [...itemsById.values()];
}

function sortRestaurants(restaurants) {
  return preferDirectRecommendations(restaurants)
    .sort((a, b) => {
      const timeOrder = (a.passTime?.getTime() || 0) - (b.passTime?.getTime() || 0);
      return timeOrder || a.distanceAheadMiles - b.distanceAheadMiles || a.distanceMiles - b.distanceMiles;
    })
    .filter((restaurant, index, sortedRestaurants) => {
      const stopCount = sortedRestaurants.slice(0, index).filter((item) => item.tripStopId === restaurant.tripStopId).length;
      return stopCount < getFoodRecommendationLimit(restaurant);
    });
}

function sortFuelStations(stations) {
  return preferDirectRecommendations(stations)
    .sort((a, b) => {
      const timeOrder = (a.passTime?.getTime() || 0) - (b.passTime?.getTime() || 0);
      return timeOrder || a.distanceAheadMiles - b.distanceAheadMiles || a.distanceMiles - b.distanceMiles;
    });
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

async function fetchRestaurantsForStop(route, tripStops, tripStop, onUpdate) {
  const restaurantsById = new Map();
  const publish = (isComplete = false) => {
    onUpdate?.(sortRestaurants([...restaurantsById.values()]), tripStop.id, isComplete);
  };
  const directSearchPoint = {
    ...tripStop,
    anchorTripStopId: tripStop.id,
    isForwardFallback: false,
    distanceAheadMiles: 0,
  };

  try {
    const data = await fetchOverpassData(buildRestaurantQuery([directSearchPoint]), "Restaurant lookup is unavailable right now.");
    data.elements
      .map((element) => normalizeRestaurant(element, tripStops, [directSearchPoint]))
      .filter((restaurant) => restaurant && restaurant.distanceMiles <= ROUTE_RECOMMENDATION_SEARCH_RADIUS_MILES)
      .forEach((restaurant) => {
        restaurantsById.set(restaurant.id, restaurant);
      });
    if (restaurantsById.size) {
      publish(true);
      return sortRestaurants([...restaurantsById.values()]);
    }
    publish(false);
  } catch {
    // Continue to forward fallback points before showing no restaurant options.
  }

  const fallbackSearchPoints = getForwardRecommendationSearchPointsWithinMiles(
    route,
    tripStops,
    FOOD_FORWARD_RECOMMENDATION_LOOKAHEAD_MILES,
  )
    .filter((point) => point.isForwardFallback && point.anchorTripStopId === tripStop.id);

  try {
    if (fallbackSearchPoints.length) {
      const data = await fetchOverpassData(buildRestaurantQuery(fallbackSearchPoints), "Restaurant lookup is unavailable right now.");
      preferDirectRecommendations(
        data.elements
          .map((element) => normalizeRestaurant(element, tripStops, fallbackSearchPoints))
          .filter((restaurant) => restaurant && restaurant.distanceMiles <= ROUTE_RECOMMENDATION_SEARCH_RADIUS_MILES),
      ).forEach((restaurant) => {
        restaurantsById.set(restaurant.id, restaurant);
      });
      if (restaurantsById.size) {
        publish(true);
        return sortRestaurants([...restaurantsById.values()]);
      }
      publish(false);
    }
  } catch {
    // Continue to per-point retries; public endpoints can fail intermittently.
  }

  for (const searchPoint of fallbackSearchPoints) {
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
      // Continue to the next point ahead.
    }
  }

  publish(true);
  return sortRestaurants([...restaurantsById.values()]);
}

async function fetchRestaurantsAlongRoute(route, departureAt, onUpdate) {
  const tripStops = activeTripStops.length ? activeTripStops : getTripRecommendationStops(route, departureAt);
  activeTripStops = tripStops;

  if (!tripStops.length) {
    return [];
  }

  const restaurantsById = new Map();
  await Promise.all(
    tripStops.map(async (tripStop) => {
      const stopRestaurants = await fetchRestaurantsForStop(route, tripStops, tripStop, (items, stopId, isComplete) => {
        onUpdate?.(items, stopId, isComplete);
      });
      stopRestaurants.forEach((restaurant) => {
        restaurantsById.set(restaurant.id, restaurant);
      });
    }),
  );

  return sortRestaurants([...restaurantsById.values()]);
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

async function fetchFuelStationsForStop(route, tripStops, tripStop, onUpdate) {
  const stationsById = new Map();
  const publish = (isComplete = false) => {
    onUpdate?.(sortFuelStations([...stationsById.values()]), tripStop.id, isComplete);
  };
  const directSearchPoint = {
    ...tripStop,
    anchorTripStopId: tripStop.id,
    isForwardFallback: false,
    distanceAheadMiles: 0,
  };

  try {
    const data = await fetchOverpassData(buildFuelQuery([directSearchPoint]), "Fuel station lookup is unavailable right now.");
    data.elements
      .map((element) => normalizeFuelStation(element, tripStops, [directSearchPoint]))
      .filter((station) => station && station.distanceMiles <= ROUTE_RECOMMENDATION_SEARCH_RADIUS_MILES)
      .forEach((station) => {
        stationsById.set(station.id, station);
      });
    if (stationsById.size) {
      publish(true);
      return sortFuelStations([...stationsById.values()]);
    }
    publish(false);
  } catch {
    // Continue to forward fallback points before showing no fuel options.
  }

  const fallbackSearchPoints = getForwardRecommendationSearchPoints(route, tripStops)
    .filter((point) => point.isForwardFallback && point.anchorTripStopId === tripStop.id);

  try {
    if (fallbackSearchPoints.length) {
      const data = await fetchOverpassData(buildFuelQuery(fallbackSearchPoints), "Fuel station lookup is unavailable right now.");
      preferDirectRecommendations(
        data.elements
          .map((element) => normalizeFuelStation(element, tripStops, fallbackSearchPoints))
          .filter((station) => station && station.distanceMiles <= ROUTE_RECOMMENDATION_SEARCH_RADIUS_MILES),
      ).forEach((station) => {
        stationsById.set(station.id, station);
      });
      if (stationsById.size) {
        publish(true);
        return sortFuelStations([...stationsById.values()]);
      }
      publish(false);
    }
  } catch {
    // Continue to per-point retries; public endpoints can fail intermittently.
  }

  for (const searchPoint of fallbackSearchPoints.slice(0, FORWARD_RECOMMENDATION_RETRY_POINTS)) {
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
      // Continue to the next point ahead.
    }
  }

  publish(true);
  return sortFuelStations([...stationsById.values()]);
}

async function fetchFuelStationsAlongRoute(route, departureAt, onUpdate) {
  const tripStops = activeTripStops.length ? activeTripStops : getTripRecommendationStops(route, departureAt);
  activeTripStops = tripStops;

  if (!tripStops.length) {
    return [];
  }

  const stationsById = new Map();
  await Promise.all(
    tripStops.map(async (tripStop) => {
      const stopStations = await fetchFuelStationsForStop(route, tripStops, tripStop, (items, stopId, isComplete) => {
        onUpdate?.(items, stopId, isComplete);
      });
      stopStations.forEach((station) => {
        stationsById.set(station.id, station);
      });
    }),
  );

  return sortFuelStations([...stationsById.values()]);
}

function drawRestaurantMarkers(restaurants) {
  if (!restaurantMarkers) return;

  restaurantMarkers.clearLayers();

  if (!restaurantToggleChecked()) return;

  restaurants.forEach((restaurant) => {
    L.marker([restaurant.lat, restaurant.lon])
      .addTo(restaurantMarkers)
      .bindPopup(`<strong>${escapeHtml(restaurant.name)}</strong><br>${escapeHtml(restaurant.label)} near ${escapeHtml(restaurant.road)}<br>${escapeHtml(restaurant.cuisine)}`);
  });
}

function renderWeatherAlerts(alerts) {
  if (!ui.weatherList) return;

  if (!alerts.length) {
    ui.weatherList.innerHTML = "<li><strong>No active NWS alerts:</strong> No inclement-weather alerts found within the mapped route area.</li>";
    return;
  }

  ui.weatherList.innerHTML = alerts
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

async function loadWeatherAlerts(route, requestId = previewRequestId) {
  if (!route) return;

  if (ui.weatherList) {
    ui.weatherList.innerHTML = "<li>Checking for active inclement-weather alerts along the route...</li>";
  }
  weatherAlertLayer?.clearLayers();

  try {
    const alerts = await fetchWeatherAlertsForRoute(route);
    if (requestId !== previewRequestId) return;
    drawWeatherAlertOverlay(alerts);
    renderWeatherAlerts(alerts);
  } catch (error) {
    if (requestId !== previewRequestId) return;
    if (ui.weatherList) {
      ui.weatherList.innerHTML = `<li><strong>Weather overlay unavailable:</strong> ${escapeHtml(error.message)}</li>`;
    }
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
    restaurantStopIds: new Set(),
    fuelStopIds: new Set(),
    townStopIds: new Set(),
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
  if (ui.routeSummary) ui.routeSummary.textContent = "Creating a fresh route...";
  if (ui.mapStatus) ui.mapStatus.textContent = `Finding a driving route from ${originQuery} to ${destinationQuery}...`;
  if (ui.routeGrid) {
    ui.routeGrid.innerHTML = `<div class="empty-state">Creating a fresh route from ${escapeHtml(originQuery)} to ${escapeHtml(destinationQuery)}...</div>`;
  }
  if (ui.restaurantList) {
    ui.restaurantList.innerHTML = `<div class="empty-state">Food recommendations will load after the new route is ready.</div>`;
  }
  if (ui.gasPanel) {
    ui.gasPanel.className = "empty-state";
    ui.gasPanel.innerHTML = "Gas recommendations will load after the new route is ready.";
  }
  persistTripState();
}

function loadTripStopTownNames(tripStops, requestId) {
  tripStops.forEach((tripStop) => {
    fetchNearbyTownName(tripStop)
      .then((townName) => {
        if (requestId !== previewRequestId) return;
        tripStop.nearTown = townName;
      })
      .catch(() => {
        // Town names improve context but should never block recommendations.
      })
      .finally(() => {
        if (requestId !== previewRequestId) return;
        recommendationLoading.townStopIds.delete(tripStop.id);
        renderRestaurants();
        renderGasStations();
      });
  });
}

function displayRouteSelection(index, requestId = previewRequestId, { loadRecommendations = true } = {}) {
  const route = activeRouteOptions[index];
  if (!route || !activeOrigin || !activeDestination) return;
  const departureAt = activeDepartureAt || getDepartureDateTime(new FormData(ui.tripForm));

  selectedRouteIndex = index;
  renderRoutes(index);
  drawRoute(route, activeOrigin, activeDestination);
  renderDirections(route);
  loadWeatherAlerts(route, requestId);
  if (ui.routeSummary) {
    ui.routeSummary.textContent = `${formatDistance(route.distance)} · ${formatDuration(getRouteDurationWithStops(route))} with food stops · ${formatDuration(route.duration)} driving · ${route.legs[0].steps.length} driving steps`;
  }

  activeRestaurants = [];
  activeFuelStations = [];
  activeTripStops = getTripRecommendationStops(route, departureAt);
  recommendationLoading = {
    restaurants: loadRecommendations && restaurantToggleChecked() && activeTripStops.length > 0,
    fuel: loadRecommendations && gasToggleChecked() && activeTripStops.length > 0,
    restaurantStopIds: new Set(loadRecommendations && restaurantToggleChecked() ? activeTripStops.map((tripStop) => tripStop.id) : []),
    fuelStopIds: new Set(loadRecommendations && gasToggleChecked() ? activeTripStops.map((tripStop) => tripStop.id) : []),
    townStopIds: new Set(activeTripStops.map((tripStop) => tripStop.id)),
  };
  drawRestaurantMarkers([]);
  renderRestaurants();
  renderGasStations();
  persistTripState();

  if (!loadRecommendations) {
    return;
  }

  loadTripStopTownNames(activeTripStops, requestId);

  if (restaurantToggleChecked()) {
    fetchRestaurantsAlongRoute(route, departureAt, (restaurants, stopId, isComplete) => {
      if (requestId !== previewRequestId) return;
      activeRestaurants = sortRestaurants(mergeRecommendations(activeRestaurants, restaurants));
      if (isComplete) recommendationLoading.restaurantStopIds.delete(stopId);
      recommendationLoading.restaurants = recommendationLoading.restaurantStopIds.size > 0;
      renderRestaurants();
      persistTripState();
    })
      .then((restaurants) => {
        if (requestId !== previewRequestId) return;
        activeRestaurants = sortRestaurants(mergeRecommendations(activeRestaurants, restaurants));
        recommendationLoading.restaurants = false;
        recommendationLoading.restaurantStopIds.clear();
        renderRestaurants();
        persistTripState();
      })
      .catch((restaurantError) => {
        if (requestId !== previewRequestId) return;
        recommendationLoading.restaurants = false;
        recommendationLoading.restaurantStopIds.clear();
        if (ui.restaurantList) {
          ui.restaurantList.innerHTML = `<div class="empty-state">${escapeHtml(restaurantError.message)}</div>`;
        }
        persistTripState();
      });
  }

  if (gasToggleChecked()) {
    fetchFuelStationsAlongRoute(route, departureAt, (stations, stopId, isComplete) => {
      if (requestId !== previewRequestId) return;
      activeFuelStations = sortFuelStations(mergeRecommendations(activeFuelStations, stations));
      if (isComplete) recommendationLoading.fuelStopIds.delete(stopId);
      recommendationLoading.fuel = recommendationLoading.fuelStopIds.size > 0;
      renderGasStations();
      if (restaurantToggleChecked()) renderRestaurants();
      persistTripState();
    })
      .then((stations) => {
        if (requestId !== previewRequestId) return;
        activeFuelStations = sortFuelStations(mergeRecommendations(activeFuelStations, stations));
        recommendationLoading.fuel = false;
        recommendationLoading.fuelStopIds.clear();
        renderGasStations();
        if (restaurantToggleChecked()) renderRestaurants();
      })
      .catch((fuelError) => {
        if (requestId !== previewRequestId) return;
        recommendationLoading.fuel = false;
        recommendationLoading.fuelStopIds.clear();
        ui.gasPanel.className = "empty-state";
        ui.gasPanel.innerHTML = escapeHtml(fuelError.message);
        if (restaurantToggleChecked()) renderRestaurants();
      });
  }
}

async function loadDrivingDirections(
  originQuery,
  destinationQuery,
  departureAt = getDepartureDateTime(new FormData(ui.tripForm)),
  requestId = previewRequestId,
  { loadRecommendations = true } = {},
) {
  if (ui.mapStatus) {
    ui.mapStatus.textContent = `Finding a driving route from ${originQuery} to ${destinationQuery}...`;
  }

  try {
    const [origin, destination] = await Promise.all([
      geocodeLocation(originQuery),
      geocodeLocation(destinationQuery),
    ]);
    const routeOptions = await fetchDrivingRoute(origin, destination);
    if (requestId !== previewRequestId) return;

    if (ui.routeSummary) ui.routeSummary.textContent = "Calculating route...";
    clearDirections();
    activeRestaurants = [];
    activeFuelStations = [];
    activeTripStops = [];
    if (loadRecommendations && restaurantToggleChecked() && ui.restaurantList) {
      ui.restaurantList.innerHTML = `<div class="empty-state">Checking the route for food recommendations...</div>`;
    }
    if (loadRecommendations && gasToggleChecked() && ui.gasPanel) {
      ui.gasPanel.className = "empty-state";
      ui.gasPanel.innerHTML = "Checking the route for gas recommendations...";
    }
    drawRestaurantMarkers([]);

    activeOrigin = origin;
    activeDestination = destination;
    activeDepartureAt = departureAt;
    activeRouteOptions = routeOptions.slice(0, routes.length);
    updateRouteCardStats(activeRouteOptions);

    if (ui.mapStatus) {
      ui.mapStatus.textContent = `Driving route ready from ${originQuery} to ${destinationQuery}.`;
    }
    displayRouteSelection(0, requestId, { loadRecommendations });
    persistTripState();
  } catch (error) {
    if (requestId !== previewRequestId) return;
    if (ui.mapStatus) ui.mapStatus.textContent = error.message;
    if (ui.formMessage) ui.formMessage.textContent = "Route preview paused until both locations can be found.";
    if (ui.routeSummary) {
      ui.routeSummary.textContent = activeRouteOptions.length
        ? "Showing the previous route. Try a more specific city, state, or street address."
        : "Try a more specific city, state, or street address.";
    }
  }
}

function renderRoutes(selectedIndex = selectedRouteIndex) {
  if (!ui.routeGrid) return;

  const availableRoutes = activeRouteOptions.length
    ? routes.filter((_, index) => activeRouteOptions[index])
    : routes;
  const routesToRender = selectedIndex == null ? availableRoutes : [routes[selectedIndex]];

  ui.routeGrid.innerHTML = routesToRender
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
    ui.routeGrid.insertAdjacentHTML(
      "beforeend",
      `<a class="route-link" href="#routes" data-show-routes>Show all route options</a>`,
    );
  }

  ui.  ui.routeGrid.querySelectorAll("[data-route]").forEach((button) => {
    button.addEventListener("click", () => {
      displayRouteSelection(Number(button.dataset.route));
      if (ui.formMessage) {
        ui.formMessage.textContent = `${routes[selectedRouteIndex].title} selected for detailed planning.`;
      }
      persistTripState();
    });
  });

  ui.routeGrid.querySelector("[data-show-routes]")?.addEventListener("click", (event) => {
    event.preventDefault();
    selectedRouteIndex = null;
    renderRoutes();
    if (ui.formMessage) ui.formMessage.textContent = "Showing all route options.";
    persistTripState();
  });
}

function renderRecommendationLoadingState(message) {
  return `<div class="empty-state loading-state" role="status">${escapeHtml(message)}</div>`;
}

function renderWaitCursor(label) {
  return `<span class="wait-cursor" role="status" aria-label="${escapeHtml(label)}"></span>`;
}

function renderStopSectionLabel(label, isLoading) {
  return `<span class="stop-section-label">${escapeHtml(label)}${isLoading ? renderWaitCursor(`${label} search in progress`) : ""}</span>`;
}

function renderRestaurants() {
  if (!ui.restaurantList) return;

  if (!restaurantToggleChecked()) {
    ui.restaurantList.innerHTML = `<div class="empty-state">Restaurant recommendations are off.</div>`;
    drawRestaurantMarkers([]);
    return;
  }

  if (!activeTripStops.length) {
    ui.restaurantList.innerHTML = `<div class="empty-state">No route recommendation point is available for food suggestions yet.</div>`;
    return;
  }

  ui.restaurantList.innerHTML = activeTripStops
    .map(
      (tripStop) => {
        const options = activeRestaurants.filter((restaurant) => restaurant.tripStopId === tripStop.id);
        const gasOptions = getGasSuggestionsForStop(tripStop);
        const isFoodLoading = recommendationLoading.restaurantStopIds.has(tripStop.id);
        const isGasLoading = recommendationLoading.fuelStopIds.has(tripStop.id);
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
          : isFoodLoading
            ? renderRecommendationLoadingState("Looking for viable food options near this stop area.")
          : `<div class="empty-state">Food options are still being checked up to ${FOOD_FORWARD_RECOMMENDATION_LOOKAHEAD_MILES} miles ahead of this stop. Public map data can be slow, so try refreshing if this does not update.</div>`;
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
          .join("") || (isGasLoading
            ? renderRecommendationLoadingState("Looking for viable gas options near this stop area.")
            : `<div class="empty-state">${tripStop.isShortTrip ? "No named fuel stations found along this route yet." : "No named fuel stations found near this food stop yet."}</div>`);

        return `
          <section class="meal-stop-card ${tripStop.colorClass}" aria-label="${escapeHtml(tripStop.label)} food and gas options">
            <div class="meal-stop-heading">
              <strong>${escapeHtml(tripStop.label)} around ${escapeHtml(formatMealTime(tripStop.passTime))}</strong>
              <span>${escapeHtml(getTripStopTimingText(tripStop))}</span>
            </div>
            <div class="meal-stop-options">
              ${renderStopSectionLabel("Food options", isFoodLoading)}
              ${optionMarkup}
              ${renderStopSectionLabel("Gas options", isGasLoading)}
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
  const townText = tripStop.nearTown
    ? `Near ${tripStop.nearTown}`
    : recommendationLoading.townStopIds.has(tripStop.id)
      ? "Locating nearby town"
      : "";
  const elapsedText = `${formatDuration(tripStop.elapsedWithStopsSeconds)} into the trip`;
  const timingParts = [distanceText, townText, elapsedText].filter(Boolean);

  if (tripStop.isShortTrip) {
    return `${timingParts.join(" · ")} · near ${tripStop.road}`;
  }

  return `${distanceText}${townText ? ` · ${townText}` : ""} · ${elapsedText}, including prior food stops · near ${tripStop.road}`;
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
  if (!ui.gasPanel) return;

  if (!gasToggleChecked()) {
    ui.gasPanel.className = "empty-state";
    ui.gasPanel.innerHTML = "Gas station display is off.";
    return;
  }

  if (!activeTripStops.length) {
    ui.gasPanel.className = "empty-state";
    ui.gasPanel.innerHTML = "No route recommendation point is available for gas suggestions yet.";
    return;
  }

  ui.gasPanel.className = "restaurant-list";
  ui.gasPanel.innerHTML = activeTripStops
    .map(
      (tripStop) => {
        const isGasLoading = recommendationLoading.fuelStopIds.has(tripStop.id);
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
          .join("") || (isGasLoading
            ? renderRecommendationLoadingState("Looking for viable gas options near this stop area.")
            : `<div class="empty-state">${tripStop.isShortTrip ? "No named fuel stations found along this route yet." : "No named fuel stations found near this four-hour stop yet."}</div>`);

        return `
          <section class="meal-stop-card ${tripStop.colorClass}" aria-label="${escapeHtml(tripStop.label)} gas options">
            <div class="meal-stop-heading">
              <strong>Gas near ${escapeHtml(tripStop.label.toLowerCase())}${isGasLoading ? renderWaitCursor("Gas search in progress") : ""}</strong>
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

async function previewTrip({ navigateToRoutes = false } = {}) {
  const formData = new FormData(ui.tripForm);
  saveFormFromControls(ui.tripForm);
  const error = validateDates(formData);
  const mode = formData.get("mode");
  const origin = formData.get("origin")?.trim();
  const destination = formData.get("destination")?.trim();
  const departureAt = getDepartureDateTime(formData);
  const requestId = ++previewRequestId;

  if (error) {
    if (ui.formMessage) ui.formMessage.textContent = error;
    return;
  }

  if (!origin || !destination) {
    if (ui.formMessage) ui.formMessage.textContent = "Enter both an origin and destination to create a route.";
    return;
  }

  if (mode !== "Car") {
    if (ui.formMessage) ui.formMessage.textContent = `${mode} support is planned. This prototype currently creates car routes.`;
    return;
  }

  if (ui.formMessage) {
    ui.formMessage.textContent = `Creating car routes from ${origin} to ${destination}.`;
  }

  if (navigateToRoutes) {
    selectedRouteIndex = null;
    activeRouteOptions = [];
    activeRestaurants = [];
    activeFuelStations = [];
    activeTripStops = [];
    recommendationLoading = {
      restaurants: false,
      fuel: false,
      restaurantStopIds: new Set(),
      fuelStopIds: new Set(),
      townStopIds: new Set(),
    };
    persistTripState();
    window.location.href = "routes.html";
    return;
  }

  await loadDrivingDirections(origin, destination, departureAt, requestId, { loadRecommendations: false });
  persistTripState();
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
  if (!ui.tripForm) return;

  ui.tripForm.querySelectorAll("input, select").forEach((control) => {
    if (control.id === "gasToggle" || control.id === "restaurantToggle") return;

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

export function initRouteInfoPage() {
  hydrateTripState();
  setupAddressAutocomplete("#origin", "#originSuggestions");
  setupAddressAutocomplete("#destination", "#destinationSuggestions");
  loadFormIntoForm(ui.tripForm);

  if (!ui.tripForm?.elements.origin?.value) {
    setDefaultTripValues();
  }
  if (!ui.tripForm?.elements.departDate?.value) {
    setDefaultDates();
  } else {
    syncDateSequence();
  }

  setupAutoPreview();

  const gasToggle = getGasToggle();
  const restaurantToggle = getRestaurantToggle();

  ui.tripForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await previewTrip({ navigateToRoutes: true });
  });

  gasToggle?.addEventListener("change", () => {
    saveFormFromControls(ui.tripForm);
    scheduleTripPreview();
  });

  restaurantToggle?.addEventListener("change", () => {
    saveFormFromControls(ui.tripForm);
    scheduleTripPreview();
  });

  previewTrip();
}

export function initRoutesPage() {
  hydrateTripState();
  initMap();
  renderRoutes();

  if (ui.directionsToggle && ui.directionsList) {
    ui.directionsToggle.addEventListener("click", () => {
      setDirectionsExpanded(ui.directionsList.hidden);
    });
  }

  if (activeRouteOptions.length && activeOrigin && activeDestination) {
    const index = selectedRouteIndex ?? 0;
    displayRouteSelection(index, previewRequestId, { loadRecommendations: true });
  } else {
    const { form } = getState();
    if (form.origin && form.destination) {
      const departureAt = getDepartureDateTime(new FormData());
      const requestId = ++previewRequestId;
      loadDrivingDirections(form.origin, form.destination, departureAt, requestId, { loadRecommendations: true });
    } else if (ui.mapStatus) {
      ui.mapStatus.textContent = "Enter a trip on the route info page to calculate driving directions.";
    }
  }

  if (map) {
    setTimeout(() => map.invalidateSize(), 0);
  }
}

export function initMealsPage() {
  hydrateTripState();

  const gasToggle = document.querySelector("#gasToggle");
  const restaurantToggle = document.querySelector("#restaurantToggle");
  if (gasToggle) gasToggle.checked = isGasEnabled();
  if (restaurantToggle) restaurantToggle.checked = isRestaurantEnabled();

  renderRestaurants();
}

export function initGasPage() {
  hydrateTripState();
  renderGasStations();
}
