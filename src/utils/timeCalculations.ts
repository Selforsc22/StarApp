/**
 * Time Calculation Utilities for Astronomical Computations
 *
 * This module provides functions for converting between different time systems
 * used in astronomy:
 * - UTC (Coordinated Universal Time)
 * - Julian Date (continuous day count from 4713 BC)
 * - Local Sidereal Time (star time based on Earth's rotation relative to stars)
 * - Greenwich Sidereal Time (sidereal time at prime meridian)
 *
 * Reference: Astronomical Algorithms by Jean Meeus (2nd Edition)
 */

/**
 * Convert a JavaScript Date to Julian Date
 *
 * Julian Date is a continuous count of days since the beginning of the Julian Period
 * (January 1, 4713 BC in the proleptic Julian calendar).
 *
 * Formula from Meeus, Astronomical Algorithms, Chapter 7
 *
 * @param date - JavaScript Date object (assumed to be in UTC)
 * @returns Julian Date as a decimal number
 */
export function dateToJulianDate(date: Date): number {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1; // JavaScript months are 0-indexed
  const day = date.getUTCDate();
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  const second = date.getUTCSeconds();
  const millisecond = date.getUTCMilliseconds();

  // Decimal day including time
  const dayFraction = (hour + minute / 60 + second / 3600 + millisecond / 3600000) / 24;

  // Adjust year and month for the algorithm
  let y = year;
  let m = month;
  if (month <= 2) {
    y = year - 1;
    m = month + 12;
  }

  // Calculate Julian Date
  // A and B account for the Gregorian calendar reform
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);

  const JD =
    Math.floor(365.25 * (y + 4716)) +
    Math.floor(30.6001 * (m + 1)) +
    day +
    dayFraction +
    B -
    1524.5;

  return JD;
}

/**
 * Convert Julian Date back to JavaScript Date
 *
 * @param jd - Julian Date
 * @returns JavaScript Date object in UTC
 */
export function julianDateToDate(jd: number): Date {
  // Algorithm from Meeus, Chapter 7
  const Z = Math.floor(jd + 0.5);
  const F = jd + 0.5 - Z;

  let A: number;
  if (Z < 2299161) {
    A = Z;
  } else {
    const alpha = Math.floor((Z - 1867216.25) / 36524.25);
    A = Z + 1 + alpha - Math.floor(alpha / 4);
  }

  const B = A + 1524;
  const C = Math.floor((B - 122.1) / 365.25);
  const D = Math.floor(365.25 * C);
  const E = Math.floor((B - D) / 30.6001);

  const day = B - D - Math.floor(30.6001 * E) + F;
  const month = E < 14 ? E - 1 : E - 13;
  const year = month > 2 ? C - 4716 : C - 4715;

  const dayInt = Math.floor(day);
  const dayFrac = day - dayInt;

  const hours = dayFrac * 24;
  const hourInt = Math.floor(hours);
  const minutes = (hours - hourInt) * 60;
  const minuteInt = Math.floor(minutes);
  const seconds = (minutes - minuteInt) * 60;
  const secondInt = Math.floor(seconds);
  const milliseconds = (seconds - secondInt) * 1000;

  return new Date(Date.UTC(year, month - 1, dayInt, hourInt, minuteInt, secondInt, milliseconds));
}

/**
 * Calculate Julian Century from J2000.0
 *
 * J2000.0 is the standard astronomical epoch (January 1, 2000, 12:00 TT)
 * Julian Century = 36525 days
 *
 * @param jd - Julian Date
 * @returns Julian centuries since J2000.0
 */
export function julianCentury(jd: number): number {
  // J2000.0 = JD 2451545.0
  return (jd - 2451545.0) / 36525.0;
}

/**
 * Calculate Greenwich Mean Sidereal Time (GMST)
 *
 * Sidereal time is the hour angle of the vernal equinox. It measures the
 * rotation of the Earth relative to the stars rather than the Sun.
 *
 * Formula from the IERS Conventions (2010)
 *
 * @param jd - Julian Date
 * @returns GMST in degrees (0-360)
 */
export function greenwichMeanSiderealTime(jd: number): number {
  const T = julianCentury(jd);

  // GMST at 0h UT in degrees
  // From USNO Circular 179 (2005)
  let GMST =
    280.46061837 +
    360.98564736629 * (jd - 2451545.0) +
    0.000387933 * T * T -
    (T * T * T) / 38710000.0;

  // Normalize to 0-360 degrees
  GMST = normalizeAngle(GMST);

  return GMST;
}

