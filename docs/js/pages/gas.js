import { initTheme } from "../theme.js";
import { bindUi } from "../ui.js";
import { initGasPage } from "../trip-engine.js";
import { initNearMeLookup } from "../near-me.js";

initTheme();
bindUi({
  gasPanel: "#gasPanel",
});
initGasPage();
initNearMeLookup();
