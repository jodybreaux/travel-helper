export function escapeHtml(value = "") {
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

export function getStreetViewUrl(point) {
  const url = new URL("https://www.google.com/maps/@");
  url.searchParams.set("api", "1");
  url.searchParams.set("map_action", "pano");
  url.searchParams.set("viewpoint", `${point.lat},${point.lon}`);
  return url.toString();
}

export function getStreetViewEmbedUrl(point) {
  const url = new URL("https://www.google.com/maps");
  url.searchParams.set("layer", "c");
  url.searchParams.set("cbll", `${point.lat},${point.lon}`);
  url.searchParams.set("cbp", "11,0,0,0,0");
  url.searchParams.set("output", "svembed");
  return url.toString();
}

export function getPlaceMapUrl(place) {
  const url = new URL("https://www.google.com/maps/search/");
  const query = [place.name, place.lat, place.lon].filter((value) => value != null).join(" ");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", query);
  return url.toString();
}

export function getDrivingDirectionsUrl(point) {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("destination", `${point.lat},${point.lon}`);
  url.searchParams.set("travelmode", "driving");
  return url.toString();
}

export function renderPlaceLink(place) {
  const placeUrl = escapeHtml(getPlaceMapUrl(place));
  const placeName = escapeHtml(place.name);

  return `<a class="place-name-link" href="${placeUrl}" target="_blank" rel="noopener" aria-label="Open ${placeName} in Google Maps">${placeName}</a>`;
}

export function renderStreetViewThumbnail(place, placeType) {
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

export function renderPlaceMapActions(place, placeType) {
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

export function renderPlaceStopCard(place, placeType) {
  const distanceText = Number.isFinite(place.distanceMiles)
    ? `${place.distanceMiles.toFixed(1)} mi away`
    : "nearby";

  return `
    <div class="stop-card">
      <strong>${renderPlaceLink(place)}</strong>
      ${renderStreetViewThumbnail(place, placeType)}
      <span>${escapeHtml(place.details || "")}${place.details ? " · " : ""}${escapeHtml(distanceText)}</span>
      ${renderPlaceMapActions(place, placeType)}
    </div>
  `;
}
