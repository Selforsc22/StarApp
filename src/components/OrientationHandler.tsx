/**
 * Orientation Handler Component
 *
 * Manages device orientation and location services for the star map.
 * Provides:
 * - Permission handling for location and motion sensors
 * - Sensor initialization and updates
 * - Calibration status display
 * - Error handling and user guidance
 * - Web platform fallback with default location
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  GeographicCoordinates,
  DevicePointing,
  CalibrationStatus,
} from '../types';
import { sensorManager } from '../services/sensorManager';

interface OrientationHandlerProps {
  onLocationUpdate: (location: GeographicCoordinates) => void;
  onOrientationUpdate: (pointing: DevicePointing) => void;
  onError?: (error: string) => void;
  children: React.ReactNode;
}

interface SensorAvailability {
  accelerometer: boolean;
  gyroscope: boolean;
  magnetometer: boolean;
  deviceMotion: boolean;
  location: boolean;
}

// Default location (New York City) for web fallback
const DEFAULT_LOCATION: GeographicCoordinates = {
  latitude: 40.7128,
  longitude: -74.006,
  elevation: 10,
};

// Default pointing direction (looking south, 45 degrees up)
const DEFAULT_POINTING: DevicePointing = {
  pointing: {
    altitude: 45,
    azimuth: 180,
  },
  fieldOfView: 60,
  calibrationStatus: 'medium',
};

export function OrientationHandler({
  onLocationUpdate,
  onOrientationUpdate,
  onError,
  children,
}: OrientationHandlerProps): JSX.Element {
  const [isInitializing, setIsInitializing] = useState(true);
  const [sensorAvailability, setSensorAvailability] = useState<SensorAvailability | null>(null);
  const [calibrationStatus, setCalibrationStatus] = useState<CalibrationStatus>('uncalibrated');
  const [showCalibrationModal, setShowCalibrationModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [isWeb, setIsWeb] = useState(false);

  // Initialize sensors
  useEffect(() => {
    async function initializeSensors() {
      try {
        setIsInitializing(true);

        // Check if running on web
        const isWebPlatform = Platform.OS === 'web';
        setIsWeb(isWebPlatform);

        if (isWebPlatform) {
          // Web platform: use defaults and try to get location from browser
          console.log('Running on web - using default orientation');

          // Try to get browser geolocation
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (position) => {
                const webLocation: GeographicCoordinates = {
                  latitude: position.coords.latitude,
                  longitude: position.coords.longitude,
                  elevation: position.coords.altitude || undefined,
                };
                onLocationUpdate(webLocation);
              },
              (err) => {
                console.log('Browser geolocation failed, using default:', err.message);
                onLocationUpdate(DEFAULT_LOCATION);
              },
              { enableHighAccuracy: true, timeout: 5000 }
            );
          } else {
            onLocationUpdate(DEFAULT_LOCATION);
          }

          // Use default pointing for web (user can't point phone at sky on web)
          onOrientationUpdate(DEFAULT_POINTING);
          setCalibrationStatus('medium');
          setIsInitializing(false);
          return;
        }

        // Native platform: initialize real sensors
        const availability = await sensorManager.initialize();
        setSensorAvailability(availability);

        // Check if we have required sensors
        if (!availability.location) {
          // Don't block - use default location
          console.log('Location not available, using default');
          onLocationUpdate(DEFAULT_LOCATION);
        }

        if (!availability.deviceMotion && !availability.accelerometer) {
          setError('Motion sensors are not available on this device.');
        }

        if (!availability.magnetometer) {
          setError('Compass is not available. Directional accuracy may be limited.');
        }

        // Start sensors
        await sensorManager.start();

        // Subscribe to updates
        const unsubscribeOrientation = sensorManager.onOrientationUpdate(onOrientationUpdate);
        const unsubscribeLocation = sensorManager.onLocationUpdate(onLocationUpdate);
        const unsubscribeCalibration = sensorManager.onCalibrationUpdate(setCalibrationStatus);

        // Get initial values
        const initialLocation = sensorManager.getLocation();
        if (initialLocation) {
          onLocationUpdate(initialLocation);
        } else {
          // Use default if no location available yet
          onLocationUpdate(DEFAULT_LOCATION);
        }

        // Provide initial orientation
        const initialPointing = sensorManager.getPointing();
        if (initialPointing) {
          onOrientationUpdate(initialPointing);
        } else {
          onOrientationUpdate(DEFAULT_POINTING);
        }

        setIsInitializing(false);

        // Cleanup on unmount
        return () => {
          unsubscribeOrientation();
          unsubscribeLocation();
          unsubscribeCalibration();
          sensorManager.stop();
        };
      } catch (err) {
        console.error('Failed to initialize sensors:', err);
        // Don't block on error - use defaults
        onLocationUpdate(DEFAULT_LOCATION);
        onOrientationUpdate(DEFAULT_POINTING);
        setError('Sensors unavailable - using default location.');
        setIsInitializing(false);
      }
    }

    initializeSensors();
  }, [onLocationUpdate, onOrientationUpdate]);

  // Show calibration instructions
  const showCalibrationInstructions = useCallback(() => {
    setShowCalibrationModal(true);
  }, []);

  // Handle permission request retry
  const handleRetryPermissions = useCallback(async () => {
    setPermissionDenied(false);
    setError(null);
    setIsInitializing(true);

    try {
      const availability = await sensorManager.initialize();
      setSensorAvailability(availability);

      if (availability.location) {
        await sensorManager.start();
      } else {
        onLocationUpdate(DEFAULT_LOCATION);
      }
      setIsInitializing(false);
    } catch (err) {
      setError('Failed to get permissions.');
      onLocationUpdate(DEFAULT_LOCATION);
      onOrientationUpdate(DEFAULT_POINTING);
      setIsInitializing(false);
    }
  }, [onLocationUpdate, onOrientationUpdate]);

  // Render loading state
  if (isInitializing) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4488ff" />
          <Text style={styles.loadingText}>Initializing sensors...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Main content */}
      {children}

      {/* Web platform notice */}
      {isWeb && (
        <View style={styles.webNotice}>
          <Ionicons name="desktop-outline" size={16} color="#4488ff" />
          <Text style={styles.webNoticeText}>
            Web mode - using default location. For full experience, use mobile app.
          </Text>
        </View>
      )}

      {/* Calibration indicator */}
      {!isWeb && calibrationStatus !== 'high' && (
        <TouchableOpacity
          style={styles.calibrationIndicator}
          onPress={showCalibrationInstructions}
        >
          <Ionicons
            name="compass-outline"
            size={20}
            color={getCalibrationColor(calibrationStatus)}
          />
          <Text style={[styles.calibrationText, { color: getCalibrationColor(calibrationStatus) }]}>
            {getCalibrationLabel(calibrationStatus)}
          </Text>
        </TouchableOpacity>
      )}

      {/* Error banner */}
      {error && !permissionDenied && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning-outline" size={16} color="#ffaa00" />
          <Text style={styles.errorBannerText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)}>
            <Ionicons name="close" size={16} color="#ffffff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Calibration modal */}
      <Modal
        visible={showCalibrationModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCalibrationModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Compass Calibration</Text>

            <View style={styles.calibrationAnimation}>
              <Ionicons name="phone-portrait-outline" size={80} color="#4488ff" />
              <Text style={styles.figure8}>∞</Text>
            </View>

            <Text style={styles.modalText}>
              Move your device in a figure-8 pattern several times to calibrate the compass.
            </Text>

            <Text style={styles.modalHint}>
              Make sure you're away from metal objects, magnets, and electronic devices that might
              interfere with the compass.
            </Text>

            <View style={styles.calibrationStatusContainer}>
              <Text style={styles.calibrationStatusLabel}>Current Status:</Text>
              <View
                style={[
                  styles.calibrationStatusDot,
                  { backgroundColor: getCalibrationColor(calibrationStatus) },
                ]}
              />
              <Text style={[styles.calibrationStatusText, { color: getCalibrationColor(calibrationStatus) }]}>
                {getCalibrationLabel(calibrationStatus)}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setShowCalibrationModal(false)}
            >
              <Text style={styles.modalButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/**
 * Get calibration status color
 */
function getCalibrationColor(status: CalibrationStatus): string {
  switch (status) {
    case 'high':
      return '#44ff44';
    case 'medium':
      return '#ffaa00';
    case 'low':
      return '#ff6600';
    case 'uncalibrated':
    default:
      return '#ff4444';
  }
}

/**
 * Get calibration status label
 */
function getCalibrationLabel(status: CalibrationStatus): string {
  switch (status) {
    case 'high':
      return 'Calibrated';
    case 'medium':
      return 'Fair';
    case 'low':
      return 'Poor';
    case 'uncalibrated':
    default:
      return 'Uncalibrated';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000011',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: '#ffffff',
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    color: '#aaaaaa',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  errorHint: {
    color: '#666666',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 16,
  },
  retryButton: {
    backgroundColor: '#4488ff',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  calibrationIndicator: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  calibrationText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '500',
  },
  webNotice: {
    position: 'absolute',
    top: 40,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 40, 80, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  webNoticeText: {
    flex: 1,
    color: '#88bbff',
    fontSize: 12,
    marginLeft: 8,
  },
  errorBanner: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(50, 40, 0, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  errorBannerText: {
    flex: 1,
    color: '#ffffff',
    fontSize: 12,
    marginLeft: 8,
    marginRight: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  calibrationAnimation: {
    alignItems: 'center',
    marginVertical: 24,
  },
  figure8: {
    position: 'absolute',
    bottom: -20,
    fontSize: 48,
    color: '#4488ff',
    opacity: 0.5,
  },
  modalText: {
    color: '#ffffff',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  modalHint: {
    color: '#888888',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 20,
  },
  calibrationStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  calibrationStatusLabel: {
    color: '#888888',
    fontSize: 12,
    marginRight: 8,
  },
  calibrationStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  calibrationStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  modalButton: {
    backgroundColor: '#4488ff',
    paddingHorizontal: 48,
    paddingVertical: 12,
    borderRadius: 8,
  },
  modalButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default OrientationHandler;
