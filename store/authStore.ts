import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { User, UserInsert, UserUpdate } from '@/types/database';
import * as Crypto from 'expo-crypto';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isInitialized: boolean;
  deviceId: string | null;
  initializeAuth: () => Promise<void>;
  createUser: (displayName: string) => Promise<User | null>;
  updateDisplayName: (displayName: string) => Promise<void>;
  logout: () => Promise<void>;
}

async function generateDeviceId(): Promise<string> {
  const randomBytes = await Crypto.getRandomBytesAsync(16);
  return Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: true,
      isInitialized: false,
      deviceId: null,

      initializeAuth: async () => {
        try {
          set({ isLoading: true });
          let { deviceId } = get();

          if (!deviceId) {
            deviceId = await generateDeviceId();
            set({ deviceId });
          }

          const { data: existingUser } = await supabase
            .from('users')
            .select('*')
            .eq('device_id', deviceId)
            .single();

          if (existingUser) {
            const updateData: UserUpdate = { last_seen_at: new Date().toISOString() };
            await supabase
              .from('users')
              .update(updateData)
              .eq('id', existingUser.id);

            set({ user: existingUser as User, isLoading: false, isInitialized: true });
          } else {
            set({ isLoading: false, isInitialized: true });
          }
        } catch (error) {
          console.error('Auth initialization error:', error);
          set({ isLoading: false, isInitialized: true });
        }
      },

      createUser: async (displayName: string) => {
        try {
          set({ isLoading: true });
          let { deviceId } = get();

          if (!deviceId) {
            deviceId = await generateDeviceId();
            set({ deviceId });
          }

          const insertData: UserInsert = {
            display_name: displayName,
            device_id: deviceId,
          };

          const { data, error } = await supabase
            .from('users')
            .insert(insertData)
            .select()
            .single();

          if (error) throw error;

          set({ user: data as User, isLoading: false });
          return data as User;
        } catch (error) {
          console.error('Create user error:', error);
          set({ isLoading: false });
          return null;
        }
      },

      updateDisplayName: async (displayName: string) => {
        const { user } = get();
        if (!user) return;

        try {
          const updateData: UserUpdate = { display_name: displayName };
          const { error } = await supabase
            .from('users')
            .update(updateData)
            .eq('id', user.id);

          if (error) throw error;

          set({ user: { ...user, display_name: displayName } });
        } catch (error) {
          console.error('Update display name error:', error);
        }
      },

      logout: async () => {
        set({ user: null, deviceId: null, isInitialized: false });
      },
    }),
    {
      name: 'between-auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ deviceId: state.deviceId }),
    }
  )
);
