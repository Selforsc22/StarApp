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
  TextInput,
  FlatList,
  Keyboard,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, addHours, addDays, addMinutes, setHours, setMinutes, startOfDay } from 'date-fns';

import {
  GeographicCoordinates,
  DevicePointing,
  ViewSettings,
  TimeSettings,
  AppSettings,
  Star,
} from './types';
import { StarMap, ViewDirection } from './components/StarMap';
import { starCatalog } from './services/starCatalog';
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
  const [currentView, setCurrentView] = useState<ViewDirection>({ azimuth: 180, altitude: 45 });
  const [observationTime, setObservationTime] = useState<Date>(new Date());
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [showEvents, setShowEvents] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [isStarPanelVisible, setIsStarPanelVisible] = useState(false);
  const [targetStar, setTargetStar] = useState<Star | null>(null);
  const [showTimeTravel, setShowTimeTravel] = useState(false);
  const [showWhatsUp, setShowWhatsUp] = useState(false);

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

  // Handle view direction changes from StarMap (includes manual scrolling)
  const handleViewChange = useCallback((view: ViewDirection) => {
    setCurrentView(view);
  }, []);

  // Handle star info panel visibility changes
  const handlePanelVisibilityChange = useCallback((isVisible: boolean) => {
    setIsStarPanelVisible(isVisible);
  }, []);

  // Handle star selection from search
  const handleSearchSelectStar = useCallback((star: Star) => {
    setTargetStar(star);
    setShowSearch(false);
  }, []);

  // Handle time travel - set custom observation time
  const handleSetCustomTime = useCallback((newTime: Date) => {
    setObservationTime(newTime);
    setSettings((prev) => ({
      ...prev,
      time: { ...prev.time, useRealTime: false },
    }));
  }, []);

  // Reset to real time
  const handleResetToRealTime = useCallback(() => {
    setObservationTime(new Date());
    setSettings((prev) => ({
      ...prev,
      time: { ...prev.time, useRealTime: true },
    }));
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
          onViewChange={handleViewChange}
          onPanelVisibilityChange={handlePanelVisibilityChange}
          targetStar={targetStar}
          onTargetStarReached={() => setTargetStar(null)}
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

              {/* Time (tappable to open time travel) */}
              <TouchableOpacity style={styles.infoItem} onPress={() => setShowTimeTravel(true)}>
                <Ionicons
                  name={settings.time.useRealTime ? 'time-outline' : 'time'}
                  size={14}
                  color={settings.view.nightMode ? '#ff6666' : '#88aaff'}
                />
                <Text style={[styles.infoText, nightModeStyle, !settings.time.useRealTime && styles.timeTravelActive]}>
                  {format(observationTime, 'HH:mm:ss')}
                </Text>
              </TouchableOpacity>

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

        {/* Pointing Info (Center) - Shows current view direction (hidden when star panel open) */}
        {settings.view.showInfo && !isStarPanelVisible && (
          <View style={styles.pointingInfo}>
            <Text style={[styles.pointingText, nightModeStyle]}>
              {formatAzimuth(currentView.azimuth)}
            </Text>
            <Text style={[styles.pointingAltitude, nightModeStyle]}>
              Alt: {formatAltitude(currentView.altitude)}
            </Text>
          </View>
        )}

        {/* Compass Indicator - Rotates based on view direction */}
        {settings.view.showCompass && (
          <View style={styles.compassContainer}>
            <View
              style={[
                styles.compassRose,
                { transform: [{ rotate: `${-currentView.azimuth}deg` }] },
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
              onPress={() => setShowWhatsUp(true)}
            >
              <Ionicons
                name="telescope"
                size={24}
                color={settings.view.nightMode ? '#ff6666' : '#ffffff'}
              />
              <Text style={[styles.toolbarButtonText, nightModeStyle]}>Tonight</Text>
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

        {/* Search Modal */}
        <SearchModal
          visible={showSearch}
          onClose={() => setShowSearch(false)}
          onSelectStar={handleSearchSelectStar}
          nightMode={settings.view.nightMode}
        />

        {/* Time Travel Modal */}
        <TimeTravelModal
          visible={showTimeTravel}
          onClose={() => setShowTimeTravel(false)}
          currentTime={observationTime}
          onSetTime={handleSetCustomTime}
          onResetToNow={handleResetToRealTime}
          isRealTime={settings.time.useRealTime}
          nightMode={settings.view.nightMode}
        />

        {/* What's Up Tonight Modal */}
        <WhatsUpModal
          visible={showWhatsUp}
          onClose={() => setShowWhatsUp(false)}
          onShowEvents={() => setShowEvents(true)}
          location={location}
          observationTime={observationTime}
          nightMode={settings.view.nightMode}
        />

        {/* Time Travel Indicator (shown when not in real-time) */}
        {!settings.time.useRealTime && (
          <TouchableOpacity
            style={[styles.timeTravelIndicator, settings.view.nightMode && styles.timeTravelIndicatorNight]}
            onPress={() => setShowTimeTravel(true)}
          >
            <Ionicons name="time" size={16} color={settings.view.nightMode ? '#ff6666' : '#4488ff'} />
            <Text style={[styles.timeTravelIndicatorText, settings.view.nightMode && { color: '#ff6666' }]}>
              {format(observationTime, 'MMM d, yyyy HH:mm')}
            </Text>
            <TouchableOpacity onPress={handleResetToRealTime} style={styles.timeTravelResetButton}>
              <Ionicons name="refresh" size={14} color={settings.view.nightMode ? '#ff6666' : '#ffffff'} />
            </TouchableOpacity>
          </TouchableOpacity>
        )}
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
          {/* Drag Handle */}
          <View style={styles.dragHandle} />
          <View style={styles.settingsHeader}>
            <Text style={[styles.settingsTitle, { color: textColor }]}>Settings</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={textColor} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.settingsBody} showsVerticalScrollIndicator={false}>
            {/* UI Elements Section */}
            <View style={styles.settingsSection}>
              <View style={styles.settingsSectionHeader}>
                <Ionicons name="eye-outline" size={18} color={accentColor} />
                <Text style={[styles.settingsSectionTitle, { color: textColor }]}>UI Elements</Text>
              </View>

              <View style={styles.settingsCard}>
                <View style={styles.settingsRow}>
                  <View style={styles.settingsLabelContainer}>
                    <Text style={[styles.settingsLabel, { color: textColor }]}>Constellations</Text>
                    <Text style={[styles.settingsHint, { color: textColor }]}>Show constellation lines</Text>
                  </View>
                  <Switch
                    value={settings.view.showConstellations}
                    onValueChange={(value) => onUpdateView({ showConstellations: value })}
                    trackColor={{ false: '#333', true: accentColor }}
                    thumbColor="#fff"
                  />
                </View>

                <View style={styles.settingsDivider} />

                <View style={styles.settingsRow}>
                  <View style={styles.settingsLabelContainer}>
                    <Text style={[styles.settingsLabel, { color: textColor }]}>Labels</Text>
                    <Text style={[styles.settingsHint, { color: textColor }]}>Show star and constellation names</Text>
                  </View>
                  <Switch
                    value={settings.view.showLabels}
                    onValueChange={(value) => onUpdateView({ showLabels: value })}
                    trackColor={{ false: '#333', true: accentColor }}
                    thumbColor="#fff"
                  />
                </View>

                <View style={styles.settingsDivider} />

                <View style={styles.settingsRow}>
                  <View style={styles.settingsLabelContainer}>
                    <Text style={[styles.settingsLabel, { color: textColor }]}>Compass</Text>
                    <Text style={[styles.settingsHint, { color: textColor }]}>Show direction indicator</Text>
                  </View>
                  <Switch
                    value={settings.view.showCompass}
                    onValueChange={(value) => onUpdateView({ showCompass: value })}
                    trackColor={{ false: '#333', true: accentColor }}
                    thumbColor="#fff"
                  />
                </View>

                <View style={styles.settingsDivider} />

                <View style={styles.settingsRow}>
                  <View style={styles.settingsLabelContainer}>
                    <Text style={[styles.settingsLabel, { color: textColor }]}>Info Bar</Text>
                    <Text style={[styles.settingsHint, { color: textColor }]}>Show location and time</Text>
                  </View>
                  <Switch
                    value={settings.view.showInfo}
                    onValueChange={(value) => onUpdateView({ showInfo: value })}
                    trackColor={{ false: '#333', true: accentColor }}
                    thumbColor="#fff"
                  />
                </View>

                <View style={styles.settingsDivider} />

                <View style={styles.settingsRow}>
                  <View style={styles.settingsLabelContainer}>
                    <Text style={[styles.settingsLabel, { color: textColor }]}>Night Mode</Text>
                    <Text style={[styles.settingsHint, { color: textColor }]}>Red UI to preserve dark adaptation</Text>
                  </View>
                  <Switch
                    value={settings.view.nightMode}
                    onValueChange={(value) => onUpdateView({ nightMode: value })}
                    trackColor={{ false: '#333', true: accentColor }}
                    thumbColor="#fff"
                  />
                </View>
              </View>
            </View>

            {/* Star Visibility Section */}
            <View style={styles.settingsSection}>
              <View style={styles.settingsSectionHeader}>
                <Ionicons name="star-outline" size={18} color={accentColor} />
                <Text style={[styles.settingsSectionTitle, { color: textColor }]}>Star Visibility</Text>
              </View>

              <View style={styles.settingsCard}>
                <Text style={[styles.settingsCardLabel, { color: textColor }]}>
                  Magnitude Limit: {settings.view.magnitudeLimit.toFixed(1)}
                </Text>
                <Text style={[styles.settingsCardHint, { color: textColor }]}>
                  Lower values show only bright stars. Higher values show fainter stars.
                </Text>
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
              </View>
            </View>

            {/* Field of View Section */}
            <View style={styles.settingsSection}>
              <View style={styles.settingsSectionHeader}>
                <Ionicons name="scan-outline" size={18} color={accentColor} />
                <Text style={[styles.settingsSectionTitle, { color: textColor }]}>Field of View</Text>
              </View>

              <View style={styles.settingsCard}>
                <Text style={[styles.settingsCardLabel, { color: textColor }]}>
                  Current: {settings.view.fieldOfView}°
                </Text>
                <Text style={[styles.settingsCardHint, { color: textColor }]}>
                  Narrow (30°) for detail, wide (120°) for overview.
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
              </View>
            </View>

            {/* About Section */}
            <View style={styles.settingsSection}>
              <View style={styles.settingsSectionHeader}>
                <Ionicons name="information-circle-outline" size={18} color={accentColor} />
                <Text style={[styles.settingsSectionTitle, { color: textColor }]}>About</Text>
              </View>

              <View style={styles.settingsCard}>
                <Text style={[styles.aboutText, { color: textColor }]}>
                  Star Map v1.0.0{'\n\n'}
                  Astronomical calculations using J2000 epoch coordinates.{'\n\n'}
                  Star data from Hipparcos Catalog.
                </Text>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Search Modal Component
 * Allows users to search for stars by name or constellation
 */
interface SearchModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectStar: (star: Star) => void;
  nightMode: boolean;
}

function SearchModal({
  visible,
  onClose,
  onSelectStar,
  nightMode,
}: SearchModalProps): JSX.Element {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Star[]>([]);
  const [allStars, setAllStars] = useState<Star[]>([]);

  const textColor = nightMode ? '#ff6666' : '#ffffff';
  const accentColor = nightMode ? '#ff6666' : '#4488ff';

  // Load stars when modal becomes visible
  useEffect(() => {
    if (visible) {
      starCatalog.load().then(() => {
        const stars = starCatalog.getStarsByMagnitude(6.0);
        setAllStars(stars);
        // Show popular stars initially
        const popularStars = stars
          .filter(s => s.name)
          .sort((a, b) => a.magnitude - b.magnitude)
          .slice(0, 20);
        setSearchResults(popularStars);
      });
    }
  }, [visible]);

  // Filter stars based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      // Show popular named stars when no search
      const popularStars = allStars
        .filter(s => s.name)
        .sort((a, b) => a.magnitude - b.magnitude)
        .slice(0, 20);
      setSearchResults(popularStars);
      return;
    }

    const query = searchQuery.toLowerCase().trim();
    const results = allStars
      .filter(star => {
        const nameMatch = star.name?.toLowerCase().includes(query);
        const constellationMatch = star.constellation?.toLowerCase().includes(query);
        return nameMatch || constellationMatch;
      })
      .sort((a, b) => a.magnitude - b.magnitude)
      .slice(0, 30);

    setSearchResults(results);
  }, [searchQuery, allStars]);

  const handleSelectStar = useCallback((star: Star) => {
    Keyboard.dismiss();
    onSelectStar(star);
  }, [onSelectStar]);

  const renderStarItem = useCallback(({ item }: { item: Star }) => (
    <TouchableOpacity
      style={styles.searchResultItem}
      onPress={() => handleSelectStar(item)}
      activeOpacity={0.7}
    >
      <View style={styles.searchResultContent}>
        <Text style={[styles.searchResultName, { color: textColor }]}>
          {item.name || `HIP ${item.id}`}
        </Text>
        <Text style={[styles.searchResultDetails, { color: textColor }]}>
          {item.constellation ? `${item.constellation} • ` : ''}
          Mag {item.magnitude.toFixed(1)}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={textColor} style={{ opacity: 0.5 }} />
    </TouchableOpacity>
  ), [textColor, handleSelectStar]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.searchOverlay}>
        <View style={[styles.searchContent, nightMode && styles.searchContentNight]}>
          {/* Drag Handle */}
          <View style={styles.dragHandle} />

          {/* Header */}
          <View style={styles.searchHeader}>
            <Text style={[styles.searchTitle, { color: textColor }]}>Find a Star</Text>
            <TouchableOpacity onPress={onClose} style={styles.searchCloseButton}>
              <Ionicons name="close" size={24} color={textColor} />
            </TouchableOpacity>
          </View>

          {/* Search Input */}
          <View style={[styles.searchInputContainer, nightMode && styles.searchInputContainerNight]}>
            <Ionicons name="search" size={20} color={nightMode ? '#ff6666' : '#888888'} />
            <TextInput
              style={[styles.searchInput, { color: textColor }]}
              placeholder="Search by star name or constellation..."
              placeholderTextColor={nightMode ? '#993333' : '#666666'}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color={nightMode ? '#993333' : '#666666'} />
              </TouchableOpacity>
            )}
          </View>

          {/* Results hint */}
          <Text style={[styles.searchHint, { color: textColor }]}>
            {searchQuery ? `${searchResults.length} results` : 'Popular stars'}
          </Text>

          {/* Results List */}
          <FlatList
            data={searchResults}
            renderItem={renderStarItem}
            keyExtractor={(item) => String(item.id)}
            style={styles.searchResultsList}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.searchEmpty}>
                <Ionicons name="star-outline" size={48} color={nightMode ? '#993333' : '#333333'} />
                <Text style={[styles.searchEmptyText, { color: textColor }]}>
                  No stars found matching "{searchQuery}"
                </Text>
              </View>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

