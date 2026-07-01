const NEAR_ME_BUTTON_LABEL = "Food & gas near me";
const NEAR_ME_LOADING_LABEL = "Finding food & gas near you...";

export function ensureSiteHeaderNearMe() {
  const header = document.querySelector(".site-header");
  if (!header) {
    return;
  }

  let utilityBar = header.querySelector(".site-utility-bar");
  if (!utilityBar) {
    utilityBar = document.createElement("div");
    utilityBar.className = "site-utility-bar";
    utilityBar.setAttribute("aria-label", "Quick actions");
    header.insertBefore(utilityBar, header.firstChild);
  }

  let button = header.querySelector("#nearMeButton");
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.className = "near-me-trigger";
    button.id = "nearMeButton";
    button.setAttribute("aria-label", "Find food and gas near your current location");
    utilityBar.prepend(button);
  } else if (!utilityBar.contains(button)) {
    utilityBar.prepend(button);
  }

  button.className = "near-me-trigger";
  button.setAttribute("aria-label", "Find food and gas near your current location");

  let buttonText = button.querySelector("#nearMeButtonText");
  if (!buttonText) {
    const existingLabel = button.textContent.trim().replace(/\s+/g, " ");
    buttonText = document.createElement("span");
    buttonText.className = "near-me-trigger-text";
    buttonText.id = "nearMeButtonText";
    buttonText.textContent = existingLabel || NEAR_ME_BUTTON_LABEL;
    button.replaceChildren(buttonText);
  }

  let waitElement = button.querySelector("#nearMeWait");
  if (!waitElement) {
    waitElement = document.createElement("span");
    waitElement.className = "wait-cursor near-me-wait";
    waitElement.id = "nearMeWait";
    waitElement.hidden = true;
    waitElement.setAttribute("aria-hidden", "true");
    button.append(waitElement);
  }

  const duplicateButtons = [...header.querySelectorAll("#nearMeButton")].filter((element) => element !== button);
  duplicateButtons.forEach((element) => element.remove());

  let statusElement = utilityBar.querySelector("#nearMeStatus");
  if (!statusElement) {
    statusElement = header.querySelector("#nearMeStatus") || document.createElement("p");
    statusElement.className = "near-me-status";
    statusElement.id = "nearMeStatus";
    statusElement.setAttribute("role", "status");
    statusElement.setAttribute("aria-live", "polite");
    utilityBar.append(statusElement);
  } else if (!utilityBar.contains(statusElement)) {
    utilityBar.append(statusElement);
  }

  let resultsBar = header.querySelector(".near-me-bar");
  if (!resultsBar) {
    resultsBar = document.createElement("div");
    resultsBar.className = "near-me-bar";
    resultsBar.setAttribute("aria-label", "Food and gas near your current location");
    header.append(resultsBar);
  }

  if (!resultsBar.querySelector("#nearMeResults")) {
    resultsBar.innerHTML = '<div class="near-me-results restaurant-list" id="nearMeResults" hidden></div>';
  }
}

export function setNearMeButtonLoading(isLoading) {
  const button = document.querySelector("#nearMeButton");
  const buttonText = document.querySelector("#nearMeButtonText");
  const waitElement = document.querySelector("#nearMeWait");

  document.documentElement.classList.toggle("is-waiting", isLoading);
  document.body.classList.toggle("is-waiting", isLoading);

  if (button) {
    button.disabled = isLoading;
    button.classList.toggle("is-loading", isLoading);
    button.setAttribute("aria-busy", isLoading ? "true" : "false");
  }

  if (buttonText) {
    buttonText.textContent = isLoading ? NEAR_ME_LOADING_LABEL : NEAR_ME_BUTTON_LABEL;
  }

  if (waitElement) {
    waitElement.hidden = !isLoading;
    waitElement.setAttribute("aria-hidden", isLoading ? "false" : "true");
  }
}
