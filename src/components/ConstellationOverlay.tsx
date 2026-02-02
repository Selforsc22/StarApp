/**
 * Constellation Overlay Component
 *
 * Renders constellation lines and labels over the star field.
 * Uses Three.js lines to draw connections between constellation stars.
 *
 * Features:
 * - Line connections between constellation stars
 * - Constellation name labels
 * - Toggle visibility for individual constellations
 * - Automatic visibility based on which constellations are above horizon
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as THREE from 'three';
import {
  Constellation,
  Star,
  GeographicCoordinates,
  Observer,
  HorizontalCoordinates,
  ViewSettings,
} from '../types';
import { starCatalog } from '../services/starCatalog';
import {
  equatorialToHorizontal,
  horizontalToCartesian,
  isAboveHorizon,
} from '../utils/coordinateConversion';

// Constants
const CELESTIAL_SPHERE_RADIUS = 100;
const LINE_COLOR = 0x4488aa;
const LABEL_COLOR = '#88aacc';

interface ConstellationOverlayProps {
  constellations: Constellation[];
  observer: Observer;
  settings: ViewSettings;
  starMap: Map<number, Star>;
}

interface ConstellationLineData {
  constellation: Constellation;
  lines: Array<{
    start: THREE.Vector3;
    end: THREE.Vector3;
  }>;
  labelPosition: THREE.Vector3 | null;
  isVisible: boolean;
}

/**
 * Process constellation data for rendering
 */
function processConstellationData(
  constellation: Constellation,
  starMap: Map<number, Star>,
  observer: Observer
): ConstellationLineData {
  const lines: Array<{ start: THREE.Vector3; end: THREE.Vector3 }> = [];
  let visibleStars = 0;
  let totalStars = 0;

  // Process each line in the constellation
  for (const [startIdx, endIdx] of constellation.lines) {
    const startStarId = constellation.stars[startIdx];
    const endStarId = constellation.stars[endIdx];

    const startStar = starMap.get(startStarId);
    const endStar = starMap.get(endStarId);

    if (!startStar || !endStar) continue;

    // Convert stars to horizontal coordinates
    const startHorizontal = equatorialToHorizontal(
      startStar.coordinates,
      observer.location,
      observer.time
    );
    const endHorizontal = equatorialToHorizontal(
      endStar.coordinates,
      observer.location,
      observer.time
    );

    // Check visibility
    const startVisible = isAboveHorizon(startHorizontal, -5);
    const endVisible = isAboveHorizon(endHorizontal, -5);

    // Count visible stars
    totalStars += 2;
    if (startVisible) visibleStars++;
    if (endVisible) visibleStars++;

    // Only draw line if at least one endpoint is visible
    if (!startVisible && !endVisible) continue;

    // Convert to 3D positions
    const startPos = horizontalToCartesian(startHorizontal, CELESTIAL_SPHERE_RADIUS);
    const endPos = horizontalToCartesian(endHorizontal, CELESTIAL_SPHERE_RADIUS);

    lines.push({
      start: new THREE.Vector3(startPos.x, startPos.y, startPos.z),
      end: new THREE.Vector3(endPos.x, endPos.y, endPos.z),
    });
  }

  // Calculate label position from constellation center
  const centerHorizontal = equatorialToHorizontal(
    constellation.center,
    observer.location,
    observer.time
  );

  let labelPosition: THREE.Vector3 | null = null;
  if (isAboveHorizon(centerHorizontal)) {
    const centerPos = horizontalToCartesian(centerHorizontal, CELESTIAL_SPHERE_RADIUS * 0.9);
    labelPosition = new THREE.Vector3(centerPos.x, centerPos.y, centerPos.z);
  }

  // Consider constellation visible if at least 50% of stars are up
  const isVisible = totalStars > 0 && visibleStars / totalStars >= 0.5;

  return {
    constellation,
    lines,
    labelPosition,
    isVisible,
  };
}

/**
 * Constellation Lines component
 * Renders the line connections for a single constellation
 */
interface ConstellationLinesProps {
  data: ConstellationLineData;
  showLabels: boolean;
}

function ConstellationLines({ data, showLabels }: ConstellationLinesProps): JSX.Element | null {
  const { lines, isVisible } = data;

  if (!isVisible || lines.length === 0) return null;

  // Create line geometry
  const geometry = useMemo(() => {
    const points: THREE.Vector3[] = [];

    for (const line of lines) {
      points.push(line.start, line.end);
    }

    return new THREE.BufferGeometry().setFromPoints(points);
  }, [lines]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial
        color={LINE_COLOR}
        transparent
        opacity={0.4}
        linewidth={1}
      />
    </lineSegments>
  );
}

