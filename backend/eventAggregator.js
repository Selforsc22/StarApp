/**
 * Event Aggregator Backend Service
 *
 * Node.js/Express server that aggregates astronomical event data from multiple sources:
 * - NASA DONKI API (space weather events)
 * - NOAA Space Weather Prediction Center (aurora forecasts)
 * - Meteor shower calendar
 *
 * Features:
 * - Caches API responses to reduce external API calls
 * - Provides unified event format
 * - Supports filtering by event type, date range, and location
 * - Periodic background refresh of event data
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const emailService = require('./emailService');

const app = express();
const PORT = process.env.PORT || 3001;

// Configuration
const NASA_API_KEY = process.env.NASA_API_KEY || 'DEMO_KEY';
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
const REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes

// In-memory cache
const cache = {
  meteorShowers: null,
  spaceWeather: null,
  auroraForecast: null,
  lastUpdate: {
    meteorShowers: 0,
    spaceWeather: 0,
    auroraForecast: 0,
  },
};

// Middleware
app.use(cors({
  origin: '*', // Allow mobile app connections
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Email subscription routes
app.use('/api', emailService);

// Meteor shower data (hardcoded annual calendar)
const METEOR_SHOWERS = [
  {
    id: 'quadrantids',
    name: 'Quadrantids',
    parent: '2003 EH1',
    radiant: { ra: 15.33, dec: 49.5 },
    radiantConstellation: 'Boötes',
    startMonth: 1, startDay: 1,
    endMonth: 1, endDay: 10,
    peakMonth: 1, peakDay: 4,
    zhr: 120,
    velocity: 41,
    description: 'One of the best annual meteor showers with a sharp peak.',
  },
  {
    id: 'lyrids',
    name: 'Lyrids',
    parent: 'Comet Thatcher',
    radiant: { ra: 18.1, dec: 32.0 },
    radiantConstellation: 'Lyra',
    startMonth: 4, startDay: 16,
    endMonth: 4, endDay: 25,
    peakMonth: 4, peakDay: 22,
    zhr: 18,
    velocity: 49,
    description: 'One of the oldest known meteor showers.',
  },
  {
    id: 'eta_aquariids',
    name: 'Eta Aquariids',
    parent: 'Comet Halley',
    radiant: { ra: 22.33, dec: -1.0 },
    radiantConstellation: 'Aquarius',
    startMonth: 4, startDay: 19,
    endMonth: 5, endDay: 28,
    peakMonth: 5, peakDay: 6,
    zhr: 50,
    velocity: 66,
    description: 'Produced by debris from Halley\'s Comet.',
  },
  {
    id: 'perseids',
    name: 'Perseids',
    parent: 'Comet Swift-Tuttle',
    radiant: { ra: 3.13, dec: 58.0 },
    radiantConstellation: 'Perseus',
    startMonth: 7, startDay: 17,
    endMonth: 8, endDay: 24,
    peakMonth: 8, peakDay: 12,
    zhr: 100,
    velocity: 59,
    description: 'The most popular meteor shower due to reliability and warm viewing conditions.',
  },
  {
    id: 'orionids',
    name: 'Orionids',
    parent: 'Comet Halley',
    radiant: { ra: 6.33, dec: 15.0 },
    radiantConstellation: 'Orion',
    startMonth: 10, startDay: 2,
    endMonth: 11, endDay: 7,
    peakMonth: 10, peakDay: 21,
    zhr: 20,
    velocity: 66,
    description: 'Second shower from Halley\'s Comet debris.',
  },
  {
    id: 'leonids',
    name: 'Leonids',
    parent: 'Comet Tempel-Tuttle',
    radiant: { ra: 10.13, dec: 22.0 },
    radiantConstellation: 'Leo',
    startMonth: 11, startDay: 6,
    endMonth: 11, endDay: 30,
    peakMonth: 11, peakDay: 17,
    zhr: 15,
    velocity: 71,
    description: 'Famous for producing meteor storms approximately every 33 years.',
  },
  {
    id: 'geminids',
    name: 'Geminids',
    parent: '3200 Phaethon',
    radiant: { ra: 7.47, dec: 33.0 },
    radiantConstellation: 'Gemini',
    startMonth: 12, startDay: 4,
    endMonth: 12, endDay: 17,
    peakMonth: 12, peakDay: 14,
    zhr: 150,
    velocity: 35,
    description: 'Considered the best annual meteor shower.',
  },
  {
    id: 'ursids',
    name: 'Ursids',
    parent: 'Comet Tuttle',
    radiant: { ra: 14.47, dec: 76.0 },
    radiantConstellation: 'Ursa Minor',
    startMonth: 12, startDay: 17,
    endMonth: 12, endDay: 26,
    peakMonth: 12, peakDay: 22,
    zhr: 10,
    velocity: 33,
    description: 'A modest shower near the winter solstice.',
  },
];

/**
 * Get meteor showers active around a given date
 */
