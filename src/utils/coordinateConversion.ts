/**
 * Coordinate Conversion Utilities for Astronomical Calculations
 *
 * This module provides conversions between different astronomical coordinate systems:
 *
 * 1. Equatorial Coordinates (RA/Dec):
 *    - Right Ascension (RA): measured in hours (0-24) eastward from the vernal equinox
 *    - Declination (Dec): measured in degrees (-90 to +90) from the celestial equator
 *    - These are fixed positions on the celestial sphere (J2000 epoch)
 *
 * 2. Horizontal Coordinates (Alt/Az):
 *    - Altitude (Alt): degrees above the horizon (-90 to +90)
 *    - Azimuth (Az): degrees from North, measured clockwise (0-360)
 *    - These depend on observer location, date, and time
 *
 * 3. Cartesian Coordinates:
 *    - Used for 3D rendering in Three.js
 *    - x, y, z on a unit sphere
 *
 * Reference: Astronomical Algorithms by Jean Meeus (2nd Edition)
 */

import {
  EquatorialCoordinates,
  HorizontalCoordinates,
  GeographicCoordinates,
  CartesianCoordinates,
  ScreenCoordinates,
  Viewport,
  Quaternion,
  DeviceOrientation,
} from '../types';

import {
  dateToJulianDate,
  localMeanSiderealTime,
  siderealTimeToHours,
  degreesToRadians,
  radiansToDegrees,
  normalizeAngle,
  hoursToDegreesValue,
} from './timeCalculations';

/**
 * Convert equatorial coordinates (RA/Dec) to horizontal coordinates (Alt/Az)
 *
 * This is the core astronomical transformation. It accounts for:
 * - Observer's geographic location
 * - Local sidereal time (Earth's rotation relative to stars)
 *
 * @param equatorial - Equatorial coordinates (RA in hours, Dec in degrees)
 * @param location - Observer's geographic location
 * @param date - Observation date/time
 * @returns Horizontal coordinates (Alt/Az in degrees)
 */
export function equatorialToHorizontal(
  equatorial: EquatorialCoordinates,
  location: GeographicCoordinates,
  date: Date
): HorizontalCoordinates {
  // Convert inputs to radians
  const lat = degreesToRadians(location.latitude);
  const dec = degreesToRadians(equatorial.dec);

  // Calculate local sidereal time
  const jd = dateToJulianDate(date);
  const lstDegrees = localMeanSiderealTime(jd, location.longitude);
  const lstHours = siderealTimeToHours(lstDegrees);

  // Calculate hour angle
  // Hour Angle = Local Sidereal Time - Right Ascension
  // HA increases westward from the meridian
  let hourAngle = lstHours - equatorial.ra;

  // Normalize hour angle to -12 to +12 hours
  while (hourAngle < -12) hourAngle += 24;
  while (hourAngle > 12) hourAngle -= 24;

  // Convert hour angle to radians (15 degrees per hour)
  const ha = degreesToRadians(hourAngle * 15);

  // Calculate altitude using spherical trigonometry
  // sin(alt) = sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(HA)
  const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha);
  const altitude = radiansToDegrees(Math.asin(sinAlt));

  // Calculate azimuth
  // cos(az) = (sin(dec) - sin(lat) * sin(alt)) / (cos(lat) * cos(alt))
  // We use atan2 for proper quadrant handling
  const cosAlt = Math.cos(degreesToRadians(altitude));

  // Avoid division by zero when object is at zenith
  if (Math.abs(cosAlt) < 1e-10) {
    return { altitude: 90, azimuth: 0 };
  }

  // sin(az) = -cos(dec) * sin(HA) / cos(alt)
  const sinAz = (-Math.cos(dec) * Math.sin(ha)) / cosAlt;

  // cos(az) = (sin(dec) - sin(lat) * sin(alt)) / (cos(lat) * cos(alt))
  const cosAz = (Math.sin(dec) - Math.sin(lat) * sinAlt) / (Math.cos(lat) * cosAlt);

  // Calculate azimuth using atan2 (gives correct quadrant)
  let azimuth = radiansToDegrees(Math.atan2(sinAz, cosAz));

  // Normalize azimuth to 0-360 (measured from North, clockwise)
  azimuth = normalizeAngle(azimuth);

  return { altitude, azimuth };
}

