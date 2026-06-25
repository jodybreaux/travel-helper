const routes = [
  {
    type: "Fastest",
    title: "Quickest Route",
    score: "Best time",
    time: "7h 12m",
    distance: "472 mi",
    summary: "Prioritizes major highways and avoids known construction near metro areas.",
    highlights: ["Low delay", "2 weather checks", "1 meal stop"],
  },
  {
    type: "Scenic",
    title: "River & Landmarks",
    score: "Most POIs",
    time: "8h 05m",
    distance: "498 mi",
    summary: "Adds landmark-rich segments and a more relaxed lunch stop near a downtown district.",
    highlights: ["6 attractions", "Lunch window", "Photo stops"],
  },
  {
    type: "Balanced",
    title: "Smart Alternate",
    score: "Recommended",
    time: "7h 34m",
    distance: "486 mi",
    summary: "Balances arrival time, traffic exposure, weather conditions, and attractions.",
    highlights: ["4 attractions", "Avoids delays", "Fuel friendly"],
  },
];

const gasStations = [
  {
    name: "Pilot Travel Center",
    details: "0.8 mi from route · diesel · open 24 hours",
  },
  {
    name: "Shell Market",
    details: "1.4 mi from route · regular $3.41 est.",
  },
  {
    name: "Love's Travel Stop",
    details: "2.2 mi from route · EV charging nearby",
  },
];

const mealWindows = [
  { name: "Breakfast", targetHour: 7 },
  { name: "Lunch", targetHour: 12 },
  { name: "Dinner", targetHour: 19 },
];

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
const directionsList = document.querySelector("#directionsList");
const weatherList = document.querySelector("#weatherList");

let map;
let routeLayer;
let originMarker;
let destinationMarker;
let restaurantMarkers;
let weatherAlertLayer;
let activeRestaurants = [];
let activeMealWindows = [];
let selectedRouteIndex = null;
let previewRequestId = 0;

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
    arrivalDate: today,
    returnDate: tomorrowValue,
    homeDate: tomorrowValue,
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
  const arrivalDate = document.querySelector("#arrivalDate");
  const returnDate = document.querySelector("#returnDate");
  const homeDate = document.querySelector("#homeDate");
  const today = getToday();

  ensureDateAtLeast(departDate, today);
  ensureDateAtLeast(arrivalDate, departDate.value);
  ensureDateAtLeast(returnDate, addDays(arrivalDate.value, 1));
  ensureDateAtLeast(homeDate, addDays(returnDate.value, 1));

  if (changedId === "departDate") {
    ensureDateAtLeast(arrivalDate, departDate.value);
  }

  if (changedId === "arrivalDate" || changedId === "departDate") {
    ensureDateAtLeast(returnDate, addDays(arrivalDate.value, 1));
  }

  if (changedId === "returnDate" || changedId === "arrivalDate" || changedId === "departDate") {
    ensureDateAtLeast(homeDate, addDays(returnDate.value, 1));
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

async function fetchDrivingRoute(origin, destination) {
  const coordinates = `${origin.lon},${origin.lat};${destination.lon},${destination.lat}`;
  const url = new URL(`https://router.project-osrm.org/route/v1/driving/${coordinates}`);
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("steps", "true");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Driving directions could not be calculated.");
  }

  const data = await response.json();
  if (data.code !== "Ok" || !data.routes.length) {
    throw new Error("No driving route found for those locations.");
  }

  return data.routes[0];
}