function getActiveMeteorShowers(date = new Date()) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const currentValue = month * 100 + day;

  return METEOR_SHOWERS.filter((shower) => {
    const startValue = shower.startMonth * 100 + shower.startDay;
    const endValue = shower.endMonth * 100 + shower.endDay;

    // Handle year wrap
    if (startValue > endValue) {
      return currentValue >= startValue || currentValue <= endValue;
    }

    return currentValue >= startValue && currentValue <= endValue;
  }).map((shower) => ({
    ...shower,
    type: 'meteor_shower',
    startTime: createDateFromMonthDay(shower.startMonth, shower.startDay),
    endTime: createDateFromMonthDay(shower.endMonth, shower.endDay),
    peakTime: createDateFromMonthDay(shower.peakMonth, shower.peakDay),
    priority: shower.zhr >= 100 ? 'high' : shower.zhr >= 20 ? 'medium' : 'low',
    source: 'IMO',
  }));
}

/**
 * Create date from month and day
 */
function createDateFromMonthDay(month, day) {
  const year = new Date().getFullYear();
  return new Date(year, month - 1, day).toISOString();
}

/**
 * Fetch space weather events from NASA DONKI
 */
async function fetchSpaceWeatherEvents() {
  const now = Date.now();

  // Check cache
  if (cache.spaceWeather && now - cache.lastUpdate.spaceWeather < CACHE_DURATION) {
    return cache.spaceWeather;
  }

  const events = [];
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

  const formatDate = (d) => d.toISOString().split('T')[0];

  try {
    // Fetch geomagnetic storms
    const gstUrl = `https://api.nasa.gov/DONKI/GST?startDate=${formatDate(startDate)}&endDate=${formatDate(endDate)}&api_key=${NASA_API_KEY}`;
    const gstResponse = await fetch(gstUrl);

    if (gstResponse.ok) {
      const gstData = await gstResponse.json();

      for (const storm of gstData) {
        const maxKp = Math.max(...storm.allKpIndex.map((k) => k.kpIndex));

        events.push({
          id: `gst_${storm.gstID}`,
          type: 'space_weather',
          name: 'Geomagnetic Storm',
          description: `Geomagnetic storm with maximum Kp index of ${maxKp}.`,
          startTime: storm.startTime,
          intensity: maxKp,
          priority: maxKp >= 6 ? 'high' : maxKp >= 4 ? 'medium' : 'low',
          source: 'NASA DONKI',
          infoUrl: `https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/GST/${storm.gstID}`,
        });
      }
    }

    // Fetch solar flares
    const flrUrl = `https://api.nasa.gov/DONKI/FLR?startDate=${formatDate(startDate)}&endDate=${formatDate(endDate)}&api_key=${NASA_API_KEY}`;
    const flrResponse = await fetch(flrUrl);

    if (flrResponse.ok) {
      const flrData = await flrResponse.json();

      for (const flare of flrData) {
        if (flare.classType.startsWith('M') || flare.classType.startsWith('X')) {
          events.push({
            id: `flr_${flare.flrID}`,
            type: 'space_weather',
            name: `${flare.classType} Solar Flare`,
            description: `${flare.classType}-class solar flare detected.`,
            startTime: flare.beginTime,
            endTime: flare.endTime,
            peakTime: flare.peakTime,
            priority: flare.classType.startsWith('X') ? 'critical' : 'high',
            source: 'NASA DONKI',
          });
        }
      }
    }
  } catch (error) {
    console.error('Error fetching space weather:', error);
  }

  cache.spaceWeather = events;
  cache.lastUpdate.spaceWeather = now;

  return events;
}

/**
 * Fetch aurora forecast from NOAA
 */
async function fetchAuroraForecast() {
  const now = Date.now();

  // Check cache
  if (cache.auroraForecast && now - cache.lastUpdate.auroraForecast < CACHE_DURATION) {
    return cache.auroraForecast;
  }

  try {
    const response = await fetch(
      'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json'
    );

    if (response.ok) {
      const data = await response.json();

      // Parse NOAA format (skip header row)
      const forecasts = data.slice(1).map((row) => ({
        time: row[0],
        kp: parseFloat(row[1]),
        observed: row[2],
        scale: row[3] || null,
      }));

      // Convert to events
      const events = forecasts
        .filter((f) => f.kp >= 4)
        .map((f, index) => ({
          id: `aurora_${index}_${f.time}`,
          type: 'aurora',
          name: 'Aurora Potential',
          description: `Kp index forecast of ${f.kp}. ${getKpDescription(f.kp)}`,
          startTime: f.time,
          intensity: f.kp,
          priority: f.kp >= 6 ? 'high' : 'medium',
          source: 'NOAA SWPC',
          visibilityLatitude: getVisibilityLatitude(f.kp),
        }));

      cache.auroraForecast = events;
      cache.lastUpdate.auroraForecast = now;

      return events;
    }
  } catch (error) {
    console.error('Error fetching aurora forecast:', error);
  }

  return [];
}

/**
 * Get aurora visibility latitude based on Kp index
 */
function getVisibilityLatitude(kp) {
  const latitudes = {
    0: 67, 1: 65, 2: 62, 3: 58, 4: 55,
    5: 52, 6: 48, 7: 45, 8: 42, 9: 40,
  };
  return latitudes[Math.min(9, Math.max(0, Math.round(kp)))] || 67;
}