/**
 * Convert horizontal coordinates (Alt/Az) to equatorial coordinates (RA/Dec)
 *
 * Inverse of equatorialToHorizontal
 *
 * @param horizontal - Horizontal coordinates
 * @param location - Observer's geographic location
 * @param date - Observation date/time
 * @returns Equatorial coordinates
 */
export function horizontalToEquatorial(
  horizontal: HorizontalCoordinates,
  location: GeographicCoordinates,
  date: Date
): EquatorialCoordinates {
  const lat = degreesToRadians(location.latitude);
  const alt = degreesToRadians(horizontal.altitude);
  const az = degreesToRadians(horizontal.azimuth);

  // Calculate declination
  // sin(dec) = sin(lat) * sin(alt) + cos(lat) * cos(alt) * cos(az)
  const sinDec = Math.sin(lat) * Math.sin(alt) + Math.cos(lat) * Math.cos(alt) * Math.cos(az);
  const dec = radiansToDegrees(Math.asin(sinDec));

  // Calculate hour angle
  const cosDec = Math.cos(degreesToRadians(dec));

  // Avoid division by zero
  if (Math.abs(cosDec) < 1e-10) {
    // Object at celestial pole
    const jd = dateToJulianDate(date);
    const lstDegrees = localMeanSiderealTime(jd, location.longitude);
    const lstHours = siderealTimeToHours(lstDegrees);
    return { ra: lstHours, dec };
  }

  // sin(HA) = -cos(alt) * sin(az) / cos(dec)
  const sinHA = (-Math.cos(alt) * Math.sin(az)) / cosDec;

  // cos(HA) = (sin(alt) - sin(lat) * sin(dec)) / (cos(lat) * cos(dec))
  const cosHA = (Math.sin(alt) - Math.sin(lat) * sinDec) / (Math.cos(lat) * cosDec);

  let hourAngle = radiansToDegrees(Math.atan2(sinHA, cosHA));

  // Convert to hours
  hourAngle = hourAngle / 15;

  // Calculate RA = LST - HA
  const jd = dateToJulianDate(date);
  const lstDegrees = localMeanSiderealTime(jd, location.longitude);
  const lstHours = siderealTimeToHours(lstDegrees);

  let ra = lstHours - hourAngle;

  // Normalize RA to 0-24 hours
  while (ra < 0) ra += 24;
  while (ra >= 24) ra -= 24;

  return { ra, dec };
}

/**
 * Apply atmospheric refraction correction
 *
 * The atmosphere bends light, making objects appear higher than they actually are.
 * This effect is strongest near the horizon.
 *
 * Formula from Meeus, Astronomical Algorithms, Chapter 16
 *
 * @param altitude - True altitude in degrees
 * @param pressure - Atmospheric pressure in millibars (default 1010)
 * @param temperature - Temperature in Celsius (default 10)
 * @returns Apparent altitude (corrected for refraction) in degrees
 */
export function applyRefraction(
  altitude: number,
  pressure: number = 1010,
  temperature: number = 10
): number {
  // Refraction is negligible above 90 degrees
  if (altitude >= 90) return altitude;

  // For objects below -1 degree, use the formula for -1 degree
  const h = Math.max(altitude, -1);

  // Bennett's formula (more accurate near horizon)
  // R = 1.02 / tan(h + 10.3/(h + 5.11)) arcminutes
  const tanArg = h + 10.3 / (h + 5.11);
  let refraction = 1.02 / Math.tan(degreesToRadians(tanArg));

  // Correct for temperature and pressure
  // R = R * (P/1010) * (283/(273+T))
  refraction *= (pressure / 1010) * (283 / (273 + temperature));

  // Convert from arcminutes to degrees
  refraction /= 60;

  return altitude + refraction;
}

/**
 * Remove atmospheric refraction correction
 *
 * Convert apparent altitude to true altitude
 *
 * @param apparentAltitude - Apparent altitude in degrees
 * @param pressure - Atmospheric pressure in millibars
 * @param temperature - Temperature in Celsius
 * @returns True altitude in degrees
 */
export function removeRefraction(
  apparentAltitude: number,
  pressure: number = 1010,
  temperature: number = 10
): number {
  if (apparentAltitude >= 90) return apparentAltitude;

  const h = Math.max(apparentAltitude, -1);

  // Inverse Bennett formula approximation
  let refraction = 1.0 / Math.tan(degreesToRadians(h + 7.31 / (h + 4.4)));

  refraction *= (pressure / 1010) * (283 / (273 + temperature));
  refraction /= 60;

  return apparentAltitude - refraction;
}

