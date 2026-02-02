/**
 * Sensor Manager Service
 *
 * Handles device sensor integration for the star map application:
 * - Accelerometer: Detects device tilt (gravity direction)
 * - Gyroscope: Detects rotation rate for smooth updates
 * - Magnetometer: Provides compass heading
 * - Device Motion: Combined orientation from sensor fusion
 *
 * The sensor data is processed to determine where the device is pointing
 * in the sky (altitude and azimuth).
 */

import {
  Accelerometer,
  Gyroscope,
  Magnetometer,
  DeviceMotion,
  AccelerometerMeasurement,
  GyroscopeMeasurement,
  MagnetometerMeasurement,
  DeviceMotionMeasurement,
} from 'expo-sensors';
import * as Location from 'expo-location';
import {
  DeviceOrientation,
  CompassHeading,
  GeographicCoordinates,
  HorizontalCoordinates,
  DevicePointing,
  CalibrationStatus,
  Quaternion,
} from '../types';
import {
  degreesToRadians,
  radiansToDegrees,
  normalizeAngle,
  normalizeQuaternion,
  slerp,
} from '../utils/coordinateConversion';

// Sensor update intervals in milliseconds
const SENSOR_UPDATE_INTERVAL = 16; // ~60fps
const LOCATION_UPDATE_INTERVAL = 10000; // 10 seconds

// Low-pass filter coefficient for smoothing sensor data
const ALPHA = 0.15;

// Magnetic declination lookup (simplified - in production, use a proper model)
const MAGNETIC_DECLINATION_DEFAULT = 0;

/**
 * Sensor state interface
 */
interface SensorState {
  accelerometer: AccelerometerMeasurement | null;
  gyroscope: GyroscopeMeasurement | null;
  magnetometer: MagnetometerMeasurement | null;
  deviceMotion: DeviceMotionMeasurement | null;
}

/**
 * Callback type for sensor updates
 */
type OrientationCallback = (pointing: DevicePointing) => void;
type LocationCallback = (location: GeographicCoordinates) => void;
type CalibrationCallback = (status: CalibrationStatus) => void;

/**
 * Sensor Manager class
 *
 * Manages all device sensors and provides a unified interface
 * for getting device orientation in sky coordinates.
 */
class SensorManager {
  private sensorState: SensorState = {
    accelerometer: null,
    gyroscope: null,
    magnetometer: null,
    deviceMotion: null,
  };

  private subscriptions: {
    accelerometer?: { remove: () => void };
    gyroscope?: { remove: () => void };
    magnetometer?: { remove: () => void };
    deviceMotion?: { remove: () => void };
    location?: { remove: () => void };
  } = {};

  private orientationCallbacks: Set<OrientationCallback> = new Set();
  private locationCallbacks: Set<LocationCallback> = new Set();
  private calibrationCallbacks: Set<CalibrationCallback> = new Set();

  private currentLocation: GeographicCoordinates | null = null;
  private currentOrientation: DeviceOrientation | null = null;
  private currentQuaternion: Quaternion | null = null;
  private smoothedQuaternion: Quaternion | null = null;

  private calibrationStatus: CalibrationStatus = 'uncalibrated';
  private magnetometerReadings: number[] = [];
  private isRunning = false;
  private useDeviceMotion = true;
  private magneticDeclination = MAGNETIC_DECLINATION_DEFAULT;

  /**
   * Initialize sensor manager and check availability
   */
  async initialize(): Promise<{
    accelerometer: boolean;
    gyroscope: boolean;
    magnetometer: boolean;
    deviceMotion: boolean;
    location: boolean;
  }> {
    const [accelerometerAvailable, gyroscopeAvailable, magnetometerAvailable, deviceMotionAvailable] =
      await Promise.all([
        Accelerometer.isAvailableAsync(),
        Gyroscope.isAvailableAsync(),
        Magnetometer.isAvailableAsync(),
        DeviceMotion.isAvailableAsync(),
      ]);

    // Check location permission
    const { status: locationStatus } = await Location.requestForegroundPermissionsAsync();
    const locationAvailable = locationStatus === 'granted';

    // Prefer DeviceMotion if available (uses sensor fusion)
    this.useDeviceMotion = deviceMotionAvailable;

    return {
      accelerometer: accelerometerAvailable,
      gyroscope: gyroscopeAvailable,
      magnetometer: magnetometerAvailable,
      deviceMotion: deviceMotionAvailable,
      location: locationAvailable,
    };
  }

