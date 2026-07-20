/**
 * Subscription Modal Component
 *
 * Allows users to manage their notification preferences:
 * - Enable/disable notifications
 * - Subscribe to email alerts
 * - Choose event types to follow
 * - Set reminder times
 * - Daily digest preferences
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  notificationService,
  SubscriptionPreferences,
  ReminderTime,
} from '../services/notificationService';
import { EventType } from '../types';

interface SubscriptionModalProps {
  visible: boolean;
  onClose: () => void;
  nightMode?: boolean;
}

interface EventTypeOption {
  type: EventType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
}

const EVENT_TYPES: EventTypeOption[] = [
  {
    type: 'meteor_shower',
    label: 'Meteor Showers',
    icon: 'sparkles',
    description: 'Annual meteor shower events',
  },
  {
    type: 'eclipse',
    label: 'Eclipses',
    icon: 'moon',
    description: 'Solar and lunar eclipses',
  },
  {
    type: 'aurora',
    label: 'Aurora Alerts',
    icon: 'color-palette',
    description: 'Northern/Southern lights forecasts',
  },
  {
    type: 'conjunction',
    label: 'Conjunctions',
    icon: 'git-merge',
    description: 'Planetary alignments',
  },
  {
    type: 'comet',
    label: 'Comets',
    icon: 'planet',
    description: 'Visible comet sightings',
  },
  {
    type: 'space_weather',
    label: 'Space Weather',
    icon: 'sunny',
    description: 'Solar flares and geomagnetic storms',
  },
];

const REMINDER_OPTIONS: { value: ReminderTime; label: string }[] = [
  { value: '1h', label: '1 hour before' },
  { value: '6h', label: '6 hours before' },
  { value: '24h', label: '1 day before' },
  { value: '3d', label: '3 days before' },
  { value: '1w', label: '1 week before' },
];

export function SubscriptionModal({
  visible,
  onClose,
  nightMode = false,
}: SubscriptionModalProps): JSX.Element {
  const [preferences, setPreferences] = useState<SubscriptionPreferences | null>(null);
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const textColor = nightMode ? '#ff6666' : '#ffffff';
  const accentColor = nightMode ? '#ff6666' : '#4488ff';
  const cardBg = nightMode ? 'rgba(255, 102, 102, 0.1)' : 'rgba(68, 136, 255, 0.1)';

  // Load preferences when modal opens
  useEffect(() => {
    if (visible) {
      loadPreferences();
    }
  }, [visible]);

  const loadPreferences = async () => {
    setIsLoading(true);
    await notificationService.initialize();
    const prefs = notificationService.getPreferences();
    setPreferences(prefs);
    setEmail(prefs.email || '');
    setIsLoading(false);
  };

  const updatePreferences = useCallback((updates: Partial<SubscriptionPreferences>) => {
    if (!preferences) return;
    setPreferences({ ...preferences, ...updates });
    setHasChanges(true);
  }, [preferences]);

  const toggleEventType = useCallback((eventType: EventType) => {
    if (!preferences) return;
    const currentTypes = [...preferences.eventTypes];
    const index = currentTypes.indexOf(eventType);
    if (index >= 0) {
      currentTypes.splice(index, 1);
    } else {
      currentTypes.push(eventType);
    }
    updatePreferences({ eventTypes: currentTypes });
  }, [preferences, updatePreferences]);

  const toggleReminderTime = useCallback((reminderTime: ReminderTime) => {
    if (!preferences) return;
    const currentTimes = [...preferences.reminderTimes];
    const index = currentTimes.indexOf(reminderTime);
    if (index >= 0) {
      currentTimes.splice(index, 1);
    } else {
      currentTimes.push(reminderTime);
    }
    updatePreferences({ reminderTimes: currentTimes });
  }, [preferences, updatePreferences]);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubscribeEmail = async () => {
    if (!email.trim()) {
      Alert.alert('Email Required', 'Please enter your email address.');
      return;
    }

    if (!validateEmail(email)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    setIsSaving(true);
    const success = await notificationService.subscribeEmail(email);
    setIsSaving(false);

    if (success) {
      updatePreferences({ email, emailEnabled: true });
      Alert.alert(
        'Subscribed!',
        'You will receive email notifications for upcoming astronomical events.',
        [{ text: 'OK' }]
      );
    } else {
      Alert.alert('Error', 'Failed to subscribe. Please try again later.');
    }
  };

  const handleUnsubscribeEmail = async () => {
    Alert.alert(
      'Unsubscribe',
      'Are you sure you want to unsubscribe from email notifications?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unsubscribe',
          style: 'destructive',
          onPress: async () => {
            setIsSaving(true);
            await notificationService.unsubscribeEmail();
            updatePreferences({ emailEnabled: false });
            setIsSaving(false);
          },
        },
      ]
    );
  };

  const handleSave = async () => {
    if (!preferences) return;

    setIsSaving(true);
    await notificationService.savePreferences(preferences);
    setIsSaving(false);
    setHasChanges(false);

    Alert.alert('Saved', 'Your notification preferences have been updated.', [
      { text: 'OK', onPress: onClose },
    ]);
  };

  const handleClose = () => {
    if (hasChanges) {
      Alert.alert(
        'Unsaved Changes',
        'You have unsaved changes. Do you want to save them?',
        [
          { text: 'Discard', style: 'destructive', onPress: onClose },
          { text: 'Save', onPress: handleSave },
        ]
      );
    } else {
      onClose();
    }
  };

  if (!visible) return <></>;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.content, nightMode && styles.contentNight]}>
          {/* Drag Handle */}
          <View style={styles.dragHandle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Ionicons name="notifications" size={24} color={accentColor} />
              <Text style={[styles.headerTitle, { color: textColor }]}>Notifications</Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={textColor} />
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={accentColor} />
              <Text style={[styles.loadingText, { color: textColor }]}>Loading preferences...</Text>
            </View>
          ) : preferences ? (
            <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
              {/* Master Toggle */}
              <View style={[styles.card, { backgroundColor: cardBg }]}>
                <View style={styles.cardRow}>
                  <View style={styles.cardRowLeft}>
                    <Ionicons name="notifications-outline" size={20} color={accentColor} />
                    <View style={styles.cardRowText}>
                      <Text style={[styles.cardRowTitle, { color: textColor }]}>
                        Enable Notifications
                      </Text>
                      <Text style={[styles.cardRowSubtitle, { color: textColor }]}>
                        Get alerts for astronomical events
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={preferences.enabled}
                    onValueChange={(value) => updatePreferences({ enabled: value })}
                    trackColor={{ false: '#333', true: accentColor }}
                    thumbColor="#fff"
                  />
                </View>
              </View>

              {preferences.enabled && (
                <>
                  {/* Push Notifications */}
                  <View style={[styles.card, { backgroundColor: cardBg }]}>
                    <View style={styles.cardHeader}>
                      <Ionicons name="phone-portrait-outline" size={18} color={accentColor} />
                      <Text style={[styles.cardTitle, { color: textColor }]}>Push Notifications</Text>
                    </View>
                    <View style={styles.cardRow}>
                      <Text style={[styles.cardRowTitle, { color: textColor }]}>
                        Device notifications
                      </Text>
                      <Switch
                        value={preferences.pushEnabled}
                        onValueChange={(value) => updatePreferences({ pushEnabled: value })}
                        trackColor={{ false: '#333', true: accentColor }}
                        thumbColor="#fff"
                      />
                    </View>
                  </View>

                  {/* Email Subscription */}
                  <View style={[styles.card, { backgroundColor: cardBg }]}>
                    <View style={styles.cardHeader}>
                      <Ionicons name="mail-outline" size={18} color={accentColor} />
                      <Text style={[styles.cardTitle, { color: textColor }]}>Email Alerts</Text>
                    </View>

                    {preferences.emailEnabled ? (
                      <View>
                        <View style={styles.subscribedContainer}>
                          <Ionicons name="checkmark-circle" size={20} color="#44ff88" />
                          <Text style={[styles.subscribedText, { color: textColor }]}>
                            Subscribed as {preferences.email}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.unsubscribeButton}
                          onPress={handleUnsubscribeEmail}
                        >
                          <Text style={styles.unsubscribeButtonText}>Unsubscribe</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View>
                        <Text style={[styles.cardDescription, { color: textColor }]}>
                          Get daily event reminders with viewing directions sent to your inbox.
                        </Text>
                        <View style={[styles.emailInputContainer, { borderColor: accentColor }]}>
                          <Ionicons name="mail" size={18} color={accentColor} />
                          <TextInput
                            style={[styles.emailInput, { color: textColor }]}
                            placeholder="Enter your email"
                            placeholderTextColor={nightMode ? '#993333' : '#666666'}
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoCorrect={false}
                          />
                        </View>
                        <TouchableOpacity
                          style={[styles.subscribeButton, { backgroundColor: accentColor }]}
                          onPress={handleSubscribeEmail}
                          disabled={isSaving}
                        >
                          {isSaving ? (
                            <ActivityIndicator size="small" color="#000" />
                          ) : (
                            <Text style={styles.subscribeButtonText}>Subscribe</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Daily Digest Toggle */}
                    <View style={[styles.cardRow, { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' }]}>
                      <View style={styles.cardRowLeft}>
                        <View style={styles.cardRowText}>
                          <Text style={[styles.cardRowTitle, { color: textColor }]}>
                            Daily Digest
                          </Text>
                          <Text style={[styles.cardRowSubtitle, { color: textColor }]}>
                            One email per day with all events
                          </Text>
                        </View>
                      </View>
                      <Switch
                        value={preferences.dailyDigest}
                        onValueChange={(value) => updatePreferences({ dailyDigest: value })}
                        trackColor={{ false: '#333', true: accentColor }}
                        thumbColor="#fff"
                      />
                    </View>
                  </View>

                  {/* Event Types */}
                  <View style={[styles.card, { backgroundColor: cardBg }]}>
                    <View style={styles.cardHeader}>
                      <Ionicons name="telescope-outline" size={18} color={accentColor} />
                      <Text style={[styles.cardTitle, { color: textColor }]}>Event Types</Text>
                    </View>
                    <Text style={[styles.cardDescription, { color: textColor }]}>
                      Choose which events you want to be notified about.
                    </Text>

                    {EVENT_TYPES.map((eventType) => (
                      <TouchableOpacity
                        key={eventType.type}
                        style={[
                          styles.eventTypeItem,
                          preferences.eventTypes.includes(eventType.type) && {
                            backgroundColor: `${accentColor}22`,
                            borderColor: accentColor,
                          },
                        ]}
                        onPress={() => toggleEventType(eventType.type)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={eventType.icon}
                          size={24}
                          color={
                            preferences.eventTypes.includes(eventType.type) ? accentColor : '#666'
                          }
                        />
                        <View style={styles.eventTypeText}>
                          <Text
                            style={[
                              styles.eventTypeLabel,
                              {
                                color: preferences.eventTypes.includes(eventType.type)
                                  ? textColor
                                  : '#888',
                              },
                            ]}
                          >
                            {eventType.label}
                          </Text>
                          <Text style={[styles.eventTypeDescription, { color: textColor }]}>
                            {eventType.description}
                          </Text>
                        </View>
                        {preferences.eventTypes.includes(eventType.type) && (
                          <Ionicons name="checkmark-circle" size={20} color={accentColor} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Reminder Times */}
                  <View style={[styles.card, { backgroundColor: cardBg }]}>
                    <View style={styles.cardHeader}>
                      <Ionicons name="time-outline" size={18} color={accentColor} />
                      <Text style={[styles.cardTitle, { color: textColor }]}>Reminder Times</Text>
                    </View>
                    <Text style={[styles.cardDescription, { color: textColor }]}>
                      When should we notify you about upcoming events?
                    </Text>

                    <View style={styles.reminderGrid}>
                      {REMINDER_OPTIONS.map((option) => (
                        <TouchableOpacity
                          key={option.value}
                          style={[
                            styles.reminderChip,
                            preferences.reminderTimes.includes(option.value) && {
                              backgroundColor: accentColor,
                              borderColor: accentColor,
                            },
                          ]}
                          onPress={() => toggleReminderTime(option.value)}
                        >
                          <Text
                            style={[
                              styles.reminderChipText,
                              preferences.reminderTimes.includes(option.value) && {
                                color: '#000',
                              },
                            ]}
                          >
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </>
              )}

              {/* Save Button */}
              {hasChanges && (
                <TouchableOpacity
                  style={[styles.saveButton, { backgroundColor: accentColor }]}
                  onPress={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={20} color="#000" />
                      <Text style={styles.saveButtonText}>Save Preferences</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              <View style={{ height: 40 }} />
            </ScrollView>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  contentNight: {
    backgroundColor: '#1a0a0a',
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  closeButton: {
    padding: 4,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginLeft: 8,
    opacity: 0.8,
  },
  cardDescription: {
    fontSize: 13,
    opacity: 0.7,
    marginBottom: 12,
    lineHeight: 18,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  cardRowText: {
    marginLeft: 12,
    flex: 1,
  },
  cardRowTitle: {
    fontSize: 16,
  },
  cardRowSubtitle: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 2,
  },
  emailInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  emailInput: {
    flex: 1,
    fontSize: 16,
    marginLeft: 12,
  },
  subscribeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  subscribeButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
  subscribedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  subscribedText: {
    marginLeft: 8,
    fontSize: 14,
  },
  unsubscribeButton: {
    paddingVertical: 10,
  },
  unsubscribeButtonText: {
    color: '#ff4444',
    fontSize: 14,
  },
  eventTypeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  eventTypeText: {
    flex: 1,
    marginLeft: 12,
  },
  eventTypeLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  eventTypeDescription: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 2,
  },
  reminderGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  reminderChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  reminderChipText: {
    color: '#ffffff',
    fontSize: 13,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  saveButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default SubscriptionModal;
