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

let map;
let routeLayer;
let originMarker;
let destinationMarker;
let restaurantMarkers;
let activeRestaurants = [];

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
  document.querySelector("#origin").value = "Chicago, IL";
  document.querySelector("#destination").value = "Nashville, TN";
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
}

function formatDistance(meters) {
  return `${(meters / 1609.344).toFixed(0)} mi`;
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
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
      ([lon, lat]) =>
        `node["amenity"="restaurant"](around:8000,${lat},${lon});way["amenity"="restaurant"](around:8000,${lat},${lon});relation["amenity"="restaurant"](around:8000,${lat},${lon});`,
    )
    .join("");

  return `[out:json][timeout:25];(${searches});out center 24;`;
}

function normalizeRestaurant(element) {
  const tags = element.tags || {};
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;

  if (!tags.name || lat == null || lon == null) return null;

  const cuisine = tags.cuisine ? tags.cuisine.replaceAll(";", ", ") : "Cuisine not listed";
  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  const city = tags["addr:city"];
  const address = [street, city].filter(Boolean).join(", ");
  const hours = tags.opening_hours ? ` · ${tags.opening_hours}` : "";

  return {
    id: `${element.type}-${element.id}`,
    name: tags.name,
    cuisine,
    details: `${cuisine}${address ? ` · ${address}` : ""}${hours}`,
    lat,
    lon,
  };
}

async function fetchRestaurantsAlongRoute(route) {
  const body = new URLSearchParams({
    data: buildRestaurantQuery(getRestaurantSearchPoints(route)),
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
    .map(normalizeRestaurant)
    .filter(Boolean)
    .forEach((restaurant) => {
      restaurantsById.set(restaurant.id, restaurant);
    });

  return [...restaurantsById.values()].slice(0, 8);
}

function drawRestaurantMarkers(restaurants) {
  if (!restaurantMarkers) return;

  restaurantMarkers.clearLayers();

  if (!restaurantToggle.checked) return;

  restaurants.forEach((restaurant) => {
    L.marker([restaurant.lat, restaurant.lon])
      .addTo(restaurantMarkers)
      .bindPopup(`<strong>${escapeHtml(restaurant.name)}</strong><br>${escapeHtml(restaurant.cuisine)}`);
  });
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

async function loadDrivingDirections(originQuery, destinationQuery) {
  if (!map) return;

  mapStatus.textContent = `Finding a driving route from ${originQuery} to ${destinationQuery}...`;
  routeSummary.textContent = "Calculating route...";
  directionsList.innerHTML = "";
  activeRestaurants = [];
  if (restaurantToggle.checked) {
    restaurantList.innerHTML = `<div class="empty-state">Looking for actual restaurants along the route...</div>`;
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

    mapStatus.textContent = `Driving route ready from ${originQuery} to ${destinationQuery}.`;
    routeSummary.textContent = `${formatDistance(route.distance)} · ${formatDuration(route.duration)} · ${route.legs[0].steps.length} driving steps`;

    if (restaurantToggle.checked) {
      try {
        activeRestaurants = await fetchRestaurantsAlongRoute(route);
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
    restaurantList.innerHTML = `<div class="empty-state">Calculate a car route to load actual restaurants along the drive.</div>`;
    return;
  }

  restaurantList.innerHTML = activeRestaurants
    .map(
      (stop) => `
        <div class="stop-card">
          <strong>${escapeHtml(stop.name)}</strong>
          <span>${escapeHtml(stop.details)}</span>
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
  await loadDrivingDirections(origin, destination);
  document.querySelector("#routes").scrollIntoView({ behavior: "smooth", block: "start" });
});

gasToggle.addEventListener("change", renderGasStations);
restaurantToggle.addEventListener("change", renderRestaurants);

setTheme(localStorage.getItem("travel-helper-theme") || "light");
setDefaultDates();
setDefaultTripValues();
initMap();
renderRoutes();
renderRestaurants();
renderGasStations();
loadDrivingDirections("Chicago, IL", "Nashville, TN");