/**
 * Calculate Local Mean Sidereal Time (LMST)
 *
 * LMST is the sidereal time at a specific longitude on Earth.
 * LMST = GMST + longitude (with East positive)
 *
 * @param jd - Julian Date
 * @param longitude - Observer's longitude in degrees (East positive)
 * @returns LMST in degrees (0-360)
 */
export function localMeanSiderealTime(jd: number, longitude: number): number {
  const GMST = greenwichMeanSiderealTime(jd);
  let LMST = GMST + longitude;

  // Normalize to 0-360 degrees
  LMST = normalizeAngle(LMST);

  return LMST;
}

/**
 * Convert Local Sidereal Time from degrees to hours
 *
 * @param lstDegrees - LST in degrees
 * @returns LST in hours (0-24)
 */
export function siderealTimeToHours(lstDegrees: number): number {
  return lstDegrees / 15.0;
}

/**
 * Convert hours to degrees
 *
 * @param hours - Time in hours
 * @returns Angle in degrees
 */
export function hoursToDegreesValue(hours: number): number {
  return hours * 15.0;
}

/**
 * Normalize an angle to the range 0-360 degrees
 *
 * @param angle - Angle in degrees
 * @returns Normalized angle in degrees (0-360)
 */
export function normalizeAngle(angle: number): number {
  let normalized = angle % 360;
  if (normalized < 0) {
    normalized += 360;
  }
  return normalized;
}

/**
 * Normalize an angle to the range -180 to +180 degrees
 *
 * @param angle - Angle in degrees
 * @returns Normalized angle in degrees (-180 to +180)
 */
export function normalizeAngleSigned(angle: number): number {
  let normalized = angle % 360;
  if (normalized > 180) {
    normalized -= 360;
  } else if (normalized < -180) {
    normalized += 360;
  }
  return normalized;
}

/**
 * Convert degrees to radians
 *
 * @param degrees - Angle in degrees
 * @returns Angle in radians
 */
export function degreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Convert radians to degrees
 *
 * @param radians - Angle in radians
 * @returns Angle in degrees
 */
export function radiansToDegrees(radians: number): number {
  return radians * (180 / Math.PI);
}

/**
 * Calculate the equation of time
 *
 * The equation of time is the difference between apparent solar time
 * and mean solar time. It accounts for the Earth's elliptical orbit
 * and axial tilt.
 *
 * @param jd - Julian Date
 * @returns Equation of time in minutes
 */
export function equationOfTime(jd: number): number {
  const T = julianCentury(jd);

  // Mean longitude of the Sun
  const L0 = normalizeAngle(280.46646 + 36000.76983 * T + 0.0003032 * T * T);

  // Mean anomaly of the Sun
  const M = normalizeAngle(357.52911 + 35999.05029 * T - 0.0001537 * T * T);

  // Eccentricity of Earth's orbit
  const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;

  // Obliquity of the ecliptic
  const epsilon = obliquityOfEcliptic(jd);

  const y = Math.tan(degreesToRadians(epsilon / 2)) ** 2;

  const L0rad = degreesToRadians(L0);
  const Mrad = degreesToRadians(M);

  // Equation of time in radians
  const EoT =
    y * Math.sin(2 * L0rad) -
    2 * e * Math.sin(Mrad) +
    4 * e * y * Math.sin(Mrad) * Math.cos(2 * L0rad) -
    0.5 * y * y * Math.sin(4 * L0rad) -
    1.25 * e * e * Math.sin(2 * Mrad);

  // Convert to minutes (4 minutes per degree)
  return radiansToDegrees(EoT) * 4;
}

/**
 * Calculate the obliquity of the ecliptic
 *
 * The obliquity is the angle between the Earth's equatorial plane
 * and the plane of its orbit around the Sun (ecliptic).
 *
 * @param jd - Julian Date
 * @returns Obliquity in degrees
 */
export function obliquityOfEcliptic(jd: number): number {
  const T = julianCentury(jd);

  // Mean obliquity formula from IAU 2006
  const epsilon0 =
    23.0 +
    26.0 / 60 +
    21.448 / 3600 -
    (46.8150 / 3600) * T -
    (0.00059 / 3600) * T * T +
    (0.001813 / 3600) * T * T * T;

  return epsilon0;
}

