/**
 * Core type definitions for the Star Map application
 *
 * Coordinate Systems:
 * - Equatorial: Right Ascension (RA) and Declination (Dec) - fixed to celestial sphere
 * - Horizontal: Altitude (Alt) and Azimuth (Az) - relative to observer's horizon
 * - Screen: X, Y coordinates for rendering
 */

// ============================================
// Coordinate Types
// ============================================

/**
 * Equatorial coordinates (celestial coordinates)
 * These are fixed positions relative to the celestial sphere
 */
export interface EquatorialCoordinates {
  /** Right Ascension in hours (0-24) */
  ra: number;
  /** Declination in degrees (-90 to +90) */
  dec: number;
}

/**
 * Horizontal coordinates (observer-relative)
 * These change based on observer location, date, and time
 */
export interface HorizontalCoordinates {
  /** Altitude above horizon in degrees (-90 to +90) */
  altitude: number;
  /** Azimuth from North in degrees (0-360, clockwise) */
  azimuth: number;
}

/**
 * Geographic coordinates of the observer
 */
export interface GeographicCoordinates {
  /** Latitude in degrees (-90 to +90, positive = North) */
  latitude: number;
  /** Longitude in degrees (-180 to +180, positive = East) */
  longitude: number;
  /** Altitude above sea level in meters (optional) */
  elevation?: number;
}

/**
 * 3D Cartesian coordinates for rendering
 */
export interface CartesianCoordinates {
  x: number;
  y: number;
  z: number;
}

/**
 * Screen coordinates for 2D overlay rendering
 */
export interface ScreenCoordinates {
  x: number;
  y: number;
  /** Whether the point is visible on screen */
  visible: boolean;
}

// ============================================
// Device Orientation Types
// ============================================

/**
 * Device orientation from sensors
 * Uses quaternion for accurate 3D rotation representation
 */
export interface DeviceOrientation {
  /** Rotation around X axis (pitch) in radians */
  alpha: number;
  /** Rotation around Y axis (roll) in radians */
  beta: number;
  /** Rotation around Z axis (yaw) in radians */
  gamma: number;
  /** Quaternion representation for smooth interpolation */
  quaternion?: Quaternion;
  /** Timestamp of the reading */
  timestamp: number;
}

/**
 * Quaternion for rotation representation
 * Avoids gimbal lock and provides smooth interpolation
 */
export interface Quaternion {
  w: number;
  x: number;
  y: number;
  z: number;
}

/**
 * Compass heading from magnetometer
 */
export interface CompassHeading {
  /** Magnetic heading in degrees (0-360) */
  magneticHeading: number;
  /** True heading in degrees (0-360), corrected for magnetic declination */
  trueHeading: number;
  /** Accuracy of the heading reading */
  accuracy: number;
}

/**
 * Combined sensor data for device pointing direction
 */
export interface DevicePointing {
  /** Where the device is pointing in horizontal coordinates */
  pointing: HorizontalCoordinates;
  /** Field of view in degrees */
  fieldOfView: number;
  /** Sensor calibration status */
  calibrationStatus: CalibrationStatus;
}

export type CalibrationStatus = 'uncalibrated' | 'low' | 'medium' | 'high';

// ============================================
// Celestial Object Types
// ============================================

/**
 * Star data from catalog
 */
export interface Star {
  /** Unique identifier (e.g., Hipparcos number) */
  id: number;
  /** Common name if available */
  name?: string;
  /** Bayer designation (e.g., "Alpha Centauri") */
  designation?: string;
  /** Equatorial coordinates (J2000 epoch) */
  coordinates: EquatorialCoordinates;
  /** Apparent visual magnitude (lower = brighter) */
  magnitude: number;
  /** Spectral type (e.g., "G2V" for Sun-like) */
  spectralType?: string;
  /** Color index (B-V) for determining star color */
  colorIndex?: number;
  /** Distance in parsecs */
  distance?: number;
  /** Constellation the star belongs to */
  constellation?: string;
}

/**
 * Star with computed horizontal coordinates
 */
export interface VisibleStar extends Star {
  /** Current horizontal coordinates */
  horizontal: HorizontalCoordinates;
  /** Screen position for rendering */
  screenPosition?: ScreenCoordinates;
  /** Rendered size based on magnitude */
  renderSize: number;
  /** RGB color based on spectral type */
  color: string;
}

/**
 * Constellation definition
 */
export interface Constellation {
  /** IAU abbreviation (e.g., "UMa" for Ursa Major) */
  abbreviation: string;
  /** Full name */
  name: string;
  /** Latin genitive form */
  genitive: string;
  /** Star IDs that form the constellation pattern */
  stars: number[];
  /** Line connections between star indices in the stars array */
  lines: [number, number][];
  /** Center point for labeling */
  center: EquatorialCoordinates;
  /** Mythology/description */
  description?: string;
}

/**
 * Constellation with visibility info
 */
