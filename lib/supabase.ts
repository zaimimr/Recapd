import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
	auth: {
		storage: AsyncStorage,
		autoRefreshToken: true,
		persistSession: true,
		detectSessionInUrl: false,
	},
});

supabase.auth.onAuthStateChange((_event, session) => {
	supabase.realtime.setAuth(session?.access_token ?? supabaseAnonKey);
});

supabase.auth.getSession().then(({ data }) => {
	supabase.realtime.setAuth(data.session?.access_token ?? supabaseAnonKey);
});
