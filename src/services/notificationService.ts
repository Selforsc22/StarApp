/**
 * Notification Service
 *
 * Handles:
 * - Push notification registration and scheduling
 * - Email subscription management
 * - Event reminder preferences
 * - Viewing direction calculations for events
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format, addHours, subHours, subDays } from 'date-fns';
import {
  AstronomicalEvent,
  EventType,
  GeographicCoordinates,
  HorizontalCoordinates,
} from '../types';
import { equatorialToHorizontal } from '../utils/coordinateConversion';
import { localMeanSiderealTime, dateToJulianDate } from '../utils/timeCalculations';

// Storage keys
const STORAGE_KEYS = {
  SUBSCRIPTIONS: '@starmap_subscriptions',
  PUSH_TOKEN: '@starmap_push_token',
  EMAIL: '@starmap_email',
  NOTIFICATION_PREFS: '@starmap_notification_prefs',
};

// Backend API URL (configure for production)
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Subscription preferences
 */
export interface SubscriptionPreferences {
  enabled: boolean;
  email?: string;
  pushEnabled: boolean;
  emailEnabled: boolean;
  eventTypes: EventType[];
  reminderTimes: ReminderTime[];
  dailyDigest: boolean;
  digestTime: string; // HH:mm format
}

export type ReminderTime = '1h' | '6h' | '24h' | '3d' | '1w';

/**
 * Viewing direction for an event
 */
export interface ViewingDirection {
  azimuth: number;
  altitude: number;
  compassDirection: string;
  description: string;
  bestViewingTime?: Date;
  isVisible: boolean;
}

/**
 * Default subscription preferences
 */
const DEFAULT_PREFERENCES: SubscriptionPreferences = {
  enabled: false,
  pushEnabled: true,
  emailEnabled: false,
  eventTypes: ['meteor_shower', 'eclipse', 'aurora', 'conjunction'],
  reminderTimes: ['24h', '1h'],
  dailyDigest: false,
  digestTime: '18:00',
};

/**
 * Configure notification handler
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Notification Service class
 */
class NotificationService {
  private preferences: SubscriptionPreferences = DEFAULT_PREFERENCES;
  private pushToken: string | null = null;
  private isInitialized = false;

