import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import type { Database } from "../types/database";

const url = Constants.expoConfig?.extra?.supabaseUrl as string | undefined;
const anonKey = Constants.expoConfig?.extra?.supabaseAnonKey as string | undefined;

if (!url || !anonKey) {
	throw new Error("Missing supabaseUrl / supabaseAnonKey in app.json extra");
}

export const supabase = createClient<Database>(url, anonKey, {
	auth: {
		storage: AsyncStorage,
		autoRefreshToken: true,
		persistSession: true,
		detectSessionInUrl: false,
	},
});
