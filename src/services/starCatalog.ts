/**
 * Star Catalog Service
 *
 * Manages the star and constellation data for the application:
 * - Loads and parses star catalog data
 * - Provides efficient star lookups by ID
 * - Manages constellation patterns
 * - Handles meteor shower calendar
 * - Supports filtering by magnitude, constellation, etc.
 */

import {
  Star,
  Constellation,
  MeteorShower,
  EquatorialCoordinates,
} from '../types';

// Import data files
import starsData from '../data/stars.json';
import constellationsData from '../data/constellations.json';
import meteorShowersData from '../data/meteorShowers.json';

/**
 * Star data structure from JSON
 */
interface StarData {
  id: number;
  name?: string;
  designation?: string;
  ra: number;
  dec: number;
  mag: number;
  spectralType?: string;
  colorIndex?: number;
  constellation?: string;
}

/**
 * Constellation data structure from JSON
 */
interface ConstellationData {
  abbreviation: string;
  name: string;
  genitive: string;
  stars: number[];
  lines: [number, number][];
  center: { ra: number; dec: number };
  description?: string;
}

/**
 * Meteor shower data structure from JSON
 */
interface MeteorShowerData {
  id: string;
  name: string;
  parent?: string;
  radiant: { ra: number; dec: number };
  radiantConstellation: string;
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
  peakMonth: number;
  peakDay: number;
  zhr: number;
  velocity?: number;
  description: string;
  viewingTips?: string;
}

/**
 * Star Catalog class
 *
 * Provides access to star data with efficient lookups and filtering
 */
class StarCatalog {
  private stars: Star[] = [];
  private starById: Map<number, Star> = new Map();
  private starsByConstellation: Map<string, Star[]> = new Map();
  private constellations: Constellation[] = [];
  private constellationByAbbr: Map<string, Constellation> = new Map();
  private meteorShowers: MeteorShower[] = [];
  private isLoaded = false;

  /**
   * Load and initialize the catalog
   */
  async load(): Promise<void> {
    if (this.isLoaded) return;

    try {
      // Process star data
      this.processStars();

      // Process constellation data
      this.processConstellations();

      // Process meteor shower data
      this.processMeteorShowers();

      this.isLoaded = true;
    } catch (error) {
      console.error('Failed to load star catalog:', error);
      throw error;
    }
  }

  /**
   * Process star data from JSON
   */
  private processStars(): void {
    const rawStars = (starsData as { stars: StarData[] }).stars;

    this.stars = rawStars.map((data) => ({
      id: data.id,
      name: data.name,
      designation: data.designation,
      coordinates: {
        ra: data.ra,
        dec: data.dec,
      },
      magnitude: data.mag,
      spectralType: data.spectralType,
      colorIndex: data.colorIndex,
      constellation: data.constellation,
    }));

    // Build lookup maps
    for (const star of this.stars) {
      this.starById.set(star.id, star);

      if (star.constellation) {
        const constellationStars = this.starsByConstellation.get(star.constellation) || [];
        constellationStars.push(star);
        this.starsByConstellation.set(star.constellation, constellationStars);
      }
    }
  }

  /**
   * Process constellation data from JSON
   */
  private processConstellations(): void {
    const rawConstellations = (constellationsData as { constellations: ConstellationData[] })
      .constellations;

    this.constellations = rawConstellations.map((data) => ({
      abbreviation: data.abbreviation,
      name: data.name,
      genitive: data.genitive,
      stars: data.stars,
      lines: data.lines,
      center: data.center,
      description: data.description,
    }));

    // Build lookup map
    for (const constellation of this.constellations) {
      this.constellationByAbbr.set(constellation.abbreviation, constellation);
    }
  }

