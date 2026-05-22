import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session } from "@supabase/supabase-js";
import * as Application from "expo-application";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { logger } from "@/lib/logger";
import { supabase } from "@/lib/supabase";
import type {
	User,
	UserInsert,
	UserPrivateDataInsert,
	UserPrivateDataUpdate,
	UserUpdate,
} from "@/types/database";

const DEVICE_ID_KEY = "recapd_device_id";

let SecureStore: typeof import("expo-secure-store") | null = null;
try {
	SecureStore = require("expo-secure-store");
} catch {
	SecureStore = null;
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
	if (SecureStore) {
		try {
			const existingId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
			if (existingId) {
				return existingId;
			}
		} catch {
			// Continue with fallback storage.
		}
	}

	try {
		const existingId = await AsyncStorage.getItem(DEVICE_ID_KEY);
		if (existingId) {
			return existingId;
		}
	} catch {
		// Continue with generated ID.
	}

	let deviceId: string;

	if (Platform.OS === "ios") {
		const iosId = await Application.getIosIdForVendorAsync();
		if (iosId) {
			deviceId = iosId;
		} else {
			const randomBytes = await Crypto.getRandomBytesAsync(16);
			deviceId = Array.from(randomBytes)
				.map((byte) => byte.toString(16).padStart(2, "0"))
				.join("");
		}
	} else {
		const androidId = Application.getAndroidId();
		if (androidId) {
			deviceId = androidId;
		} else {
			const randomBytes = await Crypto.getRandomBytesAsync(16);
			deviceId = Array.from(randomBytes)
				.map((byte) => byte.toString(16).padStart(2, "0"))
				.join("");
		}
	}

	if (SecureStore) {
		try {
			await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
		} catch {
			// Continue with AsyncStorage backup.
		}
	}

	try {
		await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
	} catch {
		// Non-fatal local persistence failure.
	}

	return deviceId;
}

function isStaleRefreshTokenError(error: unknown): boolean {
	if (!error) {
		return false;
	}

	const message =
		typeof error === "string" ? error : ((error as { message?: string }).message ?? "");
	const code = (error as { code?: string }).code ?? "";
	const normalized = `${message} ${code}`.toLowerCase();

	return (
		normalized.includes("invalid refresh token") ||
		normalized.includes("refresh_token_already_used") ||
		normalized.includes("refresh token not found") ||
		normalized.includes("already used")
	);
}

async function createFreshAnonymousSession(): Promise<Session> {
	const { data, error } = await supabase.auth.signInAnonymously();
	if (error) {
		throw error;
	}

	if (!data.session) {
		throw new Error("Anonymous session was not created");
	}

	return data.session;
}

async function resolveAnonymousSession(): Promise<Session> {
	let session: Session | null = null;

	try {
		const result = await supabase.auth.getSession();
		if (result.error) {
			throw result.error;
		}
		session = result.data.session;
	} catch (error) {
		if (!isStaleRefreshTokenError(error)) {
			throw error;
		}

		logger.warn("Stale anonymous session detected, re-establishing", error);
		await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
		return createFreshAnonymousSession();
	}

	if (session) {
		return session;
	}

	return createFreshAnonymousSession();
}

let inFlightSession: Promise<Session> | null = null;
let inFlightInit: Promise<void> | null = null;

async function ensureAnonymousSession(): Promise<Session> {
	if (inFlightSession) {
		return inFlightSession;
	}

	inFlightSession = resolveAnonymousSession();

	try {
		return await inFlightSession;
	} finally {
		inFlightSession = null;
	}
}

async function getUserByAuthUserId(authUserId: string): Promise<User | null> {
	const { data, error } = await supabase
		.from("users")
		.select("*")
		.eq("auth_user_id", authUserId)
		.maybeSingle();

	if (error) {
		throw error;
	}

	return (data as User | null) ?? null;
}

async function syncPrivateUserData(userId: string, updates: UserPrivateDataUpdate): Promise<void> {
	const payload: UserPrivateDataInsert = {
		user_id: userId,
		...updates,
	};

	const { error } = await supabase.from("user_private_data").upsert(payload, {
		onConflict: "user_id",
	});

	if (
		error?.code === "23505" &&
		typeof updates.device_id === "string" &&
		updates.device_id.length > 0
	) {
		// Another row already claims this device ID. Keep auth init usable and sync the rest.
		const { error: fallbackError } = await supabase
			.from("user_private_data")
			.upsert({ ...payload, device_id: undefined }, { onConflict: "user_id" });

		if (fallbackError) {
			throw fallbackError;
		}

		return;
	}

	if (error) {
		throw error;
	}
}

