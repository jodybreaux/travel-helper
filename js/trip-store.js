import { ROUTE_TEMPLATES } from "./constants.js";

const STORAGE_KEY = "travel-helper-trip-state";

function cloneRouteTemplates() {
  return ROUTE_TEMPLATES.map((route) => ({ ...route }));
}

function defaultRecommendationLoading() {
  return {
    restaurants: false,
    fuel: false,
    restaurantStopIds: [],
    fuelStopIds: [],
    townStopIds: [],
  };
}

function defaultForm() {
  return {
    origin: "",
    destination: "",
    departDate: "",
    returnDate: "",
    departTime: "08:00",
    mode: "Car",
    timezone: "America/Chicago",
    restaurantEnabled: true,
    dateFormat: "en-US",
  };
}

function defaultState() {
  return {
    form: defaultForm(),
    routeTemplates: cloneRouteTemplates(),
    activeRouteOptions: [],
    activeOrigin: null,
    activeDestination: null,
    activeDepartureAt: null,
    selectedRouteIndex: null,
    previewRequestId: 0,
    activeRestaurants: [],
    activeFuelStations: [],
    activeTripStops: [],
    recommendationLoading: defaultRecommendationLoading(),
  };
}

function serializeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function reviveDate(value) {
  return value ? new Date(value) : null;
}

function serializeTripStop(stop) {
  return {
    ...stop,
    passTime: serializeDate(stop.passTime),
  };
}

function reviveTripStop(stop) {
  return {
    ...stop,
    passTime: reviveDate(stop.passTime),
  };
}

function serializeRecommendation(item) {
  return {
    ...item,
    passTime: serializeDate(item.passTime),
  };
}

function reviveRecommendation(item) {
  return {
    ...item,
    passTime: reviveDate(item.passTime),
  };
}

function serializeState(state) {
  return {
    ...state,
    activeDepartureAt: serializeDate(state.activeDepartureAt),
    activeTripStops: state.activeTripStops.map(serializeTripStop),
    activeRestaurants: state.activeRestaurants.map(serializeRecommendation),
    activeFuelStations: state.activeFuelStations.map(serializeRecommendation),
    recommendationLoading: {
      ...state.recommendationLoading,
      restaurantStopIds: [...state.recommendationLoading.restaurantStopIds],
      fuelStopIds: [...state.recommendationLoading.fuelStopIds],
      townStopIds: [...state.recommendationLoading.townStopIds],
    },
  };
}

function reviveState(raw) {
  if (!raw) return defaultState();

  return {
    ...defaultState(),
    ...raw,
    form: { ...defaultForm(), ...raw.form },
    routeTemplates: raw.routeTemplates?.length ? raw.routeTemplates : cloneRouteTemplates(),
    activeDepartureAt: reviveDate(raw.activeDepartureAt),
    activeTripStops: (raw.activeTripStops || []).map(reviveTripStop),
    activeRestaurants: (raw.activeRestaurants || []).map(reviveRecommendation),
    activeFuelStations: (raw.activeFuelStations || []).map(reviveRecommendation),
    recommendationLoading: {
      ...defaultRecommendationLoading(),
      ...raw.recommendationLoading,
      restaurantStopIds: raw.recommendationLoading?.restaurantStopIds || [],
      fuelStopIds: raw.recommendationLoading?.fuelStopIds || [],
      townStopIds: raw.recommendationLoading?.townStopIds || [],
    },
  };
}

function loadState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return reviveState(raw ? JSON.parse(raw) : null);
  } catch {
    return defaultState();
  }
}

let state = loadState();

function persist() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState(state)));
  } catch {
    // Route geometry can exceed sessionStorage limits; keep the current page usable in memory.
  }
}

export function getState() {
  return state;
}

export function getRouteTemplates() {
  return state.routeTemplates;
}

export function patchState(updates) {
  state = { ...state, ...updates };
  persist();
}

export function updateRecommendationLoading(updates) {
  state.recommendationLoading = { ...state.recommendationLoading, ...updates };
  persist();
}

export function saveFormFromFormData(formData) {
  state.form = {
    ...state.form,
    origin: formData.get("origin")?.trim() || "",
    destination: formData.get("destination")?.trim() || "",
    departDate: formData.get("departDate") || "",
    returnDate: formData.get("returnDate") || "",
    departTime: formData.get("departTime") || "08:00",
    mode: formData.get("mode") || "Car",
    timezone: formData.get("timezone") || "America/Chicago",
    restaurantEnabled: formData.get("restaurantEnabled") === "on" || formData.get("restaurantEnabled") === true,
    dateFormat: formData.get("dateFormat") || state.form.dateFormat,
  };
  persist();
}

export function saveFormFromControls(form) {
  if (!form) return;

  saveFormFromFormData(new FormData(form));

  const restaurantToggle = form.querySelector("#restaurantToggle");
  state.form.restaurantEnabled = restaurantToggle ? restaurantToggle.checked : state.form.restaurantEnabled;
  persist();
}

export function loadFormIntoForm(form) {
  if (!form) return;

  const { form: saved } = state;
  const setValue = (name, value) => {
    const control = form.elements.namedItem(name);
    if (!control) return;
    if (control instanceof RadioNodeList) return;
    if (control.type === "checkbox") {
      control.checked = Boolean(value);
      return;
    }
    control.value = value ?? "";
  };

  setValue("origin", saved.origin);
  setValue("destination", saved.destination);
  setValue("departDate", saved.departDate);
  setValue("returnDate", saved.returnDate);
  setValue("departTime", saved.departTime);
  setValue("mode", saved.mode);
  setValue("timezone", saved.timezone);
  setValue("dateFormat", saved.dateFormat);

  const restaurantToggle = form.querySelector("#restaurantToggle");
  if (restaurantToggle) restaurantToggle.checked = saved.restaurantEnabled;
}

export function getTimezone() {
  return state.form.timezone || "America/Chicago";
}

export function isRestaurantEnabled() {
  return state.form.restaurantEnabled !== false;
}

export function nextPreviewRequestId() {
  state.previewRequestId += 1;
  persist();
  return state.previewRequestId;
}

export function getPreviewRequestId() {
  return state.previewRequestId;
}
