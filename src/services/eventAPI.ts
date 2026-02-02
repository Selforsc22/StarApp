/**
 * Event API Service
 *
 * Aggregates astronomical event data from multiple sources:
 * - NASA DONKI API (space weather events)
 * - NOAA Space Weather Prediction Center (aurora forecasts)
 * - Local meteor shower calendar
 * - ISS pass predictions (optional)
 *
 * Provides a unified interface for accessing upcoming astronomical events.
 */

import {
  AstronomicalEvent,
  MeteorShower,
  AuroraForecast,
  GeographicCoordinates,
  EventType,
  EventPriority,
} from '../types';
import { starCatalog } from './starCatalog';

// API Configuration
const NASA_DONKI_BASE_URL = 'https://api.nasa.gov/DONKI';
const NOAA_SWPC_BASE_URL = 'https://services.swpc.noaa.gov';

// Default NASA API key (for demo purposes - users should get their own)
const DEFAULT_NASA_API_KEY = 'DEMO_KEY';

/**
 * Space weather event from NASA DONKI
 */
interface DONKIEvent {
  messageType: string;
  messageID: string;
  messageURL: string;
  messageIssueTime: string;
  messageBody: string;
}

/**
 * Geomagnetic storm data from NASA DONKI
 */
interface GeomagneticStorm {
  gstID: string;
  startTime: string;
  allKpIndex: Array<{
    observedTime: string;
    kpIndex: number;
    source: string;
  }>;
}

/**
 * Solar flare data from NASA DONKI
 */
interface SolarFlare {
  flrID: string;
  instruments: Array<{ displayName: string }>;
  beginTime: string;
  peakTime: string;
  endTime: string;
  classType: string;
  sourceLocation: string;
}

/**
 * NOAA Kp index forecast
 */
interface NOAAKpForecast {
  time_tag: string;
  kp: number;
  observed: string;
  noaa_scale: string;
}

/**
 * Event API Service class
 */
class EventAPIService {
  private nasaApiKey: string;
  private cachedEvents: AstronomicalEvent[] = [];
  private lastFetchTime: number = 0;
  private cacheDuration = 30 * 60 * 1000; // 30 minutes

  constructor(nasaApiKey: string = DEFAULT_NASA_API_KEY) {
    this.nasaApiKey = nasaApiKey;
  }

  /**
   * Set NASA API key
   */
  setNasaApiKey(apiKey: string): void {
    this.nasaApiKey = apiKey;
  }

  /**
   * Fetch all astronomical events
   */
  async fetchAllEvents(
    location?: GeographicCoordinates,
    forceRefresh: boolean = false
  ): Promise<AstronomicalEvent[]> {
    const now = Date.now();

    // Return cached events if still valid
    if (!forceRefresh && this.cachedEvents.length > 0 && now - this.lastFetchTime < this.cacheDuration) {
      return this.cachedEvents;
    }

    const events: AstronomicalEvent[] = [];

    // Fetch from multiple sources in parallel
    const [meteorShowers, spaceWeatherEvents, auroraEvents] = await Promise.all([
      this.getMeteorShowerEvents(),
      this.fetchSpaceWeatherEvents().catch(() => []),
      this.fetchAuroraEvents(location).catch(() => []),
    ]);

    events.push(...meteorShowers);
    events.push(...spaceWeatherEvents);
    events.push(...auroraEvents);

    // Sort by start time
    events.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    this.cachedEvents = events;
    this.lastFetchTime = now;

    return events;
  }

  /**
   * Get meteor shower events from local calendar
   */
  async getMeteorShowerEvents(): Promise<AstronomicalEvent[]> {
    await starCatalog.load();

    const now = new Date();
    const activeShowers = starCatalog.getActiveMeteorShowers(now);
    const upcomingShowers = starCatalog.getUpcomingMeteorShowers(60); // Next 60 days

    const allShowers = [...activeShowers];

    // Add upcoming showers not already in active list
    for (const shower of upcomingShowers) {
      if (!allShowers.find((s) => s.id === shower.id)) {
        allShowers.push(shower);
      }
    }

    return allShowers.map((shower) => this.meteorShowerToEvent(shower, now));
  }

  /**
   * Convert meteor shower to astronomical event
   */
  private meteorShowerToEvent(shower: MeteorShower, currentDate: Date): AstronomicalEvent {
    const isActive = starCatalog.getActiveMeteorShowers(currentDate).some((s) => s.id === shower.id);
    const isPeakSoon = this.isPeakWithinDays(shower, currentDate, 3);

    return {
      id: `meteor_${shower.id}`,
      type: 'meteor_shower',
      name: shower.name,
      description: `${shower.description} Peak ZHR: ${shower.zhr} meteors/hour.`,
      startTime: shower.startTime!,
      endTime: shower.endTime,
      peakTime: shower.peakTime,
      radiant: shower.radiant,
      intensity: shower.zhr,
      priority: isPeakSoon ? 'high' : isActive ? 'medium' : 'low',
      source: 'IMO',
      infoUrl: `https://www.imo.net/resources/calendar/`,
    };
  }

