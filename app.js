const routes = [
  {
    type: "Fastest",
    title: "Interstate Express",
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
  { name: "Breakfast", start: 6, end: 10, midpoint: 8 },
  { name: "Lunch", start: 11, end: 14, midpoint: 12.5 },
  { name: "Dinner", start: 17, end: 21, midpoint: 19 },
];

const DEFAULT_ORIGIN = "1104 San Augustine Drive, Austin, TX 78733";
const DEFAULT_DESTINATION = "The Home Depot, Lakeway, TX";

const root = document.documentElement;
const themeToggle = document.querySelector("#themeToggle");
const themeLabel = document.querySelector("#themeLabel");
const tripForm = document.querySelector("#tripForm");
const formMessage = document.querySelector("#formMessage");
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

function setTheme(theme) {
  root.dataset.theme = theme;
  localStorage.setItem("travel-helper-theme", theme);
  themeLabel.textContent = theme === "dark" ? "Light" : "Dark";
}

function getToday() {
  return new Date().toISOString().split("T")[0];
}

function setDefaultDates() {
  const ids = ["departDate", "arrivalDate", "returnDate", "homeDate"];
  ids.forEach((id, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index + 1);
    document.querySelector(`#${id}`).value = date.toISOString().split("T")[0];
    document.querySelector(`#${id}`).min = getToday();
  });
}

function setDefaultTripValues() {
  document.querySelector("#origin").value = DEFAULT_ORIGIN;
  document.querySelector("#destination").value = DEFAULT_DESTINATION;
}

function debounce(callback, delay = 300) {
  let timeoutId;

  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => callback(...args), delay);
  };
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
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", query);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not geocode ${query}.`);
  }

  const results = await response.json();
  if (!results.length) {
    throw new Error(`No location found for "${query}".`);
  }

  return {
    name: results[0].display_name,
    lat: Number(results[0].lat),
    lon: Number(results[0].lon),
  };
}

async function fetchAddressSuggestions(query) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "us");
  url.searchParams.set("q", query);

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
  return mealWindows.find((meal) => hour >= meal.start && hour <= meal.end);
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

function getMealWindowPoints(route, departureAt) {
  const candidatesByMeal = new Map();
  let elapsedSeconds = 0;

  route.legs.flatMap((leg) => leg.steps).forEach((step) => {
    const [lon, lat] = step.maneuver?.location || [];
    if (lon == null || lat == null) return;

    const passTime = new Date(departureAt.getTime() + elapsedSeconds * 1000);
    const meal = getMatchingMealWindow(passTime);

    if (meal) {
      const candidate = {
        meal: meal.name,
        mealMidpoint: meal.midpoint,
        passTime,
        lon,
        lat,
        road: step.name || "route segment",
      };
      const existing = candidatesByMeal.get(meal.name) || [];
      existing.push(candidate);
      candidatesByMeal.set(meal.name, existing);
    }

    elapsedSeconds += step.duration || 0;
  });

  return [...candidatesByMeal.values()].map((candidates) =>
    candidates.reduce((best, candidate) => {
      const candidateScore = Math.abs(getHourOfDay(candidate.passTime) - candidate.mealMidpoint);
      const bestScore = Math.abs(getHourOfDay(best.passTime) - best.mealMidpoint);
      return candidateScore < bestScore ? candidate : best;
    }),
  );
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
  activeMealWindows = mealPoints;

  if (!mealPoints.length) {
    return [];
  }

  const body = new URLSearchParams({
    data: buildRestaurantQuery(mealPoints),
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
    .map((element) => normalizeRestaurant(element, mealPoints))
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

async function loadWeatherAlerts(route) {
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
    drawWeatherAlertOverlay(alerts);
    renderWeatherAlerts(alerts);
  } catch (error) {
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

async function loadDrivingDirections(originQuery, destinationQuery, departureAt = getDepartureDateTime(new FormData(tripForm))) {
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

    routes[0].time = formatDuration(route.duration);
    routes[0].distance = formatDistance(route.distance);
    renderRoutes(0);
    drawRoute(route, origin, destination);
    renderDirections(route);
    loadWeatherAlerts(route);

    mapStatus.textContent = `Driving route ready from ${originQuery} to ${destinationQuery}.`;
    routeSummary.textContent = `${formatDistance(route.distance)} · ${formatDuration(route.duration)} · ${route.legs[0].steps.length} driving steps`;

    if (restaurantToggle.checked) {
      try {
        restaurantList.innerHTML = `<div class="empty-state">Looking for actual restaurants near meal-window route areas...</div>`;
        activeRestaurants = await fetchRestaurantsAlongRoute(route, departureAt);
        renderRestaurants();
      } catch (restaurantError) {
        restaurantList.innerHTML = `<div class="empty-state">${escapeHtml(restaurantError.message)}</div>`;
      }
    }
  } catch (error) {
    mapStatus.textContent = error.message;
    routeSummary.textContent = "Try a more specific city, state, or street address.";
  }
}

function renderRoutes(selectedIndex = 2) {
  routeGrid.innerHTML = routes
    .map(
      (route, index) => `
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
          <button class="button button-secondary" type="button" data-route="${index}">
            Select route
          </button>
        </article>
      `,
    )
    .join("");

  routeGrid.querySelectorAll("[data-route]").forEach((button) => {
    button.addEventListener("click", () => {
      renderRoutes(Number(button.dataset.route));
      formMessage.textContent = `${routes[Number(button.dataset.route)].title} selected for detailed planning.`;
    });
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

  if (arrival > leave) {
    return "Departure from the destination must be after arrival at the destination.";
  }

  if (leave > home) {
    return "Desired return home must be after leaving the destination.";
  }

  return "";
}

themeToggle.addEventListener("click", () => {
  setTheme(root.dataset.theme === "dark" ? "light" : "dark");
});

tripForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(tripForm);
  const error = validateDates(formData);
  const mode = formData.get("mode");
  const origin = formData.get("origin");
  const destination = formData.get("destination");
  const departureAt = getDepartureDateTime(formData);

  if (error) {
    formMessage.textContent = error;
    return;
  }

  if (mode !== "Car") {
    formMessage.textContent = `${mode} support is planned. This prototype currently previews car routes.`;
    renderRoutes(2);
    return;
  }

  formMessage.textContent = `Previewing car routes from ${origin} to ${destination}. Meal window detected during travel.`;
  renderRoutes(2);
  await loadDrivingDirections(origin, destination, departureAt);
  document.querySelector("#routes").scrollIntoView({ behavior: "smooth", block: "start" });
});

gasToggle.addEventListener("change", renderGasStations);
restaurantToggle.addEventListener("change", renderRestaurants);

setTheme(localStorage.getItem("travel-helper-theme") || "light");
setDefaultDates();
setDefaultTripValues();
setupAddressAutocomplete("#origin", "#originSuggestions");
setupAddressAutocomplete("#destination", "#destinationSuggestions");
initMap();
renderRoutes();
renderRestaurants();
renderGasStations();
loadDrivingDirections(DEFAULT_ORIGIN, DEFAULT_DESTINATION);
