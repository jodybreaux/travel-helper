// Injected at deploy time from the GEOAPIFY_API_KEY GitHub Actions secret.
// For local development, copy places-config.example.js and add your free-tier key.
export const GEOAPIFY_API_KEY = "";

export function isGeoapifyConfigured() {
  return GEOAPIFY_API_KEY.length > 0;
}
