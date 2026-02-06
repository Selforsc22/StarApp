/**
 * Star Map Component
 *
 * Main 3D star field renderer using Three.js via React-Three-Fiber.
 * Renders stars as point sprites on a celestial sphere that rotates
 * based on device orientation and manual drag controls.
 *
 * Features:
 * - Efficient point-based star rendering
 * - Dynamic brightness based on magnitude
 * - Color-coded stars by spectral type
 * - Smooth camera movement with device orientation
 * - Touch/mouse drag to look around the sky
 * - Viewport culling for performance
 */

import React, { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Platform, PanResponder, GestureResponderEvent, PanResponderGestureState } from 'react-native';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  Star,
  VisibleStar,
  GeographicCoordinates,
  DevicePointing,
  Quaternion,
  ViewSettings,
  Observer,
} from '../types';
import { starCatalog } from '../services/starCatalog';
import { processStarsForRendering, getStarColor, calculateStarSize } from '../services/astronomyCalculations';
import {
  equatorialToHorizontal,
  horizontalToCartesian,
  degreesToRadians,
} from '../utils/coordinateConversion';

// Constants for rendering
const CELESTIAL_SPHERE_RADIUS = 100;
const MIN_STAR_SIZE = 1;
const MAX_STAR_SIZE = 8;

// Drag sensitivity (degrees per pixel)
const DRAG_SENSITIVITY = 0.3;

interface StarMapProps {
  location: GeographicCoordinates | null;
  pointing: DevicePointing | null;
  observationTime: Date;
  settings: ViewSettings;
  onStarSelect?: (star: VisibleStar) => void;
}

/**
 * Star Points component
 * Renders stars as a point cloud for efficient rendering
 */
interface StarPointsProps {
  stars: Star[];
  observer: Observer;
  magnitudeLimit: number;
}

function StarPoints({ stars, observer, magnitudeLimit }: StarPointsProps) {
  const pointsRef = useRef<THREE.Points>(null);

  // Process stars and create geometry
  const { positions, colors, sizes } = useMemo(() => {
    const posArray: number[] = [];
    const colorArray: number[] = [];
    const sizeArray: number[] = [];

    for (const star of stars) {
      if (star.magnitude > magnitudeLimit) continue;

      // Convert to horizontal coordinates
      const horizontal = equatorialToHorizontal(
        star.coordinates,
        observer.location,
        observer.time
      );

      // Skip stars below horizon
      if (horizontal.altitude < -5) continue;

      // Convert to 3D cartesian on celestial sphere
      const cartesian = horizontalToCartesian(horizontal, CELESTIAL_SPHERE_RADIUS);

      posArray.push(cartesian.x, cartesian.y, cartesian.z);

      // Get star color
      const colorHex = getStarColor(star.spectralType, star.colorIndex);
      const color = new THREE.Color(colorHex);
      colorArray.push(color.r, color.g, color.b);

      // Calculate size based on magnitude
      const size = calculateStarSize(star.magnitude, MAX_STAR_SIZE);
      sizeArray.push(size);
    }

    return {
      positions: new Float32Array(posArray),
      colors: new Float32Array(colorArray),
      sizes: new Float32Array(sizeArray),
    };
  }, [stars, observer, magnitudeLimit]);

  // Create buffer geometry
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    return geo;
  }, [positions, colors, sizes]);

  // Create shader material for points
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        pointTexture: { value: createStarTexture() },
      },
      vertexShader: `
        attribute float size;
        varying vec3 vColor;

        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D pointTexture;
        varying vec3 vColor;

        void main() {
          vec4 texColor = texture2D(pointTexture, gl_PointCoord);
          if (texColor.a < 0.1) discard;
          gl_FragColor = vec4(vColor * texColor.rgb, texColor.a);
        }
      `,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      transparent: true,
      vertexColors: true,
    });
  }, []);

  return <points ref={pointsRef} geometry={geometry} material={material} />;
}

/**
 * Create a circular star texture
 */
function createStarTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new THREE.Texture();
  }

  // Create radial gradient for star glow
  const center = size / 2;
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);

  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');
  gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.4)');
  gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.1)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  return texture;
}

/**
 * Sky background component
 * Creates a dark gradient background for the night sky
 */
function SkyBackground() {
  const { scene } = useThree();

  useEffect(() => {
    // Create gradient background
    const topColor = new THREE.Color(0x000011); // Very dark blue
    const bottomColor = new THREE.Color(0x000005); // Nearly black

    scene.background = topColor;
  }, [scene]);

  return null;
}

