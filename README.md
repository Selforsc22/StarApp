# Star Map App

A cross-platform star mapping application built with React Native and Expo that displays an accurate real-time sky map based on your device's location and orientation.

## Features

### Phase 1 (MVP) - Implemented
- **Device Sensor Integration**: Gyroscope, accelerometer, magnetometer, and GPS integration for real-time sky tracking
- **Star Catalog**: ~150 brightest stars from Hipparcos catalog with accurate J2000 epoch coordinates
- **Coordinate Conversion**: Precise astronomical calculations converting RA/Dec to Alt/Az
- **3D Star Rendering**: Efficient point-based rendering using Three.js
- **Compass Display**: Visual compass indicator showing cardinal directions
- **Night Mode**: Red UI mode for preserving dark adaptation

### Phase 2 - Implemented
- **Constellation Overlays**: Line patterns and labels for major constellations
- **Astronomical Events**: Integration with NASA DONKI and NOAA for:
  - Meteor shower calendar (Perseids, Geminids, etc.)
  - Aurora forecasts based on Kp index
  - Space weather alerts (solar flares, geomagnetic storms)
- **Event List**: Filterable, searchable list of upcoming astronomical events
- **Settings Panel**: Customizable magnitude limits, FOV, and display options

## Technical Stack

- **Frontend**: React Native with Expo SDK 50
- **Language**: TypeScript
- **3D Rendering**: Three.js via @react-three/fiber
- **Sensors**: expo-sensors, expo-location
- **Backend**: Node.js/Express (optional event aggregator)

## Project Structure

```
/star-map-app
├── /src
│   ├── /components
│   │   ├── StarMap.tsx              # 3D star field renderer
│   │   ├── OrientationHandler.tsx   # Sensor management wrapper
│   │   ├── ConstellationOverlay.tsx # Constellation lines/labels
│   │   └── EventList.tsx            # Astronomical events display
│   ├── /services
│   │   ├── astronomyCalculations.ts # Star visibility, colors, sizes
│   │   ├── starCatalog.ts           # Star/constellation data management
│   │   ├── sensorManager.ts         # Device sensor abstraction
│   │   └── eventAPI.ts              # Event fetching and caching
│   ├── /data
│   │   ├── stars.json               # Hipparcos star catalog
│   │   ├── constellations.json      # Constellation patterns
│   │   └── meteorShowers.json       # Annual meteor shower calendar
│   ├── /utils
│   │   ├── coordinateConversion.ts  # RA/Dec ↔ Alt/Az transformations
│   │   └── timeCalculations.ts      # Sidereal time, Julian date
│   ├── /types
│   │   └── index.ts                 # TypeScript type definitions
│   └── App.tsx                      # Main application component
├── /backend
│   ├── eventAggregator.js           # Express API server
│   └── package.json
├── App.tsx                          # Expo entry point
├── app.json                         # Expo configuration
├── package.json
├── tsconfig.json
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (Mac) or Android Emulator, or Expo Go app on physical device

### Installation

1. **Clone and install dependencies:**
   ```bash
   cd star-map-app
   npm install
   ```

2. **Start the development server:**
   ```bash
   npx expo start
   ```

3. **Run on device/simulator:**
   - Press `i` for iOS Simulator
   - Press `a` for Android Emulator
   - Scan QR code with Expo Go app for physical device

### Backend Setup (Optional)

The event aggregator backend provides cached astronomical event data:

1. **Install backend dependencies:**
   ```bash
   cd backend
   npm install
   ```

2. **Set NASA API key (optional but recommended):**
   ```bash
   export NASA_API_KEY=your_api_key_here
   ```
   Get a free API key at: https://api.nasa.gov/

3. **Start the backend:**
   ```bash
   npm start
   ```

The backend runs on `http://localhost:3001` by default.

## API Keys

### NASA DONKI API
- Free tier: 1000 requests/hour
- Get key at: https://api.nasa.gov/
- Used for: Solar flares, geomagnetic storms, CMEs

The app works without an API key using NASA's `DEMO_KEY`, but this has lower rate limits.

## Astronomical Calculations

### Coordinate Systems

1. **Equatorial Coordinates (RA/Dec)**
   - Right Ascension: 0-24 hours, measured eastward from vernal equinox
   - Declination: -90° to +90°, measured from celestial equator
   - Fixed positions on the celestial sphere (J2000 epoch)