/**
 * Get Kp description
 */
function getKpDescription(kp) {
  if (kp >= 8) return 'Extreme geomagnetic storm. Auroras visible at unusually low latitudes.';
  if (kp >= 6) return 'Strong geomagnetic storm. Auroras likely visible at mid-latitudes.';
  if (kp >= 4) return 'Moderate geomagnetic storm. Enhanced aurora activity possible.';
  return 'Minor geomagnetic activity.';
}

// API Routes

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Get all events
 */
app.get('/api/events', async (req, res) => {
  try {
    const { type, days = 30 } = req.query;

    // Fetch all event sources in parallel
    const [meteorShowers, spaceWeather, aurora] = await Promise.all([
      Promise.resolve(getActiveMeteorShowers()),
      fetchSpaceWeatherEvents(),
      fetchAuroraForecast(),
    ]);

    let allEvents = [...meteorShowers, ...spaceWeather, ...aurora];

    // Filter by type if specified
    if (type) {
      allEvents = allEvents.filter((event) => event.type === type);
    }

    // Sort by start time
    allEvents.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

    res.json({
      success: true,
      count: allEvents.length,
      events: allEvents,
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch events' });
  }
});

/**
 * Get meteor showers
 */
app.get('/api/events/meteors', (req, res) => {
  try {
    const activeShowers = getActiveMeteorShowers();
    const upcomingShowers = METEOR_SHOWERS.map((shower) => ({
      ...shower,
      type: 'meteor_shower',
      startTime: createDateFromMonthDay(shower.startMonth, shower.startDay),
      endTime: createDateFromMonthDay(shower.endMonth, shower.endDay),
      peakTime: createDateFromMonthDay(shower.peakMonth, shower.peakDay),
      priority: shower.zhr >= 100 ? 'high' : shower.zhr >= 20 ? 'medium' : 'low',
      source: 'IMO',
    }));

    res.json({
      success: true,
      active: activeShowers,
      all: upcomingShowers,
    });
  } catch (error) {
    console.error('Error fetching meteor showers:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch meteor showers' });
  }
});

/**
 * Get space weather events
 */
app.get('/api/events/space-weather', async (req, res) => {
  try {
    const events = await fetchSpaceWeatherEvents();

    res.json({
      success: true,
      count: events.length,
      events,
    });
  } catch (error) {
    console.error('Error fetching space weather:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch space weather' });
  }
});

/**
 * Get aurora forecast
 */
app.get('/api/events/aurora', async (req, res) => {
  try {
    const events = await fetchAuroraForecast();

    res.json({
      success: true,
      count: events.length,
      events,
    });
  } catch (error) {
    console.error('Error fetching aurora forecast:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch aurora forecast' });
  }
});

/**
 * Get events for tonight based on location
 */
app.get('/api/events/tonight', async (req, res) => {
  try {
    const { lat, lon } = req.query;

    const [meteorShowers, spaceWeather, aurora] = await Promise.all([
      Promise.resolve(getActiveMeteorShowers()),
      fetchSpaceWeatherEvents(),
      fetchAuroraForecast(),
    ]);

    let events = [...meteorShowers, ...spaceWeather, ...aurora];

    // Filter aurora events by visibility if location provided
    if (lat && lon) {
      const latitude = parseFloat(lat);

      events = events.filter((event) => {
        if (event.type === 'aurora' && event.visibilityLatitude) {
          return Math.abs(latitude) >= event.visibilityLatitude - 5;
        }
        return true;
      });

      // Add visibility flag
      events = events.map((event) => ({
        ...event,
        visibleFromLocation:
          event.type !== 'aurora' ||
          Math.abs(latitude) >= (event.visibilityLatitude || 0),
      }));
    }

    // Sort by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    events.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    res.json({
      success: true,
      count: events.length,
      events,
    });
  } catch (error) {
    console.error('Error fetching tonight events:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch events' });
  }
});

/**
 * Refresh cache
 */
app.post('/api/refresh', async (req, res) => {
  try {
    // Clear cache
    cache.spaceWeather = null;
    cache.auroraForecast = null;
    cache.lastUpdate.spaceWeather = 0;
    cache.lastUpdate.auroraForecast = 0;

    // Refresh data
    await Promise.all([fetchSpaceWeatherEvents(), fetchAuroraForecast()]);

    res.json({ success: true, message: 'Cache refreshed' });
  } catch (error) {
    console.error('Error refreshing cache:', error);
    res.status(500).json({ success: false, error: 'Failed to refresh cache' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Star Map Event Aggregator running on port ${PORT}`);
  console.log(`NASA API Key: ${NASA_API_KEY === 'DEMO_KEY' ? 'Using DEMO_KEY (limited)' : 'Custom key configured'}`);

  // Initial data fetch
  fetchSpaceWeatherEvents();
  fetchAuroraForecast();

  // Schedule periodic refresh
  setInterval(() => {
    console.log('Refreshing event data...');
    cache.spaceWeather = null;
    cache.auroraForecast = null;
    fetchSpaceWeatherEvents();
    fetchAuroraForecast();
  }, REFRESH_INTERVAL);
});

module.exports = app;
