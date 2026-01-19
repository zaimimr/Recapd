import { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { useEventStore } from '@/store/eventStore';
import { useColorScheme } from '@/components/useColorScheme';
import { Event } from '@/types/database';

interface EventPreview extends Event {
  participant_count?: number;
}

export default function JoinEventScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const createUser = useAuthStore((state) => state.createUser);
  const authLoading = useAuthStore((state) => state.isLoading);
  const { fetchEventByCode, joinEvent, isLoading, error, clearError } = useEventStore();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [code, setCode] = useState('');
  const [eventPreview, setEventPreview] = useState<EventPreview | null>(null);
  const [step, setStep] = useState<'code' | 'preview'>('code');
  const [displayName, setDisplayName] = useState('');
  const [nameError, setNameError] = useState('');

  async function handleLookup() {
    const trimmedCode = code.trim().toUpperCase();

    if (trimmedCode.length !== 6) {
      Alert.alert('Invalid Code', 'Please enter a 6-character code');
      return;
    }

    clearError();
    const event = await fetchEventByCode(trimmedCode);

    if (event) {
      setEventPreview(event);
      setStep('preview');
    }
  }

  async function handleJoin() {
    if (!eventPreview) return;

    let currentUser = user;

    if (!currentUser) {
      const trimmedName = displayName.trim();

      if (trimmedName.length < 2) {
        setNameError('Name must be at least 2 characters');
        return;
      }

      if (trimmedName.length > 30) {
        setNameError('Name must be 30 characters or less');
        return;
      }

      setNameError('');
      currentUser = await createUser(trimmedName);

      if (!currentUser) {
        Alert.alert('Error', 'Failed to create profile. Please try again.');
        return;
      }
    }

    const success = await joinEvent(eventPreview.id, currentUser.id);

    if (success) {
      router.replace(`/event/${eventPreview.id}`);
    } else {
      Alert.alert('Error', 'Failed to join event. Please try again.');
    }
  }

  function handleBack() {
    setStep('code');
    setEventPreview(null);
    setDisplayName('');
    setNameError('');
    clearError();
  }

  function formatCode(text: string) {
    return text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  }

  const isJoining = isLoading || authLoading;
  const canJoin = user || displayName.trim().length >= 2;

  if (step === 'preview' && eventPreview) {
    return (
      <KeyboardAvoidingView
        style={[styles.container, isDark && styles.containerDark]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>
          <View style={[styles.previewCard, isDark && styles.previewCardDark]}>
            <Text style={[styles.previewTitle, isDark && styles.textDark]}>
              {eventPreview.title}
            </Text>
            <Text style={[styles.previewDate, isDark && styles.textMuted]}>
              {format(new Date(eventPreview.starts_at), 'EEEE, MMMM d, yyyy')}
            </Text>
            <Text style={[styles.previewTime, isDark && styles.textMuted]}>
              {format(new Date(eventPreview.starts_at), 'h:mm a')} - {format(new Date(eventPreview.ends_at), 'h:mm a')}
            </Text>
            <View style={styles.previewStats}>
              <Text style={[styles.previewParticipants, isDark && styles.textMuted]}>
                {eventPreview.participant_count || 0} participant{eventPreview.participant_count !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>

          {!user && (
            <View style={styles.nameSection}>
              <Text style={[styles.nameLabel, isDark && styles.textDark]}>
                What should we call you?
              </Text>
              <TextInput
                style={[
                  styles.nameInput,
                  isDark && styles.nameInputDark,
                  nameError ? styles.inputError : null,
                ]}
                placeholder="Enter your name"
                placeholderTextColor={isDark ? '#666' : '#999'}
                value={displayName}
                onChangeText={(text) => {
                  setDisplayName(text);
                  setNameError('');
                }}
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={30}
              />
              {nameError ? <Text style={styles.errorText}>{nameError}</Text> : null}
              <Text style={[styles.nameHint, isDark && styles.textMuted]}>
                This is how you'll appear to others
              </Text>
            </View>
          )}

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, (!canJoin || isJoining) && styles.buttonDisabled]}
              onPress={handleJoin}
              disabled={!canJoin || isJoining}
            >
              {isJoining ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Join Event</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.backButton} onPress={handleBack}>
              <Text style={[styles.backButtonText, isDark && styles.textDark]}>
                Enter Different Code
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, isDark && styles.containerDark]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.title, isDark && styles.textDark]}>Join an Event</Text>
          <Text style={[styles.subtitle, isDark && styles.textMuted]}>
            Enter the 6-character code shared by the host
          </Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={[styles.codeInput, isDark && styles.codeInputDark]}
            placeholder="ABC123"
            placeholderTextColor={isDark ? '#444' : '#ccc'}
            value={code}
            onChangeText={(text) => setCode(formatCode(text))}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            keyboardType="default"
            returnKeyType="go"
            onSubmitEditing={handleLookup}
          />
          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>

        <TouchableOpacity
          style={[styles.button, (code.length !== 6 || isLoading) && styles.buttonDisabled]}
          onPress={handleLookup}
          disabled={code.length !== 6 || isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Find Event</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  containerDark: {
    backgroundColor: '#000',
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  form: {
    marginBottom: 24,
  },
  codeInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 24,
    fontSize: 32,
    fontWeight: '700',
    fontFamily: 'SpaceMono',
    color: '#000',
    textAlign: 'center',
    letterSpacing: 8,
  },
  codeInputDark: {
    backgroundColor: '#1a1a1a',
    color: '#fff',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
  },
  button: {
    backgroundColor: '#000',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  previewCard: {
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  previewCardDark: {
    backgroundColor: '#1a1a1a',
  },
  nameSection: {
    marginBottom: 24,
  },
  nameLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  nameInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    fontSize: 18,
    color: '#000',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  nameInputDark: {
    backgroundColor: '#1a1a1a',
    color: '#fff',
  },
  inputError: {
    borderColor: '#ef4444',
  },
  nameHint: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  previewTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
    textAlign: 'center',
  },
  previewDate: {
    fontSize: 16,
    color: '#666',
    marginBottom: 4,
  },
  previewTime: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
  },
  previewStats: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e5e5',
    width: '100%',
    alignItems: 'center',
  },
  previewParticipants: {
    fontSize: 14,
    color: '#666',
  },
  actions: {
    gap: 12,
  },
  backButton: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '500',
  },
  textDark: {
    color: '#fff',
  },
  textMuted: {
    color: '#888',
  },
});