/**
 * Convert horizontal coordinates to 3D Cartesian coordinates
 *
 * Uses a right-handed coordinate system:
 * - x: points East
 * - y: points up (zenith)
 * - z: points North
 *
 * @param horizontal - Horizontal coordinates
 * @param radius - Radius of the celestial sphere (default 1)
 * @returns Cartesian coordinates
 */
export function horizontalToCartesian(
  horizontal: HorizontalCoordinates,
  radius: number = 1
): CartesianCoordinates {
  const alt = degreesToRadians(horizontal.altitude);
  const az = degreesToRadians(horizontal.azimuth);

  // Convert spherical to Cartesian
  // Note: Azimuth is measured from North (z-axis) clockwise
  const cosAlt = Math.cos(alt);

  return {
    x: radius * cosAlt * Math.sin(az), // East component
    y: radius * Math.sin(alt), // Up component
    z: radius * cosAlt * Math.cos(az), // North component
  };
}

/**
 * Convert Cartesian coordinates to horizontal coordinates
 *
 * @param cartesian - Cartesian coordinates
 * @returns Horizontal coordinates
 */
export function cartesianToHorizontal(cartesian: CartesianCoordinates): HorizontalCoordinates {
  const { x, y, z } = cartesian;

  // Calculate radius (should be ~1 for unit sphere)
  const r = Math.sqrt(x * x + y * y + z * z);

  // Altitude from y component
  const altitude = radiansToDegrees(Math.asin(y / r));

  // Azimuth from x and z components
  let azimuth = radiansToDegrees(Math.atan2(x, z));
  azimuth = normalizeAngle(azimuth);

  return { altitude, azimuth };
}

/**
 * Convert equatorial coordinates directly to Cartesian
 *
 * @param equatorial - Equatorial coordinates
 * @param location - Observer's location
 * @param date - Observation date
 * @param radius - Sphere radius
 * @returns Cartesian coordinates
 */
export function equatorialToCartesian(
  equatorial: EquatorialCoordinates,
  location: GeographicCoordinates,
  date: Date,
  radius: number = 1
): CartesianCoordinates {
  const horizontal = equatorialToHorizontal(equatorial, location, date);
  return horizontalToCartesian(horizontal, radius);
}

/**
 * Project 3D Cartesian coordinates to 2D screen coordinates
 *
 * Uses gnomonic (tangent plane) projection centered on the device pointing direction.
 * This projection preserves straight lines (great circles become straight lines).
 *
 * @param cartesian - 3D position on celestial sphere
 * @param viewport - Current viewport settings
 * @param deviceOrientation - Device orientation quaternion
 * @returns Screen coordinates (x, y in pixels, visible flag)
 */
export function cartesianToScreen(
  cartesian: CartesianCoordinates,
  viewport: Viewport,
  deviceOrientation: Quaternion
): ScreenCoordinates {
  // Transform cartesian coordinates by device orientation
  const transformed = rotateByQuaternion(cartesian, conjugateQuaternion(deviceOrientation));

  // Check if point is behind the viewer (z <= 0 means behind)
  if (transformed.z <= 0) {
    return { x: 0, y: 0, visible: false };
  }

  // Gnomonic projection
  // Projects onto a plane tangent to the sphere at the view direction (z-axis)
  const scale = viewport.width / (2 * Math.tan(degreesToRadians(viewport.fovHorizontal / 2)));

  const x = viewport.width / 2 + (transformed.x / transformed.z) * scale;
  const y = viewport.height / 2 - (transformed.y / transformed.z) * scale;

  // Check if on screen
  const visible = x >= 0 && x <= viewport.width && y >= 0 && y <= viewport.height;

  return { x, y, visible };
}

/**
 * Convert device orientation angles to quaternion
 *
 * @param orientation - Device orientation (alpha, beta, gamma in radians)
 * @returns Quaternion representation
 */
