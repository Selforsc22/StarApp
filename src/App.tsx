/**
 * Star Map App
 *
 * Main application component that orchestrates:
 * - Device orientation and location services
 * - Star map rendering
 * - Constellation overlays
 * - Event tracking
 * - User interface and settings
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Platform,
  Dimensions,
  Modal,
  Switch,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';

import {
  GeographicCoordinates,
  DevicePointing,
  ViewSettings,
  TimeSettings,
  AppSettings,
} from './types';
import { StarMap } from './components/StarMap';
import { OrientationHandler } from './components/OrientationHandler';
import { EventList } from './components/EventList';
import { sensorManager } from './services/sensorManager';
import { formatAltitude, formatAzimuth } from './services/astronomyCalculations';
import {
  localMeanSiderealTime,
  dateToJulianDate,
  formatSiderealTime,
} from './utils/timeCalculations';

// Default settings
const DEFAULT_VIEW_SETTINGS: ViewSettings = {
  showConstellations: true,
  showLabels: true,
  showStarNames: false,
  magnitudeLimit: 5.5,
  nightMode: false,
  showCompass: true,
  showInfo: true,
  fieldOfView: 60,
};

const DEFAULT_TIME_SETTINGS: TimeSettings = {
  useRealTime: true,
  timeSpeed: 1,
};

const DEFAULT_SETTINGS: AppSettings = {
  view: DEFAULT_VIEW_SETTINGS,
  time: DEFAULT_TIME_SETTINGS,
  showCalibrationHelp: true,
  isFirstLaunch: true,
  units: 'metric',
};

// Get screen dimensions
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function App(): JSX.Element {
  // State
  const [location, setLocation] = useState<GeographicCoordinates | null>(null);
  const [pointing, setPointing] = useState<DevicePointing | null>(null);
  const [observationTime, setObservationTime] = useState<Date>(new Date());
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [showEvents, setShowEvents] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  // Update observation time
  useEffect(() => {
    if (!settings.time.useRealTime) return;

    const interval = setInterval(() => {
      setObservationTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, [settings.time.useRealTime]);

  // Handle location updates
  const handleLocationUpdate = useCallback((newLocation: GeographicCoordinates) => {
    setLocation(newLocation);
  }, []);

  // Handle orientation updates
  const handleOrientationUpdate = useCallback((newPointing: DevicePointing) => {
    setPointing(newPointing);
  }, []);

  // Update view settings
  const updateViewSettings = useCallback((updates: Partial<ViewSettings>) => {
    setSettings((prev) => ({
      ...prev,
      view: { ...prev.view, ...updates },
    }));
  }, []);

  // Calculate sidereal time
  const siderealTime = useMemo(() => {
    if (!location) return null;
    const jd = dateToJulianDate(observationTime);
    const lst = localMeanSiderealTime(jd, location.longitude);
    return formatSiderealTime(lst);
  }, [location, observationTime]);

  // Night mode styles
  const nightModeStyle = settings.view.nightMode
    ? { color: '#ff6666' }
    : { color: '#ffffff' };

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />

      <OrientationHandler
        onLocationUpdate={handleLocationUpdate}
        onOrientationUpdate={handleOrientationUpdate}
      >
        {/* Star Map */}
        <StarMap
          location={location}
          pointing={pointing}
          observationTime={observationTime}
          settings={settings.view}
        />

        {/* Top Info Bar */}
        {settings.view.showInfo && (
          <SafeAreaView style={styles.topBar}>
            <View style={styles.infoContainer}>
              {/* Location */}
              <View style={styles.infoItem}>
                <Ionicons
                  name="location-outline"
                  size={14}
                  color={settings.view.nightMode ? '#ff6666' : '#88aaff'}
                />
                <Text style={[styles.infoText, nightModeStyle]}>
                  {location
                    ? `${Math.abs(location.latitude).toFixed(2)}°${location.latitude >= 0 ? 'N' : 'S'}, ${Math.abs(location.longitude).toFixed(2)}°${location.longitude >= 0 ? 'E' : 'W'}`
                    : 'Locating...'}
                </Text>
              </View>

              {/* Time */}
              <View style={styles.infoItem}>
                <Ionicons
                  name="time-outline"
                  size={14}
                  color={settings.view.nightMode ? '#ff6666' : '#88aaff'}
                />
                <Text style={[styles.infoText, nightModeStyle]}>
                  {format(observationTime, 'HH:mm:ss')}
                </Text>
              </View>

              {/* Sidereal Time */}
              {siderealTime && (
                <View style={styles.infoItem}>
                  <Ionicons
                    name="planet-outline"
                    size={14}
                    color={settings.view.nightMode ? '#ff6666' : '#88aaff'}
                  />
                  <Text style={[styles.infoText, nightModeStyle]}>
                    LST {siderealTime}
                  </Text>
                </View>
              )}
            </View>
          </SafeAreaView>
        )}

        {/* Pointing Info (Center) */}
        {pointing && settings.view.showInfo && (
          <View style={styles.pointingInfo}>
            <Text style={[styles.pointingText, nightModeStyle]}>
              {formatAzimuth(pointing.pointing.azimuth)}
            </Text>
            <Text style={[styles.pointingAltitude, nightModeStyle]}>
              Alt: {formatAltitude(pointing.pointing.altitude)}
            </Text>
          </View>
        )}

        {/* Compass Indicator */}
        {settings.view.showCompass && pointing && (
          <View style={styles.compassContainer}>
            <View
              style={[
                styles.compassRose,
                { transform: [{ rotate: `${-pointing.pointing.azimuth}deg` }] },
              ]}
            >
              <Text style={[styles.compassN, nightModeStyle]}>N</Text>
              <Text style={[styles.compassE, nightModeStyle]}>E</Text>
              <Text style={[styles.compassS, nightModeStyle]}>S</Text>
              <Text style={[styles.compassW, nightModeStyle]}>W</Text>
              <View style={styles.compassNeedle} />
            </View>
          </View>
        )}

        {/* Bottom Toolbar */}
        <SafeAreaView style={styles.bottomBar}>
          <View style={styles.toolbar}>
            <TouchableOpacity
              style={styles.toolbarButton}
              onPress={() => setShowSearch(true)}
            >
              <Ionicons
                name="search"
                size={24}
                color={settings.view.nightMode ? '#ff6666' : '#ffffff'}
              />
              <Text style={[styles.toolbarButtonText, nightModeStyle]}>Search</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toolbarButton}
              onPress={() =>
                updateViewSettings({ showConstellations: !settings.view.showConstellations })
              }
            >
              <Ionicons
                name={settings.view.showConstellations ? 'git-network' : 'git-network-outline'}
                size={24}
                color={
                  settings.view.showConstellations
                    ? settings.view.nightMode
                      ? '#ff6666'
                      : '#4488ff'
                    : settings.view.nightMode
                      ? '#993333'
                      : '#888888'
                }
              />
              <Text
                style={[
                  styles.toolbarButtonText,
                  settings.view.showConstellations ? nightModeStyle : styles.toolbarButtonInactive,
                ]}
              >
                Lines
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toolbarButton}
              onPress={() => setShowEvents(true)}
            >
              <Ionicons
                name="calendar"
                size={24}
                color={settings.view.nightMode ? '#ff6666' : '#ffffff'}
              />
              <Text style={[styles.toolbarButtonText, nightModeStyle]}>Events</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toolbarButton}
              onPress={() => updateViewSettings({ nightMode: !settings.view.nightMode })}
            >
              <Ionicons
                name={settings.view.nightMode ? 'moon' : 'moon-outline'}
                size={24}
                color={settings.view.nightMode ? '#ff6666' : '#ffffff'}
              />
              <Text style={[styles.toolbarButtonText, nightModeStyle]}>Night</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toolbarButton}
              onPress={() => setShowSettings(true)}
            >
              <Ionicons
                name="settings-outline"
                size={24}
                color={settings.view.nightMode ? '#ff6666' : '#ffffff'}
              />
              <Text style={[styles.toolbarButtonText, nightModeStyle]}>Settings</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        {/* Event List Modal */}
        <EventList
          location={location}
          isVisible={showEvents}
          onClose={() => setShowEvents(false)}
        />

        {/* Settings Modal */}
        <SettingsModal
          visible={showSettings}
          settings={settings}
          onClose={() => setShowSettings(false)}
          onUpdateView={updateViewSettings}
          nightMode={settings.view.nightMode}
        />
      </OrientationHandler>
    </View>
  );
}

