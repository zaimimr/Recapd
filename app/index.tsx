import { Redirect } from "expo-router";
import { useAuthStore } from "@/store/authStore";

export default function Index() {
	const status = useAuthStore((s) => s.status);
	if (status === "signed_in") return <Redirect href="/(tabs)/events" />;
	return <Redirect href="/auth/login" />;
}
