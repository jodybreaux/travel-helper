import { initTheme } from "../theme.js";
import { bindUi } from "../ui.js";
import { initRoutesPage } from "../trip-engine.js";

initTheme();
bindUi({
  routeGrid: "#routeGrid",
  mapStatus: "#mapStatus",
  routeSummary: "#routeSummary",
  directionsToggle: "#directionsToggle",
  directionsList: "#directionsList",
  weatherList: "#weatherList",
  restaurantList: "#restaurantList",
  gasPanel: "#gasPanel",
});
initRoutesPage();