  /**
   * Process meteor shower data from JSON
   */
  private processMeteorShowers(): void {
    const rawShowers = (meteorShowersData as { meteorShowers: MeteorShowerData[] }).meteorShowers;

    this.meteorShowers = rawShowers.map((data) => ({
      id: data.id,
      type: 'meteor_shower' as const,
      name: data.name,
      description: data.description,
      startTime: this.createDateFromMonthDay(data.startMonth, data.startDay),
      endTime: this.createDateFromMonthDay(data.endMonth, data.endDay),
      peakTime: this.createDateFromMonthDay(data.peakMonth, data.peakDay),
      radiant: data.radiant,
      zhr: data.zhr,
      velocity: data.velocity,
      radiantConstellation: data.radiantConstellation,
      parent: data.parent,
      priority: data.zhr >= 100 ? 'high' : data.zhr >= 20 ? 'medium' : 'low',
      source: 'IMO',
      startMonth: data.startMonth,
      startDay: data.startDay,
      endMonth: data.endMonth,
      endDay: data.endDay,
    })) as MeteorShower[];
  }

  /**
   * Create a date from month and day (using current year)
   */
  private createDateFromMonthDay(month: number, day: number): Date {
    const year = new Date().getFullYear();
    return new Date(year, month - 1, day);
  }

  /**
   * Get all stars
   */
  getAllStars(): Star[] {
    return this.stars;
  }

  /**
   * Get a star by Hipparcos ID
   */
  getStarById(id: number): Star | undefined {
    return this.starById.get(id);
  }

  /**
   * Get stars filtered by maximum magnitude
   */
  getStarsByMagnitude(maxMagnitude: number): Star[] {
    return this.stars.filter((star) => star.magnitude <= maxMagnitude);
  }

  /**
   * Get stars in a specific constellation
   */
  getStarsInConstellation(abbreviation: string): Star[] {
    return this.starsByConstellation.get(abbreviation) || [];
  }

  /**
   * Get stars within a certain angular distance of a point
   */
  getStarsNearPosition(
    center: EquatorialCoordinates,
    radiusDegrees: number
  ): Star[] {
    return this.stars.filter((star) => {
      const distance = this.angularDistance(star.coordinates, center);
      return distance <= radiusDegrees;
    });
  }

  /**
   * Calculate angular distance between two points
   */
  private angularDistance(
    a: EquatorialCoordinates,
    b: EquatorialCoordinates
  ): number {
    const ra1 = (a.ra * 15 * Math.PI) / 180;
    const dec1 = (a.dec * Math.PI) / 180;
    const ra2 = (b.ra * 15 * Math.PI) / 180;
    const dec2 = (b.dec * Math.PI) / 180;

    const sinDdec2 = Math.sin((dec2 - dec1) / 2);
    const sinDra2 = Math.sin((ra2 - ra1) / 2);

    const a2 =
      sinDdec2 * sinDdec2 + Math.cos(dec1) * Math.cos(dec2) * sinDra2 * sinDra2;

    const c = 2 * Math.atan2(Math.sqrt(a2), Math.sqrt(1 - a2));

    return (c * 180) / Math.PI;
  }

  /**
   * Search stars by name
   */
  searchStars(query: string): Star[] {
    const lowerQuery = query.toLowerCase();

    return this.stars.filter((star) => {
      if (star.name?.toLowerCase().includes(lowerQuery)) return true;
      if (star.designation?.toLowerCase().includes(lowerQuery)) return true;
      return false;
    });
  }

  /**
   * Get brightest stars (for initial display)
   */
  getBrightestStars(count: number = 100): Star[] {
    return [...this.stars]
      .sort((a, b) => a.magnitude - b.magnitude)
      .slice(0, count);
  }

  /**
   * Get named stars only
   */
  getNamedStars(): Star[] {
    return this.stars.filter((star) => star.name);
  }

  /**
   * Get all constellations
   */
  getAllConstellations(): Constellation[] {
    return this.constellations;
  }

  /**
   * Get a constellation by abbreviation
   */
  getConstellation(abbreviation: string): Constellation | undefined {
    return this.constellationByAbbr.get(abbreviation);
  }

  /**
   * Get constellation for a star
   */
  getConstellationForStar(star: Star): Constellation | undefined {
    if (!star.constellation) return undefined;
    return this.constellationByAbbr.get(star.constellation);
  }