/**
 * Constellation Label component
 * Renders the name label for a constellation using HTML overlay
 */
interface ConstellationLabelProps {
  name: string;
  position: THREE.Vector3;
  camera: THREE.Camera;
  screenWidth: number;
  screenHeight: number;
}

function projectToScreen(
  position: THREE.Vector3,
  camera: THREE.Camera,
  width: number,
  height: number
): { x: number; y: number; visible: boolean } {
  const vector = position.clone().project(camera);

  const x = (vector.x * 0.5 + 0.5) * width;
  const y = (1 - (vector.y * 0.5 + 0.5)) * height;

  // Check if point is in front of camera
  const visible = vector.z < 1;

  return { x, y, visible };
}

/**
 * Main ConstellationOverlay component
 * This is used as a child of the Three.js Canvas
 */
export function ConstellationOverlayContent({
  constellations,
  observer,
  settings,
  starMap,
}: ConstellationOverlayProps): JSX.Element {
  // Process all constellations
  const constellationData = useMemo(() => {
    return constellations.map((constellation) =>
      processConstellationData(constellation, starMap, observer)
    );
  }, [constellations, starMap, observer]);

  if (!settings.showConstellations) {
    return <></>;
  }

  return (
    <group>
      {constellationData.map((data) => (
        <ConstellationLines
          key={data.constellation.abbreviation}
          data={data}
          showLabels={settings.showLabels}
        />
      ))}
    </group>
  );
}

/**
 * HTML overlay for constellation labels
 * This component renders outside the Three.js canvas
 */
interface ConstellationLabelsOverlayProps {
  constellations: Constellation[];
  observer: Observer;
  pointing: { pointing: HorizontalCoordinates; fieldOfView: number } | null;
  screenWidth: number;
  screenHeight: number;
  showLabels: boolean;
}

export function ConstellationLabelsOverlay({
  constellations,
  observer,
  pointing,
  screenWidth,
  screenHeight,
  showLabels,
}: ConstellationLabelsOverlayProps): JSX.Element | null {
  if (!showLabels || !pointing) return null;

  // Calculate visible constellation labels
  const labels = useMemo(() => {
    return constellations
      .map((constellation) => {
        // Get center position
        const centerHorizontal = equatorialToHorizontal(
          constellation.center,
          observer.location,
          observer.time
        );

        if (!isAboveHorizon(centerHorizontal)) return null;

        // Check if in current viewport
        const { altitude, azimuth } = centerHorizontal;
        const { altitude: pAlt, azimuth: pAz } = pointing.pointing;

        // Simple distance check (should use proper angular distance)
        const altDiff = Math.abs(altitude - pAlt);
        const azDiff = Math.min(
          Math.abs(azimuth - pAz),
          360 - Math.abs(azimuth - pAz)
        );

        const fov = pointing.fieldOfView;
        if (altDiff > fov / 2 || azDiff > fov / 2) return null;

        // Project to screen coordinates
        // Simplified projection for 2D overlay
        const x = screenWidth / 2 + ((pAz - azimuth + 180) % 360 - 180) * (screenWidth / fov);
        const y = screenHeight / 2 - (altitude - pAlt) * (screenHeight / fov);

        // Check if on screen
        if (x < 0 || x > screenWidth || y < 0 || y > screenHeight) return null;

        return {
          name: constellation.name,
          x,
          y,
          abbreviation: constellation.abbreviation,
        };
      })
      .filter(Boolean) as Array<{
        name: string;
        x: number;
        y: number;
        abbreviation: string;
      }>;
  }, [constellations, observer, pointing, screenWidth, screenHeight]);

  return (
    <View style={styles.labelsContainer} pointerEvents="none">
      {labels.map((label) => (
        <Text
          key={label.abbreviation}
          style={[
            styles.label,
            {
              left: label.x - 50,
              top: label.y,
            },
          ]}
        >
          {label.name}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  labelsContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  label: {
    position: 'absolute',
    width: 100,
    textAlign: 'center',
    color: LABEL_COLOR,
    fontSize: 12,
    fontWeight: '500',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
});

export default ConstellationOverlayContent;
