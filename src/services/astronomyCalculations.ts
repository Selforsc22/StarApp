/**
 * Astronomy Calculations Service
 *
 * Provides astronomical calculations for the star map application:
 * - Star visibility calculations
 * - Constellation visibility
 * - Rise/set times
 * - Twilight calculations
 * - Celestial object positions
 *
 * Uses the astronomy-engine library for precise calculations where available,
 * with fallback implementations for core functionality.
 */

import {
  Star,
  VisibleStar,
  Constellation,
  VisibleConstellation,
  EquatorialCoordinates,
  HorizontalCoordinates,
  GeographicCoordinates,
  Observer,
  Viewport,
  VisibilityResult,
  MeteorShower,
  AstronomicalEvent,
} from '../types';

import {
  equatorialToHorizontal,
  horizontalToCartesian,
  cartesianToScreen,
  isAboveHorizon,
  isInViewport,
  angularDistance,
  applyRefraction,
} from '../utils/coordinateConversion';

import {
  dateToJulianDate,
  localMeanSiderealTime,
  siderealTimeToHours,
  degreesToRadians,
  radiansToDegrees,
  normalizeAngle,
} from '../utils/timeCalculations';

// Star color lookup based on B-V color index
const STAR_COLORS: { [key: string]: string } = {
  'O': '#9bb0ff', // Blue
  'B': '#aabfff', // Blue-white
  'A': '#cad7ff', // White
  'F': '#f8f7ff', // Yellow-white
  'G': '#fff4ea', // Yellow
  'K': '#ffd2a1', // Orange
  'M': '#ffcc6f', // Red-orange
};

/**
 * Calculate star color from spectral type or color index
 */
export function getStarColor(spectralType?: string, colorIndex?: number): string {
  if (colorIndex !== undefined) {
    // Convert B-V color index to RGB
    return colorIndexToRGB(colorIndex);
  }

  if (spectralType) {
    const type = spectralType.charAt(0).toUpperCase();
    return STAR_COLORS[type] || '#ffffff';
  }

  return '#ffffff';
}

/**
 * Convert B-V color index to RGB hex color
 * Based on blackbody radiation approximation
 */