  /**
   * Start all sensors
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;

    // Set sensor update intervals
    Accelerometer.setUpdateInterval(SENSOR_UPDATE_INTERVAL);
    Gyroscope.setUpdateInterval(SENSOR_UPDATE_INTERVAL);
    Magnetometer.setUpdateInterval(SENSOR_UPDATE_INTERVAL);
    DeviceMotion.setUpdateInterval(SENSOR_UPDATE_INTERVAL);

    // Subscribe to sensors
    if (this.useDeviceMotion) {
      this.subscriptions.deviceMotion = DeviceMotion.addListener(this.handleDeviceMotion);
    } else {
      this.subscriptions.accelerometer = Accelerometer.addListener(this.handleAccelerometer);
      this.subscriptions.gyroscope = Gyroscope.addListener(this.handleGyroscope);
    }

    this.subscriptions.magnetometer = Magnetometer.addListener(this.handleMagnetometer);

    // Start location tracking
    await this.startLocationTracking();
  }

  /**
   * Stop all sensors
   */
  stop(): void {
    this.isRunning = false;

    Object.values(this.subscriptions).forEach((subscription) => {
      subscription?.remove();
    });

    this.subscriptions = {};
  }

  /**
   * Handle DeviceMotion sensor data
   * Uses hardware sensor fusion for accurate orientation
   */
  private handleDeviceMotion = (data: DeviceMotionMeasurement): void => {
    this.sensorState.deviceMotion = data;

    if (data.rotation) {
      const { alpha, beta, gamma } = data.rotation;

      // Convert rotation to quaternion
      // DeviceMotion provides rotation in radians
      const quaternion = this.eulerToQuaternion(
        alpha ?? 0,
        beta ?? 0,
        gamma ?? 0
      );

      // Apply smoothing
      if (this.smoothedQuaternion) {
        this.smoothedQuaternion = slerp(this.smoothedQuaternion, quaternion, ALPHA);
      } else {
        this.smoothedQuaternion = quaternion;
      }

      this.currentQuaternion = this.smoothedQuaternion;
      this.currentOrientation = {
        alpha: alpha ?? 0,
        beta: beta ?? 0,
        gamma: gamma ?? 0,
        quaternion: this.currentQuaternion,
        timestamp: Date.now(),
      };

      this.notifyOrientationUpdate();
    }
  };

  /**
   * Handle accelerometer data
   * Used when DeviceMotion is not available
   */
  private handleAccelerometer = (data: AccelerometerMeasurement): void => {
    this.sensorState.accelerometer = data;
    this.updateOrientationFromRawSensors();
  };

  /**
   * Handle gyroscope data
   */
  private handleGyroscope = (data: GyroscopeMeasurement): void => {
    this.sensorState.gyroscope = data;
  };

  /**
   * Handle magnetometer data for compass heading
   */
  private handleMagnetometer = (data: MagnetometerMeasurement): void => {
    this.sensorState.magnetometer = data;

    // Track magnetometer readings for calibration assessment
    const magnitude = Math.sqrt(data.x * data.x + data.y * data.y + data.z * data.z);
    this.magnetometerReadings.push(magnitude);

    // Keep only last 50 readings
    if (this.magnetometerReadings.length > 50) {
      this.magnetometerReadings.shift();
    }

    this.updateCalibrationStatus();
  };

  /**
   * Calculate orientation from raw accelerometer and magnetometer
   * Used as fallback when DeviceMotion is unavailable
   */
  private updateOrientationFromRawSensors(): void {
    const accel = this.sensorState.accelerometer;
    const mag = this.sensorState.magnetometer;

    if (!accel || !mag) return;

    // Calculate pitch (beta) from accelerometer
    // Phone lying flat: pitch = 0, pointing up: pitch = 90
    const pitch = Math.atan2(accel.y, Math.sqrt(accel.x * accel.x + accel.z * accel.z));

    // Calculate roll (gamma) from accelerometer
    const roll = Math.atan2(-accel.x, accel.z);

    // Calculate heading (alpha) from magnetometer
    // Need to correct for device tilt
    const mx = mag.x;
    const my = mag.y;
    const mz = mag.z;

    // Tilt compensation
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const cosRoll = Math.cos(roll);
    const sinRoll = Math.sin(roll);

    const Xh = mx * cosPitch + my * sinPitch * sinRoll + mz * sinPitch * cosRoll;
    const Yh = my * cosRoll - mz * sinRoll;

    let heading = Math.atan2(-Yh, Xh);
    if (heading < 0) heading += 2 * Math.PI;

    // Convert to our coordinate system
    this.currentOrientation = {
      alpha: heading,
      beta: pitch,
      gamma: roll,
      timestamp: Date.now(),
    };

    // Convert to quaternion
    this.currentQuaternion = this.eulerToQuaternion(heading, pitch, roll);

    this.notifyOrientationUpdate();
  }

