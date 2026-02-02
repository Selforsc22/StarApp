/**
 * Star Map Component
 *
 * Main 3D star field renderer using Three.js via React-Three-Fiber.
 * Renders stars as point sprites on a celestial sphere that rotates
 * based on device orientation.
 *
 * Features:
 * - Efficient point-based star rendering
 * - Dynamic brightness based on magnitude
 * - Color-coded stars by spectral type
 * - Smooth camera movement with device orientation
 * - Viewport culling for performance
 */

import React, { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
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
 * Updates camera based on device orientation
 */
interface CameraControllerProps {
  pointing: DevicePointing | null;
  fov: number;
}

function CameraController({ pointing, fov }: CameraControllerProps) {
  const { camera } = useThree();
  const targetRotation = useRef(new THREE.Quaternion());

  useFrame(() => {
    if (!pointing) return;

    // Convert pointing direction to camera orientation
    const { altitude, azimuth } = pointing.pointing;

    // Create rotation quaternion from altitude/azimuth
    // Camera looks from origin toward the celestial sphere

    // Azimuth rotation (around Y axis)
    const azRad = degreesToRadians(-azimuth + 180); // Adjust for camera direction
    const altRad = degreesToRadians(altitude);

    // Set camera to look in the pointing direction
    const distance = 0; // Camera at origin
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

  if (isLoading || !observer) {
    return (
      <View style={styles.container}>
        <View style={styles.loading} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
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
        <CameraController pointing={pointing} fov={settings.fieldOfView} />

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000011',
  },
  loading: {
    flex: 1,
    backgroundColor: '#000011',
  },
});

export default StarMap;