2. **Horizontal Coordinates (Alt/Az)**
   - Altitude: -90° to +90° above horizon
   - Azimuth: 0-360° clockwise from North
   - Depends on observer location, date, and time

### Key Algorithms

- **Sidereal Time**: Calculated using IERS Conventions (2010)
- **Coordinate Transformation**: Spherical trigonometry with proper hour angle calculation
- **Atmospheric Refraction**: Bennett's formula for horizon corrections
- **Star Colors**: B-V color index to RGB conversion

### Accuracy

- Star positions: ±1-2 arcminutes (limited by sensor accuracy)
- Sidereal time: Sub-second precision
- Coordinate conversion: Better than 1 arcsecond mathematically

## Sensor Integration

### Required Permissions

**iOS (`Info.plist`):**
- `NSLocationWhenInUseUsageDescription`
- `NSMotionUsageDescription`

**Android (`AndroidManifest.xml`):**
- `ACCESS_FINE_LOCATION`
- `ACCESS_COARSE_LOCATION`
- `HIGH_SAMPLING_RATE_SENSORS`

### Calibration

The compass requires calibration for accurate heading. The app displays calibration status and instructions when needed. For best results:

1. Move device in figure-8 pattern
2. Avoid metal objects and magnets
3. Stay away from electronic interference

## Configuration

### Display Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `magnitudeLimit` | 5.5 | Faintest stars shown (lower = fewer stars) |
| `fieldOfView` | 60° | Camera FOV in degrees |
| `showConstellations` | true | Show constellation lines |
| `showLabels` | true | Show constellation names |
| `nightMode` | false | Red UI for dark adaptation |

### Performance Tips

- Reduce `magnitudeLimit` for better performance on older devices
- Increase `fieldOfView` if stars appear too small
- Disable constellation lines if rendering is slow

## Extending the App

### Adding More Stars

Edit `src/data/stars.json`:
```json
{
  "id": 12345,
  "name": "Star Name",
  "designation": "Greek Designation",
  "ra": 12.345,
  "dec": 45.678,
  "mag": 3.5,
  "spectralType": "G2V",
  "colorIndex": 0.65,
  "constellation": "UMa"
}
```

### Adding Constellations

Edit `src/data/constellations.json`:
```json
{
  "abbreviation": "ABC",
  "name": "Constellation Name",
  "genitive": "Constellationis",
  "stars": [12345, 23456, 34567],
  "lines": [[0, 1], [1, 2]],
  "center": {"ra": 12.0, "dec": 45.0},
  "description": "Description text"
}
```

## Known Limitations

1. **Web Platform**: Limited sensor support in mobile browsers
2. **Indoor Use**: Compass may be inaccurate indoors
3. **Polar Regions**: Some calculations may be less accurate at extreme latitudes
4. **Star Count**: Currently limited to ~150 brightest stars (expandable)

## Future Enhancements

- [ ] Planets, Moon, and Sun tracking
- [ ] Deep sky objects (galaxies, nebulae)
- [ ] Camera AR overlay mode
- [ ] Time travel feature
- [ ] Offline mode with cached events
- [ ] Push notifications for events
- [ ] Social sharing features
- [ ] Telescope mount integration

## Resources

### Astronomical References
- [Astronomical Algorithms](https://www.willbell.com/math/mc1.htm) by Jean Meeus
- [USNO Circular 179](https://aa.usno.navy.mil/publications/docs/Circular_179.php)
- [IAU Standards](https://www.iau.org/administration/resolutions/)

### Data Sources
- [Hipparcos Catalog](https://www.cosmos.esa.int/web/hipparcos)
- [IAU Constellation Boundaries](https://www.iau.org/public/themes/constellations/)
- [IMO Meteor Shower Calendar](https://www.imo.net/resources/calendar/)
- [NASA DONKI](https://kauai.ccmc.gsfc.nasa.gov/DONKI/)
- [NOAA SWPC](https://www.swpc.noaa.gov/)

## License

MIT License - see LICENSE file for details.

## Contributing

Contributions are welcome! Please read the contributing guidelines before submitting PRs.

## Acknowledgments

- Star data from ESA Hipparcos mission
- Constellation patterns from IAU
- Meteor shower data from International Meteor Organization
- Space weather data from NASA and NOAA
