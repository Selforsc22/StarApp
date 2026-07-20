/**
 * Email Service for StarMap
 *
 * Handles:
 * - User subscriptions for event notifications
 * - Daily digest email generation
 * - Event-specific alert emails
 * - Unsubscribe management
 *
 * In production, this would integrate with SendGrid, Mailgun, or similar.
 * This implementation provides the API endpoints and email generation logic.
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Simple file-based storage for demo (use a database in production)
const SUBSCRIBERS_FILE = path.join(__dirname, 'data', 'subscribers.json');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Load subscribers from file
function loadSubscribers() {
  try {
    if (fs.existsSync(SUBSCRIBERS_FILE)) {
      return JSON.parse(fs.readFileSync(SUBSCRIBERS_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading subscribers:', error);
  }
  return { subscribers: [] };
}

// Save subscribers to file
function saveSubscribers(data) {
  try {
    fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving subscribers:', error);
  }
}

/**
 * Subscribe to email notifications
 * POST /api/subscribe
 */
router.post('/subscribe', (req, res) => {
  const { email, pushToken, preferences } = req.body;

  if (!email || !validateEmail(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  const data = loadSubscribers();

  // Check if already subscribed
  const existingIndex = data.subscribers.findIndex(s => s.email === email);

  const subscriber = {
    email,
    pushToken: pushToken || null,
    preferences: preferences || getDefaultPreferences(),
    subscribedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    verified: false, // In production, send verification email
    unsubscribeToken: generateToken(),
  };

  if (existingIndex >= 0) {
    // Update existing subscriber
    data.subscribers[existingIndex] = {
      ...data.subscribers[existingIndex],
      ...subscriber,
      subscribedAt: data.subscribers[existingIndex].subscribedAt,
    };
  } else {
    // Add new subscriber
    data.subscribers.push(subscriber);
  }

  saveSubscribers(data);

  // In production: Send verification email here
  console.log(`New subscription: ${email}`);

  res.json({
    success: true,
    message: 'Subscribed successfully',
    unsubscribeToken: subscriber.unsubscribeToken,
  });
});

/**
 * Update subscription preferences
 * PUT /api/preferences
 */
router.put('/preferences', (req, res) => {
  const { email, pushToken, preferences } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  const data = loadSubscribers();
  const subscriberIndex = data.subscribers.findIndex(s => s.email === email);

  if (subscriberIndex < 0) {
    return res.status(404).json({ error: 'Subscriber not found' });
  }

  data.subscribers[subscriberIndex] = {
    ...data.subscribers[subscriberIndex],
    pushToken: pushToken || data.subscribers[subscriberIndex].pushToken,
    preferences: preferences || data.subscribers[subscriberIndex].preferences,
    lastUpdated: new Date().toISOString(),
  };

  saveSubscribers(data);

  res.json({ success: true, message: 'Preferences updated' });
});

/**
 * Unsubscribe from email notifications
 * POST /api/unsubscribe
 */
router.post('/unsubscribe', (req, res) => {
  const { email, token } = req.body;

  if (!email && !token) {
    return res.status(400).json({ error: 'Email or token required' });
  }

  const data = loadSubscribers();
  let subscriberIndex = -1;

  if (token) {
    subscriberIndex = data.subscribers.findIndex(s => s.unsubscribeToken === token);
  } else if (email) {
    subscriberIndex = data.subscribers.findIndex(s => s.email === email);
  }

  if (subscriberIndex < 0) {
    return res.status(404).json({ error: 'Subscriber not found' });
  }

  const removedEmail = data.subscribers[subscriberIndex].email;
  data.subscribers.splice(subscriberIndex, 1);
  saveSubscribers(data);

  console.log(`Unsubscribed: ${removedEmail}`);

  res.json({ success: true, message: 'Unsubscribed successfully' });
});

/**
 * Get subscriber info (for verification)
 * GET /api/subscriber/:email
 */
router.get('/subscriber/:email', (req, res) => {
  const { email } = req.params;

  const data = loadSubscribers();
  const subscriber = data.subscribers.find(s => s.email === email);

  if (!subscriber) {
    return res.status(404).json({ error: 'Subscriber not found' });
  }

  res.json({
    email: subscriber.email,
    preferences: subscriber.preferences,
    subscribedAt: subscriber.subscribedAt,
  });
});

/**
 * Send daily digest (called by cron job)
 * POST /api/send-digest
 */
router.post('/send-digest', async (req, res) => {
  const { events, date } = req.body;

  if (!events || !Array.isArray(events)) {
    return res.status(400).json({ error: 'Events array required' });
  }

  const data = loadSubscribers();
  const digestSubscribers = data.subscribers.filter(
    s => s.preferences?.dailyDigest && s.preferences?.emailEnabled
  );

  let sentCount = 0;

  for (const subscriber of digestSubscribers) {
    const relevantEvents = filterEventsForSubscriber(events, subscriber.preferences);

    if (relevantEvents.length > 0) {
      const emailContent = generateDigestEmail(relevantEvents, subscriber, date);
      // In production: Send email via SendGrid/Mailgun
      console.log(`Would send digest to ${subscriber.email}:`, emailContent.subject);
      sentCount++;
    }
  }

  res.json({
    success: true,
    sent: sentCount,
    total: digestSubscribers.length,
  });
});

/**
 * Send event alert (for high-priority events)
 * POST /api/send-alert
 */
router.post('/send-alert', async (req, res) => {
  const { event, location } = req.body;

  if (!event) {
    return res.status(400).json({ error: 'Event data required' });
  }

  const data = loadSubscribers();
  const alertSubscribers = data.subscribers.filter(s => {
    const prefs = s.preferences;
    return (
      prefs?.enabled &&
      prefs?.emailEnabled &&
      prefs?.eventTypes?.includes(event.type)
    );
  });

  let sentCount = 0;

  for (const subscriber of alertSubscribers) {
    const emailContent = generateAlertEmail(event, subscriber, location);
    // In production: Send email via SendGrid/Mailgun
    console.log(`Would send alert to ${subscriber.email}:`, emailContent.subject);
    sentCount++;
  }

  res.json({
    success: true,
    sent: sentCount,
    total: alertSubscribers.length,
  });
});

// Helper functions

function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function generateToken() {
  return 'tok_' + Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15);
}

function getDefaultPreferences() {
  return {
    enabled: true,
    emailEnabled: true,
    pushEnabled: true,
    eventTypes: ['meteor_shower', 'eclipse', 'aurora', 'conjunction'],
    reminderTimes: ['24h', '1h'],
    dailyDigest: false,
    digestTime: '18:00',
  };
}

function filterEventsForSubscriber(events, preferences) {
  if (!preferences?.eventTypes) return events;
  return events.filter(e => preferences.eventTypes.includes(e.type));
}

function generateDigestEmail(events, subscriber, date) {
  const formattedDate = new Date(date || Date.now()).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const subject = `StarMap Daily Digest - ${formattedDate}`;

  const eventsHtml = events.map(event => `
    <div style="background: #1a1a2e; border-radius: 12px; padding: 16px; margin-bottom: 12px; border-left: 4px solid ${getPriorityColor(event.priority)};">
      <h3 style="color: #ffffff; margin: 0 0 8px 0;">${event.name}</h3>
      <p style="color: #888888; margin: 0 0 8px 0;">${event.description}</p>
      <p style="color: #4488ff; margin: 0; font-size: 14px;">
        ${new Date(event.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        ${event.peakTime ? ` - Peak: ${new Date(event.peakTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
      </p>
    </div>
  `).join('');

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a1a; color: #ffffff; padding: 20px; margin: 0;">
  <div style="max-width: 600px; margin: 0 auto;">
    <div style="text-align: center; padding: 30px 0;">
      <h1 style="margin: 0; font-size: 28px; color: #4488ff;">StarMap</h1>
      <p style="color: #888888; margin: 8px 0 0 0;">Daily Sky Events</p>
    </div>

    <div style="background: linear-gradient(135deg, #4488ff22, #8844ff22); border-radius: 16px; padding: 24px; margin-bottom: 24px;">
      <h2 style="margin: 0 0 8px 0; color: #ffffff;">${formattedDate}</h2>
      <p style="margin: 0; color: #888888;">${events.length} astronomical event${events.length !== 1 ? 's' : ''} to watch</p>
    </div>

    ${eventsHtml}

    <div style="background: #1a1a2e; border-radius: 12px; padding: 16px; margin: 24px 0;">
      <h3 style="color: #44ff88; margin: 0 0 12px 0;">Viewing Tips</h3>
      <p style="color: #cccccc; margin: 0; line-height: 1.6;">
        ✓ Find a dark location away from city lights<br>
        ✓ Give your eyes 20-30 minutes to adapt<br>
        ✓ Check weather conditions before heading out<br>
        ✓ Use StarMap's night mode to preserve dark adaptation
      </p>
    </div>

    <div style="text-align: center; padding: 24px 0; border-top: 1px solid #2a2a4e;">
      <p style="color: #666666; font-size: 12px; margin: 0;">
        Open StarMap for real-time sky guidance<br><br>
        <a href="#" style="color: #4488ff; text-decoration: none;">Manage preferences</a> |
        <a href="#" style="color: #4488ff; text-decoration: none;">Unsubscribe</a>
      </p>
    </div>
  </div>
</body>
</html>
`;

  return { subject, html };
}

function generateAlertEmail(event, subscriber, location) {
  const subject = `StarMap Alert: ${event.name}`;

  // Calculate viewing direction if location is provided
  let viewingSection = '';
  if (location && (event.radiant || event.location)) {
    const direction = getCompassDirection(event, location);
    viewingSection = `
      <div style="background: rgba(68, 136, 255, 0.1); border: 1px solid #4488ff; border-radius: 12px; padding: 20px; margin: 20px 0;">
        <h3 style="color: #4488ff; margin: 0 0 12px 0; text-transform: uppercase; font-size: 14px;">Where to Look</h3>
        <div style="text-align: center; padding: 16px 0;">
          <div style="font-size: 48px; font-weight: bold; color: #ffffff;">${direction.compass}</div>
          <div style="color: #888888; font-size: 14px;">${direction.azimuth}° azimuth</div>
        </div>
        <p style="color: #cccccc; margin: 12px 0 0 0; text-align: center;">
          Look ${direction.altitudeDesc} in the ${direction.compass} sky
        </p>
      </div>
    `;
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a1a; color: #ffffff; padding: 20px; margin: 0;">
  <div style="max-width: 600px; margin: 0 auto;">
    <div style="background: linear-gradient(135deg, ${getPriorityColor(event.priority)}44, #0a0a1a); border-radius: 16px; padding: 30px; text-align: center; margin-bottom: 24px;">
      <div style="font-size: 48px; margin-bottom: 12px;">${getEventEmoji(event.type)}</div>
      <h1 style="margin: 0; font-size: 24px; color: #ffffff;">${event.name}</h1>
    </div>

    <div style="background: #1a1a2e; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
      <p style="color: #cccccc; margin: 0; line-height: 1.6;">${event.description}</p>
    </div>

    <div style="background: #1a1a2e; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
      <h3 style="color: #888888; margin: 0 0 12px 0; text-transform: uppercase; font-size: 12px;">When</h3>
      <p style="color: #ffffff; margin: 0 0 8px 0; font-size: 18px;">
        ${new Date(event.startTime).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
      </p>
      ${event.peakTime ? `<p style="color: #ffcc00; margin: 0; font-size: 14px;">Peak: ${new Date(event.peakTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${new Date(event.peakTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>` : ''}
    </div>

    ${viewingSection}

    <div style="background: #1a1a2e; border-radius: 12px; padding: 16px;">
      <h3 style="color: #44ff88; margin: 0 0 12px 0;">Viewing Tips</h3>
      <p style="color: #cccccc; margin: 0; line-height: 1.8; font-size: 14px;">
        ✓ Find a dark location away from city lights<br>
        ✓ Allow 20-30 minutes for your eyes to adapt<br>
        ✓ Best viewing is typically after midnight<br>
        ✓ Use StarMap for real-time guidance
      </p>
    </div>

    <div style="text-align: center; padding: 24px 0; border-top: 1px solid #2a2a4e; margin-top: 24px;">
      <p style="color: #666666; font-size: 12px; margin: 0;">
        <a href="#" style="color: #4488ff; text-decoration: none;">Open in StarMap</a><br><br>
        <a href="#" style="color: #666666; text-decoration: none;">Unsubscribe</a>
      </p>
    </div>
  </div>
</body>
</html>
`;

  return { subject, html };
}

function getPriorityColor(priority) {
  switch (priority) {
    case 'critical': return '#ff4444';
    case 'high': return '#ff8800';
    case 'medium': return '#ffcc00';
    case 'low':
    default: return '#44aaff';
  }
}

function getEventEmoji(type) {
  switch (type) {
    case 'meteor_shower': return '☄️';
    case 'eclipse': return '🌑';
    case 'aurora': return '🌌';
    case 'conjunction': return '✨';
    case 'comet': return '💫';
    case 'space_weather': return '☀️';
    default: return '⭐';
  }
}

function getCompassDirection(event, location) {
  // Simplified compass direction calculation
  // In production, use proper astronomical calculations
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

  // Use radiant for meteor showers, location for others
  const coords = event.radiant || event.location || { ra: 12, dec: 45 };

  // Very simplified calculation for demo
  const azimuth = ((coords.ra * 15) + 180) % 360;
  const dirIndex = Math.round(azimuth / 45) % 8;

  const altitude = Math.abs(coords.dec);
  let altitudeDesc = 'toward the horizon';
  if (altitude > 60) altitudeDesc = 'high up';
  else if (altitude > 30) altitudeDesc = 'about halfway up';

  return {
    compass: directions[dirIndex],
    azimuth: Math.round(azimuth),
    altitude: Math.round(altitude),
    altitudeDesc,
  };
}

module.exports = router;
