import { Weather } from './types';

/**
 * Automatic weather stamp for a daily log.
 *
 * Weather is the highest-value auto-field on a construction daily report:
 * weather-delay claims are the single most common downstream use of the log,
 * and a stamp that the crew never has to type is a stamp that is always there
 * and always consistent.
 *
 * Uses Open-Meteo, which needs no API key and no account, so this works from
 * the browser with nothing to configure. If the call fails (no signal, no
 * coordinates on the project) the entry is simply saved without weather --
 * never block filing a log on a weather lookup.
 */

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';

// WMO weather interpretation codes.
const WMO: Record<number, { vi: string; en: string }> = {
  0: { vi: 'Trời quang', en: 'Clear sky' },
  1: { vi: 'Nắng nhẹ', en: 'Mainly clear' },
  2: { vi: 'Có mây', en: 'Partly cloudy' },
  3: { vi: 'Nhiều mây', en: 'Overcast' },
  45: { vi: 'Sương mù', en: 'Fog' },
  48: { vi: 'Sương muối', en: 'Rime fog' },
  51: { vi: 'Mưa phùn nhẹ', en: 'Light drizzle' },
  53: { vi: 'Mưa phùn', en: 'Drizzle' },
  55: { vi: 'Mưa phùn dày', en: 'Dense drizzle' },
  61: { vi: 'Mưa nhỏ', en: 'Slight rain' },
  63: { vi: 'Mưa vừa', en: 'Moderate rain' },
  65: { vi: 'Mưa to', en: 'Heavy rain' },
  66: { vi: 'Mưa lạnh', en: 'Freezing rain' },
  67: { vi: 'Mưa lạnh nặng hạt', en: 'Heavy freezing rain' },
  71: { vi: 'Tuyết nhẹ', en: 'Slight snow' },
  73: { vi: 'Tuyết', en: 'Moderate snow' },
  75: { vi: 'Tuyết dày', en: 'Heavy snow' },
  80: { vi: 'Mưa rào nhẹ', en: 'Slight showers' },
  81: { vi: 'Mưa rào', en: 'Showers' },
  82: { vi: 'Mưa rào rất to', en: 'Violent showers' },
  95: { vi: 'Dông', en: 'Thunderstorm' },
  96: { vi: 'Dông kèm mưa đá', en: 'Thunderstorm with hail' },
  99: { vi: 'Dông mạnh kèm mưa đá', en: 'Severe thunderstorm with hail' }
};

export function describeWeatherCode(code: number | null | undefined): { vi: string; en: string } {
  if (code === null || code === undefined) return { vi: 'Không rõ', en: 'Unknown' };
  return WMO[code] || { vi: 'Không rõ', en: 'Unknown' };
}

/**
 * Current conditions at the site. `workDate` in the past switches to the
 * historical archive so a log written up two days later still carries the
 * weather of the day the work actually happened.
 */
export async function fetchWeather(
  latitude: number,
  longitude: number,
  workDate?: string | null
): Promise<Weather | null> {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;

  const today = new Date().toISOString().split('T')[0];
  const isPast = Boolean(workDate && workDate < today);

  try {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      timezone: 'auto'
    });

    if (isPast) {
      params.set('start_date', workDate as string);
      params.set('end_date', workDate as string);
      params.set('daily', 'weather_code,temperature_2m_max,precipitation_sum,wind_speed_10m_max');
    } else {
      params.set('current', 'temperature_2m,precipitation,wind_speed_10m,weather_code');
    }

    const res = await fetch(`${OPEN_METEO}?${params.toString()}`);
    if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}`);

    const json = await res.json();

    let code: number | null = null;
    let temp: number | null = null;
    let precip: number | null = null;
    let wind: number | null = null;

    if (isPast && json.daily) {
      code = json.daily.weather_code?.[0] ?? null;
      temp = json.daily.temperature_2m_max?.[0] ?? null;
      precip = json.daily.precipitation_sum?.[0] ?? null;
      wind = json.daily.wind_speed_10m_max?.[0] ?? null;
    } else if (json.current) {
      code = json.current.weather_code ?? null;
      temp = json.current.temperature_2m ?? null;
      precip = json.current.precipitation ?? null;
      wind = json.current.wind_speed_10m ?? null;
    } else {
      return null;
    }

    const label = describeWeatherCode(code);

    return {
      temp_c: temp,
      precip_mm: precip,
      wind_kph: wind,
      code,
      label_vi: label.vi,
      label_en: label.en,
      source: 'open-meteo',
      fetched_at: new Date().toISOString()
    };
  } catch (err) {
    // Never block a log on weather. The field is optional by design.
    console.warn('Weather lookup failed, filing entry without a weather stamp:', err);
    return null;
  }
}

/** One-line rendering for cards, digests and exports. */
export function formatWeather(w: Weather | null | undefined): string {
  if (!w) return '';
  const bits: string[] = [];
  if (w.label_vi) bits.push(w.label_vi);
  if (typeof w.temp_c === 'number') bits.push(`${Math.round(w.temp_c)}°C`);
  if (typeof w.precip_mm === 'number' && w.precip_mm > 0) bits.push(`mưa ${w.precip_mm}mm`);
  if (typeof w.wind_kph === 'number') bits.push(`gió ${Math.round(w.wind_kph)} km/h`);
  return bits.join(' · ');
}

/** True when conditions are the kind a delay claim would later hang on. */
export function isAdverseWeather(w: Weather | null | undefined): boolean {
  if (!w) return false;
  const heavyRain = typeof w.precip_mm === 'number' && w.precip_mm >= 10;
  const highWind = typeof w.wind_kph === 'number' && w.wind_kph >= 38;
  const badCode = typeof w.code === 'number' && [65, 67, 75, 82, 95, 96, 99].includes(w.code);
  return heavyRain || highWind || badCode;
}