  /**
   * Convert Euler angles to quaternion
   * Uses ZXY rotation order matching device orientation convention
   */
  private eulerToQuaternion(alpha: number, beta: number, gamma: number): Quaternion {
    const halfAlpha = alpha / 2;
    const halfBeta = beta / 2;
    const halfGamma = gamma / 2;

    const ca = Math.cos(halfAlpha);
    const sa = Math.sin(halfAlpha);
    const cb = Math.cos(halfBeta);
    const sb = Math.sin(halfBeta);
    const cg = Math.cos(halfGamma);
    const sg = Math.sin(halfGamma);

    // ZXY rotation order
    return normalizeQuaternion({
      w: ca * cb * cg - sa * sb * sg,
      x: ca * sb * cg - sa * cb * sg,
      y: ca * sb * sg + sa * cb * cg,
      z: ca * cb * sg + sa * sb * cg,
    });
  }

  /**
   * Get device pointing direction in sky coordinates
   */
  getPointing(): DevicePointing | null {
    if (!this.currentOrientation) return null;

    const pointing = this.orientationToSkyCoordinates(this.currentOrientation);

    return {
      pointing,
      fieldOfView: 60, // Default FOV
      calibrationStatus: this.calibrationStatus,
    };
  }

  /**
   * Convert device orientation to sky coordinates (Alt/Az)
   *
   * The conversion depends on how the device is held:
   * - Portrait mode: Screen facing user, top pointing up
   * - When pointing at sky: Beta (pitch) determines altitude
   *                        Alpha (yaw) determines azimuth
   */
  private orientationToSkyCoordinates(orientation: DeviceOrientation): HorizontalCoordinates {
    const { alpha, beta, gamma } = orientation;

    // Convert device orientation to altitude/azimuth
    // Beta (pitch): 0 = horizontal, 90 = pointing straight up
    // When device is vertical (portrait, looking at screen), beta ~ 90
    // We want altitude: -90 to +90 (below to above horizon)
    //
    // For a phone held in portrait mode pointing at the sky:
    // - beta = 0: phone horizontal, pointing at horizon
    // - beta = 90 (π/2): phone vertical, pointing at zenith
    //
    // But expo-sensors gives beta differently based on device orientation
    // Typically: beta is around 0 when flat, increases when tilted back
    //
    // Simplification: We use beta directly as a proxy for altitude adjustment

    // Convert beta from device coordinates to altitude
    // Device beta typically goes from -π/2 to π/2
    // Map to altitude where:
    // - Phone flat face up: looking at zenith (alt = 90)
    // - Phone vertical screen facing user: looking at horizon (alt = 0)
    // - Phone tilted back: looking above horizon
    const altitude = radiansToDegrees(beta);

    // Alpha is the compass direction (yaw)
    // We need to apply magnetic declination correction
    let azimuth = radiansToDegrees(alpha) + this.magneticDeclination;
    azimuth = normalizeAngle(azimuth);

    // Clamp altitude to valid range
    const clampedAltitude = Math.max(-90, Math.min(90, altitude));

    return {
      altitude: clampedAltitude,
      azimuth,
    };
  }

