import {
  NEAR_ME_FOOD_LIMIT,
  NEAR_ME_FUEL_LIMIT,
  NEAR_ME_SEARCH_RADIUS_MILES,
} from "./constants.js";
import { fetchFoodNearLocation, fetchFuelNearLocation } from "./places-api.js";
import { reverseGeocodeStreetAddress } from "./geocode.js";
import { escapeHtml, renderPlaceStopCard } from "./place-cards.js";

import { setNearMeButtonLoading } from "./site-header.js";

const STORAGE_KEY = "travel-helper-near-me";

let nearMeState = loadNearMeState();

function loadNearMeState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : defaultNearMeState();
  } catch {
    return defaultNearMeState();
  }
}

function defaultNearMeState() {
  return {
    location: null,
    food: [],
    fuel: [],
    loading: false,
    error: "",
    updatedAt: null,
  };
}

function persistNearMeState() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nearMeState));
  } catch {
    // Keep the current page usable even if storage is full.
  }
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This browser does not support location lookup."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new Error("Location permission was denied. Allow location access to search near you."));
          return;
        }

        if (error.code === error.TIMEOUT) {
          reject(new Error("Location lookup timed out. Try again in a moment."));
          return;
        }

        reject(new Error("Unable to determine your current location."));
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000,
      },
    );
  });
}

function renderNearMeSection(title, items, placeType, emptyMessage) {
  const cards = items.length
    ? items.map((item) => renderPlaceStopCard(item, placeType)).join("")
    : `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;

  return `
    <section class="near-me-section" aria-label="${escapeHtml(title)}">
      <h4>${escapeHtml(title)}</h4>
      ${cards}
    </section>
  `;
}

function getNearMeLocationLabel() {
  if (!nearMeState.location) {
    return "your current location";
  }

  return nearMeState.location.addressLabel || "your current location";
}

function renderNearMeResults(container) {
  if (!container) return;

  if (nearMeState.loading) {
    container.hidden = false;
    container.innerHTML = `<div class="empty-state loading-state" role="status">Finding food and gas near your current location...</div>`;
    return;
  }

  if (nearMeState.error) {
    container.hidden = false;
    container.innerHTML = `<div class="empty-state" role="status">${escapeHtml(nearMeState.error)}</div>`;
    return;
  }

  if (!nearMeState.food.length && !nearMeState.fuel.length) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }

  const locationLabel = nearMeState.location
    ? `Updated ${new Date(nearMeState.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · within ${NEAR_ME_SEARCH_RADIUS_MILES} mi`
    : "";

  container.hidden = false;
  container.innerHTML = `
    <div class="near-me-summary">
      <strong>Near ${escapeHtml(getNearMeLocationLabel())}</strong>
      ${locationLabel ? `<span>${escapeHtml(locationLabel)}</span>` : ""}
    </div>
    ${renderNearMeSection(
      `Food (${nearMeState.food.length})`,
      nearMeState.food,
      "restaurant",
      "No food locations found near you.",
    )}
    ${renderNearMeSection(
      `Gas (${nearMeState.fuel.length})`,
      nearMeState.fuel,
      "gas station",
      "No gas stations found near you.",
    )}
  `;
}

function setNearMeStatus(statusElement, message) {
  if (statusElement) {
    statusElement.textContent = message || "";
  }
}

function setNearMeWaiting(isWaiting) {
  setNearMeButtonLoading(isWaiting);
}

async function searchFoodAndGasNearMe({ statusElement, resultsElement }) {
  if (nearMeState.loading) return;

  nearMeState = {
    ...defaultNearMeState(),
    loading: true,
  };
  persistNearMeState();
  renderNearMeResults(resultsElement);
  setNearMeStatus(statusElement, "Requesting your location...");
  setNearMeWaiting(true);

  try {
    const location = await getCurrentPosition();
    setNearMeStatus(statusElement, "Looking up your street address...");

    const [addressLabel, food, fuel] = await Promise.all([
      reverseGeocodeStreetAddress(location).catch(() => ""),
      fetchFoodNearLocation(location, NEAR_ME_FOOD_LIMIT),
      fetchFuelNearLocation(location, NEAR_ME_FUEL_LIMIT),
    ]);

    nearMeState = {
      location: {
        ...location,
        addressLabel: addressLabel || "your current location",
      },
      food,
      fuel,
      loading: false,
      error: "",
      updatedAt: Date.now(),
    };
    persistNearMeState();
    const locationSummary = addressLabel ? ` near ${addressLabel}` : " near you";
    setNearMeStatus(
      statusElement,
      food.length || fuel.length
        ? `Found ${food.length} food and ${fuel.length} gas options${locationSummary}.`
        : `No nearby food or gas locations were found${locationSummary}.`,
    );
  } catch (error) {
    nearMeState = {
      ...defaultNearMeState(),
      error: error.message || "Near-me lookup failed.",
    };
    persistNearMeState();
    setNearMeStatus(statusElement, nearMeState.error);
  } finally {
    setNearMeWaiting(false);
    renderNearMeResults(resultsElement);
  }
}

export function initNearMeLookup({
  button = "#nearMeButton",
  status = "#nearMeStatus",
  results = "#nearMeResults",
} = {}) {
  const buttonElement = typeof button === "string" ? document.querySelector(button) : button;
  const statusElement = typeof status === "string" ? document.querySelector(status) : status;
  const resultsElement = typeof results === "string" ? document.querySelector(results) : results;

  if (!buttonElement || !resultsElement) {
    return;
  }

  if (buttonElement.dataset.nearMeBound === "true") {
    return;
  }
  buttonElement.dataset.nearMeBound = "true";

  renderNearMeResults(resultsElement);
  if (!nearMeState.loading && nearMeState.food.length + nearMeState.fuel.length > 0) {
    const locationSummary = nearMeState.location?.addressLabel
      ? ` near ${nearMeState.location.addressLabel}`
      : " near you";
    setNearMeStatus(
      statusElement,
      `Showing ${nearMeState.food.length} food and ${nearMeState.fuel.length} gas options${locationSummary}.`,
    );
  }

  buttonElement.addEventListener("click", () => {
    searchFoodAndGasNearMe({
      statusElement,
      resultsElement,
    });
  });
}

export function clearNearMeResults() {
  nearMeState = defaultNearMeState();
  persistNearMeState();
  setNearMeButtonLoading(false);

  const resultsElement = document.querySelector("#nearMeResults");
  const statusElement = document.querySelector("#nearMeStatus");

  if (resultsElement) {
    resultsElement.hidden = true;
    resultsElement.innerHTML = "";
  }

  if (statusElement) {
    statusElement.textContent = "";
  }
}
