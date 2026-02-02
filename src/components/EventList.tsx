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
 * - Expandable details
 * - Pull to refresh
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
import { format, isToday, isTomorrow, differenceInDays } from 'date-fns';
import {
  AstronomicalEvent,
  EventType,
  EventPriority,
  GeographicCoordinates,
} from '../types';
import { eventAPI } from '../services/eventAPI';

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
  if (isToday(date)) {
    return 'Today';
  }
  if (isTomorrow(date)) {
    return 'Tomorrow';
  }
  const daysAway = differenceInDays(date, new Date());
  if (daysAway <= 7) {
    return format(date, 'EEEE'); // Day name
  }
  return format(date, 'MMM d');
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
 * Event detail modal
 */
interface EventDetailModalProps {
  event: AstronomicalEvent | null;
  onClose: () => void;
}

function EventDetailModal({ event, onClose }: EventDetailModalProps): JSX.Element | null {
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

          <ScrollView style={styles.modalBody}>
            <Text style={styles.modalTitle}>{event.name}</Text>

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
                  {format(event.peakTime, 'MMMM d, yyyy')}
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

            <View style={styles.descriptionContainer}>
              <Text style={styles.descriptionTitle}>About</Text>
              <Text style={styles.descriptionText}>{event.description}</Text>
            </View>

            {event.infoUrl && (
              <TouchableOpacity
                style={styles.linkButton}
                onPress={() => Linking.openURL(event.infoUrl!)}
              >
                <Ionicons name="open-outline" size={16} color="#4488ff" />
                <Text style={styles.linkButtonText}>Learn More</Text>
              </TouchableOpacity>
            )}
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
          <TouchableOpacity style={styles.closeHeaderButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#ffffff" />
          </TouchableOpacity>
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
        <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
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
});

export default EventList;
