import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { supabase } from "@/lib/supabase";
import type { User, UserInsert, UserUpdate } from "@/types/database";

const DEVICE_ID_KEY = "recapd_device_id";

let SecureStore: typeof import("expo-secure-store") | null = null;
try {
	SecureStore = require("expo-secure-store");
} catch {
	// SecureStore not available (dev client without native module)
}

interface AuthState {
	user: User | null;
	isLoading: boolean;
	isInitialized: boolean;
	deviceId: string | null;
	initializeAuth: () => Promise<void>;
	createUser: (displayName: string) => Promise<User | null>;
	updateDisplayName: (displayName: string) => Promise<boolean>;
	logout: () => Promise<void>;
}

async function getOrCreateDeviceId(): Promise<string> {
	// Try to get from SecureStore first (survives reinstall)
	if (SecureStore) {
		try {
			const existingId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
			if (existingId) {
				return existingId;
			}
		} catch {
			// SecureStore might not be available
		}
	}

	// Try AsyncStorage as fallback
	try {
		const existingId = await AsyncStorage.getItem(DEVICE_ID_KEY);
		if (existingId) {
			return existingId;
		}
	} catch {
		// AsyncStorage might fail
	}

	// Generate new device ID
	let deviceId: string;

	if (Platform.OS === "ios") {
		const iosId = await Application.getIosIdForVendorAsync();
		if (iosId) {
			deviceId = iosId;
		} else {
			const randomBytes = await Crypto.getRandomBytesAsync(16);
			deviceId = Array.from(randomBytes)
				.map((b) => b.toString(16).padStart(2, "0"))
				.join("");
		}
	} else {
		const androidId = Application.getAndroidId();
		if (androidId) {
			deviceId = androidId;
		} else {
			const randomBytes = await Crypto.getRandomBytesAsync(16);
			deviceId = Array.from(randomBytes)
				.map((b) => b.toString(16).padStart(2, "0"))
				.join("");
		}
	}

	// Save to SecureStore if available
	if (SecureStore) {
		try {
			await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
		} catch {
			// SecureStore might fail
		}
	}

	// Also save to AsyncStorage as backup
	try {
		await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
	} catch {
		// AsyncStorage might fail
	}

	return deviceId;
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

					const deviceId = await getOrCreateDeviceId();
					set({ deviceId });

					const { data: existingUser } = await supabase
						.from("users")
						.select("*")
						.eq("device_id", deviceId)
						.single();

					if (existingUser) {
						const updateData: UserUpdate = {
							last_seen_at: new Date().toISOString(),
						};
						const { error: updateError } = await supabase
							.from("users")
							.update(updateData)
							.eq("id", existingUser.id);
						if (updateError) {
							console.error("Failed to update last_seen_at:", updateError);
						}

						set({
							user: existingUser as User,
							isLoading: false,
							isInitialized: true,
						});
					} else {
						set({ isLoading: false, isInitialized: true });
					}
				} catch (error) {
					console.error("Auth initialization error:", error);
					set({ isLoading: false, isInitialized: true });
				}
			},

			createUser: async (displayName: string) => {
				try {
					set({ isLoading: true });

					const trimmedName = displayName.trim();
					if (trimmedName.length < 2 || trimmedName.length > 30) {
						set({ isLoading: false });
						return null;
					}
					const deviceId = await getOrCreateDeviceId();
					set({ deviceId });

					const insertData: UserInsert = {
						display_name: trimmedName,
						device_id: deviceId,
					};

					const { data, error } = await supabase.from("users").insert(insertData).select().single();

					if (error) throw error;

					set({ user: data as User, isLoading: false });
					return data as User;
				} catch (error) {
					console.error("Create user error:", error);
					set({ isLoading: false });
					return null;
				}
			},

			updateDisplayName: async (displayName: string): Promise<boolean> => {
				const { user } = get();
				if (!user) return false;

				try {
					const updateData: UserUpdate = { display_name: displayName };
					const { error } = await supabase.from("users").update(updateData).eq("id", user.id);

					if (error) throw error;

					set({ user: { ...user, display_name: displayName } });
					return true;
				} catch (error) {
					console.error("Update display name error:", error);
					return false;
				}
			},

			logout: async () => {
				set({ user: null, isInitialized: false });
			},
		}),
		{
			name: "recapd-auth",
			storage: createJSONStorage(() => AsyncStorage),
			partialize: (state) => ({ deviceId: state.deviceId }),
		}
	)
);