  /**
   * Start location tracking
   */
  private async startLocationTracking(): Promise<void> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.warn('Location permission not granted');
      return;
    }

    // Get initial location
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    this.updateLocation(location);

    // Start watching location
    this.subscriptions.location = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: LOCATION_UPDATE_INTERVAL,
        distanceInterval: 100, // meters
      },
      this.updateLocation
    );
  }

  /**
   * Update current location
   */
  private updateLocation = (location: Location.LocationObject): void => {
    this.currentLocation = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      elevation: location.coords.altitude ?? undefined,
    };

    // Update magnetic declination based on location
    this.updateMagneticDeclination();

    // Notify callbacks
    this.locationCallbacks.forEach((callback) => {
      if (this.currentLocation) {
        callback(this.currentLocation);
      }
    });
  };

  /**
   * Get current location
   */
  getLocation(): GeographicCoordinates | null {
    return this.currentLocation;
  }

  /**
   * Get current compass heading
   */
  getCompassHeading(): CompassHeading | null {
    const mag = this.sensorState.magnetometer;
    const accel = this.sensorState.accelerometer;

    if (!mag) return null;

    // Simple heading calculation (can be improved with tilt compensation)
    let magneticHeading = radiansToDegrees(Math.atan2(mag.y, mag.x));
    magneticHeading = normalizeAngle(magneticHeading);

    // Apply magnetic declination for true heading
    const trueHeading = normalizeAngle(magneticHeading + this.magneticDeclination);

    return {
      magneticHeading,
      trueHeading,
      accuracy: this.getCalibrationAccuracy(),
    };
  }

  /**
   * Update calibration status based on magnetometer readings
   */
  private updateCalibrationStatus(): void {
    if (this.magnetometerReadings.length < 10) {
      this.setCalibrationStatus('uncalibrated');
      return;
    }

    // Calculate variance of magnetometer magnitude
    const mean =
      this.magnetometerReadings.reduce((a, b) => a + b, 0) / this.magnetometerReadings.length;
    const variance =
      this.magnetometerReadings.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
      this.magnetometerReadings.length;
    const stdDev = Math.sqrt(variance);

    // Coefficient of variation
    const cv = stdDev / mean;

    // Classify calibration based on variance
    // Lower CV = more consistent readings = better calibration
    if (cv < 0.05) {
      this.setCalibrationStatus('high');
    } else if (cv < 0.15) {
      this.setCalibrationStatus('medium');
    } else if (cv < 0.3) {
      this.setCalibrationStatus('low');
    } else {
      this.setCalibrationStatus('uncalibrated');
    }
  }

  /**
   * Set calibration status and notify callbacks
   */
  private setCalibrationStatus(status: CalibrationStatus): void {
    if (this.calibrationStatus !== status) {
      this.calibrationStatus = status;
      this.calibrationCallbacks.forEach((callback) => callback(status));
    }
  }

  /**
   * Get calibration accuracy as a number (0-100)
   */
  private getCalibrationAccuracy(): number {
    switch (this.calibrationStatus) {
      case 'high':
        return 95;
      case 'medium':
        return 70;
      case 'low':
        return 40;
      case 'uncalibrated':
      default:
        return 10;
    }
  }

  /**
   * Update magnetic declination based on location
   * In production, use World Magnetic Model (WMM) or IGRF
   */
  private updateMagneticDeclination(): void {
    if (!this.currentLocation) return;

    // Simplified declination lookup
    // In production, use the World Magnetic Model
    // This is a very rough approximation for continental US
    const { latitude, longitude } = this.currentLocation;

    // Very rough approximation - in reality, use WMM
    // Declination varies from about -20° to +20° in continental US
    // East longitude decreases declination, West increases
    // Higher latitudes have more extreme declination

    // Simplified formula (NOT accurate, just for demonstration)
    const baseDeclination = -4; // Base for central US
    const lonEffect = (longitude + 100) * 0.1;
    const latEffect = (latitude - 40) * 0.2;

    this.magneticDeclination = baseDeclination + lonEffect + latEffect;
  }

  /**
   * Request compass calibration
   * Returns instructions for the user
   */
  requestCalibration(): string {
    return (
      'To calibrate the compass, slowly move your device in a figure-8 pattern ' +
      'several times. Make sure you are away from magnetic interference sources ' +
      'like speakers, magnets, or metal objects.'
    );
  }

  /**
   * Notify all orientation callbacks
   */
  private notifyOrientationUpdate(): void {
    const pointing = this.getPointing();
    if (pointing) {
      this.orientationCallbacks.forEach((callback) => callback(pointing));
    }
  }

  /**
   * Subscribe to orientation updates
   */
  onOrientationUpdate(callback: OrientationCallback): () => void {
    this.orientationCallbacks.add(callback);
    return () => this.orientationCallbacks.delete(callback);
  }

  /**
   * Subscribe to location updates
   */
  onLocationUpdate(callback: LocationCallback): () => void {
    this.locationCallbacks.add(callback);
    return () => this.locationCallbacks.delete(callback);
  }

  /**
   * Subscribe to calibration status updates
   */
  onCalibrationUpdate(callback: CalibrationCallback): () => void {
    this.calibrationCallbacks.add(callback);
    return () => this.calibrationCallbacks.delete(callback);
  }

  /**
   * Get current quaternion for 3D rendering
   */
  getQuaternion(): Quaternion | null {
    return this.smoothedQuaternion;
  }

  /**
   * Get current calibration status
   */
  getCalibrationStatus(): CalibrationStatus {
    return this.calibrationStatus;
  }

  /**
   * Check if sensors are running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}

// Export singleton instance
export const sensorManager = new SensorManager();

// Export class for testing
export { SensorManager };
