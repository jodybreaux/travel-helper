export function getRouteWeatherSamplePoints(route) {
  const coordinates = route.geometry?.coordinates || [];
  if (!coordinates.length) return [];

  const sampleCount = Math.min(8, coordinates.length);
  const step = Math.max(1, Math.floor(coordinates.length / sampleCount));
  const points = [];

  for (let index = 0; index < coordinates.length; index += step) {
    points.push(coordinates[index]);
  }

  return points;
}

export function getWeatherSeverityColor(severity = "") {
  const colors = {
    Extreme: "#7f1d1d",
    Severe: "#dc2626",
    Moderate: "#f59e0b",
    Minor: "#facc15",
    Unknown: "#64748b",
  };

  return colors[severity] || colors.Unknown;
}

export async function fetchWeatherAlertsAtPoint([lon, lat]) {
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

export async function fetchWeatherAlertsForRoute(route) {
  const samplePoints = getRouteWeatherSamplePoints(route);
  if (!samplePoints.length) return [];

  const alertResults = await Promise.all(samplePoints.map(fetchWeatherAlertsAtPoint));
  const alertsById = new Map();

  alertResults.flat().forEach((alert) => {
    const id = alert.id || alert.properties?.id || alert.properties?.headline;
    if (id) alertsById.set(id, alert);
  });

  return [...alertsById.values()];
}