/**
 * Time Travel Modal Component
 * Allows users to change observation date/time
 */
interface TimeTravelModalProps {
  visible: boolean;
  onClose: () => void;
  currentTime: Date;
  onSetTime: (time: Date) => void;
  onResetToNow: () => void;
  isRealTime: boolean;
  nightMode: boolean;
}

function TimeTravelModal({
  visible,
  onClose,
  currentTime,
  onSetTime,
  onResetToNow,
  isRealTime,
  nightMode,
}: TimeTravelModalProps): JSX.Element {
  const textColor = nightMode ? '#ff6666' : '#ffffff';
  const accentColor = nightMode ? '#ff6666' : '#4488ff';

  // Quick time jumps
  const timeJumps = [
    { label: '-1 month', delta: () => addDays(currentTime, -30) },
    { label: '-1 week', delta: () => addDays(currentTime, -7) },
    { label: '-1 day', delta: () => addDays(currentTime, -1) },
    { label: '-1 hour', delta: () => addHours(currentTime, -1) },
    { label: '+1 hour', delta: () => addHours(currentTime, 1) },
    { label: '+1 day', delta: () => addDays(currentTime, 1) },
    { label: '+1 week', delta: () => addDays(currentTime, 7) },
    { label: '+1 month', delta: () => addDays(currentTime, 30) },
  ];

  // Time of day presets
  const timePresets = [
    { label: 'Sunset', hour: 19, minute: 0 },
    { label: 'Dusk', hour: 21, minute: 0 },
    { label: 'Midnight', hour: 0, minute: 0 },
    { label: 'Dawn', hour: 5, minute: 0 },
  ];

  const handleTimePreset = (hour: number, minute: number) => {
    let newTime = setHours(currentTime, hour);
    newTime = setMinutes(newTime, minute);
    onSetTime(newTime);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.searchOverlay}>
        <View style={[styles.searchContent, nightMode && styles.searchContentNight, { minHeight: '50%' }]}>
          <View style={styles.dragHandle} />

          <View style={styles.searchHeader}>
            <Text style={[styles.searchTitle, { color: textColor }]}>Time Travel</Text>
            <TouchableOpacity onPress={onClose} style={styles.searchCloseButton}>
              <Ionicons name="close" size={24} color={textColor} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
            {/* Current Time Display */}
            <View style={[styles.timeTravelCurrentTime, nightMode && { borderColor: 'rgba(255, 102, 102, 0.3)' }]}>
              <Text style={[styles.timeTravelDateDisplay, { color: textColor }]}>
                {format(currentTime, 'EEEE, MMMM d, yyyy')}
              </Text>
              <Text style={[styles.timeTravelTimeDisplay, { color: accentColor }]}>
                {format(currentTime, 'HH:mm:ss')}
              </Text>
              {!isRealTime && (
                <View style={styles.timeTravelBadge}>
                  <Ionicons name="time" size={12} color={accentColor} />
                  <Text style={[styles.timeTravelBadgeText, { color: accentColor }]}>Time Travel Active</Text>
                </View>
              )}
            </View>

            {/* Reset to Now Button */}
            <TouchableOpacity
              style={[styles.timeTravelResetNow, { borderColor: accentColor }]}
              onPress={() => {
                onResetToNow();
                onClose();
              }}
            >
              <Ionicons name="refresh" size={18} color={accentColor} />
              <Text style={[styles.timeTravelResetNowText, { color: accentColor }]}>
                {isRealTime ? 'Currently showing real time' : 'Return to Now'}
              </Text>
            </TouchableOpacity>

            {/* Time Jumps */}
            <Text style={[styles.timeTravelSectionTitle, { color: textColor }]}>Jump By</Text>
            <View style={styles.timeTravelJumps}>
              {timeJumps.map((jump, index) => (
                <TouchableOpacity
                  key={index}
                  style={[styles.timeTravelJumpButton, { borderColor: accentColor }]}
                  onPress={() => onSetTime(jump.delta())}
                >
                  <Text style={[styles.timeTravelJumpText, { color: textColor }]}>{jump.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Time of Day Presets */}
            <Text style={[styles.timeTravelSectionTitle, { color: textColor }]}>Time of Day</Text>
            <View style={styles.timeTravelPresets}>
              {timePresets.map((preset, index) => (
                <TouchableOpacity
                  key={index}
                  style={[styles.timeTravelPresetButton, { backgroundColor: accentColor }]}
                  onPress={() => handleTimePreset(preset.hour, preset.minute)}
                >
                  <Text style={styles.timeTravelPresetText}>{preset.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Quick Date Access */}
            <Text style={[styles.timeTravelSectionTitle, { color: textColor }]}>Quick Dates</Text>
            <View style={styles.timeTravelPresets}>
              <TouchableOpacity
                style={[styles.timeTravelPresetButton, { backgroundColor: 'rgba(255,255,255,0.1)' }]}
                onPress={() => onSetTime(startOfDay(new Date()))}
              >
                <Text style={[styles.timeTravelPresetText, { color: textColor }]}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.timeTravelPresetButton, { backgroundColor: 'rgba(255,255,255,0.1)' }]}
                onPress={() => onSetTime(addDays(startOfDay(new Date()), 1))}
              >
                <Text style={[styles.timeTravelPresetText, { color: textColor }]}>Tomorrow</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.timeTravelPresetButton, { backgroundColor: 'rgba(255,255,255,0.1)' }]}
                onPress={() => onSetTime(addDays(startOfDay(new Date()), 7))}
              >
                <Text style={[styles.timeTravelPresetText, { color: textColor }]}>Next Week</Text>
              </TouchableOpacity>
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/**
 * What's Up Tonight Modal Component
 * Shows summary of visible celestial objects
 */
interface WhatsUpModalProps {
  visible: boolean;
  onClose: () => void;
  onShowEvents: () => void;
  location: GeographicCoordinates | null;
  observationTime: Date;
  nightMode: boolean;
}

// Moon phase calculation
function getMoonPhase(date: Date): { phase: string; illumination: number; emoji: string } {
  // Simplified moon phase calculation
  const lunarCycle = 29.53059;
  const knownNewMoon = new Date('2000-01-06T18:14:00Z').getTime();
  const daysSinceNewMoon = (date.getTime() - knownNewMoon) / (1000 * 60 * 60 * 24);
  const currentCycleDay = daysSinceNewMoon % lunarCycle;
  const phasePercent = currentCycleDay / lunarCycle;

  let phase: string;
  let emoji: string;

  if (phasePercent < 0.03 || phasePercent > 0.97) {
    phase = 'New Moon';
    emoji = '🌑';
  } else if (phasePercent < 0.22) {
    phase = 'Waxing Crescent';
    emoji = '🌒';
  } else if (phasePercent < 0.28) {
    phase = 'First Quarter';
    emoji = '🌓';
  } else if (phasePercent < 0.47) {
    phase = 'Waxing Gibbous';
    emoji = '🌔';
  } else if (phasePercent < 0.53) {
    phase = 'Full Moon';
    emoji = '🌕';
  } else if (phasePercent < 0.72) {
    phase = 'Waning Gibbous';
    emoji = '🌖';
  } else if (phasePercent < 0.78) {
    phase = 'Last Quarter';
    emoji = '🌗';
  } else {
    phase = 'Waning Crescent';
    emoji = '🌘';
  }

  // Calculate illumination (0-100%)
  const illumination = Math.round((1 - Math.cos(phasePercent * 2 * Math.PI)) * 50);

  return { phase, illumination, emoji };
}

// Planet visibility data (simplified - positions vary throughout year)
interface PlanetInfo {
  name: string;
  symbol: string;
  magnitude: number;
  visible: boolean;
  description: string;
}

function getVisiblePlanets(date: Date): PlanetInfo[] {
  const month = date.getMonth();
  const hour = date.getHours();
  const isNight = hour >= 20 || hour <= 5;

  // Simplified planet visibility - in reality this requires ephemeris calculations
  return [
    {
      name: 'Mercury',
      symbol: '☿',
      magnitude: -0.4,
      visible: isNight && (month === 2 || month === 5 || month === 9),
      description: 'Best seen near horizon after sunset or before sunrise',
    },
    {
      name: 'Venus',
      symbol: '♀',
      magnitude: -4.4,
      visible: isNight && (month >= 1 && month <= 5),
      description: 'The brightest planet, often called the Evening/Morning Star',
    },
    {
      name: 'Mars',
      symbol: '♂',
      magnitude: 0.7,
      visible: isNight && (month >= 6 && month <= 11),
      description: 'The Red Planet, visible with distinctive orange hue',
    },
    {
      name: 'Jupiter',
      symbol: '♃',
      magnitude: -2.5,
      visible: isNight,
      description: 'The largest planet, very bright and easy to spot',
    },
    {
      name: 'Saturn',
      symbol: '♄',
      magnitude: 0.5,
      visible: isNight && (month >= 4 && month <= 10),
      description: 'Famous for its rings, visible through telescope',
    },
  ];
}

function WhatsUpModal({
  visible,
  onClose,
  onShowEvents,
  location,
  observationTime,
  nightMode,
}: WhatsUpModalProps): JSX.Element {
  const textColor = nightMode ? '#ff6666' : '#ffffff';
  const accentColor = nightMode ? '#ff6666' : '#4488ff';

  const moonInfo = getMoonPhase(observationTime);
  const planets = getVisiblePlanets(observationTime);
  const visiblePlanets = planets.filter(p => p.visible);

  const hour = observationTime.getHours();
  const isNightTime = hour >= 20 || hour <= 5;
  const isDusk = hour >= 17 && hour < 20;
  const isDawn = hour >= 5 && hour < 7;

  let skyCondition = 'Daylight';
  if (isNightTime) skyCondition = 'Night Sky';
  else if (isDusk) skyCondition = 'Dusk';
  else if (isDawn) skyCondition = 'Dawn';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.searchOverlay}>
        <View style={[styles.searchContent, nightMode && styles.searchContentNight, { minHeight: '70%' }]}>
          <View style={styles.dragHandle} />

          <View style={styles.searchHeader}>
            <Text style={[styles.searchTitle, { color: textColor }]}>Tonight's Sky</Text>
            <TouchableOpacity onPress={onClose} style={styles.searchCloseButton}>
              <Ionicons name="close" size={24} color={textColor} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
            {/* Sky Condition */}
            <View style={[styles.whatsUpCard, nightMode && { borderColor: 'rgba(255, 102, 102, 0.2)' }]}>
              <View style={styles.whatsUpCardHeader}>
                <Ionicons name="partly-sunny" size={24} color={accentColor} />
                <Text style={[styles.whatsUpCardTitle, { color: textColor }]}>Current Conditions</Text>
              </View>
              <Text style={[styles.whatsUpCardValue, { color: accentColor }]}>{skyCondition}</Text>
              <Text style={[styles.whatsUpCardDescription, { color: textColor }]}>
                {format(observationTime, 'EEEE, MMMM d')} at {format(observationTime, 'h:mm a')}
              </Text>
            </View>

            {/* Moon Phase */}
            <View style={[styles.whatsUpCard, nightMode && { borderColor: 'rgba(255, 102, 102, 0.2)' }]}>
              <View style={styles.whatsUpCardHeader}>
                <Text style={{ fontSize: 24 }}>{moonInfo.emoji}</Text>
                <Text style={[styles.whatsUpCardTitle, { color: textColor }]}>Moon Phase</Text>
              </View>
              <Text style={[styles.whatsUpCardValue, { color: accentColor }]}>{moonInfo.phase}</Text>
              <Text style={[styles.whatsUpCardDescription, { color: textColor }]}>
                {moonInfo.illumination}% illuminated
              </Text>
            </View>

            {/* Visible Planets */}
            <View style={[styles.whatsUpCard, nightMode && { borderColor: 'rgba(255, 102, 102, 0.2)' }]}>
              <View style={styles.whatsUpCardHeader}>
                <Ionicons name="planet" size={24} color={accentColor} />
                <Text style={[styles.whatsUpCardTitle, { color: textColor }]}>Visible Planets</Text>
              </View>
              {visiblePlanets.length > 0 ? (
                visiblePlanets.map((planet, index) => (
                  <View key={index} style={styles.whatsUpPlanetItem}>
                    <View style={styles.whatsUpPlanetHeader}>
                      <Text style={[styles.whatsUpPlanetSymbol, { color: accentColor }]}>{planet.symbol}</Text>
                      <Text style={[styles.whatsUpPlanetName, { color: textColor }]}>{planet.name}</Text>
                      <Text style={[styles.whatsUpPlanetMag, { color: textColor }]}>
                        mag {planet.magnitude > 0 ? '+' : ''}{planet.magnitude.toFixed(1)}
                      </Text>
                    </View>
                    <Text style={[styles.whatsUpPlanetDescription, { color: textColor }]}>
                      {planet.description}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={[styles.whatsUpCardDescription, { color: textColor }]}>
                  {isNightTime ? 'No bright planets currently visible' : 'Wait for nightfall to see planets'}
                </Text>
              )}
            </View>

            {/* Upcoming Events Link */}
            <TouchableOpacity
              style={[styles.whatsUpCard, nightMode && { borderColor: 'rgba(255, 102, 102, 0.2)' }]}
              onPress={() => {
                onClose();
                onShowEvents();
              }}
              activeOpacity={0.7}
            >
              <View style={styles.whatsUpCardHeader}>
                <Ionicons name="calendar" size={24} color={accentColor} />
                <Text style={[styles.whatsUpCardTitle, { color: textColor }]}>Upcoming Events</Text>
                <View style={{ flex: 1 }} />
                <Ionicons name="chevron-forward" size={20} color={textColor} style={{ opacity: 0.5 }} />
              </View>
              <Text style={[styles.whatsUpCardDescription, { color: textColor }]}>
                Meteor showers, eclipses, and astronomical events
              </Text>
            </TouchableOpacity>

            {/* Viewing Tips */}
            <View style={[styles.whatsUpCard, nightMode && { borderColor: 'rgba(255, 102, 102, 0.2)' }]}>
              <View style={styles.whatsUpCardHeader}>
                <Ionicons name="bulb" size={24} color={accentColor} />
                <Text style={[styles.whatsUpCardTitle, { color: textColor }]}>Viewing Tips</Text>
              </View>
              <View style={styles.whatsUpTip}>
                <Ionicons name="checkmark-circle" size={16} color={accentColor} />
                <Text style={[styles.whatsUpTipText, { color: textColor }]}>
                  {moonInfo.illumination < 30 ? 'Great night for stargazing - low moon illumination' : 'Bright moon may wash out faint stars'}
                </Text>
              </View>
              <View style={styles.whatsUpTip}>
                <Ionicons name="checkmark-circle" size={16} color={accentColor} />
                <Text style={[styles.whatsUpTipText, { color: textColor }]}>
                  Allow 20-30 minutes for your eyes to adapt to darkness
                </Text>
              </View>
              <View style={styles.whatsUpTip}>
                <Ionicons name="checkmark-circle" size={16} color={accentColor} />
                <Text style={[styles.whatsUpTipText, { color: textColor }]}>
                  Use night mode (red UI) to preserve night vision
                </Text>
              </View>
            </View>

            <View style={{ height: 40 }} />
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
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  toolbarButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: 64,
    minHeight: 56,
    borderRadius: 12,
  },
  toolbarButtonText: {
    color: '#ffffff',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '500',
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
    paddingTop: 8,
  },
  settingsSection: {
    marginBottom: 20,
  },
  settingsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  settingsSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginLeft: 8,
    opacity: 0.8,
  },
  settingsCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 16,
  },
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  settingsLabelContainer: {
    flex: 1,
    marginRight: 16,
  },
  settingsLabel: {
    fontSize: 16,
  },
  settingsHint: {
    fontSize: 12,
    opacity: 0.5,
    marginTop: 2,
  },
  settingsDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 8,
  },
  settingsCardLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  settingsCardHint: {
    fontSize: 12,
    opacity: 0.5,
    marginBottom: 12,
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
  // Drag handle for modals
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  // Search Modal styles
  searchOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  searchContent: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    minHeight: '60%',
  },
  searchContentNight: {
    backgroundColor: '#1a0a0a',
  },
  searchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  searchTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  searchCloseButton: {
    padding: 4,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginHorizontal: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(68, 136, 255, 0.3)',
  },
  searchInputContainerNight: {
    borderColor: 'rgba(255, 102, 102, 0.3)',
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    marginLeft: 12,
    marginRight: 8,
  },
  searchHint: {
    fontSize: 12,
    opacity: 0.6,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  searchResultsList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  searchResultContent: {
    flex: 1,
  },
  searchResultName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  searchResultDetails: {
    fontSize: 13,
    opacity: 0.6,
  },
  searchEmpty: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  searchEmptyText: {
    fontSize: 14,
    opacity: 0.6,
    marginTop: 16,
    textAlign: 'center',
  },
  // Time Travel styles
  timeTravelActive: {
    fontWeight: 'bold',
  },
  timeTravelIndicator: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(68, 136, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(68, 136, 255, 0.3)',
  },
  timeTravelIndicatorNight: {
    backgroundColor: 'rgba(255, 102, 102, 0.2)',
    borderColor: 'rgba(255, 102, 102, 0.3)',
  },
  timeTravelIndicatorText: {
    color: '#ffffff',
    fontSize: 12,
    marginLeft: 6,
    fontWeight: '500',
  },
  timeTravelResetButton: {
    marginLeft: 8,
    padding: 4,
  },
  timeTravelCurrentTime: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(68, 136, 255, 0.3)',
    marginBottom: 20,
  },
  timeTravelDateDisplay: {
    fontSize: 16,
    opacity: 0.8,
  },
  timeTravelTimeDisplay: {
    fontSize: 36,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 4,
  },
  timeTravelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(68, 136, 255, 0.2)',
    borderRadius: 12,
  },
  timeTravelBadgeText: {
    fontSize: 11,
    marginLeft: 4,
    fontWeight: '600',
  },
  timeTravelResetNow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 20,
  },
  timeTravelResetNowText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '500',
  },
  timeTravelSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    opacity: 0.6,
    marginBottom: 12,
    marginTop: 8,
  },
  timeTravelJumps: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  timeTravelJumpButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  timeTravelJumpText: {
    fontSize: 13,
  },
  timeTravelPresets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  timeTravelPresetButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  timeTravelPresetText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '600',
  },
  // What's Up Tonight styles
  whatsUpCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(68, 136, 255, 0.2)',
  },
  whatsUpCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  whatsUpCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 10,
    textTransform: 'uppercase',
    opacity: 0.8,
  },
  whatsUpCardValue: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  whatsUpCardDescription: {
    fontSize: 14,
    opacity: 0.7,
  },
  whatsUpPlanetItem: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  whatsUpPlanetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  whatsUpPlanetSymbol: {
    fontSize: 20,
    width: 30,
  },
  whatsUpPlanetName: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  whatsUpPlanetMag: {
    fontSize: 12,
    opacity: 0.6,
  },
  whatsUpPlanetDescription: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 4,
    marginLeft: 30,
  },
  whatsUpTip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 8,
  },
  whatsUpTipText: {
    fontSize: 13,
    marginLeft: 8,
    flex: 1,
    opacity: 0.8,
  },
});
