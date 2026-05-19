import type { Session } from "@supabase/supabase-js";
import { create } from "zustand";
import { fetchProfile, signOut as supabaseSignOut, updateDisplayName } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

type AuthStatus = "loading" | "signed_in" | "signed_out";

interface AuthState {
	status: AuthStatus;
	session: Session | null;
	userId: string | null;
	displayName: string | null;
	isAnonymous: boolean;
	hydrate: () => Promise<void>;
	refreshProfile: () => Promise<void>;
	setDisplayName: (name: string) => Promise<void>;
	signOut: () => Promise<void>;
}

let authSubscription: { unsubscribe: () => void } | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
	status: "loading",
	session: null,
	userId: null,
	displayName: null,
	isAnonymous: false,

	hydrate: async () => {
		const { data } = await supabase.auth.getSession();
		applySession(set, data.session ?? null);
		if (data.session) {
			await get().refreshProfile();
		}

		if (!authSubscription) {
			const { data: sub } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
				applySession(set, nextSession);
				if (nextSession) {
					await get().refreshProfile();
				}
			});
			authSubscription = sub.subscription;
		}
	},

	refreshProfile: async () => {
		const userId = get().userId;
		if (!userId) return;
		try {
			const profile = await fetchProfile(userId);
			if (profile) set({ displayName: profile.display_name });
		} catch {}
	},

	setDisplayName: async (name) => {
		const userId = get().userId;
		if (!userId) throw new Error("Not signed in");
		await updateDisplayName(userId, name);
		set({ displayName: name.trim() });
	},

	signOut: async () => {
		await supabaseSignOut();
		set({
			status: "signed_out",
			session: null,
			userId: null,
			displayName: null,
			isAnonymous: false,
		});
	},
}));

function applySession(set: (partial: Partial<AuthState>) => void, session: Session | null) {
	if (!session) {
		set({
			status: "signed_out",
			session: null,
			userId: null,
			displayName: null,
			isAnonymous: false,
		});
		return;
	}
	const isAnonymous = session.user.is_anonymous === true;
	set({
		status: "signed_in",
		session,
		userId: session.user.id,
		isAnonymous,
	});
}
