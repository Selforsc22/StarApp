/**
 * Event List Component
 *
 * Displays upcoming astronomical events including:
 * - Meteor showers
 * - Aurora forecasts
 * - Space weather events
 *
 * Features:
 * - Grouped by date/category
 * - Priority indicators
 * - Expandable details with viewing directions
 * - Pull to refresh
 * - Subscription management
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Modal,
  ScrollView,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, isToday, isTomorrow, isYesterday, differenceInDays, startOfDay, subDays } from 'date-fns';
import {
  AstronomicalEvent,
  EventType,
  EventPriority,
  GeographicCoordinates,
} from '../types';
import { eventAPI } from '../services/eventAPI';
import { notificationService, ViewingDirection } from '../services/notificationService';
import { SubscriptionModal } from './SubscriptionModal';

interface EventListProps {
  location: GeographicCoordinates | null;
  isVisible: boolean;
  onClose: () => void;
}

interface EventItemProps {
  event: AstronomicalEvent;
  onPress: (event: AstronomicalEvent) => void;
}

/**
 * Get icon name for event type
 */
function getEventIcon(type: EventType): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 'meteor_shower':
      return 'sparkles';
    case 'aurora':
      return 'color-palette';
    case 'eclipse':
      return 'moon';
    case 'conjunction':
      return 'git-merge';
    case 'space_weather':
      return 'sunny';
    case 'comet':
      return 'planet';
    default:
      return 'star';
  }
}

/**
 * Get color for event priority
 */
function getPriorityColor(priority: EventPriority): string {
  switch (priority) {
    case 'critical':
      return '#ff4444';
    case 'high':
      return '#ff8800';
    case 'medium':
      return '#ffcc00';
    case 'low':
    default:
      return '#44aaff';
  }
}

/**
 * Format event date
 */
function formatEventDate(date: Date): string {
  if (isYesterday(date)) {
    return 'Yesterday';
  }
  if (isToday(date)) {
    return 'Today';
  }
  if (isTomorrow(date)) {
    return 'Tomorrow';
  }
  const daysAway = differenceInDays(date, new Date());
  if (daysAway > 0 && daysAway <= 7) {
    return format(date, 'EEEE'); // Day name
  }
  return format(date, 'MMM d');
}

/**
 * Check if event should be shown (yesterday or later)
 */
function shouldShowEvent(event: AstronomicalEvent): boolean {
  const now = new Date();
  const yesterday = startOfDay(subDays(now, 1));

  // Show if event starts from yesterday onwards
  if (event.startTime >= yesterday) {
    return true;
  }

  // Also show if event is still active (end time is in the future)
  if (event.endTime && event.endTime >= yesterday) {
    return true;
  }

  return false;
}

/**
 * Event item component
 */
function EventItem({ event, onPress }: EventItemProps): JSX.Element {
  const priorityColor = getPriorityColor(event.priority);
  const icon = getEventIcon(event.type);
  const isActive = event.startTime <= new Date() && (!event.endTime || event.endTime >= new Date());

  return (
    <TouchableOpacity
      style={[styles.eventItem, isActive && styles.eventItemActive]}
      onPress={() => onPress(event)}
      activeOpacity={0.7}
    >
      <View style={[styles.priorityIndicator, { backgroundColor: priorityColor }]} />

      <View style={styles.eventIcon}>
        <Ionicons name={icon} size={24} color={priorityColor} />
      </View>

      <View style={styles.eventContent}>
        <View style={styles.eventHeader}>
          <Text style={styles.eventName} numberOfLines={1}>
            {event.name}
          </Text>
          {isActive && (
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>ACTIVE</Text>
            </View>
          )}
        </View>

        <Text style={styles.eventDescription} numberOfLines={2}>
          {event.description}
        </Text>

        <View style={styles.eventMeta}>
          <Ionicons name="calendar-outline" size={12} color="#888888" />
          <Text style={styles.eventDate}>
            {formatEventDate(event.startTime)}
            {event.peakTime && ` · Peak: ${format(event.peakTime, 'MMM d')}`}
          </Text>
        </View>
      </View>

      <Ionicons name="chevron-forward" size={20} color="#666666" />
    </TouchableOpacity>
  );
}

