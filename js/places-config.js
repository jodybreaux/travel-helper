// For local development. Restrict this key in Geoapify to localhost and your site URL.
export const GEOAPIFY_API_KEY = "9e93d02e14294234a5fbf143a7fcd400";

export function isGeoapifyConfigured() {
  return GEOAPIFY_API_KEY.length > 0;
}
