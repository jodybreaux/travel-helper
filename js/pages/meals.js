import { initTheme } from "../theme.js";
import { bindUi } from "../ui.js";
import { initMealsPage } from "../trip-engine.js";
import { initNearMeLookup } from "../near-me.js";

initTheme();
bindUi({
  restaurantList: "#restaurantList",
  gasPanel: "#gasPanel",
});
initMealsPage();
initNearMeLookup();
