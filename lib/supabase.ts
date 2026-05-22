import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Note: URL polyfill removed - React Native 0.81+ has built-in URL support

let SecureStore: typeof import("expo-secure-store") | null = null;
try {
	SecureStore = require("expo-secure-store");
} catch {
	SecureStore = null;
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

const authStorage = {
	async getItem(key: string) {
		if (SecureStore) {
			try {
				const secureValue = await SecureStore.getItemAsync(key);
				if (secureValue != null) {
					return secureValue;
				}
			} catch {
				// Fall back to AsyncStorage when SecureStore is unavailable.
			}
		}

		return AsyncStorage.getItem(key);
	},
	async setItem(key: string, value: string) {
		if (SecureStore) {
			try {
				await SecureStore.setItemAsync(key, value);
			} catch {
				// Keep AsyncStorage as a compatibility fallback.
			}
		}

		await AsyncStorage.setItem(key, value);
	},
	async removeItem(key: string) {
		if (SecureStore) {
			try {
				await SecureStore.deleteItemAsync(key);
			} catch {
				// Continue cleanup in AsyncStorage.
			}
		}

		await AsyncStorage.removeItem(key);
	},
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
	auth: {
		storage: authStorage,
		autoRefreshToken: true,
		persistSession: true,
		detectSessionInUrl: false,
	},
});
