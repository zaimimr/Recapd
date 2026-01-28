import { useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  Modal,
  Animated,
} from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = 340;

interface NotificationPromptModalProps {
  visible: boolean;
  onEnable: () => void;
  onMaybeLater: () => void;
  isDark: boolean;
}

export default function NotificationPromptModal({
  visible,
  onEnable,
  onMaybeLater,
  isDark,
}: NotificationPromptModalProps) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

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

  const closeSheet = useCallback((callback: () => void) => {
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
      callback();
    });
  }, [translateY, backdropOpacity]);

  useEffect(() => {
    if (visible) {
      translateY.setValue(SHEET_HEIGHT);
      backdropOpacity.setValue(0);
      openSheet();
    }
  }, [visible, openSheet, translateY, backdropOpacity]);

  if (!visible) return null;

  function handleEnable() {
    closeSheet(onEnable);
  }

  function handleMaybeLater() {
    closeSheet(onMaybeLater);
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleMaybeLater}
    >
      <View style={styles.container}>
        <Animated.View
          style={[styles.backdrop, { opacity: backdropOpacity }]}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={handleMaybeLater}
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
          <View style={styles.handleContainer}>
            <View style={[styles.handle, isDark && styles.handleDark]} />
          </View>

          <View style={styles.content}>
            <View style={styles.iconContainer}>
              <FontAwesome name="bell" size={28} color="#fff" />
            </View>

            <Text style={[styles.title, isDark && styles.textDark]}>
              Never miss a memory
            </Text>

            <Text style={[styles.message, isDark && styles.textMuted]}>
              We'll send you a gentle nudge to upload your photos after events end — so everyone can relive the night together. No spam, ever. Promise.
            </Text>

            <TouchableOpacity
              style={styles.enableButton}
              onPress={handleEnable}
            >
              <Text style={styles.enableButtonText}>Enable Notifications</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.laterButton}
              onPress={handleMaybeLater}
            >
              <Text style={[styles.laterButtonText, isDark && styles.textMuted]}>
                Maybe Later
              </Text>
            </TouchableOpacity>
          </View>
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
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
    alignItems: 'center',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#7c3aed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  enableButton: {
    backgroundColor: '#000',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  enableButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  laterButton: {
    paddingVertical: 12,
  },
  laterButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  textDark: {
    color: '#fff',
  },
  textMuted: {
    color: '#888',
  },
});
