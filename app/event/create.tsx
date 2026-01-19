import { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { format, addHours, setHours, setMinutes, isBefore } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { useEventStore } from '@/store/eventStore';
import { useColorScheme } from '@/components/useColorScheme';

export default function CreateEventScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const { createEvent, isLoading } = useEventStore();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  useEffect(() => {
    if (isInitialized && !user) {
      router.replace('/onboarding?returnTo=/event/create');
    }
  }, [isInitialized, user]);

  if (!isInitialized || !user) {
    return (
      <View style={[styles.container, isDark && styles.containerDark, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={isDark ? '#fff' : '#000'} />
      </View>
    );
  }

  const now = new Date();
  const defaultStart = setMinutes(setHours(now, now.getHours() + 1), 0);
  const defaultEnd = addHours(defaultStart, 4);

  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [startPickerMode, setStartPickerMode] = useState<'date' | 'time'>('date');
  const [endPickerMode, setEndPickerMode] = useState<'date' | 'time'>('date');
  const [error, setError] = useState('');

  function handleStartDateChange(event: DateTimePickerEvent, selectedDate?: Date) {
    if (Platform.OS === 'android') {
      setShowStartPicker(false);
      if (event.type === 'set' && selectedDate) {
        if (startPickerMode === 'date') {
          setStartDate(selectedDate);
          setStartPickerMode('time');
          setShowStartPicker(true);
        } else {
          setStartDate(selectedDate);
          if (isBefore(endDate, selectedDate)) {
            setEndDate(addHours(selectedDate, 4));
          }
        }
      }
    } else {
      if (selectedDate) {
        setStartDate(selectedDate);
        if (isBefore(endDate, selectedDate)) {
          setEndDate(addHours(selectedDate, 4));
        }
      }
    }
  }

  function handleEndDateChange(event: DateTimePickerEvent, selectedDate?: Date) {
    if (Platform.OS === 'android') {
      setShowEndPicker(false);
      if (event.type === 'set' && selectedDate) {
        if (endPickerMode === 'date') {
          setEndDate(selectedDate);
          setEndPickerMode('time');
          setShowEndPicker(true);
        } else {
          setEndDate(selectedDate);
        }
      }
    } else {
      if (selectedDate) {
        setEndDate(selectedDate);
      }
    }
  }

  function openStartPicker() {
    setStartPickerMode('date');
    setShowStartPicker(true);
  }

  function openEndPicker() {
    setEndPickerMode('date');
    setShowEndPicker(true);
  }

  async function handleCreate() {
    const trimmedTitle = title.trim();

    if (trimmedTitle.length < 2) {
      setError('Event name must be at least 2 characters');
      return;
    }

    if (isBefore(endDate, startDate)) {
      setError('End time must be after start time');
      return;
    }

    setError('');

    const event = await createEvent(
      {
        title: trimmedTitle,
        starts_at: startDate.toISOString(),
        ends_at: endDate.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      user!.id
    );

    if (event) {
      router.replace(`/event/share/${event.id}`);
    } else {
      Alert.alert('Error', 'Failed to create event. Please try again.');
    }
  }

  return (
    <ScrollView
      style={[styles.container, isDark && styles.containerDark]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.form}>
        <View style={styles.field}>
          <Text style={[styles.label, isDark && styles.textDark]}>Event Name</Text>
          <TextInput
            style={[styles.input, isDark && styles.inputDark]}
            placeholder="e.g., Sarah's Wedding"
            placeholderTextColor={isDark ? '#666' : '#999'}
            value={title}
            onChangeText={(text) => {
              setTitle(text);
              setError('');
            }}
            maxLength={50}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, isDark && styles.textDark]}>Start Time</Text>
          <TouchableOpacity
            style={[styles.dateButton, isDark && styles.dateButtonDark]}
            onPress={openStartPicker}
          >
            <Text style={[styles.dateText, isDark && styles.textDark]}>
              {format(startDate, 'EEE, MMM d, yyyy')}
            </Text>
            <Text style={[styles.timeText, isDark && styles.textMuted]}>
              {format(startDate, 'h:mm a')}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, isDark && styles.textDark]}>End Time</Text>
          <TouchableOpacity
            style={[styles.dateButton, isDark && styles.dateButtonDark]}
            onPress={openEndPicker}
          >
            <Text style={[styles.dateText, isDark && styles.textDark]}>
              {format(endDate, 'EEE, MMM d, yyyy')}
            </Text>
            <Text style={[styles.timeText, isDark && styles.textMuted]}>
              {format(endDate, 'h:mm a')}
            </Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.infoBox}>
          <Text style={[styles.infoText, isDark && styles.textMuted]}>
            After the event ends, guests will be prompted to share photos taken during this time window.
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.button, (!title.trim() || isLoading) && styles.buttonDisabled]}
        onPress={handleCreate}
        disabled={!title.trim() || isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Create Event</Text>
        )}
      </TouchableOpacity>

      {showStartPicker && (
        <DateTimePicker
          value={startDate}
          mode={Platform.OS === 'ios' ? 'datetime' : startPickerMode}
          display="default"
          onChange={handleStartDateChange}
        />
      )}

      {showEndPicker && (
        <DateTimePicker
          value={endDate}
          mode={Platform.OS === 'ios' ? 'datetime' : endPickerMode}
          display="default"
          onChange={handleEndDateChange}
          minimumDate={startDate}
        />
      )}
    </ScrollView>
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
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 24,
  },
  form: {
    gap: 24,
    marginBottom: 32,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    fontSize: 18,
    color: '#000',
  },
  inputDark: {
    backgroundColor: '#1a1a1a',
    color: '#fff',
  },
  dateButton: {
    backgroundColor: '#f5f5f5',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateButtonDark: {
    backgroundColor: '#1a1a1a',
  },
  dateText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
  },
  timeText: {
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
  },
  infoBox: {
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    padding: 16,
  },
  infoText: {
    fontSize: 14,
    color: '#0369a1',
    lineHeight: 20,
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
  textDark: {
    color: '#fff',
  },
  textMuted: {
    color: '#888',
  },
});
