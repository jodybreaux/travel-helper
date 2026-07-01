import { initTheme } from "../theme.js";
import { bindUi } from "../ui.js";
import { initRouteInfoPage } from "../trip-engine.js";

initTheme();
bindUi({
  tripForm: "#tripForm",
  formMessage: "#formMessage",
});
initRouteInfoPage();
