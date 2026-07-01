// Copy to places-config.js and add a free Geoapify Places API key.
// Restrict the key to your site URL under Geoapify MyProjects -> API Keys.
export const GEOAPIFY_API_KEY = "your-geoapify-api-key";

export function isGeoapifyConfigured() {
  return GEOAPIFY_API_KEY.length > 0;
}