function getStepInstruction(step) {
  const maneuver = step.maneuver || {};
  const action = [maneuver.modifier, maneuver.type].filter(Boolean).join(" ");
  const road = step.name ? ` onto ${step.name}` : "";
  return `${action || "Continue"}${road}`.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function renderDirections(route) {
  directionsList.innerHTML = "";

  route.legs.flatMap((leg) => leg.steps).forEach((step) => {
    const item = document.createElement("li");
    item.textContent = `${getStepInstruction(step)} · ${formatDistance(step.distance)} · ${formatDuration(step.duration)}`;
    directionsList.appendChild(item);
  });
}

function getRestaurantSearchPoints(route) {
  const coordinates = route.geometry.coordinates;
  if (coordinates.length <= 2) return coordinates;

  const sampleIndexes = [0.2, 0.4, 0.6, 0.8].map((fraction) =>
    Math.min(coordinates.length - 1, Math.floor(coordinates.length * fraction)),
  );

  return sampleIndexes.map((index) => coordinates[index]);
}

function buildRestaurantQuery(points) {
  const searches = points
    .map(
      (point) => {
        const [lon, lat] = Array.isArray(point) ? point : [point.lon, point.lat];
        return `node["amenity"="restaurant"](around:8000,${lat},${lon});way["amenity"="restaurant"](around:8000,${lat},${lon});relation["amenity"="restaurant"](around:8000,${lat},${lon});`;
      },
    )
    .join("");

  return `[out:json][timeout:25];(${searches});out center 24;`;
}

function getHourOfDay(date) {
  const timezone = document.querySelector("#timezone").value;
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

function getMatchingMealWindow(date) {
  const hour = getHourOfDay(date);
  return mealWindows.find((meal) => Math.abs(hour - meal.targetHour) <= 0.5);
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

function getRouteCoordinateAtElapsed(route, elapsedTargetSeconds) {
  let elapsedSeconds = 0;
  const steps = route.legs.flatMap((leg) => leg.steps);

  for (const step of steps) {
    const duration = step.duration || 0;
    const nextElapsedSeconds = elapsedSeconds + duration;
    const coordinates = step.geometry?.coordinates || [];

    if (elapsedTargetSeconds <= nextElapsedSeconds) {
      if (coordinates.length) {
        const fraction = duration ? (elapsedTargetSeconds - elapsedSeconds) / duration : 0;
        const index = Math.max(0, Math.min(coordinates.length - 1, Math.round(fraction * (coordinates.length - 1))));
        const [lon, lat] = coordinates[index];
        return { lon, lat, road: step.name || "route segment" };
      }

      const [lon, lat] = step.maneuver?.location || [];
      if (lon != null && lat != null) {
        return { lon, lat, road: step.name || "route segment" };
      }
    }

    elapsedSeconds = nextElapsedSeconds;
  }

  const [lon, lat] = route.geometry.coordinates.at(-1) || [];
  return lon != null && lat != null ? { lon, lat, road: "route area" } : null;
}

function getNextMealTime(departureAt, targetHour) {
  const target = new Date(departureAt);
  target.setHours(targetHour, 0, 0, 0);

  while (target < departureAt) {
    target.setDate(target.getDate() + 1);
  }

  return target;
}

function getMealWindowPoints(route, departureAt) {
  const arrivalAt = new Date(departureAt.getTime() + (route.duration || 0) * 1000);

  return mealWindows
    .map((meal) => {
      const passTime = getNextMealTime(departureAt, meal.targetHour);
      if (passTime > arrivalAt) return null;

      const elapsedSeconds = (passTime.getTime() - departureAt.getTime()) / 1000;
      const location = getRouteCoordinateAtElapsed(route, elapsedSeconds);
      if (!location) return null;

      return {
        meal: meal.name,
        mealMidpoint: meal.targetHour,
        passTime,
        ...location,
      };
    })
    .filter(Boolean);
}

function getNearbyFoodPoints(route, departureAt) {
  return getRestaurantSearchPoints(route).map((point) => {
    const [lon, lat] = Array.isArray(point) ? point : [point.lon, point.lat];

    return {
      meal: "Nearby food",
      mealMidpoint: getHourOfDay(departureAt),
      passTime: departureAt,
      lon,
      lat,
      road: "route area",
    };
  });
}

function getDepartureDateTime(formData) {
  const date = formData.get("departDate") || document.querySelector("#departDate").value;
  const time = formData.get("departTime") || document.querySelector("#departTime").value || "08:00";

  return new Date(`${date}T${time}`);
}

function normalizeRestaurant(element, mealPoints = []) {
  const tags = element.tags || {};
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;

  if (!tags.name || lat == null || lon == null) return null;

  const location = { lat, lon };
  const mealPoint = mealPoints
    .map((point) => ({
      ...point,
      distanceMiles: getDistanceMiles(location, point),
    }))
    .sort((a, b) => a.distanceMiles - b.distanceMiles)[0];
  const cuisine = tags.cuisine ? tags.cuisine.replaceAll(";", ", ") : "Cuisine not listed";
  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  const city = tags["addr:city"];
  const address = [street, city].filter(Boolean).join(", ");
  const hours = tags.opening_hours ? ` · ${tags.opening_hours}` : "";

  return {
    id: `${element.type}-${element.id}`,
    name: tags.name,
    cuisine,
    meal: mealPoint?.meal || "Meal stop",
    passTime: mealPoint?.passTime,
    road: mealPoint?.road || "route area",
    distanceMiles: mealPoint?.distanceMiles,
    details: `${cuisine}${address ? ` · ${address}` : ""}${hours}`,
    lat,
    lon,
  };
}

async function fetchRestaurantsAlongRoute(route, departureAt) {
  const mealPoints = getMealWindowPoints(route, departureAt);
  const lookupPoints = mealPoints.length ? mealPoints : getNearbyFoodPoints(route, departureAt);
  activeMealWindows = lookupPoints;

  if (!lookupPoints.length) {
    return [];
  }

  const body = new URLSearchParams({
    data: buildRestaurantQuery(lookupPoints),
  });
  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];

  let data;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Accept: "application/json",
        },
        body,
      });

      if (!response.ok) continue;

      data = await response.json();
      break;
    } catch {
      // Try the next public Overpass endpoint before showing a user-facing error.
    }
  }

  if (!data) {
    throw new Error("Restaurant lookup is unavailable right now.");
  }

  const restaurantsById = new Map();

  data.elements
    .map((element) => normalizeRestaurant(element, lookupPoints))
    .filter(Boolean)
    .forEach((restaurant) => {
      restaurantsById.set(restaurant.id, restaurant);
    });

  return [...restaurantsById.values()]
    .sort((a, b) => {
      const mealOrder = mealWindows.findIndex((meal) => meal.name === a.meal) - mealWindows.findIndex((meal) => meal.name === b.meal);
      return mealOrder || a.distanceMiles - b.distanceMiles;
    })
    .filter((restaurant, index, restaurants) => {
      const mealCount = restaurants.slice(0, index).filter((item) => item.meal === restaurant.meal).length;
      return mealCount < 3;
    });
}

