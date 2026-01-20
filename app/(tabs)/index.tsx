import { useColorScheme } from "@/components/useColorScheme";
import { useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function HomeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <View style={styles.header}>
        <Text style={[styles.logo, isDark && styles.textDark]}>Recapd</Text>
        <Text style={[styles.tagline, isDark && styles.textMuted]}>
          See the night from everyone's eyes
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={() => router.push("/event/join")}
        >
          <Text style={styles.primaryButtonText}>Join Event</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.button,
            styles.secondaryButton,
            isDark && styles.secondaryButtonDark,
          ]}
          onPress={() => router.push("/event/create")}
        >
          <Text style={[styles.secondaryButtonText, isDark && styles.textDark]}>
            Create Event
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerText, isDark && styles.textMuted]}>
          Create an event to share photos with your group
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 24,
  },
  containerDark: {
    backgroundColor: "#000",
  },
  header: {
    marginTop: 60,
    alignItems: "center",
  },
  logo: {
    fontSize: 42,
    fontWeight: "700",
    color: "#000",
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 16,
    color: "#666",
    marginTop: 8,
  },
  actions: {
    flex: 1,
    justifyContent: "center",
    gap: 16,
  },
  button: {
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 14,
    alignItems: "center",
  },
  primaryButton: {
    backgroundColor: "#000",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  secondaryButton: {
    backgroundColor: "#f5f5f5",
  },
  secondaryButtonDark: {
    backgroundColor: "#1a1a1a",
  },
  secondaryButtonText: {
    color: "#000",
    fontSize: 18,
    fontWeight: "600",
  },
  footer: {
    alignItems: "center",
    paddingBottom: 40,
  },
  footerText: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
  },
  textDark: {
    color: "#fff",
  },
  textMuted: {
    color: "#888",
  },
});
