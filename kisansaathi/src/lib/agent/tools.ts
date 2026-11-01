import Anthropic from '@anthropic-ai/sdk';

// ---- Tool Definitions (JSON Schema for Claude) ----

export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_weather_data',
    description: 'Fetch LIVE weather data for Guntur from Open-Meteo API. Returns current conditions and 3-day forecast including temperature, humidity, rainfall, wind, and UV index.',
    input_schema: {
      type: 'object' as const,
      properties: {
        lat: { type: 'number', description: 'Latitude of the farm location' },
        lon: { type: 'number', description: 'Longitude of the farm location' },
      },
      required: ['lat', 'lon'],
    },
  },
  {
    name: 'get_soil_data',
    description: 'Fetch LIVE soil moisture and evapotranspiration data from NASA POWER API for the farm location. Returns root-zone soil wetness and water balance metrics.',
    input_schema: {
      type: 'object' as const,
      properties: {
        lat: { type: 'number', description: 'Latitude of the farm location' },
        lon: { type: 'number', description: 'Longitude of the farm location' },
      },
      required: ['lat', 'lon'],
    },
  },
  {
    name: 'get_mandi_price',
    description: 'Fetch LIVE mandi (wholesale market) prices from Data.gov.in Agmarknet for the crop in Guntur market.',
    input_schema: {
      type: 'object' as const,
      properties: {
        commodity: {
          type: 'string',
          description: 'Crop name in English (e.g., "chilli", "cotton", "paddy")',
        },
      },
      required: ['commodity'],
    },
  },
];

// ---- Tool Executor (called when Claude invokes a tool) ----

export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  baseUrl: string
): Promise<string> {
  try {
    let response: Response;

    if (toolName === 'get_weather_data') {
      response = await fetch(
        `${baseUrl}/api/weather?lat=${toolInput.lat}&lon=${toolInput.lon}`
      );
    } else if (toolName === 'get_soil_data') {
      response = await fetch(
        `${baseUrl}/api/soil?lat=${toolInput.lat}&lon=${toolInput.lon}`
      );
    } else if (toolName === 'get_mandi_price') {
      response = await fetch(
        `${baseUrl}/api/prices?commodity=${encodeURIComponent(toolInput.commodity as string)}`
      );
    } else {
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }

    if (!response.ok) {
      const errText = await response.text();
      return JSON.stringify({ error: `API returned ${response.status}: ${errText}` });
    }

    const data = await response.json();
    return JSON.stringify(data);
  } catch (err) {
    return JSON.stringify({ error: String(err) });
  }
}