/**
 * Event detail modal with viewing directions
 */
interface EventDetailModalProps {
  event: AstronomicalEvent | null;
  location: GeographicCoordinates | null;
  onClose: () => void;
  onSetReminder: (event: AstronomicalEvent) => void;
}

function EventDetailModal({ event, location, onClose, onSetReminder }: EventDetailModalProps): JSX.Element | null {
  const [viewingDirection, setViewingDirection] = useState<ViewingDirection | null>(null);

  useEffect(() => {
    if (event && location) {
      const direction = notificationService.getViewingDirection(
        event,
        location,
        event.peakTime || event.startTime
      );
      setViewingDirection(direction);
    } else {
      setViewingDirection(null);
    }
  }, [event, location]);

  if (!event) return null;

  const priorityColor = getPriorityColor(event.priority);
  const icon = getEventIcon(event.type);

  return (
    <Modal visible={!!event} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <View style={[styles.modalIcon, { backgroundColor: `${priorityColor}22` }]}>
              <Ionicons name={icon} size={32} color={priorityColor} />
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color="#ffffff" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle}>{event.name}</Text>

            {/* Viewing Direction Card */}
            {viewingDirection && (
              <View style={styles.viewingDirectionCard}>
                <View style={styles.viewingDirectionHeader}>
                  <Ionicons name="compass" size={20} color="#4488ff" />
                  <Text style={styles.viewingDirectionTitle}>Where to Look</Text>
                </View>

                <View style={styles.viewingDirectionMain}>
                  <View style={styles.compassDisplay}>
                    <Text style={styles.compassDirection}>{viewingDirection.compassDirection}</Text>
                    <Text style={styles.compassDegrees}>{viewingDirection.azimuth.toFixed(0)}°</Text>
                  </View>

                  <View style={styles.altitudeDisplay}>
                    <Ionicons
                      name={viewingDirection.altitude > 45 ? 'arrow-up' : 'arrow-forward'}
                      size={24}
                      color="#44ff88"
                    />
                    <Text style={styles.altitudeValue}>{viewingDirection.altitude.toFixed(0)}°</Text>
                    <Text style={styles.altitudeLabel}>altitude</Text>
                  </View>
                </View>

                <Text style={styles.viewingDirectionDescription}>
                  {viewingDirection.description}
                </Text>

                {!viewingDirection.isVisible && (
                  <View style={styles.visibilityWarning}>
                    <Ionicons name="warning" size={16} color="#ffaa00" />
                    <Text style={styles.visibilityWarningText}>
                      May not be visible from your current location
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Date & Time Info */}
            <View style={styles.dateTimeCard}>
              <View style={styles.detailRow}>
                <Ionicons name="calendar-outline" size={16} color="#888888" />
                <Text style={styles.detailLabel}>Start:</Text>
                <Text style={styles.detailValue}>
                  {format(event.startTime, 'MMMM d, yyyy')}
                </Text>
              </View>

              {event.endTime && (
                <View style={styles.detailRow}>
                  <Ionicons name="calendar-outline" size={16} color="#888888" />
                  <Text style={styles.detailLabel}>End:</Text>
                  <Text style={styles.detailValue}>
                    {format(event.endTime, 'MMMM d, yyyy')}
                  </Text>
                </View>
              )}

              {event.peakTime && (
                <View style={styles.detailRow}>
                  <Ionicons name="star-outline" size={16} color="#ffcc00" />
                  <Text style={styles.detailLabel}>Peak:</Text>
                  <Text style={styles.detailValue}>
                    {format(event.peakTime, 'MMMM d, yyyy h:mm a')}
                  </Text>
                </View>
              )}

              {event.intensity && (
                <View style={styles.detailRow}>
                  <Ionicons name="speedometer-outline" size={16} color="#888888" />
                  <Text style={styles.detailLabel}>
                    {event.type === 'meteor_shower' ? 'ZHR:' : 'Intensity:'}
                  </Text>
                  <Text style={styles.detailValue}>
                    {event.type === 'meteor_shower' ? `${event.intensity}/hour` : event.intensity}
                  </Text>
                </View>
              )}
            </View>

            {/* Description */}
            <View style={styles.descriptionContainer}>
              <Text style={styles.descriptionTitle}>About</Text>
              <Text style={styles.descriptionText}>{event.description}</Text>
            </View>

            {/* Viewing Tips */}
            <View style={styles.viewingTipsCard}>
              <Text style={styles.descriptionTitle}>Viewing Tips</Text>
              <View style={styles.viewingTip}>
                <Ionicons name="checkmark-circle" size={16} color="#44ff88" />
                <Text style={styles.viewingTipText}>
                  Find a dark location away from city lights
                </Text>
              </View>
              <View style={styles.viewingTip}>
                <Ionicons name="checkmark-circle" size={16} color="#44ff88" />
                <Text style={styles.viewingTipText}>
                  Allow 20-30 minutes for your eyes to adapt
                </Text>
              </View>
              {event.type === 'meteor_shower' && (
                <View style={styles.viewingTip}>
                  <Ionicons name="checkmark-circle" size={16} color="#44ff88" />
                  <Text style={styles.viewingTipText}>
                    Best viewing after midnight when the radiant is higher
                  </Text>
                </View>
              )}
              {event.type === 'aurora' && (
                <View style={styles.viewingTip}>
                  <Ionicons name="checkmark-circle" size={16} color="#44ff88" />
                  <Text style={styles.viewingTipText}>
                    Check for clear skies and look toward the pole
                  </Text>
                </View>
              )}
            </View>

            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={styles.reminderButton}
                onPress={() => onSetReminder(event)}
              >
                <Ionicons name="notifications-outline" size={18} color="#4488ff" />
                <Text style={styles.reminderButtonText}>Set Reminder</Text>
              </TouchableOpacity>

              {event.infoUrl && (
                <TouchableOpacity
                  style={styles.linkButton}
                  onPress={() => Linking.openURL(event.infoUrl!)}
                >
                  <Ionicons name="open-outline" size={16} color="#4488ff" />
                  <Text style={styles.linkButtonText}>Learn More</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <Text style={styles.sourceText}>Source: {event.source}</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Main EventList component
 */
export function EventList({ location, isVisible, onClose }: EventListProps): JSX.Element | null {
  const [events, setEvents] = useState<AstronomicalEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<AstronomicalEvent | null>(null);
  const [filter, setFilter] = useState<EventType | 'all'>('all');
  const [showSubscription, setShowSubscription] = useState(false);

  // Fetch events
  const fetchEvents = useCallback(async (refresh: boolean = false) => {
    try {
      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      const allEvents = await eventAPI.fetchAllEvents(location ?? undefined, refresh);
      setEvents(allEvents);
    } catch (error) {
      console.error('Failed to fetch events:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [location]);

  useEffect(() => {
    if (isVisible) {
      fetchEvents();
    }
  }, [isVisible, fetchEvents]);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    fetchEvents(true);
  }, [fetchEvents]);

  // Handle set reminder
  const handleSetReminder = useCallback(async (event: AstronomicalEvent) => {
    if (!location) {
      setShowSubscription(true);
      return;
    }

    await notificationService.initialize();
    const prefs = notificationService.getPreferences();

    if (!prefs.enabled) {
      setShowSubscription(true);
      return;
    }

    // Schedule notifications for configured reminder times
    for (const reminderTime of prefs.reminderTimes) {
      await notificationService.scheduleEventNotification(event, location, reminderTime);
    }

    // Show confirmation (in a real app, use a toast)
    alert(`Reminder set for ${event.name}`);
  }, [location]);

  // Filter events
  const filteredEvents = events.filter((event) => filter === 'all' || event.type === filter);

  // Group events by date
  const groupedEvents = filteredEvents.reduce<{ [key: string]: AstronomicalEvent[] }>(
    (groups, event) => {
      const dateKey = formatEventDate(event.startTime);
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(event);
      return groups;
    },
    {}
  );

  // Convert to flat list with headers
  const listData: Array<{ type: 'header' | 'event'; data: string | AstronomicalEvent }> = [];
  Object.entries(groupedEvents).forEach(([date, dateEvents]) => {
    listData.push({ type: 'header', data: date });
    dateEvents.forEach((event) => {
      listData.push({ type: 'event', data: event });
    });
  });

  if (!isVisible) return null;

  return (
    <Modal visible={isVisible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Astronomical Events</Text>
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={styles.subscribeHeaderButton}
              onPress={() => setShowSubscription(true)}
            >
              <Ionicons name="notifications-outline" size={22} color="#4488ff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeHeaderButton} onPress={onClose}>
              <Ionicons name="close" size={24} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Filter tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterContainer}
          contentContainerStyle={styles.filterContent}
        >
          {[
            { key: 'all', label: 'All', icon: 'list' },
            { key: 'meteor_shower', label: 'Meteors', icon: 'sparkles' },
            { key: 'aurora', label: 'Aurora', icon: 'color-palette' },
            { key: 'space_weather', label: 'Space Weather', icon: 'sunny' },
          ].map((item) => (
            <TouchableOpacity
              key={item.key}
              style={[
                styles.filterTab,
                filter === item.key && styles.filterTabActive,
              ]}
              onPress={() => setFilter(item.key as EventType | 'all')}
            >
              <Ionicons
                name={item.icon as any}
                size={16}
                color={filter === item.key ? '#ffffff' : '#888888'}
              />
              <Text
                style={[
                  styles.filterTabText,
                  filter === item.key && styles.filterTabTextActive,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Event list */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4488ff" />
            <Text style={styles.loadingText}>Loading events...</Text>
          </View>
        ) : listData.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="telescope-outline" size={64} color="#444444" />
            <Text style={styles.emptyText}>No upcoming events</Text>
            <Text style={styles.emptySubtext}>
              Check back later for meteor showers, aurora forecasts, and more!
            </Text>
          </View>
        ) : (
          <FlatList
            data={listData}
            keyExtractor={(item, index) =>
              item.type === 'header' ? `header-${item.data}` : `event-${(item.data as AstronomicalEvent).id}`
            }
            renderItem={({ item }) => {
              if (item.type === 'header') {
                return (
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionHeaderText}>{item.data as string}</Text>
                  </View>
                );
              }
              return (
                <EventItem
                  event={item.data as AstronomicalEvent}
                  onPress={setSelectedEvent}
                />
              );
            }}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor="#4488ff"
                colors={['#4488ff']}
              />
            }
            contentContainerStyle={styles.listContent}
          />
        )}

        {/* Event detail modal */}
        <EventDetailModal
          event={selectedEvent}
          location={location}
          onClose={() => setSelectedEvent(null)}
          onSetReminder={handleSetReminder}
        />

        {/* Subscription modal */}
        <SubscriptionModal
          visible={showSubscription}
          onClose={() => setShowSubscription(false)}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a1a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#0a0a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#222244',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subscribeHeaderButton: {
    padding: 8,
    marginRight: 8,
  },
  closeHeaderButton: {
    padding: 8,
  },
  filterContainer: {
    backgroundColor: '#0a0a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#222244',
  },
  filterContent: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 4,
    borderRadius: 20,
    backgroundColor: '#1a1a2e',
  },
  filterTabActive: {
    backgroundColor: '#4488ff',
  },
  filterTabText: {
    color: '#888888',
    fontSize: 14,
    marginLeft: 6,
  },
  filterTabTextActive: {
    color: '#ffffff',
  },
  listContent: {
    paddingBottom: 100,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#0f0f1f',
  },
  sectionHeaderText: {
    color: '#888888',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  eventItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#0a0a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2e',
  },
  eventItemActive: {
    backgroundColor: '#0f1020',
  },
  priorityIndicator: {
    width: 4,
    height: '100%',
    borderRadius: 2,
    marginRight: 12,
  },
  eventIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  eventContent: {
    flex: 1,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  eventName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  activeBadge: {
    backgroundColor: '#44ff44',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  activeBadgeText: {
    color: '#000000',
    fontSize: 10,
    fontWeight: 'bold',
  },
  eventDescription: {
    color: '#888888',
    fontSize: 13,
    marginBottom: 4,
  },
  eventMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eventDate: {
    color: '#666666',
    fontSize: 12,
    marginLeft: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888888',
    fontSize: 14,
    marginTop: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtext: {
    color: '#666666',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4e',
  },
  modalIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    padding: 8,
  },
  modalBody: {
    padding: 20,
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailLabel: {
    color: '#888888',
    fontSize: 14,
    marginLeft: 8,
    marginRight: 4,
  },
  detailValue: {
    color: '#ffffff',
    fontSize: 14,
  },
  descriptionContainer: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#0f0f1f',
    borderRadius: 12,
  },
  descriptionTitle: {
    color: '#888888',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  descriptionText: {
    color: '#cccccc',
    fontSize: 14,
    lineHeight: 22,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    padding: 12,
    borderWidth: 1,
    borderColor: '#4488ff',
    borderRadius: 8,
  },
  linkButtonText: {
    color: '#4488ff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#2a2a4e',
    alignItems: 'center',
  },
  sourceText: {
    color: '#666666',
    fontSize: 12,
  },
  // Viewing direction styles
  viewingDirectionCard: {
    backgroundColor: 'rgba(68, 136, 255, 0.1)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(68, 136, 255, 0.3)',
  },
  viewingDirectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  viewingDirectionTitle: {
    color: '#4488ff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
    textTransform: 'uppercase',
  },
  viewingDirectionMain: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 12,
  },
  compassDisplay: {
    alignItems: 'center',
  },
  compassDirection: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: 'bold',
  },
  compassDegrees: {
    color: '#888888',
    fontSize: 14,
    marginTop: 4,
  },
  altitudeDisplay: {
    alignItems: 'center',
  },
  altitudeValue: {
    color: '#44ff88',
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 4,
  },
  altitudeLabel: {
    color: '#888888',
    fontSize: 12,
  },
  viewingDirectionDescription: {
    color: '#cccccc',
    fontSize: 14,
    lineHeight: 20,
  },
  visibilityWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    padding: 10,
    backgroundColor: 'rgba(255, 170, 0, 0.1)',
    borderRadius: 8,
  },
  visibilityWarningText: {
    color: '#ffaa00',
    fontSize: 13,
    marginLeft: 8,
    flex: 1,
  },
  dateTimeCard: {
    backgroundColor: '#0f0f1f',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  viewingTipsCard: {
    backgroundColor: '#0f0f1f',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  viewingTip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 10,
  },
  viewingTipText: {
    color: '#cccccc',
    fontSize: 13,
    marginLeft: 10,
    flex: 1,
    lineHeight: 18,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
  },
  reminderButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    backgroundColor: 'rgba(68, 136, 255, 0.15)',
    borderWidth: 1,
    borderColor: '#4488ff',
    borderRadius: 12,
  },
  reminderButtonText: {
    color: '#4488ff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default EventList;