  /**
   * Search constellations by name
   */
  searchConstellations(query: string): Constellation[] {
    const lowerQuery = query.toLowerCase();

    return this.constellations.filter((constellation) => {
      if (constellation.name.toLowerCase().includes(lowerQuery)) return true;
      if (constellation.abbreviation.toLowerCase().includes(lowerQuery)) return true;
      return false;
    });
  }

  /**
   * Get constellation line coordinates for rendering
   * Returns pairs of star coordinates for each line
   */
  getConstellationLines(
    abbreviation: string
  ): { start: Star; end: Star }[] | null {
    const constellation = this.getConstellation(abbreviation);
    if (!constellation) return null;

    const lines: { start: Star; end: Star }[] = [];

    for (const [startIndex, endIndex] of constellation.lines) {
      const startStarId = constellation.stars[startIndex];
      const endStarId = constellation.stars[endIndex];

      const startStar = this.getStarById(startStarId);
      const endStar = this.getStarById(endStarId);

      if (startStar && endStar) {
        lines.push({ start: startStar, end: endStar });
      }
    }

    return lines;
  }

  /**
   * Get all meteor showers
   */
  getAllMeteorShowers(): MeteorShower[] {
    return this.meteorShowers;
  }

  /**
   * Get currently active meteor showers
   */
  getActiveMeteorShowers(date: Date = new Date()): MeteorShower[] {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const currentDateValue = month * 100 + day;

    return this.meteorShowers.filter((shower) => {
      const startValue = (shower as any).startMonth * 100 + (shower as any).startDay;
      const endValue = (shower as any).endMonth * 100 + (shower as any).endDay;

      // Handle year wrap
      if (startValue > endValue) {
        return currentDateValue >= startValue || currentDateValue <= endValue;
      }

      return currentDateValue >= startValue && currentDateValue <= endValue;
    });
  }

  /**
   * Get upcoming meteor showers
   */
  getUpcomingMeteorShowers(days: number = 30): MeteorShower[] {
    const now = new Date();
    const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    return this.meteorShowers.filter((shower) => {
      const peakTime = shower.peakTime;
      if (!peakTime) return false;

      // Adjust peak time to current year if it's in the past
      const adjustedPeak = new Date(peakTime);
      if (adjustedPeak < now) {
        adjustedPeak.setFullYear(now.getFullYear() + 1);
      }

      return adjustedPeak >= now && adjustedPeak <= futureDate;
    });
  }

  /**
   * Get meteor shower by ID
   */
  getMeteorShower(id: string): MeteorShower | undefined {
    return this.meteorShowers.find((shower) => shower.id === id);
  }

  /**
   * Get total star count
   */
  getStarCount(): number {
    return this.stars.length;
  }

  /**
   * Get total constellation count
   */
  getConstellationCount(): number {
    return this.constellations.length;
  }

  /**
   * Check if catalog is loaded
   */
  isReady(): boolean {
    return this.isLoaded;
  }

  /**
   * Get star map for efficient lookups
   */
  getStarMap(): Map<number, Star> {
    return this.starById;
  }

  /**
   * Get statistics about the catalog
   */
  getStatistics(): {
    totalStars: number;
    namedStars: number;
    constellations: number;
    meteorShowers: number;
    brightestStar: Star | null;
    faintestStar: Star | null;
    magnitudeRange: { min: number; max: number };
  } {
    const namedStars = this.stars.filter((s) => s.name).length;
    const brightestStar =
      this.stars.length > 0
        ? this.stars.reduce((a, b) => (a.magnitude < b.magnitude ? a : b))
        : null;
    const faintestStar =
      this.stars.length > 0
        ? this.stars.reduce((a, b) => (a.magnitude > b.magnitude ? a : b))
        : null;

    return {
      totalStars: this.stars.length,
      namedStars,
      constellations: this.constellations.length,
      meteorShowers: this.meteorShowers.length,
      brightestStar,
      faintestStar,
      magnitudeRange: {
        min: brightestStar?.magnitude ?? 0,
        max: faintestStar?.magnitude ?? 0,
      },
    };
  }
}

// Export singleton instance
export const starCatalog = new StarCatalog();

// Export class for testing
export { StarCatalog };