  /**
   * Check if meteor shower peak is within specified days
   */
  private isPeakWithinDays(shower: MeteorShower, currentDate: Date, days: number): boolean {
    if (!shower.peakTime) return false;

    const peak = new Date(shower.peakTime);
    // Adjust to current year
    peak.setFullYear(currentDate.getFullYear());

    const diffDays = (peak.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24);

    return diffDays >= -1 && diffDays <= days;
  }

  /**
   * Fetch space weather events from NASA DONKI
   */
  async fetchSpaceWeatherEvents(): Promise<AstronomicalEvent[]> {
    const events: AstronomicalEvent[] = [];

    try {
      // Fetch geomagnetic storm data
      const gstEvents = await this.fetchGeomagneticStorms();
      events.push(...gstEvents);

      // Fetch solar flare data
      const flareEvents = await this.fetchSolarFlares();
      events.push(...flareEvents);
    } catch (error) {
      console.warn('Failed to fetch space weather events:', error);
    }

    return events;
  }

  /**
   * Fetch geomagnetic storm data
   */
  private async fetchGeomagneticStorms(): Promise<AstronomicalEvent[]> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000); // Last 7 days

    const url = `${NASA_DONKI_BASE_URL}/GST?startDate=${this.formatDate(startDate)}&endDate=${this.formatDate(endDate)}&api_key=${this.nasaApiKey}`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data: GeomagneticStorm[] = await response.json();

      return data.map((storm) => {
        const maxKp = Math.max(...storm.allKpIndex.map((k) => k.kpIndex));
        const priority = this.kpToPriority(maxKp);

        return {
          id: `gst_${storm.gstID}`,
          type: 'space_weather' as EventType,
          name: 'Geomagnetic Storm',
          description: `Geomagnetic storm with maximum Kp index of ${maxKp}. ${this.kpToDescription(maxKp)}`,
          startTime: new Date(storm.startTime),
          intensity: maxKp,
          priority,
          source: 'NASA DONKI',
          infoUrl: `https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/GST/${storm.gstID}`,
        };
      });
    } catch (error) {
      console.warn('Failed to fetch geomagnetic storms:', error);
      return [];
    }
  }

  /**
   * Fetch solar flare data
   */
  private async fetchSolarFlares(): Promise<AstronomicalEvent[]> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 3 * 24 * 60 * 60 * 1000); // Last 3 days

    const url = `${NASA_DONKI_BASE_URL}/FLR?startDate=${this.formatDate(startDate)}&endDate=${this.formatDate(endDate)}&api_key=${this.nasaApiKey}`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data: SolarFlare[] = await response.json();

      return data
        .filter((flare) => flare.classType.startsWith('M') || flare.classType.startsWith('X'))
        .map((flare) => ({
          id: `flr_${flare.flrID}`,
          type: 'space_weather' as EventType,
          name: `${flare.classType} Solar Flare`,
          description: `${flare.classType}-class solar flare detected. Strong solar flares can cause auroras and radio blackouts.`,
          startTime: new Date(flare.beginTime),
          endTime: flare.endTime ? new Date(flare.endTime) : undefined,
          peakTime: flare.peakTime ? new Date(flare.peakTime) : undefined,
          priority: flare.classType.startsWith('X') ? 'critical' : 'high',
          source: 'NASA DONKI',
          infoUrl: `https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/FLR/${flare.flrID}`,
        }));
    } catch (error) {
      console.warn('Failed to fetch solar flares:', error);
      return [];
    }
  }

  /**
   * Fetch aurora forecast events
   */
  async fetchAuroraEvents(location?: GeographicCoordinates): Promise<AstronomicalEvent[]> {
    try {
      // Fetch current Kp forecast
      const forecast = await this.fetchKpForecast();

      if (!forecast) return [];

      const events: AstronomicalEvent[] = [];

      // Check for aurora potential
      const highKpForecasts = forecast.filter((f) => f.kp >= 4);

      for (const f of highKpForecasts) {
        const visibilityLat = this.kpToVisibilityLatitude(f.kp);
        const isVisible = location ? Math.abs(location.latitude) >= visibilityLat : true;

        events.push({
          id: `aurora_${f.time_tag}`,
          type: 'aurora' as EventType,
          name: 'Aurora Potential',
          description: `Kp index forecast of ${f.kp}. ${isVisible ? 'Auroras may be visible from your location.' : `Auroras may be visible above ${visibilityLat}° latitude.`}`,
          startTime: new Date(f.time_tag),
          intensity: f.kp,
          priority: this.kpToPriority(f.kp),
          source: 'NOAA SWPC',
          visibleFromLocation: isVisible,
          infoUrl: 'https://www.swpc.noaa.gov/products/aurora-30-minute-forecast',
        });
      }

      return events;
    } catch (error) {
      console.warn('Failed to fetch aurora events:', error);
      return [];
    }
  }

  /**
   * Fetch Kp index forecast from NOAA
   */
  private async fetchKpForecast(): Promise<NOAAKpForecast[] | null> {
    const url = `${NOAA_SWPC_BASE_URL}/products/noaa-planetary-k-index-forecast.json`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();

      // Parse NOAA format
      return data.slice(1).map((row: string[]) => ({
        time_tag: row[0],
        kp: parseFloat(row[1]),
        observed: row[2],
        noaa_scale: row[3] || '',
      }));
    } catch (error) {
      console.warn('Failed to fetch Kp forecast:', error);
      return null;
    }
  }

  /**
   * Get current aurora forecast
   */
  async getAuroraForecast(location: GeographicCoordinates): Promise<AuroraForecast | null> {
    try {
      const forecast = await this.fetchKpForecast();
      if (!forecast || forecast.length === 0) return null;

      // Get the latest forecast
      const latest = forecast[0];

      return {
        kpIndex: latest.kp,
        forecastTime: new Date(latest.time_tag),
        visibilityLatitude: this.kpToVisibilityLatitude(latest.kp),
        probability: this.kpToProbability(latest.kp, location.latitude),
        gScale: latest.noaa_scale || undefined,
      };
    } catch (error) {
      console.warn('Failed to get aurora forecast:', error);
      return null;
    }
  }

  /**
   * Convert Kp index to aurora visibility latitude
   * Lower latitudes see auroras at higher Kp values
   */
  private kpToVisibilityLatitude(kp: number): number {
    // Approximate visibility based on Kp
    // Kp 0: ~67° (Arctic Circle only)
    // Kp 5: ~55° (Northern US/Canada)
    // Kp 9: ~40° (Southern US)
    const latitudes: { [key: number]: number } = {
      0: 67,
      1: 65,
      2: 62,
      3: 58,
      4: 55,
      5: 52,
      6: 48,
      7: 45,
      8: 42,
      9: 40,
    };

    const clampedKp = Math.min(9, Math.max(0, Math.round(kp)));
    return latitudes[clampedKp] || 67;
  }

  /**
   * Convert Kp index to aurora probability at a given latitude
   */
  private kpToProbability(kp: number, latitude: number): number {
    const visibilityLat = this.kpToVisibilityLatitude(kp);
    const absLat = Math.abs(latitude);

    if (absLat < visibilityLat - 10) return 0;
    if (absLat >= visibilityLat + 5) return 95;

    // Linear interpolation
    return Math.min(95, Math.max(0, (absLat - visibilityLat + 10) * 6.3));
  }

  /**
   * Convert Kp index to event priority
   */
  private kpToPriority(kp: number): EventPriority {
    if (kp >= 8) return 'critical';
    if (kp >= 6) return 'high';
    if (kp >= 4) return 'medium';
    return 'low';
  }

  /**
   * Convert Kp index to description
   */
  private kpToDescription(kp: number): string {
    if (kp >= 8) return 'Extreme geomagnetic storm. Auroras visible at unusually low latitudes.';
    if (kp >= 6) return 'Strong geomagnetic storm. Auroras likely visible at mid-latitudes.';
    if (kp >= 4) return 'Moderate geomagnetic storm. Enhanced aurora activity possible.';
    if (kp >= 2) return 'Minor geomagnetic activity. Auroras visible at high latitudes.';
    return 'Quiet geomagnetic conditions.';
  }

  /**
   * Format date for API requests
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Get events for tonight
   */
  async getEventsTonight(location: GeographicCoordinates): Promise<AstronomicalEvent[]> {
    const allEvents = await this.fetchAllEvents(location);
    const now = new Date();
    const tonight = new Date(now);
    tonight.setHours(18, 0, 0, 0); // Start at 6 PM

    const tomorrow = new Date(tonight);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(6, 0, 0, 0); // End at 6 AM

    return allEvents.filter((event) => {
      const eventTime = event.startTime;
      return eventTime >= tonight && eventTime <= tomorrow;
    });
  }

  /**
   * Get high priority events
   */
  async getHighPriorityEvents(): Promise<AstronomicalEvent[]> {
    const allEvents = await this.fetchAllEvents();

    return allEvents.filter(
      (event) => event.priority === 'high' || event.priority === 'critical'
    );
  }

  /**
   * Subscribe to event notifications (placeholder for push notifications)
   */
  async subscribeToNotifications(
    eventTypes: EventType[],
    location: GeographicCoordinates
  ): Promise<boolean> {
    // In a production app, this would register for push notifications
    // For now, just return success
    console.log('Subscribed to notifications for:', eventTypes);
    return true;
  }

  /**
   * Clear cached events
   */
  clearCache(): void {
    this.cachedEvents = [];
    this.lastFetchTime = 0;
  }
}

// Export singleton instance
export const eventAPI = new EventAPIService();

// Export class for testing
export { EventAPIService };