/**
 * Calculate nutation in longitude
 *
 * Nutation is a periodic oscillation of the Earth's axis.
 * This is a simplified calculation for nutation in longitude.
 *
 * @param jd - Julian Date
 * @returns Nutation in longitude in degrees
 */
export function nutationInLongitude(jd: number): number {
  const T = julianCentury(jd);

  // Mean elongation of the Moon from the Sun
  const D = normalizeAngle(297.85036 + 445267.111480 * T - 0.0019142 * T * T);

  // Mean anomaly of the Sun
  const M = normalizeAngle(357.52772 + 35999.050340 * T - 0.0001603 * T * T);

  // Mean anomaly of the Moon
  const Mprime = normalizeAngle(134.96298 + 477198.867398 * T + 0.0086972 * T * T);

  // Moon's argument of latitude
  const F = normalizeAngle(93.27191 + 483202.017538 * T - 0.0036825 * T * T);

  // Longitude of ascending node of Moon's mean orbit
  const Omega = normalizeAngle(125.04452 - 1934.136261 * T + 0.0020708 * T * T);

  // Convert to radians
  const OmegaRad = degreesToRadians(Omega);
  const L = degreesToRadians(280.4665 + 36000.7698 * T);
  const Lprime = degreesToRadians(218.3165 + 481267.8813 * T);

  // Nutation in longitude (arcseconds)
  const deltaPsi =
    -17.2 * Math.sin(OmegaRad) -
    1.32 * Math.sin(2 * L) -
    0.23 * Math.sin(2 * Lprime) +
    0.21 * Math.sin(2 * OmegaRad);

  // Convert to degrees
  return deltaPsi / 3600;
}

/**
 * Calculate Greenwich Apparent Sidereal Time (GAST)
 *
 * GAST accounts for nutation, giving the true position of the vernal equinox.
 *
 * @param jd - Julian Date
 * @returns GAST in degrees
 */
export function greenwichApparentSiderealTime(jd: number): number {
  const GMST = greenwichMeanSiderealTime(jd);
  const deltaPsi = nutationInLongitude(jd);
  const epsilon = obliquityOfEcliptic(jd);

  // Equation of the equinoxes
  const eqEq = deltaPsi * Math.cos(degreesToRadians(epsilon));

  return normalizeAngle(GMST + eqEq);
}

/**
 * Calculate Local Apparent Sidereal Time (LAST)
 *
 * @param jd - Julian Date
 * @param longitude - Observer's longitude in degrees (East positive)
 * @returns LAST in degrees
 */
export function localApparentSiderealTime(jd: number, longitude: number): number {
  const GAST = greenwichApparentSiderealTime(jd);
  return normalizeAngle(GAST + longitude);
}

/**
 * Get the current Julian Date
 *
 * @returns Current Julian Date
 */
export function currentJulianDate(): number {
  return dateToJulianDate(new Date());
}

/**
 * Format sidereal time as HH:MM:SS
 *
 * @param lstDegrees - Sidereal time in degrees
 * @returns Formatted time string
 */
export function formatSiderealTime(lstDegrees: number): string {
  const hours = siderealTimeToHours(lstDegrees);
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  const s = Math.floor(((hours - h) * 60 - m) * 60);

  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * Calculate the fraction of the day
 *
 * @param date - JavaScript Date object
 * @returns Fraction of day (0-1)
 */
export function dayFraction(date: Date): number {
  return (
    (date.getUTCHours() +
      date.getUTCMinutes() / 60 +
      date.getUTCSeconds() / 3600 +
      date.getUTCMilliseconds() / 3600000) /
    24
  );
}

/**
 * Calculate Modified Julian Date
 *
 * MJD = JD - 2400000.5
 * MJD starts at midnight rather than noon
 *
 * @param jd - Julian Date
 * @returns Modified Julian Date
 */
export function modifiedJulianDate(jd: number): number {
  return jd - 2400000.5;
}

/**
 * Calculate Julian Date from Modified Julian Date
 *
 * @param mjd - Modified Julian Date
 * @returns Julian Date
 */
export function mjdToJulianDate(mjd: number): number {
  return mjd + 2400000.5;
}
