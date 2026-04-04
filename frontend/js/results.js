const API_OVERRIDE_KEY = "vivasayiApiBase";
const API_TIMEOUT_MS = 7000;
let activeApiBase = null;

function resolveApiBase() {
  const override = localStorage.getItem(API_OVERRIDE_KEY);
  if (override) {
    return override.replace(/\/+$/, "");
  }

  const { protocol, hostname, host, port } = window.location;
  const resolvedProtocol = protocol === "file:" ? "http:" : protocol;

  if (protocol === "file:") {
    return "http://localhost:5000";
  }

  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";

  if (isLocalHost && port !== "5000") {
    return `${resolvedProtocol}//${hostname}:5000`;
  }

  return `${resolvedProtocol}//${host}`;
}

function buildApiCandidates() {
  const candidates = [];
  const override = localStorage.getItem(API_OVERRIDE_KEY);
  const normalizedDefault = resolveApiBase();

  if (override) {
    candidates.push(override.replace(/\/+$/, ""));
  }

  candidates.push(normalizedDefault);

  const { protocol, hostname } = window.location;
  const resolvedProtocol = protocol === "file:" ? "http:" : protocol;
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";

  if (protocol !== "file:") {
    candidates.push(`${resolvedProtocol}//localhost:5000`);
    candidates.push(`${resolvedProtocol}//127.0.0.1:5000`);
  }

  if (protocol === "file:") {
    candidates.push("http://localhost:5000");
    candidates.push("http://127.0.0.1:5000");
  }

  return [...new Set(candidates)];
}

async function checkApiHealth(baseUrl) {
  const controller = new AbortController();
  const timerId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal
    });
    return response.ok;
  } catch (_error) {
    return false;
  } finally {
    window.clearTimeout(timerId);
  }
}

async function getActiveApiBase() {
  if (activeApiBase) {
    return activeApiBase;
  }

  const candidates = buildApiCandidates();
  const healthChecks = await Promise.all(
    candidates.map(async (candidate) => ({ candidate, healthy: await checkApiHealth(candidate) }))
  );

  const healthyCandidate = healthChecks.find((item) => item.healthy);
  if (healthyCandidate) {
    activeApiBase = healthyCandidate.candidate;
    return activeApiBase;
  }

  if (localStorage.getItem(API_OVERRIDE_KEY)) {
    localStorage.removeItem(API_OVERRIDE_KEY);
  }

  throw new Error(
    "Cannot reach API server. Start app from project root with npm start and refresh this page."
  );
}

const API_BASE = resolveApiBase();

const loadingEl = document.getElementById("loading");
const resultContentEl = document.getElementById("resultContent");
const errorBox = document.getElementById("errorBox");

const yieldValueEl = document.getElementById("yieldValue");
const priceValueEl = document.getElementById("priceValue");
const profitValueEl = document.getElementById("profitValue");
const recommendListEl = document.getElementById("recommendList");
const historyListEl = document.getElementById("historyList");
const chartCanvas = document.getElementById("comparisonChart");

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

function hideError() {
  errorBox.classList.add("hidden");
}

function setLoading(isLoading) {
  loadingEl.classList.toggle("hidden", !isLoading);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value);
}

function saveHistory(entry) {
  const history = JSON.parse(localStorage.getItem("vivasayiHistory") || "[]");
  history.unshift({ ...entry, createdAt: new Date().toISOString() });
  localStorage.setItem("vivasayiHistory", JSON.stringify(history.slice(0, 8)));
}

function renderHistory() {
  const history = JSON.parse(localStorage.getItem("vivasayiHistory") || "[]");
  historyListEl.innerHTML = "";

  if (!history.length) {
    historyListEl.innerHTML = "<li>No saved predictions yet.</li>";
    return;
  }

  history.forEach((item) => {
    const li = document.createElement("li");
    const date = new Date(item.createdAt).toLocaleString();
    li.textContent = `${date} | ${item.crop} | Yield ${item.yield} t/ha | Profit Rs ${formatCurrency(item.profit)}`;
    historyListEl.appendChild(li);
  });
}

function renderRecommendations(recommendations) {
  recommendListEl.innerHTML = "";
  recommendations.forEach((rec, index) => {
    const li = document.createElement("li");
    li.textContent = `${index + 1}. ${rec.crop} - Yield ${rec.predictedYield} t/ha | Profit Rs ${formatCurrency(rec.expectedProfit)}`;
    recommendListEl.appendChild(li);
  });
}

