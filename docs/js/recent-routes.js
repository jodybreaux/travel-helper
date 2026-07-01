import { RECENT_ROUTE_LIMIT } from "./constants.js";
import { escapeHtml } from "./place-cards.js";

const STORAGE_KEY = "travel-helper-recent-routes";

export function getRecentRoutes() {
  try {
    const routes = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(routes) ? routes : [];
  } catch {
    return [];
  }
}

export function addRecentRoute({ origin, destination }) {
  const originValue = origin?.trim();
  const destinationValue = destination?.trim();

  if (!originValue || !destinationValue) {
    return;
  }

  const entry = {
    origin: originValue,
    destination: destinationValue,
    usedAt: Date.now(),
  };

  const routes = getRecentRoutes().filter(
    (route) => !(route.origin === entry.origin && route.destination === entry.destination),
  );
  routes.unshift(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(routes.slice(0, RECENT_ROUTE_LIMIT)));
}

export function getRecentRouteByIndex(index) {
  const routeIndex = Number(index);
  if (!Number.isInteger(routeIndex) || routeIndex < 0) {
    return null;
  }

  return getRecentRoutes()[routeIndex] || null;
}

export function populateRecentRoutesSelect(select) {
  if (!select) return;

  const routes = getRecentRoutes();
  const options = [
    '<option value="">Select a previous route...</option>',
    ...routes.map(
      (route, index) => `<option value="${index}">${escapeHtml(route.origin)} → ${escapeHtml(route.destination)}</option>`,
    ),
  ];

  if (!routes.length) {
    options[0] = '<option value="">No previous routes yet</option>';
  }

  select.innerHTML = options.join("");
  select.disabled = routes.length === 0;
}

export function setupRecentRoutesSelect(select, onSelect) {
  if (!select) return;

  populateRecentRoutesSelect(select);
  select.addEventListener("change", () => {
    const route = getRecentRouteByIndex(select.value);
    if (!route) return;

    onSelect(route);
    select.value = "";
  });
}