function drawRestaurantMarkers(restaurants) {
  if (!restaurantMarkers) return;

  restaurantMarkers.clearLayers();

  if (!restaurantToggle.checked) return;

  restaurants.forEach((restaurant) => {
    L.marker([restaurant.lat, restaurant.lon])
      .addTo(restaurantMarkers)
      .bindPopup(`<strong>${escapeHtml(restaurant.name)}</strong><br>${escapeHtml(restaurant.meal)} near ${escapeHtml(restaurant.road)}<br>${escapeHtml(restaurant.cuisine)}`);
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

  map.fitBounds(routeLayer.getBounds(), { padding: [36, 36] });
}

async function loadDrivingDirections(originQuery, destinationQuery, departureAt = getDepartureDateTime(new FormData(tripForm)), requestId = previewRequestId) {
  if (!map) return;

  mapStatus.textContent = `Finding a driving route from ${originQuery} to ${destinationQuery}...`;
  routeSummary.textContent = "Calculating route...";
  directionsList.innerHTML = "";
  activeRestaurants = [];
  activeMealWindows = [];
  if (restaurantToggle.checked) {
    restaurantList.innerHTML = `<div class="empty-state">Checking the route timing for meal windows...</div>`;
  }
  drawRestaurantMarkers([]);

  try {
    const [origin, destination] = await Promise.all([
      geocodeLocation(originQuery),
      geocodeLocation(destinationQuery),
    ]);
    const route = await fetchDrivingRoute(origin, destination);
    if (requestId !== previewRequestId) return;

    routes[0].time = formatDuration(route.duration);
    routes[0].distance = formatDistance(route.distance);
    renderRoutes();
    drawRoute(route, origin, destination);
    renderDirections(route);
    loadWeatherAlerts(route, requestId);

    mapStatus.textContent = `Driving route ready from ${originQuery} to ${destinationQuery}.`;
    routeSummary.textContent = `${formatDistance(route.distance)} · ${formatDuration(route.duration)} · ${route.legs[0].steps.length} driving steps`;

    if (restaurantToggle.checked) {
      try {
        restaurantList.innerHTML = `<div class="empty-state">Looking for actual restaurants near meal-window route areas...</div>`;
        activeRestaurants = await fetchRestaurantsAlongRoute(route, departureAt);
        if (requestId !== previewRequestId) return;
        renderRestaurants();
      } catch (restaurantError) {
        if (requestId !== previewRequestId) return;
        restaurantList.innerHTML = `<div class="empty-state">${escapeHtml(restaurantError.message)}</div>`;
      }
    }
  } catch (error) {
    if (requestId !== previewRequestId) return;
    mapStatus.textContent = error.message;
    routeSummary.textContent = "Try a more specific city, state, or street address.";
  }
}

function renderRoutes(selectedIndex = selectedRouteIndex) {
  const routesToRender = selectedIndex == null ? routes : [routes[selectedIndex]];

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
              <span>Estimated travel</span>
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
      selectedRouteIndex = Number(button.dataset.route);
      renderRoutes(selectedRouteIndex);
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

function renderRestaurants() {
  if (!restaurantToggle.checked) {
    restaurantList.innerHTML = `<div class="empty-state">Restaurant recommendations are off.</div>`;
    drawRestaurantMarkers([]);
    return;
  }

  if (!activeRestaurants.length) {
    restaurantList.innerHTML = activeMealWindows.length
      ? `<div class="empty-state">No named OpenStreetMap restaurants found near the detected meal-window route areas.</div>`
      : `<div class="empty-state">No breakfast, lunch, or dinner window falls within this route based on the selected departure time.</div>`;
    return;
  }

  restaurantList.innerHTML = activeRestaurants
    .map(
      (stop) => `
        <div class="stop-card">
          <strong>${escapeHtml(stop.name)}</strong>
          <span>${escapeHtml(stop.meal)} around ${escapeHtml(formatMealTime(stop.passTime))} near ${escapeHtml(stop.road)}</span>
          <span>${escapeHtml(stop.details)}${Number.isFinite(stop.distanceMiles) ? ` · ${stop.distanceMiles.toFixed(1)} mi from meal-window area` : ""}</span>
        </div>
      `,
    )
    .join("");
  drawRestaurantMarkers(activeRestaurants);
}

function renderGasStations() {
  if (!gasToggle.checked) {
    gasPanel.className = "empty-state";
    gasPanel.innerHTML = "Gas station display is off.";
    return;
  }

  gasPanel.className = "restaurant-list";
  gasPanel.innerHTML = gasStations
    .map(
      (stop) => `
        <div class="stop-card">
          <strong>${stop.name}</strong>
          <span>${stop.details}</span>
        </div>
      `,
    )
    .join("");
}

function validateDates(formData) {
  const depart = new Date(formData.get("departDate"));
  const arrival = new Date(formData.get("arrivalDate"));
  const leave = new Date(formData.get("returnDate"));
  const home = new Date(formData.get("homeDate"));

  if (depart > arrival) {
    return "Departure from origin must be before arrival at the destination.";
  }

  if (arrival >= leave) {
    return "Leaving the destination must be after arrival at the destination.";
  }

  if (leave >= home) {
    return "Desired return home must be after leaving the destination.";
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
    formMessage.textContent = "Enter both an origin and destination to preview routes.";
    return;
  }

  selectedRouteIndex = null;
  renderRoutes();
  renderGasStations();

  if (mode !== "Car") {
    formMessage.textContent = `${mode} support is planned. This prototype currently previews car routes.`;
    return;
  }

  formMessage.textContent = `Previewing car routes from ${origin} to ${destination}.`;
  await loadDrivingDirections(origin, destination, departureAt, requestId);

  if (scrollToRoutes) {
    showPage("routes");
  }
}

const scheduleTripPreview = debounce(() => {
  previewTrip();
}, 700);

function setupAutoPreview() {
  tripForm.querySelectorAll("input, select").forEach((control) => {
    if (control === gasToggle || control === restaurantToggle) return;

    const eventName = control.type === "text" ? "input" : "change";
    control.addEventListener(eventName, () => {
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
showPage("route-info", { scroll: false });
renderRoutes();
renderRestaurants();
renderGasStations();
previewTrip();
