/**
 * useStarMap Hook
 *
 * Custom React hook that provides a unified interface for the star map functionality.
 * Manages state for location, orientation, settings, and coordinates all star map
 * features.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  GeographicCoordinates,
  DevicePointing,
  ViewSettings,
  TimeSettings,
  AppSettings,
  Star,
  VisibleStar,
  Constellation,
  Observer,
} from '../types';
import { sensorManager } from '../services/sensorManager';
import { starCatalog } from '../services/starCatalog';
import { processStarsForRendering } from '../services/astronomyCalculations';

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

interface UseStarMapResult {
  // State
  location: GeographicCoordinates | null;
  pointing: DevicePointing | null;
  observationTime: Date;
  settings: AppSettings;
  isLoading: boolean;
  error: string | null;

  // Computed data
  observer: Observer | null;
  visibleStars: VisibleStar[];
  constellations: Constellation[];

  // Actions
  updateViewSettings: (updates: Partial<ViewSettings>) => void;
  updateTimeSettings: (updates: Partial<TimeSettings>) => void;
  setCustomTime: (time: Date) => void;
  resetToRealTime: () => void;
  refreshData: () => Promise<void>;
}

export function useStarMap(): UseStarMapResult {
  // Core state
  const [location, setLocation] = useState<GeographicCoordinates | null>(null);
  const [pointing, setPointing] = useState<DevicePointing | null>(null);
  const [observationTime, setObservationTime] = useState<Date>(new Date());
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Catalog data
  const [stars, setStars] = useState<Star[]>([]);
  const [constellations, setConstellations] = useState<Constellation[]>([]);

  // Initialize catalog
  useEffect(() => {
    async function loadCatalog() {
      try {
        setIsLoading(true);
        await starCatalog.load();

        setStars(starCatalog.getAllStars());
        setConstellations(starCatalog.getAllConstellations());

        setIsLoading(false);
      } catch (err) {
        setError('Failed to load star catalog');
        setIsLoading(false);
      }
    }

    loadCatalog();
  }, []);

  // Initialize sensors
  useEffect(() => {
    async function initSensors() {
      try {
        await sensorManager.initialize();
        await sensorManager.start();

        // Subscribe to updates
        const unsubLocation = sensorManager.onLocationUpdate(setLocation);
        const unsubOrientation = sensorManager.onOrientationUpdate(setPointing);

        // Get initial location
        const initialLocation = sensorManager.getLocation();
        if (initialLocation) {
          setLocation(initialLocation);
        }

        return () => {
          unsubLocation();
          unsubOrientation();
          sensorManager.stop();
        };
      } catch (err) {
        setError('Failed to initialize sensors');
      }
    }

    initSensors();
  }, []);

  // Update observation time
  useEffect(() => {
    if (!settings.time.useRealTime) return;

    const interval = setInterval(() => {
      setObservationTime(new Date());
    }, 1000 / settings.time.timeSpeed);

    return () => clearInterval(interval);
  }, [settings.time.useRealTime, settings.time.timeSpeed]);

  // Compute observer
  const observer = useMemo<Observer | null>(() => {
    if (!location) return null;
    return { location, time: observationTime };
  }, [location, observationTime]);

  // Compute visible stars
  const visibleStars = useMemo(() => {
    if (!observer) return [];
    return processStarsForRendering(stars, observer, settings.view.magnitudeLimit);
  }, [stars, observer, settings.view.magnitudeLimit]);

  // Action handlers
  const updateViewSettings = useCallback((updates: Partial<ViewSettings>) => {
    setSettings((prev) => ({
      ...prev,
      view: { ...prev.view, ...updates },
    }));
  }, []);

  const updateTimeSettings = useCallback((updates: Partial<TimeSettings>) => {
    setSettings((prev) => ({
      ...prev,
      time: { ...prev.time, ...updates },
    }));
  }, []);

  const setCustomTime = useCallback((time: Date) => {
    setSettings((prev) => ({
      ...prev,
      time: { ...prev.time, useRealTime: false, customTime: time },
    }));
    setObservationTime(time);
  }, []);

  const resetToRealTime = useCallback(() => {
    setSettings((prev) => ({
      ...prev,
      time: { ...prev.time, useRealTime: true, customTime: undefined },
    }));
    setObservationTime(new Date());
  }, []);

  const refreshData = useCallback(async () => {
    try {
      setIsLoading(true);
      await starCatalog.load();
      setStars(starCatalog.getAllStars());
      setConstellations(starCatalog.getAllConstellations());
      setIsLoading(false);
    } catch (err) {
      setError('Failed to refresh data');
      setIsLoading(false);
    }
  }, []);

  return {
    location,
    pointing,
    observationTime,
    settings,
    isLoading,
    error,
    observer,
    visibleStars,
    constellations,
    updateViewSettings,
    updateTimeSettings,
    setCustomTime,
    resetToRealTime,
    refreshData,
  };
}

export default useStarMap;
