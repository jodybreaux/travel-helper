import {
  ROUTE_RECOMMENDATION_SEARCH_RADIUS_METERS,
  ROUTE_RECOMMENDATION_SEARCH_RADIUS_MILES,
} from "./constants.js";
import { GEOAPIFY_API_KEY, isGeoapifyConfigured } from "./places-config.js";

export { isGeoapifyConfigured };

export const GEOAPIFY_FOOD_CATEGORIES = "catering.restaurant,catering.fast_food,catering.cafe";
export const GEOAPIFY_FUEL_CATEGORIES = "commercial.gas_station,service.fuel,service.vehicle.fuel";

const GEOAPIFY_PLACES_URL = "https://api.geoapify.com/v2/places";
const GEOAPIFY_REQUEST_TIMEOUT_MS = 8000;

export async function fetchGeoapifyPlaces(categories, lon, lat, limit = 20) {
  const url = new URL(GEOAPIFY_PLACES_URL);
  url.searchParams.set("categories", categories);
  url.searchParams.set("filter", `circle:${lon},${lat},${ROUTE_RECOMMENDATION_SEARCH_RADIUS_METERS}`);
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