/**
 * Camera controller component
 * Updates camera based on device orientation and manual offset
 */
interface CameraControllerProps {
  pointing: DevicePointing | null;
  manualOffset: { azimuth: number; altitude: number };
  fov: number;
}

function CameraController({ pointing, manualOffset, fov }: CameraControllerProps) {
  const { camera } = useThree();
  const targetRotation = useRef(new THREE.Quaternion());

  useFrame(() => {
    // Combine device pointing with manual offset
    let altitude = manualOffset.altitude;
    let azimuth = manualOffset.azimuth;

    if (pointing) {
      altitude += pointing.pointing.altitude;
      azimuth += pointing.pointing.azimuth;
    }

    // Clamp altitude to prevent flipping
    altitude = Math.max(-89, Math.min(89, altitude));

    // Normalize azimuth to 0-360
    azimuth = ((azimuth % 360) + 360) % 360;

    // Create rotation quaternion from altitude/azimuth
    // Camera looks from origin toward the celestial sphere

    // Azimuth rotation (around Y axis)
    const azRad = degreesToRadians(-azimuth + 180); // Adjust for camera direction
    const altRad = degreesToRadians(altitude);

    // Set camera to look in the pointing direction
    const x = Math.sin(azRad) * Math.cos(altRad) * 0.1;
    const y = Math.sin(altRad) * 0.1;
    const z = Math.cos(azRad) * Math.cos(altRad) * 0.1;

    // Smoothly interpolate camera target
    const targetPosition = new THREE.Vector3(x, y, z);
    camera.lookAt(targetPosition.multiplyScalar(CELESTIAL_SPHERE_RADIUS));

    // Update FOV
    if ((camera as THREE.PerspectiveCamera).fov !== fov) {
      (camera as THREE.PerspectiveCamera).fov = fov;
      (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    }
  });

  return null;
}

/**
 * Horizon line component
 * Draws a circle at the horizon for reference
 */
function HorizonLine() {
  const segments = 128;
  const radius = CELESTIAL_SPHERE_RADIUS * 0.99;

  const points = useMemo(() => {
    const pts: THREE.Vector3[] = [];

    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
    }

    return pts;
  }, [radius]);

  const geometry = useMemo(() => {
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [points]);

  return (
    <line geometry={geometry}>
      <lineBasicMaterial color={0x333366} linewidth={1} transparent opacity={0.5} />
    </line>
  );
}

/**
 * Cardinal directions component
 * Shows N, E, S, W labels at the horizon
 */
function CardinalDirections() {
  const directions = [
    { label: 'N', azimuth: 0 },
    { label: 'E', azimuth: 90 },
    { label: 'S', azimuth: 180 },
    { label: 'W', azimuth: 270 },
  ];

  const radius = CELESTIAL_SPHERE_RADIUS * 0.95;

  return (
    <group>
      {directions.map(({ label, azimuth }) => {
        const angle = degreesToRadians(azimuth);
        const x = Math.sin(angle) * radius;
        const z = Math.cos(angle) * radius;

        return (
          <group key={label} position={[x, 0, z]}>
            {/* Direction marker */}
            <mesh>
              <sphereGeometry args={[1, 8, 8]} />
              <meshBasicMaterial color={label === 'N' ? 0xff4444 : 0x4444ff} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/**
 * Main StarMap component
 */
export function StarMap({
  location,
  pointing,
  observationTime,
  settings,
  onStarSelect,
}: StarMapProps) {
  const [stars, setStars] = useState<Star[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Manual offset for drag navigation
  const [manualOffset, setManualOffset] = useState({ azimuth: 0, altitude: 0 });

  // Track if we're currently dragging
  const isDragging = useRef(false);
  const lastDragPosition = useRef({ x: 0, y: 0 });

  // Load star catalog
  useEffect(() => {
    async function loadStars() {
      try {
        await starCatalog.load();
        const allStars = starCatalog.getStarsByMagnitude(settings.magnitudeLimit);
        setStars(allStars);
        setIsLoading(false);
      } catch (error) {
        console.error('Failed to load stars:', error);
        setIsLoading(false);
      }
    }

    loadStars();
  }, [settings.magnitudeLimit]);

  // Create observer from current location and time
  const observer: Observer | null = useMemo(() => {
    if (!location) return null;
    return {
      location,
      time: observationTime,
    };
  }, [location, observationTime]);

  // Handle drag/pan for mobile using PanResponder
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt: GestureResponderEvent) => {
      isDragging.current = true;
      const touch = evt.nativeEvent;
      lastDragPosition.current = { x: touch.pageX, y: touch.pageY };
    },
    onPanResponderMove: (evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
      if (!isDragging.current) return;

      const touch = evt.nativeEvent;
      const deltaX = touch.pageX - lastDragPosition.current.x;
      const deltaY = touch.pageY - lastDragPosition.current.y;

      lastDragPosition.current = { x: touch.pageX, y: touch.pageY };

      // Update manual offset
      setManualOffset(prev => ({
        azimuth: prev.azimuth - deltaX * DRAG_SENSITIVITY,
        altitude: Math.max(-89, Math.min(89, prev.altitude + deltaY * DRAG_SENSITIVITY)),
      }));
    },
    onPanResponderRelease: () => {
      isDragging.current = false;
    },
    onPanResponderTerminate: () => {
      isDragging.current = false;
    },
  }), []);

  // Handle mouse drag for web
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (Platform.OS !== 'web') return;
    isDragging.current = true;
    lastDragPosition.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (Platform.OS !== 'web' || !isDragging.current) return;

    const deltaX = e.clientX - lastDragPosition.current.x;
    const deltaY = e.clientY - lastDragPosition.current.y;

    lastDragPosition.current = { x: e.clientX, y: e.clientY };

    setManualOffset(prev => ({
      azimuth: prev.azimuth - deltaX * DRAG_SENSITIVITY,
      altitude: Math.max(-89, Math.min(89, prev.altitude + deltaY * DRAG_SENSITIVITY)),
    }));
  }, []);

  const handleMouseUp = useCallback(() => {
    if (Platform.OS !== 'web') return;
    isDragging.current = false;
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (Platform.OS !== 'web') return;
    isDragging.current = false;
  }, []);

  // Handle wheel for zoom (optional enhancement)
  const handleWheel = useCallback((e: React.WheelEvent) => {
    // Could be used to adjust FOV for zoom
    // For now, we'll just use it for vertical scrolling
    setManualOffset(prev => ({
      ...prev,
      altitude: Math.max(-89, Math.min(89, prev.altitude - e.deltaY * 0.1)),
    }));
  }, []);

  if (isLoading || !observer) {
    return (
      <View style={styles.container}>
        <View style={styles.loading} />
      </View>
    );
  }

  // Web-specific event handlers
  const webEventHandlers = Platform.OS === 'web' ? {
    onMouseDown: handleMouseDown,
    onMouseMove: handleMouseMove,
    onMouseUp: handleMouseUp,
    onMouseLeave: handleMouseLeave,
    onWheel: handleWheel,
  } : {};

  return (
    <View
      style={styles.container}
      {...panResponder.panHandlers}
      // @ts-ignore - Web-specific event handlers
      {...webEventHandlers}
    >
      <Canvas
        camera={{
          fov: settings.fieldOfView,
          near: 0.1,
          far: CELESTIAL_SPHERE_RADIUS * 3,
          position: [0, 0, 0],
        }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
        }}
      >
        <SkyBackground />
        <CameraController
          pointing={pointing}
          manualOffset={manualOffset}
          fov={settings.fieldOfView}
        />

        {/* Stars */}
        <StarPoints
          stars={stars}
          observer={observer}
          magnitudeLimit={settings.magnitudeLimit}
        />

        {/* Horizon reference */}
        <HorizonLine />

        {/* Cardinal directions */}
        {settings.showCompass && <CardinalDirections />}

        {/* Ambient light for visibility */}
        <ambientLight intensity={0.1} />
      </Canvas>

      {/* Instructions overlay */}
      <View style={styles.instructions}>
        <View style={styles.instructionBadge}>
          <Text style={styles.text}>
            {Platform.OS === 'web'
              ? 'Drag to look around • Scroll to pan up/down'
              : 'Drag to look around the sky'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000011',
    cursor: Platform.OS === 'web' ? 'grab' : undefined,
  } as any,
  loading: {
    flex: 1,
    backgroundColor: '#000011',
  },
  instructions: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
    pointerEvents: 'none',
  } as any,
  instructionBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  text: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
  },
});

export default StarMap;