export interface VisibleConstellation extends Constellation {
  /** Whether the constellation is currently visible */
  isVisible: boolean;
  /** Percentage of constellation above horizon */
  visibilityPercentage: number;
  /** Screen position for label */
  labelPosition?: ScreenCoordinates;
}

// ============================================
// Astronomical Event Types
// ============================================

export type EventType =
  | 'meteor_shower'
  | 'eclipse'
  | 'conjunction'
  | 'opposition'
  | 'aurora'
  | 'comet'
  | 'satellite_pass'
  | 'space_weather';

export type EventPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * Astronomical event
 */
export interface AstronomicalEvent {
  /** Unique identifier */
  id: string;
  /** Event type */
  type: EventType;
  /** Display name */
  name: string;
  /** Detailed description */
  description: string;
  /** Start time */
  startTime: Date;
  /** End time (if applicable) */
  endTime?: Date;
  /** Peak time (for meteor showers, etc.) */
  peakTime?: Date;
  /** Location in the sky (if applicable) */
  location?: EquatorialCoordinates;
  /** Radiant point for meteor showers */
  radiant?: EquatorialCoordinates;
  /** Expected intensity/activity level */
  intensity?: number;
  /** Priority for notifications */
  priority: EventPriority;
  /** Source of the event data */
  source: string;
  /** URL for more information */
  infoUrl?: string;
  /** Whether visible from user's location */
  visibleFromLocation?: boolean;
}

/**
 * Meteor shower specific data
 */
export interface MeteorShower extends AstronomicalEvent {
  type: 'meteor_shower';
  /** Zenith hourly rate at peak */
  zhr: number;
  /** Parent comet or asteroid */
  parent?: string;
  /** Typical meteor velocity in km/s */
  velocity?: number;
  /** Radiant constellation */
  radiantConstellation: string;
}

/**
 * Aurora forecast data
 */
export interface AuroraForecast {
  /** Kp index (0-9) */
  kpIndex: number;
  /** Forecast time */
  forecastTime: Date;
  /** Visibility line latitude */
  visibilityLatitude: number;
  /** Probability percentage */
  probability: number;
  /** NOAA G-scale (G1-G5) */
  gScale?: string;
}

// ============================================
// App State Types
// ============================================

/**
 * View settings for the star map
 */
export interface ViewSettings {
  /** Show constellation lines */
  showConstellations: boolean;
  /** Show constellation labels */
  showLabels: boolean;
  /** Show star names */
  showStarNames: boolean;
  /** Minimum magnitude to display (lower = more stars) */
  magnitudeLimit: number;
  /** Night mode (red UI) */
  nightMode: boolean;
  /** Show compass overlay */
  showCompass: boolean;
  /** Show info panel */
  showInfo: boolean;
  /** Field of view in degrees */
  fieldOfView: number;
}

/**
 * Time settings for time travel feature
 */
export interface TimeSettings {
  /** Whether using real-time or custom time */
  useRealTime: boolean;
  /** Custom date/time if not using real-time */
  customTime?: Date;
  /** Animation speed multiplier (1 = real-time) */
  timeSpeed: number;
}

/**
 * App settings
 */
export interface AppSettings {
  view: ViewSettings;
  time: TimeSettings;
  /** Whether to show calibration instructions */
  showCalibrationHelp: boolean;
  /** Whether first launch */
  isFirstLaunch: boolean;
  /** Preferred units */
  units: 'metric' | 'imperial';
}

/**
 * Location permission status
 */
export type PermissionStatus = 'undetermined' | 'granted' | 'denied';

/**
 * App-wide state
 */
export interface AppState {
  /** User's current location */
  location: GeographicCoordinates | null;
  /** Location permission status */
  locationPermission: PermissionStatus;
  /** Motion sensor permission status */
  motionPermission: PermissionStatus;
  /** Current device orientation */
  orientation: DeviceOrientation | null;
  /** Where device is pointing */
  pointing: DevicePointing | null;
  /** Current observation time */
  observationTime: Date;
  /** Loading state */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** App settings */
  settings: AppSettings;
}

// ============================================
// Utility Types
// ============================================

/**
 * Observer information for calculations
 */
export interface Observer {
  /** Geographic position */
  location: GeographicCoordinates;
  /** Observation date/time */
  time: Date;
}

/**
 * Viewport for culling calculations
 */
export interface Viewport {
  /** Center of view in horizontal coordinates */
  center: HorizontalCoordinates;
  /** Horizontal field of view in degrees */
  fovHorizontal: number;
  /** Vertical field of view in degrees */
  fovVertical: number;
  /** Screen width in pixels */
  width: number;
  /** Screen height in pixels */
  height: number;
}

/**
 * Result of visibility check
 */
export interface VisibilityResult {
  /** Whether object is above horizon */
  aboveHorizon: boolean;
  /** Whether object is in current viewport */
  inViewport: boolean;
  /** Angular distance from viewport center */
  angularDistance: number;
}