async function linkLegacyProfile(deviceId: string, authUserId: string): Promise<User | null> {
	const { data: privateRecord, error: privateError } = await supabase
		.from("user_private_data")
		.select("user_id")
		.eq("device_id", deviceId)
		.maybeSingle();

	if (privateError) {
		throw privateError;
	}

	if (!privateRecord?.user_id) {
		return null;
	}

	const { data, error } = await supabase
		.from("users")
		.update({
			auth_user_id: authUserId,
			last_seen_at: new Date().toISOString(),
		})
		.eq("id", privateRecord.user_id)
		.is("auth_user_id", null)
		.select("*")
		.maybeSingle();

	if (error) {
		throw error;
	}

	if (data) {
		return data as User;
	}

	return getUserByAuthUserId(authUserId);
}

export const useAuthStore = create<AuthState>()(
	persist(
		(set, get) => ({
			user: null,
			isLoading: true,
			isInitialized: false,
			deviceId: null,

			initializeAuth: async () => {
				if (inFlightInit) {
					return inFlightInit;
				}

				inFlightInit = (async () => {
					try {
						set({ isLoading: true });

						const [deviceId, session] = await Promise.all([
							getOrCreateDeviceId(),
							ensureAnonymousSession(),
						]);

						set({ deviceId });

						const authUserId = session.user.id;
						let user = await getUserByAuthUserId(authUserId);

						if (!user) {
							user = await linkLegacyProfile(deviceId, authUserId);
						}

						if (user) {
							const updateData: UserUpdate = {
								last_seen_at: new Date().toISOString(),
							};
							const { error: updateError } = await supabase
								.from("users")
								.update(updateData)
								.eq("id", user.id);

							if (updateError) {
								logger.warn("Failed to update user last_seen_at", updateError, {
									userId: user.id,
								});
							}

							try {
								await syncPrivateUserData(user.id, { device_id: deviceId });
							} catch (privateError) {
								logger.warn("Failed to sync private user data during auth init", privateError, {
									userId: user.id,
								});
							}

							set({
								user,
								isLoading: false,
								isInitialized: true,
							});
							return;
						}

						set({ user: null, isLoading: false, isInitialized: true });
					} catch (error) {
						if (isStaleRefreshTokenError(error)) {
							logger.warn("Auth initialization recovered from stale session", error);
						} else {
							logger.error("Auth initialization failed", error);
						}
						set({ user: null, isLoading: false, isInitialized: true });
					}
				})();

				try {
					return await inFlightInit;
				} finally {
					inFlightInit = null;
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

					const [deviceId, session] = await Promise.all([
						getOrCreateDeviceId(),
						ensureAnonymousSession(),
					]);

					set({ deviceId });

					const authUserId = session.user.id;
					const existingUser = await getUserByAuthUserId(authUserId);
					if (existingUser) {
						set({ user: existingUser, isLoading: false });
						return existingUser;
					}

					const insertData: UserInsert = {
						display_name: trimmedName,
						auth_user_id: authUserId,
					};

					const { error } = await supabase.from("users").insert(insertData);
					if (error) {
						throw error;
					}

					const createdUser = await getUserByAuthUserId(authUserId);
					if (!createdUser) {
						throw new Error("Created user profile could not be loaded");
					}

					await syncPrivateUserData(createdUser.id, { device_id: deviceId });

					set({ user: createdUser, isLoading: false });
					return createdUser;
				} catch (error) {
					logger.error("Failed to create user profile", error);
					set({ isLoading: false });
					return null;
				}
			},

			updateDisplayName: async (displayName: string): Promise<boolean> => {
				const { user } = get();
				if (!user) {
					return false;
				}

				try {
					const updateData: UserUpdate = { display_name: displayName.trim() };
					const { error } = await supabase.from("users").update(updateData).eq("id", user.id);

					if (error) {
						throw error;
					}

					set({ user: { ...user, display_name: displayName.trim() } });
					return true;
				} catch (error) {
					logger.error("Failed to update display name", error, { userId: user.id });
					return false;
				}
			},

			logout: async () => {
				try {
					await supabase.auth.signOut();
				} catch (error) {
					logger.warn("Supabase sign out failed", error);
				} finally {
					set({ user: null, isInitialized: false });
				}
			},
		}),
		{
			name: "recapd-auth",
			storage: createJSONStorage(() => AsyncStorage),
			partialize: (state) => ({ deviceId: state.deviceId }),
		}
	)
);