/**
 * Settings Modal Component
 */
interface SettingsModalProps {
  visible: boolean;
  settings: AppSettings;
  onClose: () => void;
  onUpdateView: (updates: Partial<ViewSettings>) => void;
  nightMode: boolean;
}

function SettingsModal({
  visible,
  settings,
  onClose,
  onUpdateView,
  nightMode,
}: SettingsModalProps): JSX.Element {
  const textColor = nightMode ? '#ff6666' : '#ffffff';
  const accentColor = nightMode ? '#ff6666' : '#4488ff';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.settingsOverlay}>
        <View style={[styles.settingsContent, nightMode && styles.settingsContentNight]}>
          <View style={styles.settingsHeader}>
            <Text style={[styles.settingsTitle, { color: textColor }]}>Settings</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={textColor} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.settingsBody}>
            {/* Display Section */}
            <Text style={[styles.settingsSectionTitle, { color: textColor }]}>Display</Text>

            <View style={styles.settingsRow}>
              <Text style={[styles.settingsLabel, { color: textColor }]}>
                Show Constellation Lines
              </Text>
              <Switch
                value={settings.view.showConstellations}
                onValueChange={(value) => onUpdateView({ showConstellations: value })}
                trackColor={{ false: '#333', true: accentColor }}
                thumbColor="#fff"
              />
            </View>

            <View style={styles.settingsRow}>
              <Text style={[styles.settingsLabel, { color: textColor }]}>
                Show Labels
              </Text>
              <Switch
                value={settings.view.showLabels}
                onValueChange={(value) => onUpdateView({ showLabels: value })}
                trackColor={{ false: '#333', true: accentColor }}
                thumbColor="#fff"
              />
            </View>

            <View style={styles.settingsRow}>
              <Text style={[styles.settingsLabel, { color: textColor }]}>
                Show Compass
              </Text>
              <Switch
                value={settings.view.showCompass}
                onValueChange={(value) => onUpdateView({ showCompass: value })}
                trackColor={{ false: '#333', true: accentColor }}
                thumbColor="#fff"
              />
            </View>

            <View style={styles.settingsRow}>
              <Text style={[styles.settingsLabel, { color: textColor }]}>
                Show Info Bar
              </Text>
              <Switch
                value={settings.view.showInfo}
                onValueChange={(value) => onUpdateView({ showInfo: value })}
                trackColor={{ false: '#333', true: accentColor }}
                thumbColor="#fff"
              />
            </View>

            <View style={styles.settingsRow}>
              <Text style={[styles.settingsLabel, { color: textColor }]}>
                Night Mode (Red UI)
              </Text>
              <Switch
                value={settings.view.nightMode}
                onValueChange={(value) => onUpdateView({ nightMode: value })}
                trackColor={{ false: '#333', true: accentColor }}
                thumbColor="#fff"
              />
            </View>

            {/* Star Visibility Section */}
            <Text style={[styles.settingsSectionTitle, { color: textColor }]}>
              Star Visibility
            </Text>

            <View style={styles.settingsRow}>
              <Text style={[styles.settingsLabel, { color: textColor }]}>
                Magnitude Limit: {settings.view.magnitudeLimit.toFixed(1)}
              </Text>
            </View>
            <View style={styles.magnitudeButtons}>
              {[3.0, 4.0, 5.0, 5.5, 6.0].map((mag) => (
                <TouchableOpacity
                  key={mag}
                  style={[
                    styles.magnitudeButton,
                    settings.view.magnitudeLimit === mag && {
                      backgroundColor: accentColor,
                    },
                  ]}
                  onPress={() => onUpdateView({ magnitudeLimit: mag })}
                >
                  <Text
                    style={[
                      styles.magnitudeButtonText,
                      settings.view.magnitudeLimit === mag && { color: '#000' },
                    ]}
                  >
                    {mag}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Field of View Section */}
            <Text style={[styles.settingsSectionTitle, { color: textColor }]}>
              Field of View
            </Text>

            <View style={styles.fovButtons}>
              {[30, 45, 60, 90, 120].map((fov) => (
                <TouchableOpacity
                  key={fov}
                  style={[
                    styles.fovButton,
                    settings.view.fieldOfView === fov && {
                      backgroundColor: accentColor,
                    },
                  ]}
                  onPress={() => onUpdateView({ fieldOfView: fov })}
                >
                  <Text
                    style={[
                      styles.fovButtonText,
                      settings.view.fieldOfView === fov && { color: '#000' },
                    ]}
                  >
                    {fov}°
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* About Section */}
            <Text style={[styles.settingsSectionTitle, { color: textColor }]}>About</Text>
            <Text style={[styles.aboutText, { color: textColor }]}>
              Star Map v1.0.0{'\n'}
              Astronomical calculations using J2000 epoch coordinates.{'\n'}
              Star data from Hipparcos Catalog.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000011',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 17, 0.7)',
  },
  infoContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoText: {
    color: '#ffffff',
    fontSize: 11,
    marginLeft: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  pointingInfo: {
    position: 'absolute',
    top: '50%',
    left: 16,
    transform: [{ translateY: -30 }],
  },
  pointingText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  pointingAltitude: {
    color: '#aaaaaa',
    fontSize: 12,
    marginTop: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  compassContainer: {
    position: 'absolute',
    top: 100,
    right: 16,
    width: 60,
    height: 60,
  },
  compassRose: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  compassN: {
    position: 'absolute',
    top: 4,
    color: '#ff4444',
    fontSize: 10,
    fontWeight: 'bold',
  },
  compassE: {
    position: 'absolute',
    right: 6,
    color: '#ffffff',
    fontSize: 10,
  },
  compassS: {
    position: 'absolute',
    bottom: 4,
    color: '#ffffff',
    fontSize: 10,
  },
  compassW: {
    position: 'absolute',
    left: 6,
    color: '#ffffff',
    fontSize: 10,
  },
  compassNeedle: {
    width: 2,
    height: 20,
    backgroundColor: '#ff4444',
    borderRadius: 1,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 17, 0.9)',
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  toolbarButton: {
    alignItems: 'center',
    padding: 8,
    minWidth: 60,
  },
  toolbarButtonText: {
    color: '#ffffff',
    fontSize: 10,
    marginTop: 4,
  },
  toolbarButtonInactive: {
    color: '#666666',
  },
  settingsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  settingsContent: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
  },
  settingsContentNight: {
    backgroundColor: '#1a0a0a',
  },
  settingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  settingsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  settingsBody: {
    padding: 20,
  },
  settingsSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 12,
    textTransform: 'uppercase',
    opacity: 0.7,
  },
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  settingsLabel: {
    fontSize: 16,
  },
  magnitudeButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  magnitudeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#2a2a4e',
  },
  magnitudeButtonText: {
    color: '#ffffff',
    fontSize: 14,
  },
  fovButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  fovButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#2a2a4e',
  },
  fovButtonText: {
    color: '#ffffff',
    fontSize: 14,
  },
  aboutText: {
    fontSize: 12,
    opacity: 0.6,
    lineHeight: 20,
    marginBottom: 40,
  },
});
