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
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { useColorScheme } from '@/components/useColorScheme';

export default function OnboardingScreen() {
  const router = useRouter();
  const createUser = useAuthStore((state) => state.createUser);
  const isLoading = useAuthStore((state) => state.isLoading);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');

  async function handleContinue() {
    const trimmedName = displayName.trim();

    if (trimmedName.length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }

    if (trimmedName.length > 30) {
      setError('Name must be 30 characters or less');
      return;
    }

    setError('');
    const user = await createUser(trimmedName);

    if (user) {
      router.replace('/(tabs)');
    } else {
      setError('Failed to create profile. Please try again.');
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, isDark && styles.containerDark]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.logo, isDark && styles.textDark]}>Between</Text>
          <Text style={[styles.tagline, isDark && styles.textMuted]}>
            See the night from everyone's eyes
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={[styles.label, isDark && styles.textDark]}>What should we call you?</Text>
          <TextInput
            style={[
              styles.input,
              isDark && styles.inputDark,
              error ? styles.inputError : null,
            ]}
            placeholder="Enter your name"
            placeholderTextColor={isDark ? '#666' : '#999'}
            value={displayName}
            onChangeText={(text) => {
              setDisplayName(text);
              setError('');
            }}
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={30}
            returnKeyType="done"
            onSubmitEditing={handleContinue}
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Text style={[styles.hint, isDark && styles.textMuted]}>
            This is how you'll appear to others
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.button,
            (!displayName.trim() || isLoading) && styles.buttonDisabled,
          ]}
          onPress={handleContinue}
          disabled={!displayName.trim() || isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Continue</Text>
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
    marginBottom: 48,
  },
  logo: {
    fontSize: 42,
    fontWeight: '700',
    color: '#000',
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 16,
    color: '#666',
    marginTop: 8,
  },
  form: {
    marginBottom: 32,
  },
  label: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    fontSize: 18,
    color: '#000',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  inputDark: {
    backgroundColor: '#1a1a1a',
    color: '#fff',
  },
  inputError: {
    borderColor: '#ef4444',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    marginTop: 8,
  },
  hint: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
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