function colorIndexToRGB(bv: number): string {
  // Clamp B-V to valid range
  const clampedBV = Math.max(-0.4, Math.min(2.0, bv));

  let r: number, g: number, b: number;

  if (clampedBV < 0) {
    // Blue stars (negative B-V)
    r = 155 + (clampedBV + 0.4) * 100;
    g = 176 + (clampedBV + 0.4) * 50;
    b = 255;
  } else if (clampedBV < 0.4) {
    // Blue-white to white
    r = 155 + clampedBV * 250;
    g = 176 + clampedBV * 198;
    b = 255;
  } else if (clampedBV < 0.8) {
    // White to yellow
    r = 255;
    g = 255 - (clampedBV - 0.4) * 50;
    b = 255 - (clampedBV - 0.4) * 200;
  } else if (clampedBV < 1.4) {
    // Yellow to orange
    r = 255;
    g = 235 - (clampedBV - 0.8) * 100;
    b = 175 - (clampedBV - 0.8) * 150;
  } else {
    // Orange to red
    r = 255;
    g = 175 - (clampedBV - 1.4) * 100;
    b = 85 - (clampedBV - 1.4) * 50;
  }

  // Clamp to valid range and convert to hex
  r = Math.round(Math.max(0, Math.min(255, r)));
  g = Math.round(Math.max(0, Math.min(255, g)));
  b = Math.round(Math.max(0, Math.min(255, b)));

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Calculate render size for a star based on magnitude
 * Uses logarithmic scale matching human eye perception
 */
export function calculateStarSize(magnitude: number, baseSizeMaximum: number = 6): number {
  // Magnitude scale: lower = brighter
  // Sirius = -1.46, limit of naked eye = ~6
  // Size should be larger for brighter (lower magnitude) stars

  // Map magnitude to size using logarithmic perception
  // Magnitude difference of 5 = 100x brightness difference

  const minMag = -1.5; // Brightest (Sirius)
  const maxMag = 6.5; // Faintest visible

  // Normalize magnitude to 0-1 range (inverted: brighter = higher)
  const normalizedBrightness = 1 - (magnitude - minMag) / (maxMag - minMag);

  // Apply power function for perceptual scaling
  const size = Math.pow(normalizedBrightness, 2) * baseSizeMaximum + 0.5;

  return Math.max(0.5, size);
}

/**
 * Calculate opacity for a star based on magnitude
 */
export function calculateStarOpacity(magnitude: number): number {
  const minMag = -1.5;
  const maxMag = 6.5;

  const normalizedBrightness = 1 - (magnitude - minMag) / (maxMag - minMag);
  return Math.max(0.3, Math.min(1, normalizedBrightness * 0.7 + 0.3));
}

/**
 * Process a star for rendering
 * Converts coordinates and calculates visual properties
 */
export function processStarForRendering(
  star: Star,
  observer: Observer,
  viewport?: Viewport
): VisibleStar | null {
  // Convert equatorial to horizontal coordinates
  const horizontal = equatorialToHorizontal(
    star.coordinates,
    observer.location,
    observer.time
  );

  // Check if above horizon
  if (!isAboveHorizon(horizontal)) {
    return null;
  }

  // Apply atmospheric refraction correction
  const refractedAltitude = applyRefraction(horizontal.altitude);
  const correctedHorizontal = {
    ...horizontal,
    altitude: refractedAltitude,
  };

  // Check viewport if provided
  if (viewport && !isInViewport(correctedHorizontal, viewport)) {
    return null;
  }

  // Calculate visual properties
  const renderSize = calculateStarSize(star.magnitude);
  const color = getStarColor(star.spectralType, star.colorIndex);

  return {
    ...star,
    horizontal: correctedHorizontal,
    renderSize,
    color,
  };
}

/**
 * Process multiple stars for rendering
 * Returns only visible stars sorted by brightness
 */
export function processStarsForRendering(
  stars: Star[],
  observer: Observer,
  magnitudeLimit: number = 6.0,
  viewport?: Viewport
): VisibleStar[] {
  const visibleStars: VisibleStar[] = [];

  for (const star of stars) {
    // Filter by magnitude first (optimization)
    if (star.magnitude > magnitudeLimit) continue;

    const visibleStar = processStarForRendering(star, observer, viewport);
    if (visibleStar) {
      visibleStars.push(visibleStar);
    }
  }

  // Sort by magnitude (brightest first)
  visibleStars.sort((a, b) => a.magnitude - b.magnitude);

  return visibleStars;
}

/**
 * Check if a constellation is visible
 * Returns visibility information
 */
export function checkConstellationVisibility(
  constellation: Constellation,
  stars: Map<number, Star>,
  observer: Observer
): VisibleConstellation {
  let visibleCount = 0;
  let totalCount = 0;

  // Check visibility of each star in the constellation
  for (const starId of constellation.stars) {
    const star = stars.get(starId);
    if (!star) continue;

    totalCount++;

    const horizontal = equatorialToHorizontal(star.coordinates, observer.location, observer.time);

    if (isAboveHorizon(horizontal)) {
      visibleCount++;
    }
  }

  const visibilityPercentage = totalCount > 0 ? (visibleCount / totalCount) * 100 : 0;
  const isVisible = visibilityPercentage >= 50; // Consider visible if at least 50% of stars are up

  // Calculate label position from constellation center
  const centerHorizontal = equatorialToHorizontal(
    constellation.center,
    observer.location,
    observer.time
  );

  return {
    ...constellation,
    isVisible,
    visibilityPercentage,
    labelPosition: isAboveHorizon(centerHorizontal)
      ? { x: 0, y: 0, visible: true }
      : undefined,
  };
}

/**
 * Calculate rise time for a celestial object
 * Returns the next rise time from the given date
 */
export function calculateRiseTime(
  coordinates: EquatorialCoordinates,
  location: GeographicCoordinates,
  date: Date
): Date | null {
  const { ra, dec } = coordinates;
  const { latitude } = location;

  // Check if object is circumpolar or never rises
  const decRad = degreesToRadians(dec);
  const latRad = degreesToRadians(latitude);

  // Hour angle at rise/set (when altitude = 0)
  // cos(H) = -tan(lat) * tan(dec)
  const cosH = -Math.tan(latRad) * Math.tan(decRad);

  // Check if object is circumpolar (always up) or never rises
  if (cosH < -1) {
    // Object is circumpolar - always above horizon
    return null;
  }
  if (cosH > 1) {
    // Object never rises at this latitude
    return null;
  }

  const H = radiansToDegrees(Math.acos(cosH));

  // Rise occurs when hour angle = -H (east of meridian)
  // Hour angle = LST - RA
  // At rise: -H = LST - RA, so LST = RA - H

  const jd = dateToJulianDate(date);
  const lstDegrees = localMeanSiderealTime(jd, location.longitude);
  const lstHours = siderealTimeToHours(lstDegrees);

  // Calculate the LST at which the object rises
  const riseLST = ra - H / 15; // Convert H from degrees to hours

  // Calculate time difference from current LST to rise LST
  let hoursDiff = riseLST - lstHours;
  if (hoursDiff < 0) hoursDiff += 24;

  // Convert sidereal hours to solar hours
  // Sidereal day is ~23.9345 hours
  const solarHours = hoursDiff * (24 / 23.9344696);

  // Calculate rise time
  const riseTime = new Date(date.getTime() + solarHours * 60 * 60 * 1000);

  return riseTime;
}

/**
 * Calculate set time for a celestial object
 */
export function calculateSetTime(
  coordinates: EquatorialCoordinates,
  location: GeographicCoordinates,
  date: Date
): Date | null {
  const { ra, dec } = coordinates;
  const { latitude } = location;

  const decRad = degreesToRadians(dec);
  const latRad = degreesToRadians(latitude);

  const cosH = -Math.tan(latRad) * Math.tan(decRad);

  if (cosH < -1 || cosH > 1) {
    return null;
  }

  const H = radiansToDegrees(Math.acos(cosH));

  // Set occurs when hour angle = +H (west of meridian)
  const setLST = ra + H / 15;

  const jd = dateToJulianDate(date);
  const lstDegrees = localMeanSiderealTime(jd, location.longitude);
  const lstHours = siderealTimeToHours(lstDegrees);

  let hoursDiff = setLST - lstHours;
  if (hoursDiff < 0) hoursDiff += 24;

  const solarHours = hoursDiff * (24 / 23.9344696);

  const setTime = new Date(date.getTime() + solarHours * 60 * 60 * 1000);

  return setTime;
}

/**
 * Calculate twilight times
 * Returns civil, nautical, and astronomical twilight times
 */
export function calculateTwilightTimes(
  location: GeographicCoordinates,
  date: Date
): {
  civilDawn: Date | null;
  civilDusk: Date | null;
  nauticalDawn: Date | null;
  nauticalDusk: Date | null;
  astronomicalDawn: Date | null;
  astronomicalDusk: Date | null;
} {
  // Sun's approximate position (simplified calculation)
  const dayOfYear = getDayOfYear(date);

  // Simplified solar declination
  // More accurate calculation would use the full solar position algorithm
  const solarDeclination = 23.45 * Math.sin(degreesToRadians((360 / 365) * (dayOfYear - 81)));

  const decRad = degreesToRadians(solarDeclination);
  const latRad = degreesToRadians(location.latitude);

  // Function to calculate twilight time for a given sun altitude
  const calculateTwilightTime = (
    sunAltitude: number,
    isRising: boolean
  ): Date | null => {
    const altRad = degreesToRadians(sunAltitude);

    // Hour angle when sun is at given altitude
    // cos(H) = (sin(alt) - sin(lat) * sin(dec)) / (cos(lat) * cos(dec))
    const cosH =
      (Math.sin(altRad) - Math.sin(latRad) * Math.sin(decRad)) /
      (Math.cos(latRad) * Math.cos(decRad));

    if (cosH < -1 || cosH > 1) {
      return null; // Sun doesn't reach this altitude
    }

    const H = radiansToDegrees(Math.acos(cosH));

    // Solar noon (approximately)
    const solarNoon = 12 - location.longitude / 15;

    const hourOffset = isRising ? -H / 15 : H / 15;
    const time = solarNoon + hourOffset;

    const result = new Date(date);
    result.setUTCHours(0, 0, 0, 0);
    result.setUTCMinutes(Math.round(time * 60));

    return result;
  };

  return {
    civilDawn: calculateTwilightTime(-6, true),
    civilDusk: calculateTwilightTime(-6, false),
    nauticalDawn: calculateTwilightTime(-12, true),
    nauticalDusk: calculateTwilightTime(-12, false),
    astronomicalDawn: calculateTwilightTime(-18, true),
    astronomicalDusk: calculateTwilightTime(-18, false),
  };
}

/**
 * Get day of year (1-366)
 */
function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

/**
 * Check if it's currently dark enough for stargazing
 */
export function isDarkEnough(location: GeographicCoordinates, date: Date): boolean {
  const twilight = calculateTwilightTimes(location, date);

  // Check if current time is after astronomical dusk and before astronomical dawn
  if (!twilight.astronomicalDusk || !twilight.astronomicalDawn) {
    // Polar regions - check sun altitude directly
    // Simplified: assume dark if sun declination puts it below horizon
    return true;
  }

  const now = date.getTime();
  const dusk = twilight.astronomicalDusk.getTime();
  const dawn = twilight.astronomicalDawn.getTime();

  // Handle overnight case
  if (dusk > dawn) {
    // Dawn is next day
    return now > dusk || now < dawn;
  } else {
    return now > dusk && now < dawn;
  }
}

/**
 * Calculate meteor shower visibility
 */
export function calculateMeteorShowerVisibility(
  shower: MeteorShower,
  observer: Observer
): {
  radiantAltitude: number;
  radiantAzimuth: number;
  isRadiantUp: boolean;
  expectedRate: number;
  bestViewingTime: Date | null;
} {
  const radiantHorizontal = equatorialToHorizontal(
    shower.radiant!,
    observer.location,
    observer.time
  );

  const isRadiantUp = isAboveHorizon(radiantHorizontal);

  // Calculate expected rate based on radiant altitude
  // ZHR assumes radiant at zenith; actual rate is lower when radiant is lower
  let expectedRate = 0;
  if (isRadiantUp && radiantHorizontal.altitude > 0) {
    // Rate correction: multiply ZHR by sin(altitude)
    const altitudeCorrection = Math.sin(degreesToRadians(radiantHorizontal.altitude));
    expectedRate = Math.round(shower.zhr * altitudeCorrection);
  }

  // Calculate best viewing time (when radiant is highest)
  const riseTime = calculateRiseTime(shower.radiant!, observer.location, observer.time);
  const setTime = calculateSetTime(shower.radiant!, observer.location, observer.time);

  // Best time is roughly when radiant transits (highest)
  let bestViewingTime: Date | null = null;
  if (riseTime && setTime) {
    const transitTime = new Date((riseTime.getTime() + setTime.getTime()) / 2);
    bestViewingTime = transitTime;
  }

  return {
    radiantAltitude: radiantHorizontal.altitude,
    radiantAzimuth: radiantHorizontal.azimuth,
    isRadiantUp,
    expectedRate,
    bestViewingTime,
  };
}

/**
 * Get current meteor showers that are active
 */
export function getActiveMeteorShowers(
  showers: MeteorShower[],
  date: Date
): MeteorShower[] {
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate();

  return showers.filter((shower) => {
    // Check if current date is within shower's active period
    const start = shower.startMonth * 100 + (shower as any).startDay;
    const end = shower.endMonth * 100 + (shower as any).endDay;
    const current = month * 100 + day;

    // Handle year wrap (e.g., Dec 28 - Jan 5)
    if (start > end) {
      return current >= start || current <= end;
    }

    return current >= start && current <= end;
  });
}

/**
 * Calculate angular separation between two points
 */
export function calculateAngularSeparation(
  coord1: EquatorialCoordinates,
  coord2: EquatorialCoordinates
): number {
  const ra1 = degreesToRadians(coord1.ra * 15); // Convert hours to degrees then radians
  const dec1 = degreesToRadians(coord1.dec);
  const ra2 = degreesToRadians(coord2.ra * 15);
  const dec2 = degreesToRadians(coord2.dec);

  // Haversine formula
  const sinDdec2 = Math.sin((dec2 - dec1) / 2);
  const sinDra2 = Math.sin((ra2 - ra1) / 2);

  const a =
    sinDdec2 * sinDdec2 + Math.cos(dec1) * Math.cos(dec2) * sinDra2 * sinDra2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return radiansToDegrees(c);
}

/**
 * Find the nearest star to a given position
 */
export function findNearestStar(
  position: HorizontalCoordinates,
  stars: VisibleStar[],
  maxDistance: number = 5 // degrees
): VisibleStar | null {
  let nearestStar: VisibleStar | null = null;
  let minDistance = maxDistance;

  for (const star of stars) {
    const distance = angularDistance(position, star.horizontal);

    if (distance < minDistance) {
      minDistance = distance;
      nearestStar = star;
    }
  }

  return nearestStar;
}

/**
 * Format altitude as string
 */
export function formatAltitude(altitude: number): string {
  const sign = altitude >= 0 ? '+' : '';
  return `${sign}${altitude.toFixed(1)}°`;
}

/**
 * Format azimuth as compass direction
 */
export function formatAzimuth(azimuth: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(azimuth / 22.5) % 16;
  return `${directions[index]} (${azimuth.toFixed(1)}°)`;
}