function renderComparisonChart(allComparisons) {
  if (!chartCanvas || !allComparisons?.length) {
    return;
  }

  const ctx = chartCanvas.getContext("2d");
  const width = chartCanvas.width;
  const height = chartCanvas.height;

  ctx.clearRect(0, 0, width, height);

  const maxProfit = Math.max(...allComparisons.map((item) => item.expectedProfit), 1);
  const barWidth = (width - 120) / allComparisons.length;

  ctx.fillStyle = "#173a2a";
  ctx.font = "700 14px Space Grotesk";
  ctx.fillText("Profit (Rs)", 18, 20);

  allComparisons.forEach((item, i) => {
    const x = 70 + i * barWidth;
    const normalized = item.expectedProfit / maxProfit;
    const barHeight = Math.max(8, normalized * (height - 90));
    const y = height - barHeight - 35;

    ctx.fillStyle = i < 3 ? "#ef7b2d" : "#12654b";
    ctx.fillRect(x, y, barWidth - 16, barHeight);

    ctx.fillStyle = "#1a2d22";
    ctx.font = "600 12px Space Grotesk";
    ctx.fillText(item.crop, x, height - 12);

    ctx.save();
    ctx.translate(x + 4, y - 6);
    ctx.rotate(-0.25);
    ctx.fillText(formatCurrency(item.expectedProfit), 0, 0);
    ctx.restore();
  });
}

function getSavedInput() {
  const raw = localStorage.getItem("vivasayiInput") || sessionStorage.getItem("vivasayiInput");
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (_parseError) {
    return null;
  }
}

async function requestJSON(url, options = {}) {
  let response;
  const controller = new AbortController();
  const timerId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    response = await fetch(url, {
      ...options,
      cache: "no-store",
      signal: controller.signal
    });
  } catch (networkError) {
    const displayBase = activeApiBase || API_BASE;
    const error = new Error(
      `Cannot reach API server at ${displayBase}. Start app from project root (npm start) and try again.`
    );
    error.isNetworkError = networkError?.name === "AbortError" || networkError instanceof TypeError;
    throw error;
  } finally {
    window.clearTimeout(timerId);
  }

  const responseText = await response.text();
  let data = null;

  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch (_parseError) {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.error || `Request failed (${response.status}).`);
  }

  return data || {};
}

async function postJSON(url, payload) {
  return requestJSON(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

async function getRecommendations(params, apiBase) {
  const query = new URLSearchParams(params).toString();
  return requestJSON(`${apiBase}/recommend?${query}`);
}

async function requestWithActiveApi(runRequest) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const apiBase = await getActiveApiBase();
    try {
      return await runRequest(apiBase);
    } catch (error) {
      if (!error?.isNetworkError || attempt === 1) {
        throw error;
      }

      activeApiBase = null;
    }
  }

  throw new Error("Cannot reach API server. Start app from project root with npm start and refresh this page.");
}

async function runPrediction() {
  hideError();
  renderHistory();

  const input = getSavedInput();
  if (!input) {
    showError("No input found. Please open Input Form, fill details, and submit Start Prediction.");
    return;
  }

  setLoading(true);
  resultContentEl.classList.add("hidden");

  try {
    const [prediction, rec] = await Promise.all([
      requestWithActiveApi((apiBase) => postJSON(`${apiBase}/predict`, input)),
      requestWithActiveApi((apiBase) => getRecommendations(input, apiBase))
    ]);

    const profit = await requestWithActiveApi((apiBase) =>
      postJSON(`${apiBase}/profit`, {
      crop: input.crop || prediction.crop,
      yieldValue: prediction.predictedYield
      })
    );

    yieldValueEl.textContent = `${prediction.predictedYield} tons/hectare`;
    priceValueEl.textContent = `Rs ${formatCurrency(profit.estimatedPricePerTon)} / ton`;
    profitValueEl.textContent = `Rs ${formatCurrency(profit.expectedProfit)}`;

    renderRecommendations(rec.recommendations);
    renderComparisonChart(rec.allComparisons);

    saveHistory({
      crop: profit.crop,
      yield: prediction.predictedYield,
      profit: profit.expectedProfit
    });
    renderHistory();

    resultContentEl.classList.remove("hidden");
  } catch (err) {
    showError(err.message || "Unable to load prediction results.");
  } finally {
    setLoading(false);
  }
}

runPrediction();