  /**
   * Initialize the notification service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    await this.loadPreferences();
    await this.registerForPushNotifications();
    this.isInitialized = true;
  }

  /**
   * Register for push notifications
   */
  async registerForPushNotifications(): Promise<string | null> {
    if (!Device.isDevice) {
      console.log('Push notifications require a physical device');
      return null;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permission not granted');
      return null;
    }

    try {
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
      });
      this.pushToken = tokenData.data;
      await AsyncStorage.setItem(STORAGE_KEYS.PUSH_TOKEN, this.pushToken);

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('events', {
          name: 'Astronomical Events',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#4488FF',
        });
      }

      return this.pushToken;
    } catch (error) {
      console.error('Failed to get push token:', error);
      return null;
    }
  }

  /**
   * Load preferences from storage
   */
  async loadPreferences(): Promise<SubscriptionPreferences> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.SUBSCRIPTIONS);
      if (stored) {
        this.preferences = { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.error('Failed to load preferences:', error);
    }
    return this.preferences;
  }

  /**
   * Save preferences to storage
   */
  async savePreferences(prefs: Partial<SubscriptionPreferences>): Promise<void> {
    this.preferences = { ...this.preferences, ...prefs };
    await AsyncStorage.setItem(STORAGE_KEYS.SUBSCRIPTIONS, JSON.stringify(this.preferences));

    // Sync with backend if email is enabled
    if (this.preferences.emailEnabled && this.preferences.email) {
      await this.syncWithBackend();
    }
  }

  /**
   * Get current preferences
   */
  getPreferences(): SubscriptionPreferences {
    return { ...this.preferences };
  }

  /**
   * Subscribe to email notifications
   */
  async subscribeEmail(email: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          pushToken: this.pushToken,
          preferences: this.preferences,
        }),
      });

      if (response.ok) {
        await this.savePreferences({ email, emailEnabled: true });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to subscribe:', error);
      // Save locally even if backend fails
      await this.savePreferences({ email, emailEnabled: true });
      return true;
    }
  }

  /**
   * Unsubscribe from email notifications
   */
  async unsubscribeEmail(): Promise<boolean> {
    try {
      if (this.preferences.email) {
        await fetch(`${API_BASE_URL}/api/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: this.preferences.email }),
        });
      }
      await this.savePreferences({ emailEnabled: false });
      return true;
    } catch (error) {
      console.error('Failed to unsubscribe:', error);
      await this.savePreferences({ emailEnabled: false });
      return true;
    }
  }

  /**
   * Sync preferences with backend
   */
  private async syncWithBackend(): Promise<void> {
    try {
      await fetch(`${API_BASE_URL}/api/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: this.preferences.email,
          pushToken: this.pushToken,
          preferences: this.preferences,
        }),
      });
    } catch (error) {
      console.error('Failed to sync with backend:', error);
    }
  }

  /**
   * Schedule local notification for an event
   */
  async scheduleEventNotification(
    event: AstronomicalEvent,
    location: GeographicCoordinates,
    reminderTime: ReminderTime
  ): Promise<string | null> {
    if (!this.preferences.pushEnabled) return null;

    const notifyTime = this.getReminderDate(event.startTime, reminderTime);
    if (notifyTime <= new Date()) return null;

    const viewingDirection = this.getViewingDirection(event, location, event.startTime);
    const directionText = viewingDirection.isVisible
      ? `Look ${viewingDirection.compassDirection} at ${viewingDirection.altitude.toFixed(0)}° altitude`
      : 'May not be visible from your location';

    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: `${this.getReminderLabel(reminderTime)}: ${event.name}`,
          body: `${event.description}\n\n${directionText}`,
          data: { eventId: event.id, type: event.type },
          sound: true,
        },
        trigger: { date: notifyTime },
      });
      return id;
    } catch (error) {
      console.error('Failed to schedule notification:', error);
      return null;
    }
  }

  /**
   * Cancel a scheduled notification
   */
  async cancelNotification(notificationId: string): Promise<void> {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  }

  /**
   * Cancel all scheduled notifications
   */
  async cancelAllNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }

  /**
   * Get reminder date based on reminder time setting
   */
  private getReminderDate(eventDate: Date, reminderTime: ReminderTime): Date {
    switch (reminderTime) {
      case '1h':
        return subHours(eventDate, 1);
      case '6h':
        return subHours(eventDate, 6);
      case '24h':
        return subHours(eventDate, 24);
      case '3d':
        return subDays(eventDate, 3);
      case '1w':
        return subDays(eventDate, 7);
      default:
        return subHours(eventDate, 24);
    }
  }

  /**
   * Get human-readable reminder label
   */
  private getReminderLabel(reminderTime: ReminderTime): string {
    switch (reminderTime) {
      case '1h':
        return 'Starting in 1 hour';
      case '6h':
        return 'Starting in 6 hours';
      case '24h':
        return 'Tomorrow';
      case '3d':
        return 'In 3 days';
      case '1w':
        return 'Next week';
      default:
        return 'Upcoming';
    }
  }

  /**
   * Calculate viewing direction for an astronomical event
   */
  getViewingDirection(
    event: AstronomicalEvent,
    location: GeographicCoordinates,
    viewingTime: Date
  ): ViewingDirection {
    // For events with a radiant point (meteor showers)
    if (event.radiant) {
      return this.calculateHorizontalPosition(event.radiant, location, viewingTime);
    }

    // For events with a specific location
    if (event.location) {
      return this.calculateHorizontalPosition(event.location, location, viewingTime);
    }

    // For events without specific position (aurora, space weather)
    return this.getGeneralViewingDirection(event, location);
  }

  /**
   * Calculate horizontal position from equatorial coordinates
   */
  private calculateHorizontalPosition(
    equatorial: { ra: number; dec: number },
    location: GeographicCoordinates,
    time: Date
  ): ViewingDirection {
    const jd = dateToJulianDate(time);
    const lst = localMeanSiderealTime(jd, location.longitude);

    const horizontal = equatorialToHorizontal(
      equatorial.ra,
      equatorial.dec,
      location.latitude,
      lst
    );

    const compassDirection = this.getCompassDirection(horizontal.azimuth);
    const isVisible = horizontal.altitude > 0;

    let description = '';
    if (isVisible) {
      description = `Face ${compassDirection} and look `;
      if (horizontal.altitude > 60) {
        description += 'almost straight up';
      } else if (horizontal.altitude > 30) {
        description += 'about halfway up the sky';
      } else {
        description += 'toward the horizon';
      }
    } else {
      description = `Currently below the horizon. Best viewing when it rises in the ${this.getCompassDirection((horizontal.azimuth + 180) % 360)}`;
    }

    return {
      azimuth: horizontal.azimuth,
      altitude: horizontal.altitude,
      compassDirection,
      description,
      isVisible,
    };
  }

  /**
   * Get general viewing direction for events without specific coordinates
   */
  private getGeneralViewingDirection(
    event: AstronomicalEvent,
    location: GeographicCoordinates
  ): ViewingDirection {
    switch (event.type) {
      case 'aurora':
        // Auroras are best viewed toward the poles
        const isNorthern = location.latitude >= 0;
        return {
          azimuth: isNorthern ? 0 : 180,
          altitude: 30,
          compassDirection: isNorthern ? 'North' : 'South',
          description: `Look ${isNorthern ? 'north' : 'south'} toward the pole. Auroras appear low on the horizon and can extend upward.`,
          isVisible: true,
        };

      case 'space_weather':
        return {
          azimuth: 180,
          altitude: 45,
          compassDirection: 'South',
          description: 'Solar activity affects radio and satellite communications. No specific viewing direction.',
          isVisible: false,
        };

      default:
        return {
          azimuth: 0,
          altitude: 45,
          compassDirection: 'North',
          description: 'Check the event details for specific viewing instructions.',
          isVisible: true,
        };
    }
  }

  /**
   * Convert azimuth to compass direction
   */
  getCompassDirection(azimuth: number): string {
    const directions = [
      'North', 'NNE', 'NE', 'ENE',
      'East', 'ESE', 'SE', 'SSE',
      'South', 'SSW', 'SW', 'WSW',
      'West', 'WNW', 'NW', 'NNW',
    ];
    const index = Math.round(azimuth / 22.5) % 16;
    return directions[index];
  }

  /**
   * Format viewing direction for display
   */
  formatViewingDirection(direction: ViewingDirection): string {
    if (!direction.isVisible) {
      return direction.description;
    }

    const altitudeDesc =
      direction.altitude > 60
        ? 'high in the sky'
        : direction.altitude > 30
          ? 'about halfway up'
          : 'near the horizon';

    return `Look ${direction.compassDirection} (${direction.azimuth.toFixed(0)}°), ${altitudeDesc} (${direction.altitude.toFixed(0)}° altitude)`;
  }

  /**
   * Get best viewing time for an event
   */
  getBestViewingTime(
    event: AstronomicalEvent,
    location: GeographicCoordinates
  ): { time: Date; direction: ViewingDirection } | null {
    // For events with peak time, that's usually the best
    if (event.peakTime) {
      const direction = this.getViewingDirection(event, location, event.peakTime);
      return { time: event.peakTime, direction };
    }

    // For meteor showers, best viewing is typically after midnight
    if (event.type === 'meteor_shower') {
      const bestTime = new Date(event.startTime);
      bestTime.setHours(2, 0, 0, 0); // 2 AM local time
      const direction = this.getViewingDirection(event, location, bestTime);
      return { time: bestTime, direction };
    }

    // Default to start time
    const direction = this.getViewingDirection(event, location, event.startTime);
    return { time: event.startTime, direction };
  }

  /**
   * Generate email content for an event
   */
  generateEventEmailContent(
    event: AstronomicalEvent,
    location: GeographicCoordinates
  ): { subject: string; body: string; html: string } {
    const viewingInfo = this.getBestViewingTime(event, location);
    const direction = viewingInfo?.direction;

    const subject = `StarMap Alert: ${event.name}`;

    const body = `
${event.name}
${'-'.repeat(event.name.length)}

${event.description}

WHEN
Start: ${format(event.startTime, 'EEEE, MMMM d, yyyy')}
${event.peakTime ? `Peak: ${format(event.peakTime, 'EEEE, MMMM d, yyyy h:mm a')}` : ''}
${event.endTime ? `End: ${format(event.endTime, 'EEEE, MMMM d, yyyy')}` : ''}

WHERE TO LOOK
${direction ? this.formatViewingDirection(direction) : 'Check app for viewing directions'}

${direction?.description || ''}

TIPS
- Find a dark location away from city lights
- Give your eyes 20-30 minutes to adapt to darkness
- Use the StarMap app's night mode to preserve your dark adaptation

Open StarMap for real-time sky guidance and to find the exact position.
`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a1a; color: #ffffff; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; }
    .header { background: linear-gradient(135deg, #4488ff, #8844ff); padding: 30px; border-radius: 16px; text-align: center; margin-bottom: 24px; }
    .header h1 { margin: 0; font-size: 24px; }
    .card { background: #1a1a2e; border-radius: 12px; padding: 20px; margin-bottom: 16px; border: 1px solid #2a2a4e; }
    .card-title { color: #4488ff; font-size: 14px; text-transform: uppercase; margin-bottom: 8px; font-weight: 600; }
    .direction-box { background: #0f0f1f; border-radius: 8px; padding: 16px; margin-top: 12px; border-left: 4px solid #4488ff; }
    .direction-compass { font-size: 36px; font-weight: bold; color: #4488ff; }
    .tip { display: flex; align-items: center; margin: 8px 0; }
    .tip-icon { color: #44ff88; margin-right: 8px; }
    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 32px; }
    a { color: #4488ff; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${event.name}</h1>
    </div>

    <div class="card">
      <div class="card-title">About This Event</div>
      <p>${event.description}</p>
    </div>

    <div class="card">
      <div class="card-title">When</div>
      <p><strong>Start:</strong> ${format(event.startTime, 'EEEE, MMMM d, yyyy')}</p>
      ${event.peakTime ? `<p><strong>Peak:</strong> ${format(event.peakTime, 'EEEE, MMMM d, yyyy h:mm a')}</p>` : ''}
      ${event.endTime ? `<p><strong>End:</strong> ${format(event.endTime, 'EEEE, MMMM d, yyyy')}</p>` : ''}
    </div>

    <div class="card">
      <div class="card-title">Where to Look</div>
      ${direction ? `
        <div class="direction-box">
          <div class="direction-compass">${direction.compassDirection}</div>
          <p>Azimuth: ${direction.azimuth.toFixed(0)}° | Altitude: ${direction.altitude.toFixed(0)}°</p>
          <p>${direction.description}</p>
        </div>
      ` : '<p>Check the app for viewing directions</p>'}
    </div>

    <div class="card">
      <div class="card-title">Viewing Tips</div>
      <div class="tip"><span class="tip-icon">✓</span> Find a dark location away from city lights</div>
      <div class="tip"><span class="tip-icon">✓</span> Give your eyes 20-30 minutes to adapt</div>
      <div class="tip"><span class="tip-icon">✓</span> Use night mode to preserve dark adaptation</div>
    </div>

    <div class="footer">
      <p>Open StarMap for real-time guidance</p>
      <p><a href="#">Unsubscribe</a> from event notifications</p>
    </div>
  </div>
</body>
</html>
`;

    return { subject, body, html };
  }
}

// Export singleton instance
export const notificationService = new NotificationService();

// Export class for testing
export { NotificationService };
