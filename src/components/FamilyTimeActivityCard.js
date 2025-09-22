import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function FamilyTimeActivityCard({ activity, onPress, onEdit, onDelete }) {
  // Activity type configuration for icons and colors
  const activityTypeConfig = {
    'Reading Time': { icon: 'book-outline', color: '#4CAF50' },
    'Sports': { icon: 'fitness-outline', color: '#FF9800' },
    'Adventure': { icon: 'map-outline', color: '#2196F3' },
    'Important': { icon: 'star-outline', color: '#F44336' }
  };

  // Feeling configuration for colors
  const feelingConfig = {
    'Exciting': { color: '#FFD700', emoji: '🤩' },
    'Happy': { color: '#4CAF50', emoji: '😊' },
    'Sad': { color: '#2196F3', emoji: '😢' }
  };

  const typeConfig = activityTypeConfig[activity.type] || { icon: 'calendar-outline', color: '#666' };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDuration = () => {
    const startTime = new Date(activity.startTime);
    const endTime = new Date(activity.endTime);
    const durationMs = endTime - startTime;
    const durationMins = Math.round(durationMs / (1000 * 60));
    
    if (durationMins < 60) {
      return `${durationMins} min`;
    } else {
      const hours = Math.floor(durationMins / 60);
      const mins = durationMins % 60;
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
  };

  const renderParticipants = () => {
    return (
      <View style={styles.participantsContainer}>
        <Text style={styles.participantsLabel}>Participants:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.participantsList}>
          {activity.participants.map((participant, index) => {
            const feelingInfo = feelingConfig[participant.feeling];
            return (
              <View key={`${participant.childId}-${index}`} style={styles.participantItem}>
                <View style={[styles.participantAvatar, { borderColor: feelingInfo.color }]}>
                  <Text style={styles.participantEmoji}>{participant.childName.charAt(0)}</Text>
                </View>
                <Text style={styles.participantName} numberOfLines={1}>
                  {participant.childName}
                </Text>
                <Text style={styles.participantFeeling}>
                  {feelingInfo.emoji}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const renderPhotos = () => {
    if (!activity.photos || activity.photos.length === 0) {
      return null;
    }

    return (
      <View style={styles.photosContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosList}>
          {activity.photos.slice(0, 3).map((photoUri, index) => (
            <Image
              key={index}
              source={{ uri: photoUri }}
              style={styles.photoThumbnail}
              resizeMode="cover"
            />
          ))}
          {activity.photos.length > 3 && (
            <View style={styles.morePhotosIndicator}>
              <Text style={styles.morePhotosText}>+{activity.photos.length - 3}</Text>
            </View>
          )}
        </ScrollView>
      </View>
    );
  };

  const renderBookInfo = () => {
    if (activity.type !== 'Reading Time' || !activity.bookInfo) {
      return null;
    }

    return (
      <View style={styles.bookInfoContainer}>
        <Ionicons name="book" size={16} color="#4CAF50" />
        <View style={styles.bookDetails}>
          <Text style={styles.bookTitle} numberOfLines={1}>
            {activity.bookInfo.title}
          </Text>
          <Text style={styles.bookAuthor} numberOfLines={1}>
            by {activity.bookInfo.author}
          </Text>
        </View>
        {activity.bookInfo.detectedByAI && (
          <View style={styles.aiDetectedBadge}>
            <Text style={styles.aiDetectedText}>AI</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <TouchableOpacity style={styles.container} onPress={() => onPress && onPress(activity)} activeOpacity={0.7}>
      {/* Header with activity type and actions */}
      <View style={styles.header}>
        <View style={styles.typeContainer}>
          <View style={[styles.typeIcon, { backgroundColor: typeConfig.color }]}>
            <Ionicons name={typeConfig.icon} size={20} color="white" />
          </View>
          <View style={styles.titleContainer}>
            <Text style={styles.activityTitle} numberOfLines={1}>
              {activity.title}
            </Text>
            <Text style={styles.activityType}>
              {activity.type}
            </Text>
          </View>
        </View>
        
        <View style={styles.actionsContainer}>
          {onEdit && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={(e) => {
                e.stopPropagation();
                onEdit(activity);
              }}
            >
              <Ionicons name="pencil-outline" size={18} color="#666" />
            </TouchableOpacity>
          )}
          {onDelete && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={(e) => {
                e.stopPropagation();
                onDelete(activity);
              }}
            >
              <Ionicons name="trash-outline" size={18} color="#F44336" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Time and duration */}
      <View style={styles.timeContainer}>
        <View style={styles.timeItem}>
          <Ionicons name="time-outline" size={14} color="#666" />
          <Text style={styles.timeText}>
            {formatTime(activity.startTime)} - {formatTime(activity.endTime)}
          </Text>
        </View>
        <Text style={styles.durationText}>
          {formatDuration()}
        </Text>
      </View>

      {/* Location */}
      {activity.location && (
        <View style={styles.locationContainer}>
          <Ionicons name="location-outline" size={14} color="#666" />
          <Text style={styles.locationText} numberOfLines={1}>
            {activity.location}
          </Text>
        </View>
      )}

      {/* Book info for Reading Time activities */}
      {renderBookInfo()}

      {/* Participants */}
      {renderParticipants()}

      {/* Photos */}
      {renderPhotos()}

      {/* Remarks */}
      {activity.remarks && (
        <View style={styles.remarksContainer}>
          <Text style={styles.remarksText} numberOfLines={2}>
            {activity.remarks}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  typeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  typeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  titleContainer: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  activityType: {
    fontSize: 12,
    color: '#666',
    textTransform: 'uppercase',
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    padding: 8,
    marginLeft: 4,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  timeItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 6,
  },
  durationText: {
    fontSize: 12,
    color: '#48b6b0',
    fontWeight: '500',
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  locationText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 6,
    flex: 1,
  },
  bookInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f8f0',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  bookDetails: {
    flex: 1,
    marginLeft: 8,
  },
  bookTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  bookAuthor: {
    fontSize: 12,
    color: '#666',
  },
  aiDetectedBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  aiDetectedText: {
    fontSize: 10,
    color: 'white',
    fontWeight: '600',
  },
  participantsContainer: {
    marginBottom: 8,
  },
  participantsLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 6,
  },
  participantsList: {
    flexDirection: 'row',
  },
  participantItem: {
    alignItems: 'center',
    marginRight: 12,
    minWidth: 50,
  },
  participantAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    marginBottom: 4,
  },
  participantEmoji: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  participantName: {
    fontSize: 10,
    color: '#666',
    textAlign: 'center',
    marginBottom: 2,
  },
  participantFeeling: {
    fontSize: 12,
  },
  photosContainer: {
    marginBottom: 8,
  },
  photosList: {
    flexDirection: 'row',
  },
  photoThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 8,
  },
  morePhotosIndicator: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderStyle: 'dashed',
  },
  morePhotosText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  remarksContainer: {
    backgroundColor: '#f8f9fa',
    padding: 8,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#48b6b0',
  },
  remarksText: {
    fontSize: 14,
    color: '#333',
    fontStyle: 'italic',
  },
});