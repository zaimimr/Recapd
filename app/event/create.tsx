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
  Modal,
  Pressable,
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
  const [activePicker, setActivePicker] = useState<'start' | 'end' | null>(null);
  const [tempDate, setTempDate] = useState<Date>(defaultStart);
  const [androidPickerMode, setAndroidPickerMode] = useState<'date' | 'time'>('date');
  const [error, setError] = useState('');

  function openStartPicker() {
    setTempDate(startDate);
    setAndroidPickerMode('date');
    setActivePicker('start');
  }

  function openEndPicker() {
    setTempDate(endDate);
    setAndroidPickerMode('date');
    setActivePicker('end');
  }

  function handlePickerChange(event: DateTimePickerEvent, selectedDate?: Date) {
    if (Platform.OS === 'android') {
      if (event.type === 'dismissed') {
        setActivePicker(null);
        return;
      }
      if (event.type === 'set' && selectedDate) {
        if (androidPickerMode === 'date') {
          setTempDate(selectedDate);
          setAndroidPickerMode('time');
        } else {
          confirmSelection(selectedDate);
        }
      }
    } else {
      if (selectedDate) {
        setTempDate(selectedDate);
      }
    }
  }

  function confirmSelection(dateToConfirm?: Date) {
    const finalDate = dateToConfirm || tempDate;
    if (activePicker === 'start') {
      setStartDate(finalDate);
      if (isBefore(endDate, finalDate)) {
        setEndDate(addHours(finalDate, 4));
      }
    } else if (activePicker === 'end') {
      setEndDate(finalDate);
    }
    setActivePicker(null);
  }

  function cancelSelection() {
    setActivePicker(null);
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

      {Platform.OS === 'ios' && activePicker && (
        <Modal
          visible={true}
          transparent
          animationType="slide"
          onRequestClose={cancelSelection}
        >
          <Pressable style={styles.modalOverlay} onPress={cancelSelection}>
            <Pressable style={[styles.pickerSheet, isDark && styles.pickerSheetDark]}>
              <View style={[styles.pickerHeader, isDark && styles.pickerHeaderDark]}>
                <TouchableOpacity onPress={cancelSelection} style={styles.pickerHeaderButton}>
                  <Text style={styles.pickerCancelText}>Cancel</Text>
                </TouchableOpacity>
                <Text style={[styles.pickerTitle, isDark && styles.textDark]}>
                  {activePicker === 'start' ? 'Start Time' : 'End Time'}
                </Text>
                <TouchableOpacity onPress={() => confirmSelection()} style={styles.pickerHeaderButton}>
                  <Text style={styles.pickerDoneText}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={tempDate}
                mode="datetime"
                display="spinner"
                onChange={handlePickerChange}
                minimumDate={activePicker === 'end' ? startDate : undefined}
                textColor={isDark ? '#fff' : '#000'}
                style={styles.picker}
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {Platform.OS === 'android' && activePicker && (
        <DateTimePicker
          value={tempDate}
          mode={androidPickerMode}
          display="default"
          onChange={handlePickerChange}
          minimumDate={activePicker === 'end' && androidPickerMode === 'date' ? startDate : undefined}
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: '#f8f8f8',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
  },
  pickerSheetDark: {
    backgroundColor: '#1c1c1e',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  pickerHeaderDark: {
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  pickerHeaderButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 60,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
  pickerCancelText: {
    fontSize: 17,
    color: '#007AFF',
  },
  pickerDoneText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#007AFF',
    textAlign: 'right',
  },
  picker: {
    height: 216,
  },
});
