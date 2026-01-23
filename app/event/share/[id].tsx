import { useColorScheme } from "@/components/useColorScheme";
import { useEventStore } from "@/store/eventStore";
import { format } from "date-fns";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";

export default function ShareEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { fetchEventById, currentEvent, isLoading } = useEventStore();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (id) {
      fetchEventById(id);
    }
  }, [id]);

  async function handleCopyCode() {
    if (currentEvent?.join_code) {
      await Clipboard.setStringAsync(currentEvent.join_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handleShare() {
    if (!currentEvent) return;

    const shareUrl = `https://recapd.app/join/${currentEvent.join_code}`;
    const message = `Join "${currentEvent.title}" on Recapd!\n\nCode: ${currentEvent.join_code}\n\n${format(new Date(currentEvent.starts_at), "EEE, MMM d")} • ${format(new Date(currentEvent.starts_at), "h:mm a")} - ${format(new Date(currentEvent.ends_at), "h:mm a")}\n\n${shareUrl}`;

    try {
      await Share.share({
        message,
        title: `Join ${currentEvent.title}`,
      });
    } catch {
      Alert.alert("Error", "Failed to share");
    }
  }

  function handleDone() {
    router.replace(`/event/${id}`);
  }

  if (isLoading || !currentEvent) {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          isDark && styles.containerDark,
        ]}
      >
        <ActivityIndicator size="large" color={isDark ? "#fff" : "#000"} />
      </View>
    );
  }

  const joinUrl = `https://recapd.app/join/${currentEvent.join_code}`;

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.title, isDark && styles.textDark]}>
            {currentEvent.title}
          </Text>
          <Text style={[styles.subtitle, isDark && styles.textMuted]}>
            {format(new Date(currentEvent.starts_at), "EEE, MMM d")} •{" "}
            {format(new Date(currentEvent.starts_at), "h:mm a")} -{" "}
            {format(new Date(currentEvent.ends_at), "h:mm a")}
          </Text>
        </View>

        <View style={styles.qrContainer}>
          <View style={styles.qrWrapper}>
            <QRCode
              value={joinUrl}
              size={200}
              backgroundColor="#fff"
              color="#000"
            />
          </View>
        </View>

        <View style={styles.codeSection}>
          <Text style={[styles.codeLabel, isDark && styles.textMuted]}>
            Join Code
          </Text>
          <TouchableOpacity style={styles.codeButton} onPress={handleCopyCode}>
            <Text style={[styles.codeText, isDark && styles.textDark]}>
              {currentEvent.join_code}
            </Text>
            <Text style={styles.copyHint}>
              {copied ? "Copied!" : "Tap to copy"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
            <Text style={styles.shareButtonText}>Share Invite</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
            <Text style={[styles.doneButtonText, isDark && styles.textDark]}>
              Done
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  containerDark: {
    backgroundColor: "#000",
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
    padding: 24,
    alignItems: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#000",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
  },
  qrContainer: {
    marginBottom: 32,
  },
  qrWrapper: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  codeSection: {
    alignItems: "center",
    marginBottom: 32,
  },
  codeLabel: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
  },
  codeButton: {
    alignItems: "center",
  },
  codeText: {
    fontSize: 36,
    fontWeight: "700",
    fontFamily: "SpaceMono",
    color: "#000",
    letterSpacing: 4,
  },
  copyHint: {
    fontSize: 14,
    color: "#3b82f6",
    marginTop: 4,
  },
  actions: {
    width: "100%",
    gap: 12,
    marginTop: "auto",
    paddingBottom: 24,
  },
  shareButton: {
    backgroundColor: "#000",
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: "center",
  },
  shareButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  doneButton: {
    paddingVertical: 16,
    alignItems: "center",
  },
  doneButtonText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "500",
  },
  textDark: {
    color: "#fff",
  },
  textMuted: {
    color: "#888",
  },
});