export function orientationToQuaternion(orientation: DeviceOrientation): Quaternion {
  const { alpha, beta, gamma } = orientation;

  // Convert Euler angles to quaternion
  // Order: Z (alpha) -> X (beta) -> Y (gamma)
  const c1 = Math.cos(alpha / 2);
  const c2 = Math.cos(beta / 2);
  const c3 = Math.cos(gamma / 2);
  const s1 = Math.sin(alpha / 2);
  const s2 = Math.sin(beta / 2);
  const s3 = Math.sin(gamma / 2);

  return {
    w: c1 * c2 * c3 - s1 * s2 * s3,
    x: c1 * s2 * c3 - s1 * c2 * s3,
    y: c1 * c2 * s3 + s1 * s2 * c3,
    z: s1 * c2 * c3 + c1 * s2 * s3,
  };
}

/**
 * Rotate a point by a quaternion
 *
 * @param point - Point to rotate
 * @param q - Quaternion to rotate by
 * @returns Rotated point
 */
export function rotateByQuaternion(
  point: CartesianCoordinates,
  q: Quaternion
): CartesianCoordinates {
  // Convert point to quaternion (w=0)
  const p: Quaternion = { w: 0, x: point.x, y: point.y, z: point.z };

  // Rotate: q * p * q^-1
  const qConj = conjugateQuaternion(q);
  const temp = multiplyQuaternions(q, p);
  const result = multiplyQuaternions(temp, qConj);

  return { x: result.x, y: result.y, z: result.z };
}

/**
 * Multiply two quaternions
 *
 * @param a - First quaternion
 * @param b - Second quaternion
 * @returns Product quaternion
 */
