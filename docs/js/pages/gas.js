import { initTheme } from "../theme.js";
import { bindUi } from "../ui.js";
import { initGasPage } from "../trip-engine.js";

initTheme();
bindUi({
  gasPanel: "#gasPanel",
});
initGasPage();
