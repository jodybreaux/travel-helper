import {
  ROUTE_RECOMMENDATION_SEARCH_RADIUS_METERS,
  ROUTE_RECOMMENDATION_SEARCH_RADIUS_MILES,
  NEAR_ME_SEARCH_RADIUS_METERS,
  NEAR_ME_SEARCH_RADIUS_MILES,
  OVERPASS_REQUEST_TIMEOUT_MS,
} from "./constants.js";
import { GEOAPIFY_API_KEY, isGeoapifyConfigured } from "./places-config.js";

export { isGeoapifyConfigured };

export const GEOAPIFY_FOOD_CATEGORIES = "catering.restaurant,catering.fast_food,catering.cafe";
// Geoapify rejects the whole request when any category is invalid.
export const GEOAPIFY_FUEL_CATEGORIES = "service.vehicle.fuel";

const GEOAPIFY_PLACES_URL = "https://api.geoapify.com/v2/places";
const GEOAPIFY_REQUEST_TIMEOUT_MS = 8000;

export async function fetchGeoapifyPlaces(
  categories,
  lon,
  lat,
  limit = 20,
  radiusMeters = ROUTE_RECOMMENDATION_SEARCH_RADIUS_METERS,
) {
  const url = new URL(GEOAPIFY_PLACES_URL);
  url.searchParams.set("categories", categories);
  url.searchParams.set("filter", `circle:${lon},${lat},${radiusMeters}`);
  url.searchParams.set("bias", `proximity:${lon},${lat}`);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("lang", "en");
  url.searchParams.set("apiKey", GEOAPIFY_API_KEY);

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), GEOAPIFY_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Geoapify lookup failed (${response.status})`);
    }

    return response.json();
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function getGeoapifyDistanceMiles(a, b) {
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

function getNearestSearchPoint(location, searchPoints) {
  return searchPoints
    .map((point) => ({
      ...point,
      distanceMiles: getGeoapifyDistanceMiles(location, point),
    }))
    .sort((a, b) => a.distanceMiles - b.distanceMiles)[0];
}

function getGeoapifyDistanceMilesForPlace(props, searchPoint) {
  if (props.distance != null) {
    return props.distance / 1609.344;
  }

  return searchPoint?.distanceMiles ?? Number.POSITIVE_INFINITY;
}

export function normalizeGeoapifyRestaurant(feature, tripStops, searchPoints) {
  const props = feature.properties || {};
  const lat = props.lat;
  const lon = props.lon;
  const name = props.name || props.address_line1 || props.brand;

  if (!name || lat == null || lon == null) return null;

  const location = { lat, lon };
  const searchPoint = getNearestSearchPoint(location, searchPoints);
  const tripStop = tripStops.find((point) => point.id === searchPoint?.anchorTripStopId) || searchPoint;
  const cuisineTag = (props.categories || []).find((category) => category.startsWith("catering."));
  const cuisine = cuisineTag
    ? cuisineTag.replace(/^catering\./, "").replaceAll("_", " ")
    : "Cuisine not listed";
  const address = props.formatted || props.address_line1 || "";
  const hours = props.opening_hours ? ` · ${props.opening_hours}` : "";
  const distanceMiles = getGeoapifyDistanceMilesForPlace(props, searchPoint);

  return {
    id: `geoapify-${props.place_id}`,
    name,
    cuisine,
    tripStopId: tripStop?.id,
    label: tripStop?.label || "Suggested food stop",
    passTime: tripStop?.passTime,
    road: searchPoint?.road || tripStop?.road || "route area",
    distanceFromOriginMiles: tripStop?.distanceFromOriginMiles,
    distanceMiles,
    isForwardFallback: Boolean(searchPoint?.isForwardFallback),
    distanceAheadMiles: searchPoint?.distanceAheadMiles || 0,
    isShortTrip: Boolean(tripStop?.isShortTrip),
    details: `${cuisine}${address ? ` · ${address}` : ""}${hours}`,
    lat,
    lon,
  };
}

export function normalizeGeoapifyFuelStation(feature, tripStops, searchPoints) {
  const props = feature.properties || {};
  const lat = props.lat;
  const lon = props.lon;
  const name = props.name || props.brand || "Fuel station";

  if (lat == null || lon == null) return null;

  const location = { lat, lon };
  const searchPoint = getNearestSearchPoint(location, searchPoints);
  const tripStop = tripStops.find((point) => point.id === searchPoint?.anchorTripStopId) || searchPoint;
  const address = props.formatted || props.address_line1 || "";
  const hours = props.opening_hours ? ` · ${props.opening_hours}` : "";
  const fuelCategories = (props.categories || [])
    .filter((category) => category.includes("fuel"))
    .map((category) => category.replace(/^.*\./, "").replaceAll("_", " "))
    .filter(Boolean);
  const fuelDetails = fuelCategories.length ? ` · ${fuelCategories.join(", ")}` : "";
  const distanceMiles = getGeoapifyDistanceMilesForPlace(props, searchPoint);

  return {
    id: `geoapify-${props.place_id}`,
    name,
    tripStopId: tripStop?.id,
    label: tripStop?.label || "Suggested food stop",
    passTime: tripStop?.passTime,
    road: searchPoint?.road || tripStop?.road || "route area",
    distanceFromOriginMiles: tripStop?.distanceFromOriginMiles,
    distanceMiles,
    isForwardFallback: Boolean(searchPoint?.isForwardFallback),
    distanceAheadMiles: searchPoint?.distanceAheadMiles || 0,
    isShortTrip: Boolean(tripStop?.isShortTrip),
    details: `${address || "Address not listed"}${fuelDetails}${hours}`,
    lat,
    lon,
  };
}

function withinSearchRadius(item) {
  return item && item.distanceMiles <= ROUTE_RECOMMENDATION_SEARCH_RADIUS_MILES;
}

export async function fetchGeoapifyRestaurantsForStop(
  route,
  tripStops,
  tripStop,
  onUpdate,
  {
    getForwardRecommendationSearchPointsWithinMiles,
    foodForwardRecommendationLookaheadMiles,
    forwardRecommendationRetryPoints,
    maxRestaurantsPerStop,
    preferDirectRecommendations,
    sortRestaurants,
  },
) {
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
    const data = await fetchGeoapifyPlaces(
      GEOAPIFY_FOOD_CATEGORIES,
      tripStop.lon,
      tripStop.lat,
      maxRestaurantsPerStop + 4,
    );
    preferDirectRecommendations(
      data.features
        .map((feature) => normalizeGeoapifyRestaurant(feature, tripStops, [directSearchPoint]))
        .filter(withinSearchRadius),
    ).forEach((restaurant) => {
      restaurantsById.set(restaurant.id, restaurant);
    });

    if (restaurantsById.size) {
      publish(true);
      return sortRestaurants([...restaurantsById.values()]);
    }
    publish(false);
  } catch {
    // Continue to forward fallback points.
  }

  const fallbackSearchPoints = getForwardRecommendationSearchPointsWithinMiles(
    route,
    tripStops,
    foodForwardRecommendationLookaheadMiles,
  ).filter((point) => point.isForwardFallback && point.anchorTripStopId === tripStop.id);

  for (const searchPoint of fallbackSearchPoints.slice(0, forwardRecommendationRetryPoints)) {
    try {
      const data = await fetchGeoapifyPlaces(
        GEOAPIFY_FOOD_CATEGORIES,
        searchPoint.lon,
        searchPoint.lat,
        maxRestaurantsPerStop + 4,
      );
      const matches = preferDirectRecommendations(
        data.features
          .map((feature) => normalizeGeoapifyRestaurant(feature, tripStops, [searchPoint]))
          .filter(withinSearchRadius),
      );

      if (matches.length) {
        matches.forEach((restaurant) => {
          restaurantsById.set(restaurant.id, restaurant);
        });
        break;
      }
    } catch {
      // Try the next point ahead.
    }
  }

  publish(true);
  return sortRestaurants([...restaurantsById.values()]);
}

export async function fetchGeoapifyFuelStationsForStop(
  route,
  tripStops,
  tripStop,
  onUpdate,
  {
    getForwardRecommendationSearchPoints,
    forwardRecommendationRetryPoints,
    maxFuelStationsPerStop,
    preferDirectRecommendations,
    sortFuelStations,
  },
) {
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
    const data = await fetchGeoapifyPlaces(
      GEOAPIFY_FUEL_CATEGORIES,
      tripStop.lon,
      tripStop.lat,
      maxFuelStationsPerStop + 4,
    );
    preferDirectRecommendations(
      data.features
        .map((feature) => normalizeGeoapifyFuelStation(feature, tripStops, [directSearchPoint]))
        .filter(withinSearchRadius),
    ).forEach((station) => {
      stationsById.set(station.id, station);
    });

    if (stationsById.size) {
      publish(true);
      return sortFuelStations([...stationsById.values()]);
    }
    publish(false);
  } catch {
    // Continue to forward fallback points.
  }

  const fallbackSearchPoints = getForwardRecommendationSearchPoints(route, tripStops)
    .filter((point) => point.isForwardFallback && point.anchorTripStopId === tripStop.id);

  for (const searchPoint of fallbackSearchPoints.slice(0, forwardRecommendationRetryPoints)) {
    try {
      const data = await fetchGeoapifyPlaces(
        GEOAPIFY_FUEL_CATEGORIES,
        searchPoint.lon,
        searchPoint.lat,
        maxFuelStationsPerStop + 4,
      );
      const matches = preferDirectRecommendations(
        data.features
          .map((feature) => normalizeGeoapifyFuelStation(feature, tripStops, [searchPoint]))
          .filter(withinSearchRadius),
      );

      if (matches.length) {
        matches.forEach((station) => {
          stationsById.set(station.id, station);
        });
        break;
      }
    } catch {
      // Try the next point ahead.
    }
  }

  publish(true);
  return sortFuelStations([...stationsById.values()]);
}

export async function fetchGeoapifyRestaurantsAlongRoute(tripStops, onUpdate, helpers) {
  const restaurantsById = new Map();

  await Promise.all(
    tripStops.map(async (tripStop) => {
      const stopRestaurants = await fetchGeoapifyRestaurantsForStop(
        helpers.route,
        tripStops,
        tripStop,
        (items, stopId, isComplete) => {
          items.forEach((restaurant) => restaurantsById.set(restaurant.id, restaurant));
          onUpdate?.(helpers.sortRestaurants([...restaurantsById.values()]), stopId, isComplete);
        },
        helpers,
      );
      stopRestaurants.forEach((restaurant) => {
        restaurantsById.set(restaurant.id, restaurant);
      });
    }),
  );

  return helpers.sortRestaurants([...restaurantsById.values()]);
}

export async function fetchGeoapifyFuelStationsAlongRoute(tripStops, onUpdate, helpers) {
  const stationsById = new Map();

  await Promise.all(
    tripStops.map(async (tripStop) => {
      const stopStations = await fetchGeoapifyFuelStationsForStop(
        helpers.route,
        tripStops,
        tripStop,
        (items, stopId, isComplete) => {
          items.forEach((station) => stationsById.set(station.id, station));
          onUpdate?.(helpers.sortFuelStations([...stationsById.values()]), stopId, isComplete);
        },
        helpers,
      );
      stopStations.forEach((station) => {
        stationsById.set(station.id, station);
      });
    }),
  );

  return helpers.sortFuelStations([...stationsById.values()]);
}

const OVERPASS_ENDPOINTS = [
  "https://z.overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

async function fetchOverpassJson(query) {
  const body = new URLSearchParams({ data: query });
  const attempts = OVERPASS_ENDPOINTS.map((endpoint) => (async () => {
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

      if (!response.ok) throw new Error("Overpass request failed");
      return response.json();
    } finally {
      window.clearTimeout(timeoutId);
    }
  })());

  return Promise.any(attempts);
}

function normalizeNearMeRestaurant(feature, userLocation) {
  const props = feature.properties || {};
  const lat = props.lat;
  const lon = props.lon;
  const name = props.name || props.address_line1 || props.brand;

  if (!name || lat == null || lon == null) return null;

  const cuisineTag = (props.categories || []).find((category) => category.startsWith("catering."));
  const cuisine = cuisineTag
    ? cuisineTag.replace(/^catering\./, "").replaceAll("_", " ")
    : "Cuisine not listed";
  const address = props.formatted || props.address_line1 || "";
  const hours = props.opening_hours ? ` · ${props.opening_hours}` : "";
  const distanceMiles = getGeoapifyDistanceMiles(userLocation, { lat, lon });

  return {
    id: `geoapify-${props.place_id}`,
    name,
    distanceMiles,
    details: `${cuisine}${address ? ` · ${address}` : ""}${hours}`,
    lat,
    lon,
  };
}

function normalizeNearMeFuelStation(feature, userLocation) {
  const props = feature.properties || {};
  const lat = props.lat;
  const lon = props.lon;
  const name = props.name || props.brand || "Fuel station";

  if (lat == null || lon == null) return null;

  const address = props.formatted || props.address_line1 || "";
  const hours = props.opening_hours ? ` · ${props.opening_hours}` : "";
  const distanceMiles = getGeoapifyDistanceMiles(userLocation, { lat, lon });

  return {
    id: `geoapify-${props.place_id}`,
    name,
    distanceMiles,
    details: `${address || "Address not listed"}${hours}`,
    lat,
    lon,
  };
}

function normalizeNearMeOsmRestaurant(element, userLocation) {
  const tags = element.tags || {};
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  const name = tags.name || tags.brand || tags.operator;

  if (!name || lat == null || lon == null) return null;

  const cuisine = tags.cuisine ? tags.cuisine.replaceAll(";", ", ") : tags.amenity?.replaceAll("_", " ") || "Restaurant";
  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  const city = tags["addr:city"];
  const address = [street, city].filter(Boolean).join(", ");
  const distanceMiles = getGeoapifyDistanceMiles(userLocation, { lat, lon });

  return {
    id: `osm-${element.type}-${element.id}`,
    name,
    distanceMiles,
    details: `${cuisine}${address ? ` · ${address}` : ""}`,
    lat,
    lon,
  };
}

function normalizeNearMeOsmFuelStation(element, userLocation) {
  const tags = element.tags || {};
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  const name = tags.name || tags.brand || tags.operator || "Fuel station";

  if (lat == null || lon == null) return null;

  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  const city = tags["addr:city"];
  const address = [street, city].filter(Boolean).join(", ");
  const distanceMiles = getGeoapifyDistanceMiles(userLocation, { lat, lon });

  return {
    id: `osm-${element.type}-${element.id}`,
    name,
    distanceMiles,
    details: address || "Address not listed",
    lat,
    lon,
  };
}

function sortByDistance(items) {
  return [...items].sort((a, b) => a.distanceMiles - b.distanceMiles);
}

function withinNearMeRadius(item) {
  return item && item.distanceMiles <= NEAR_ME_SEARCH_RADIUS_MILES;
}

export async function fetchFoodNearLocation(location, limit, radiusMeters = NEAR_ME_SEARCH_RADIUS_METERS) {
  if (isGeoapifyConfigured()) {
    try {
      const data = await fetchGeoapifyPlaces(
        GEOAPIFY_FOOD_CATEGORIES,
        location.lon,
        location.lat,
        limit + 6,
        radiusMeters,
      );
      const restaurants = sortByDistance(
        data.features
          .map((feature) => normalizeNearMeRestaurant(feature, location))
          .filter(withinNearMeRadius),
      ).slice(0, limit);

      if (restaurants.length) {
        return restaurants;
      }
    } catch {
      // Fall back to Overpass.
    }
  }

  const query = `[out:json][timeout:25];(nwr["amenity"~"^(restaurant|fast_food|cafe)$"](around:${radiusMeters},${location.lat},${location.lon}););out center ${limit + 10};`;
  const data = await fetchOverpassJson(query);

  return sortByDistance(
    data.elements
      .map((element) => normalizeNearMeOsmRestaurant(element, location))
      .filter(withinNearMeRadius),
  ).slice(0, limit);
}

export async function fetchFuelNearLocation(location, limit, radiusMeters = NEAR_ME_SEARCH_RADIUS_METERS) {
  if (isGeoapifyConfigured()) {
    try {
      const data = await fetchGeoapifyPlaces(
        GEOAPIFY_FUEL_CATEGORIES,
        location.lon,
        location.lat,
        limit + 4,
        radiusMeters,
      );
      const stations = sortByDistance(
        data.features
          .map((feature) => normalizeNearMeFuelStation(feature, location))
          .filter(withinNearMeRadius),
      ).slice(0, limit);

      if (stations.length) {
        return stations;
      }
    } catch {
      // Fall back to Overpass.
    }
  }

  const query = `[out:json][timeout:25];(nwr["amenity"="fuel"](around:${radiusMeters},${location.lat},${location.lon}););out center ${limit + 8};`;
  const data = await fetchOverpassJson(query);

  return sortByDistance(
    data.elements
      .map((element) => normalizeNearMeOsmFuelStation(element, location))
      .filter(withinNearMeRadius),
  ).slice(0, limit);
}
