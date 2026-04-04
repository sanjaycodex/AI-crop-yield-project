const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");

app.use(cors());
app.use(express.json());
app.use(express.static(FRONTEND_DIR));

const CROP_DATA = [
  { crop: "Rice", price: 2000, cost: 10000, rainfallMin: 120, tempRange: [22, 35], soil: ["clay", "loamy"], season: ["kharif", "monsoon"] },
  { crop: "Wheat", price: 1800, cost: 8000, rainfallMin: 50, tempRange: [15, 28], soil: ["loamy", "clay"], season: ["rabi", "winter"] },
  { crop: "Cotton", price: 5000, cost: 20000, rainfallMin: 60, tempRange: [21, 36], soil: ["sandy", "loamy"], season: ["kharif", "summer"] },
  { crop: "Maize", price: 1700, cost: 7000, rainfallMin: 60, tempRange: [18, 32], soil: ["loamy", "sandy"], season: ["kharif", "summer", "rabi"] },
  { crop: "Millet", price: 2200, cost: 6000, rainfallMin: 35, tempRange: [20, 34], soil: ["sandy", "loamy"], season: ["summer", "kharif"] },
  { crop: "Sugarcane", price: 3200, cost: 18000, rainfallMin: 100, tempRange: [24, 38], soil: ["loamy", "clay"], season: ["spring", "kharif"] }
];

function toNumber(value) {
  return Number(value);
}

function validateCommonInput(data) {
  const required = [
    "soilType",
    "soilPH",
    "nitrogen",
    "phosphorus",
    "potassium",
    "temperature",
    "rainfall",
    "location",
    "season"
  ];

  for (const field of required) {
    if (data[field] === undefined || data[field] === null || data[field] === "") {
      return `Missing field: ${field}`;
    }
  }

  const checks = [
    { field: "soilPH", min: 0, max: 14 },
    { field: "nitrogen", min: 0, max: 400 },
    { field: "phosphorus", min: 0, max: 400 },
    { field: "potassium", min: 0, max: 400 },
    { field: "temperature", min: -10, max: 60 },
    { field: "rainfall", min: 0, max: 2000 }
  ];

  for (const check of checks) {
    const num = toNumber(data[check.field]);
    if (Number.isNaN(num) || num < check.min || num > check.max) {
      return `${check.field} should be between ${check.min} and ${check.max}`;
    }
  }

  return null;
}

function getSoilFactor(soilType) {
  const map = {
    sandy: 0.9,
    clay: 1.05,
    loamy: 1.2
  };

  return map[String(soilType || "").toLowerCase()] || 1;
}

function getSeasonFactor(season) {
  const map = {
    kharif: 1.1,
    rabi: 1.05,
    summer: 0.95,
    winter: 1,
    monsoon: 1.12,
    spring: 1.02,
    autumn: 0.98
  };

  return map[String(season || "").toLowerCase()] || 1;
}

function getClimateFactor(crop, temperature, rainfall) {
  let score = 1;

  const [tempMin, tempMax] = crop.tempRange;
  if (temperature >= tempMin && temperature <= tempMax) {
    score += 0.2;
  } else {
    score -= 0.15;
  }

  if (rainfall >= crop.rainfallMin) {
    score += 0.15;
  } else {
    score -= 0.2;
  }

  return Math.max(0.5, score);
}

function estimateYield(data, cropName) {
  const n = toNumber(data.nitrogen);
  const p = toNumber(data.phosphorus);
  const k = toNumber(data.potassium);
  const rainfall = toNumber(data.rainfall);
  const temperature = toNumber(data.temperature);

  const baseNutrients = n + p + k;
  const soilFactor = getSoilFactor(data.soilType);
  const seasonFactor = getSeasonFactor(data.season);

  let cropFactor = 1;
  if (cropName) {
    const crop = CROP_DATA.find((item) => item.crop.toLowerCase() === String(cropName).toLowerCase());
    if (crop) {
      cropFactor = getClimateFactor(crop, temperature, rainfall);
      if (crop.soil.includes(String(data.soilType).toLowerCase())) {
        cropFactor += 0.1;
      }
      if (crop.season.includes(String(data.season).toLowerCase())) {
        cropFactor += 0.08;
      }
    }
  }

  const rawYield = (baseNutrients * rainfall * soilFactor * seasonFactor * cropFactor) / 1000;
  return Number(Math.max(0.4, rawYield).toFixed(2));
}

function estimateProfit(crop, predictedYield) {
  const revenue = predictedYield * crop.price;
  const profit = revenue - crop.cost;

  return {
    estimatedPricePerTon: crop.price,
    costOfCultivation: crop.cost,
    expectedRevenue: Number(revenue.toFixed(2)),
    expectedProfit: Number(profit.toFixed(2))
  };
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", app: "Vivasayi AI API" });
});

app.post("/predict", (req, res) => {
  const inputError = validateCommonInput(req.body || {});
  if (inputError) {
    return res.status(400).json({ error: inputError });
  }

  const crop = req.body.crop || "Rice";
  const predictedYield = estimateYield(req.body, crop);

  return res.json({
    crop,
    predictedYield,
    unit: "tons/hectare"
  });
});

app.post("/profit", (req, res) => {
  const { crop, yieldValue } = req.body || {};

  if (!crop || yieldValue === undefined || yieldValue === null) {
    return res.status(400).json({ error: "Fields required: crop, yieldValue" });
  }

  const selectedCrop = CROP_DATA.find((item) => item.crop.toLowerCase() === String(crop).toLowerCase());
  if (!selectedCrop) {
    return res.status(404).json({ error: "Crop not found in dataset" });
  }

  const numericYield = toNumber(yieldValue);
  if (Number.isNaN(numericYield) || numericYield <= 0) {
    return res.status(400).json({ error: "yieldValue should be a positive number" });
  }

  const profitData = estimateProfit(selectedCrop, numericYield);
  return res.json({
    crop: selectedCrop.crop,
    yieldValue: numericYield,
    ...profitData
  });
});

app.get("/recommend", (req, res) => {
  const input = {
    soilType: req.query.soilType,
    soilPH: req.query.soilPH,
    nitrogen: req.query.nitrogen,
    phosphorus: req.query.phosphorus,
    potassium: req.query.potassium,
    temperature: req.query.temperature,
    rainfall: req.query.rainfall,
    location: req.query.location || "Unknown",
    season: req.query.season
  };

  const inputError = validateCommonInput(input);
  if (inputError) {
    return res.status(400).json({ error: inputError });
  }

  const ranked = CROP_DATA.map((crop) => {
    const predictedYield = estimateYield(input, crop.crop);
    const profitData = estimateProfit(crop, predictedYield);

    return {
      crop: crop.crop,
      predictedYield,
      estimatedPricePerTon: profitData.estimatedPricePerTon,
      expectedProfit: profitData.expectedProfit,
      costOfCultivation: profitData.costOfCultivation
    };
  }).sort((a, b) => b.expectedProfit - a.expectedProfit);

  return res.json({
    location: input.location,
    season: input.season,
    recommendations: ranked.slice(0, 3),
    allComparisons: ranked
  });
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Vivasayi AI running on http://localhost:${PORT}`);
});
