import { useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Dimensions,
  Modal,
  Animated,
  PanResponder,
} from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { getAvatarColor } from '@/lib/colors';
import { ParticipantWithStats } from '@/store/eventStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.55;
const DRAG_THRESHOLD = 50;

interface GuestSheetProps {
  visible: boolean;
  onClose: () => void;
  participants: ParticipantWithStats[];
  isDark: boolean;
}

export default function GuestSheet({
  visible,
  onClose,
  participants,
  isDark,
}: GuestSheetProps) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const sortedParticipants = [...participants].sort((a, b) => {
    if (a.role === 'host' && b.role !== 'host') return -1;
    if (a.role !== 'host' && b.role === 'host') return 1;
    return b.photoCount - a.photoCount;
  });

  const openSheet = useCallback(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [translateY, backdropOpacity]);

  const closeSheet = useCallback(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: SHEET_HEIGHT,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  }, [translateY, backdropOpacity, onClose]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy > 5;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > DRAG_THRESHOLD || gestureState.vy > 0.5) {
          closeSheet();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 20,
            stiffness: 200,
          }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (visible) {
      translateY.setValue(SHEET_HEIGHT);
      backdropOpacity.setValue(0);
      openSheet();
    }
  }, [visible, openSheet, translateY, backdropOpacity]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={closeSheet}
    >
      <View style={styles.container}>
        <Animated.View
          style={[styles.backdrop, { opacity: backdropOpacity }]}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={closeSheet}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            isDark && styles.sheetDark,
            {
              transform: [{ translateY }],
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <View {...panResponder.panHandlers}>
            <View style={styles.handleContainer}>
              <View style={[styles.handle, isDark && styles.handleDark]} />
            </View>

            <View style={[styles.header, isDark && styles.headerDark]}>
              <Text style={[styles.title, isDark && styles.textDark]}>
                {participants.length} Guest{participants.length !== 1 ? 's' : ''}
              </Text>
              <TouchableOpacity onPress={closeSheet} style={styles.closeButton}>
                <FontAwesome name="times" size={20} color={isDark ? '#8e8e93' : '#666'} />
              </TouchableOpacity>
            </View>
          </View>

          <FlatList
            data={sortedParticipants}
            keyExtractor={(item) => item.userId}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            bounces={false}
            renderItem={({ item }) => (
              <View style={styles.participantRow}>
                <View
                  style={[
                    styles.avatar,
                    { backgroundColor: getAvatarColor(item.displayName) },
                  ]}
                >
                  <Text style={styles.avatarText}>
                    {item.displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.participantInfo}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.participantName, isDark && styles.textDark]}>
                      {item.displayName}
                    </Text>
                    {item.role === 'host' && (
                      <View style={styles.hostBadge}>
                        <Text style={styles.hostBadgeText}>Host</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.status}>
                    {item.photoCount > 0
                      ? 'shared'
                      : item.noPhotosToUpload
                        ? 'nothing to share'
                        : 'waiting'}
                  </Text>
                </View>
                <View style={styles.photoCount}>
                  <Text style={[styles.photoCountValue, isDark && styles.photoCountValueDark]}>
                    {item.photoCount}
                  </Text>
                  <FontAwesome
                    name="camera"
                    size={12}
                    color={isDark ? '#8e8e93' : '#8e8e93'}
                  />
                </View>
              </View>
            )}
          />
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    maxHeight: SHEET_HEIGHT,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 20,
  },
  sheetDark: {
    backgroundColor: '#1c1c1e',
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  handle: {
    width: 36,
    height: 5,
    backgroundColor: '#d1d1d6',
    borderRadius: 2.5,
  },
  handleDark: {
    backgroundColor: '#48484a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(60, 60, 67, 0.12)',
  },
  headerDark: {
    borderBottomColor: 'rgba(84, 84, 88, 0.65)',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    letterSpacing: -0.4,
  },
  closeButton: {
    padding: 6,
    marginRight: -6,
  },
  list: {
    paddingHorizontal: 20,
    paddingTop: 6,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  participantInfo: {
    flex: 1,
    marginLeft: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  participantName: {
    fontSize: 17,
    fontWeight: '400',
    color: '#000',
    letterSpacing: -0.4,
  },
  hostBadge: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  hostBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  status: {
    fontSize: 14,
    color: '#8e8e93',
    marginTop: 2,
  },
  photoCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  photoCountValue: {
    fontSize: 17,
    fontWeight: '400',
    color: '#8e8e93',
  },
  photoCountValueDark: {
    color: '#8e8e93',
  },
  textDark: {
    color: '#fff',
  },
});
