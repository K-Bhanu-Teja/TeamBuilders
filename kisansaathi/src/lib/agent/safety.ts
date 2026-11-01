// Safety layer: filters advice output before showing to farmer
// Checks for banned pesticides and extreme weather conditions

const BANNED_PESTICIDES = [
  'monocrotophos', 'methyl parathion', 'phorate', 'endosulfan',
  'chlorpyrifos', 'profenofos', 'triazophos', 'dimethoate',
  'phosphamidon', 'carbofuran', 'aldicarb', 'quinalphos',
];

export type SafetyCheckResult = {
  safe: boolean;
  warnings: string[];
  filteredAdvice: string;
};

export function runSafetyCheck(
  adviceText: string,
  weatherData?: { rainfall_24h?: number; max_temp?: number } | null,
  soilData?: { soil_moisture_percent?: number } | null
): SafetyCheckResult {
  const warnings: string[] = [];
  let filteredAdvice = adviceText;

  // Check for banned pesticides in advice
  const lowerAdvice = adviceText.toLowerCase();
  for (const pesticide of BANNED_PESTICIDES) {
    if (lowerAdvice.includes(pesticide)) {
      warnings.push(`⚠️ Banned pesticide mention removed: ${pesticide}`);
      const regex = new RegExp(pesticide, 'gi');
      filteredAdvice = filteredAdvice.replace(regex, '[BANNED CHEMICAL — DO NOT USE]');
    }
  }

  // Extreme weather checks
  if (weatherData?.rainfall_24h !== undefined && weatherData.rainfall_24h > 40) {
    warnings.push(`🌧️ Heavy rain alert: ${weatherData.rainfall_24h}mm expected. Spraying not advisable.`);
  }

  if (weatherData?.max_temp !== undefined && weatherData.max_temp > 42) {
    warnings.push(`🔥 Heatwave alert: ${weatherData.max_temp}°C. Irrigate early morning or evening only.`);
  }

  // Soil saturation check
  if (soilData?.soil_moisture_percent !== undefined && soilData.soil_moisture_percent > 80) {
    warnings.push(`💧 Soil is saturated (${soilData.soil_moisture_percent}%). Irrigation not needed.`);
  }

  return {
    safe: warnings.length === 0,
    warnings,
    filteredAdvice,
  };
}
