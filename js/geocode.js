export function formatStreetAddress(address = {}) {
  const streetLine = [
    address.house_number,
    address.road || address.street || address.pedestrian || address.footway,
  ].filter(Boolean).join(" ").trim();
  const city = address.city
    || address.town
    || address.village
    || address.hamlet
    || address.suburb
    || address.municipality
    || "";
  const state = address.state || address.region || "";
  const postcode = address.postcode || "";

  if (streetLine && city) {
    const statePostcode = [state, postcode].filter(Boolean).join(" ").trim();
    return statePostcode ? `${streetLine}, ${city}, ${statePostcode}` : `${streetLine}, ${city}`;
  }

  if (streetLine) {
    return streetLine;
  }

  if (city && state) {
    return postcode ? `${city}, ${state} ${postcode}` : `${city}, ${state}`;
  }

  return city || state || postcode || "";
}

export async function reverseGeocodeStreetAddress({ lat, lon }) {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("zoom", "18");
  url.searchParams.set("addressdetails", "1");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Could not look up your street address.");
  }

  const data = await response.json();
  const streetAddress = formatStreetAddress(data.address || {});
  if (streetAddress) {
    return streetAddress;
  }

  if (data.display_name) {
    return data.display_name.split(",").slice(0, 3).join(",").trim();
  }

  return "";
}
