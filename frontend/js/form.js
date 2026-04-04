const weatherBtn = document.getElementById("weatherBtn");
const form = document.getElementById("farmForm");
const errorBox = document.getElementById("errorBox");
const weatherApiKeyInput = document.getElementById("weatherApiKey");

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

function hideError() {
  errorBox.classList.add("hidden");
}

function saveInputPayload(data) {
  const payload = JSON.stringify(data);

  try {
    localStorage.setItem("vivasayiInput", payload);
    return true;
  } catch (_err) {
    try {
      sessionStorage.setItem("vivasayiInput", payload);
      return true;
    } catch (_innerErr) {
      return false;
    }
  }
}

function getFormData() {
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());

  ["soilPH", "nitrogen", "phosphorus", "potassium", "temperature", "rainfall"].forEach((key) => {
    data[key] = Number(data[key]);
  });

  return data;
}

function validateInput(data) {
  if (!data.soilType || !data.location || !data.season) {
    return "Please fill all required fields.";
  }

  if (data.soilPH < 0 || data.soilPH > 14) {
    return "Soil pH must be between 0 and 14.";
  }

  const numericChecks = ["nitrogen", "phosphorus", "potassium", "temperature", "rainfall"];
  for (const key of numericChecks) {
    if (Number.isNaN(data[key])) {
      return `Invalid value for ${key}.`;
    }
  }

  if (data.rainfall < 0) {
    return "Rainfall cannot be negative.";
  }

  return null;
}

async function fillWeatherFromAPI() {
  hideError();

  const location = form.location.value.trim();
  const apiKey = weatherApiKeyInput.value.trim();

  if (!location || !apiKey) {
    showError("Enter both location and OpenWeather API key to auto-fill weather.");
    return;
  }

  weatherBtn.disabled = true;
  weatherBtn.textContent = "Fetching...";

  try {
    const geoRes = await fetch(
      `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(location)}&limit=1&appid=${apiKey}`
    );

    const geoData = await geoRes.json();
    if (!Array.isArray(geoData) || geoData.length === 0) {
      throw new Error("Location not found by weather service.");
    }

    const { lat, lon } = geoData[0];
    const weatherRes = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`
    );

    const weatherData = await weatherRes.json();
    if (!weatherData.main) {
      throw new Error(weatherData.message || "Unable to fetch weather data.");
    }

    form.temperature.value = weatherData.main.temp;
    form.rainfall.value = weatherData.rain?.["1h"] ? Number(weatherData.rain["1h"]) * 24 : 20;
  } catch (err) {
    showError(err.message || "Failed to auto-fill weather.");
  } finally {
    weatherBtn.disabled = false;
    weatherBtn.textContent = "Auto-fill Weather";
  }
}

weatherBtn?.addEventListener("click", fillWeatherFromAPI);

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  hideError();

  const data = getFormData();
  const validationError = validateInput(data);
  if (validationError) {
    showError(validationError);
    return;
  }

  const isSaved = saveInputPayload(data);
  if (!isSaved) {
    showError("Unable to save input in browser storage. Allow storage and try again.");
    return;
  }

  window.location.assign(new URL("results.html", window.location.href).href);
});