export function multiplyQuaternions(a: Quaternion, b: Quaternion): Quaternion {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

/**
 * Get conjugate of a quaternion
 *
 * @param q - Quaternion
 * @returns Conjugate quaternion
 */
export function conjugateQuaternion(q: Quaternion): Quaternion {
  return { w: q.w, x: -q.x, y: -q.y, z: -q.z };
}

/**
 * Normalize a quaternion to unit length
 *
 * @param q - Quaternion
 * @returns Normalized quaternion
 */
export function normalizeQuaternion(q: Quaternion): Quaternion {
  const mag = Math.sqrt(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z);
  if (mag < 1e-10) {
    return { w: 1, x: 0, y: 0, z: 0 };
  }
  return {
    w: q.w / mag,
    x: q.x / mag,
    y: q.y / mag,
    z: q.z / mag,
  };
}

/**
 * Spherical linear interpolation between two quaternions
 *
 * Used for smooth orientation transitions
 *
 * @param a - Start quaternion
 * @param b - End quaternion
 * @param t - Interpolation factor (0-1)
 * @returns Interpolated quaternion
 */
export function slerp(a: Quaternion, b: Quaternion, t: number): Quaternion {
  // Compute dot product
  let dot = a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z;

  // If dot is negative, negate one quaternion to take shorter path
  let bCopy = { ...b };
  if (dot < 0) {
    bCopy = { w: -b.w, x: -b.x, y: -b.y, z: -b.z };
    dot = -dot;
  }

  // If quaternions are very close, use linear interpolation
  if (dot > 0.9995) {
    return normalizeQuaternion({
      w: a.w + t * (bCopy.w - a.w),
      x: a.x + t * (bCopy.x - a.x),
      y: a.y + t * (bCopy.y - a.y),
      z: a.z + t * (bCopy.z - a.z),
    });
  }

  // Compute slerp
  const theta0 = Math.acos(dot);
  const theta = theta0 * t;
  const sinTheta = Math.sin(theta);
  const sinTheta0 = Math.sin(theta0);

  const s0 = Math.cos(theta) - (dot * sinTheta) / sinTheta0;
  const s1 = sinTheta / sinTheta0;

  return {
    w: s0 * a.w + s1 * bCopy.w,
    x: s0 * a.x + s1 * bCopy.x,
    y: s0 * a.y + s1 * bCopy.y,
    z: s0 * a.z + s1 * bCopy.z,
  };
}

/**
 * Calculate angular distance between two points in horizontal coordinates
 *
 * Uses the haversine formula for accuracy
 *
 * @param a - First point
 * @param b - Second point
 * @returns Angular distance in degrees
 */
export function angularDistance(
  a: HorizontalCoordinates,
  b: HorizontalCoordinates
): number {
  const alt1 = degreesToRadians(a.altitude);
  const alt2 = degreesToRadians(b.altitude);
  const dAz = degreesToRadians(b.azimuth - a.azimuth);
  const dAlt = alt2 - alt1;

  // Haversine formula
  const sinDalt2 = Math.sin(dAlt / 2);
  const sinDaz2 = Math.sin(dAz / 2);

  const h =
    sinDalt2 * sinDalt2 + Math.cos(alt1) * Math.cos(alt2) * sinDaz2 * sinDaz2;

  return radiansToDegrees(2 * Math.asin(Math.sqrt(h)));
}

/**
 * Check if a point is within the current viewport
 *
 * @param horizontal - Point in horizontal coordinates
 * @param viewport - Current viewport
 * @returns True if point is in viewport
 */
export function isInViewport(
  horizontal: HorizontalCoordinates,
  viewport: Viewport
): boolean {
  const distance = angularDistance(horizontal, viewport.center);
  const maxDistance = Math.max(viewport.fovHorizontal, viewport.fovVertical) / 2;

  return distance <= maxDistance * 1.2; // 20% margin for edge cases
}

/**
 * Check if a point is above the horizon
 *
 * @param horizontal - Point in horizontal coordinates
 * @param minAltitude - Minimum altitude to consider visible (default -1 for refraction)
 * @returns True if above horizon
 */
export function isAboveHorizon(
  horizontal: HorizontalCoordinates,
  minAltitude: number = -1
): boolean {
  return horizontal.altitude >= minAltitude;
}

/**
 * Convert RA from hours to degrees
 */
export function raHoursToDegrees(raHours: number): number {
  return hoursToDegreesValue(raHours);
}

/**
 * Convert RA from degrees to hours
 */
export function raDegreesToHours(raDegrees: number): number {
  return raDegrees / 15.0;
}

/**
 * Parse RA string (HH:MM:SS or HHhMMmSSs) to hours
 */
export function parseRA(raString: string): number {
  // Try HH:MM:SS format
  let match = raString.match(/(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const seconds = parseFloat(match[3]);
    return hours + minutes / 60 + seconds / 3600;
  }

  // Try HHhMMmSSs format
  match = raString.match(/(\d+)h\s*(\d+)m\s*(\d+(?:\.\d+)?)?s?/i);
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const seconds = match[3] ? parseFloat(match[3]) : 0;
    return hours + minutes / 60 + seconds / 3600;
  }

  // Try decimal hours
  const decimal = parseFloat(raString);
  if (!isNaN(decimal)) {
    return decimal;
  }

  throw new Error(`Invalid RA format: ${raString}`);
}

/**
 * Parse Dec string (±DD:MM:SS or ±DD°MM'SS") to degrees
 */
export function parseDec(decString: string): number {
  // Determine sign
  const negative = decString.startsWith('-');
  const cleanString = decString.replace(/^[+-]/, '');

  // Try DD:MM:SS format
  let match = cleanString.match(/(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (match) {
    const degrees = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const seconds = parseFloat(match[3]);
    const value = degrees + minutes / 60 + seconds / 3600;
    return negative ? -value : value;
  }

  // Try DD°MM'SS" format
  match = cleanString.match(/(\d+)[°]\s*(\d+)[′']\s*(\d+(?:\.\d+)?)?[″"]?/);
  if (match) {
    const degrees = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const seconds = match[3] ? parseFloat(match[3]) : 0;
    const value = degrees + minutes / 60 + seconds / 3600;
    return negative ? -value : value;
  }

  // Try decimal degrees
  const decimal = parseFloat(decString);
  if (!isNaN(decimal)) {
    return decimal;
  }

  throw new Error(`Invalid Dec format: ${decString}`);
}

/**
 * Format RA as HH:MM:SS string
 */
export function formatRA(raHours: number): string {
  const h = Math.floor(raHours);
  const m = Math.floor((raHours - h) * 60);
  const s = ((raHours - h) * 60 - m) * 60;

  return `${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m ${s.toFixed(1).padStart(4, '0')}s`;
}

/**
 * Format Dec as ±DD°MM'SS" string
 */
export function formatDec(decDegrees: number): string {
  const sign = decDegrees >= 0 ? '+' : '-';
  const abs = Math.abs(decDegrees);
  const d = Math.floor(abs);
  const m = Math.floor((abs - d) * 60);
  const s = ((abs - d) * 60 - m) * 60;

  return `${sign}${d.toString().padStart(2, '0')}° ${m.toString().padStart(2, '0')}' ${s.toFixed(1).padStart(4, '0')}"`;
}

// Re-export utility functions from timeCalculations for convenience
export { degreesToRadians, radiansToDegrees, normalizeAngle } from './timeCalculations';
