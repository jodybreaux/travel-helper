export const ui = {
  tripForm: null,
  formMessage: null,
  routeGrid: null,
  restaurantList: null,
  gasPanel: null,
  mapStatus: null,
  routeSummary: null,
  directionsToggle: null,
  directionsList: null,
  weatherList: null,
};

export function bindUi(selectors = {}) {
  Object.entries(selectors).forEach(([key, selector]) => {
    if (typeof selector === "string") {
      ui[key] = document.querySelector(selector);
      return;
    }
    ui[key] = selector;
  });
}
