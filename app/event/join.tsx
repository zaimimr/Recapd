import FontAwesome from "@expo/vector-icons/FontAwesome";
import { format } from "date-fns";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	KeyboardAvoidingView,
	Modal,
	Platform,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";
import { useColorScheme } from "@/components/useColorScheme";
import { SUBSCRIPTIONS_ENABLED } from "@/lib/subscription";
import { useAuthStore } from "@/store/authStore";
import { type EventWithParticipants, useEventStore } from "@/store/eventStore";
import { useSubscriptionStore } from "@/store/subscriptionStore";
import { FREE_PARTICIPANT_LIMIT } from "@/types/subscription";

export default function JoinEventScreen() {
	const router = useRouter();
	const user = useAuthStore((state) => state.user);
	const createUser = useAuthStore((state) => state.createUser);
	const authLoading = useAuthStore((state) => state.isLoading);
	const { fetchEventByCode, joinEvent, isLoading, error, clearError } = useEventStore();
	const colorScheme = useColorScheme();
	const isDark = colorScheme === "dark";

	const [code, setCode] = useState("");
	const [eventPreview, setEventPreview] = useState<EventWithParticipants | null>(null);
	const [step, setStep] = useState<"code" | "preview">("code");
	const [displayName, setDisplayName] = useState("");
	const [nameError, setNameError] = useState("");
	const [scannerVisible, setScannerVisible] = useState(false);
	const [permission, requestPermission] = useCameraPermissions();
	const hasScanned = useRef(false);

	async function handleLookup(eventCode?: string) {
		const trimmedCode = (eventCode || code).trim().toUpperCase();

		if (trimmedCode.length !== 6) {
			Alert.alert("Invalid Code", "Please enter a 6-character code");
			return;
		}

		clearError();
		const event = await fetchEventByCode(trimmedCode);

		if (event) {
			setEventPreview(event);
			setStep("preview");
		}
	}

	async function handleJoin() {
		if (!eventPreview) return;

		let currentUser = user;

		if (!currentUser) {
			const trimmedName = displayName.trim();

			if (trimmedName.length < 2) {
				setNameError("Name must be at least 2 characters");
				return;
			}

			if (trimmedName.length > 30) {
				setNameError("Name must be 30 characters or less");
				return;
			}

			setNameError("");
			currentUser = await createUser(trimmedName);

			if (!currentUser) {
				Alert.alert("Error", "Failed to create profile. Please try again.");
				return;
			}
		}

		const success = await joinEvent(eventPreview.id, currentUser.id);

		if (success) {
			router.replace(`/event/${eventPreview.id}?justJoined=true`);
		} else {
			Alert.alert("Error", "Failed to join event. Please try again.");
		}
	}

	function handleBack() {
		setStep("code");
		setEventPreview(null);
		setDisplayName("");
		setNameError("");
		clearError();
	}

	function formatCode(text: string) {
		return text
			.toUpperCase()
			.replace(/[^A-Z0-9]/g, "")
			.slice(0, 6);
	}

	async function handleOpenScanner() {
		if (!permission?.granted) {
			const result = await requestPermission();
			if (!result.granted) {
				Alert.alert("Camera Permission Required", "Please allow camera access to scan QR codes", [
					{ text: "OK" },
				]);
				return;
			}
		}
		hasScanned.current = false;
		setScannerVisible(true);
	}

	function handleBarCodeScanned({ data }: { data: string }) {
		if (hasScanned.current) return;
		hasScanned.current = true;

		// Extract event code from QR data
		// Could be just the code, or a URL like recapd://join/ABC123 or https://recapd.app/join/ABC123
		let eventCode = data;

		// Try to extract code from URL patterns
		const urlPatterns = [/\/join\/([A-Z0-9]{6})/i, /code=([A-Z0-9]{6})/i, /^([A-Z0-9]{6})$/i];

		for (const pattern of urlPatterns) {
			const match = data.match(pattern);
			if (match) {
				eventCode = match[1].toUpperCase();
				break;
			}
		}

		// Validate it looks like a code
		const cleanCode = eventCode
			.toUpperCase()
			.replace(/[^A-Z0-9]/g, "")
			.slice(0, 6);

		if (cleanCode.length === 6) {
			setScannerVisible(false);
			setCode(cleanCode);
			// Auto-lookup after scanning
			setTimeout(() => handleLookup(cleanCode), 300);
		} else {
			Alert.alert("Invalid QR Code", "This QR code doesn't contain a valid event code");
			hasScanned.current = false;
		}
	}

	const isPro = useSubscriptionStore((state) => state.isPro);
	const isJoining = isLoading || authLoading;
	const canJoin = user || displayName.trim().length >= 2;
	const isEventFull =
		SUBSCRIPTIONS_ENABLED &&
		(eventPreview?.participant_count || 0) >= FREE_PARTICIPANT_LIMIT &&
		!eventPreview?.hostIsPro &&
		!isPro;

	if (step === "preview" && eventPreview) {
		return (
			<KeyboardAvoidingView
				style={[styles.container, isDark && styles.containerDark]}
				behavior={Platform.OS === "ios" ? "padding" : "height"}
			>
				<View style={styles.content}>
					<View style={[styles.previewCard, isDark && styles.previewCardDark]}>
						<Text style={[styles.previewTitle, isDark && styles.textDark]}>
							{eventPreview.title}
						</Text>
						<Text style={[styles.previewDate, isDark && styles.textMuted]}>
							{format(new Date(eventPreview.starts_at), "EEEE, MMMM d, yyyy")}
						</Text>
						<Text style={[styles.previewTime, isDark && styles.textMuted]}>
							{format(new Date(eventPreview.starts_at), "h:mm a")} -{" "}
							{format(new Date(eventPreview.ends_at), "h:mm a")}
						</Text>
						<View style={styles.previewStats}>
							<Text style={[styles.previewParticipants, isDark && styles.textMuted]}>
								{eventPreview.participant_count || 0} participant
								{eventPreview.participant_count !== 1 ? "s" : ""}
							</Text>
						</View>
					</View>

					{isEventFull && (
						<View style={styles.eventFullBanner}>
							<FontAwesome name="exclamation-circle" size={16} color="#ef4444" />
							<Text style={styles.eventFullText}>
								This event has reached the free plan limit of {FREE_PARTICIPANT_LIMIT} participants.
								Ask the host to upgrade to Pro for unlimited spots.
							</Text>
						</View>
					)}

					{!user && !isEventFull && (
						<View style={styles.nameSection}>
							<Text style={[styles.nameLabel, isDark && styles.textDark]}>
								What should we call you?
							</Text>
							<TextInput
								style={[
									styles.nameInput,
									isDark && styles.nameInputDark,
									nameError ? styles.inputError : null,
								]}
								placeholder="Enter your name"
								placeholderTextColor={isDark ? "#666" : "#999"}
								value={displayName}
								onChangeText={(text) => {
									setDisplayName(text);
									setNameError("");
								}}
								autoCapitalize="words"
								autoCorrect={false}
								maxLength={30}
								accessibilityLabel="Your name"
								accessibilityHint="Enter your display name"
							/>
							{nameError ? <Text style={styles.errorText}>{nameError}</Text> : null}
							<Text style={[styles.nameHint, isDark && styles.textMuted]}>
								This is how you'll appear to others
							</Text>
						</View>
					)}

					<View style={styles.actions}>
						<TouchableOpacity
							style={[
								styles.button,
								(!canJoin || isJoining || isEventFull) && styles.buttonDisabled,
							]}
							onPress={handleJoin}
							disabled={!canJoin || isJoining || isEventFull}
							accessibilityRole="button"
							accessibilityLabel={isEventFull ? "Event Full" : "Join Event"}
							accessibilityState={{ disabled: !canJoin || isJoining || isEventFull }}
						>
							{isJoining ? (
								<ActivityIndicator color="#fff" />
							) : (
								<Text style={styles.buttonText}>{isEventFull ? "Event Full" : "Join Event"}</Text>
							)}
						</TouchableOpacity>

						<TouchableOpacity
							style={styles.backButton}
							onPress={handleBack}
							accessibilityRole="button"
							accessibilityLabel="Enter Different Code"
						>
							<Text style={[styles.backButtonText, isDark && styles.textDark]}>
								Enter Different Code
							</Text>
						</TouchableOpacity>
					</View>
				</View>
			</KeyboardAvoidingView>
		);
	}

	return (
		<KeyboardAvoidingView
			style={[styles.container, isDark && styles.containerDark]}
			behavior={Platform.OS === "ios" ? "padding" : "height"}
		>
			<View style={styles.content}>
				<View style={styles.header}>
					<Text style={[styles.title, isDark && styles.textDark]}>Join an Event</Text>
					<Text style={[styles.subtitle, isDark && styles.textMuted]}>
						Enter the 6-character code shared by the host
					</Text>
				</View>

				<View style={styles.form}>
					<TextInput
						style={[styles.codeInput, isDark && styles.codeInputDark]}
						placeholder="ABC123"
						placeholderTextColor={isDark ? "#444" : "#ccc"}
						value={code}
						onChangeText={(text) => setCode(formatCode(text))}
						autoCapitalize="characters"
						autoCorrect={false}
						maxLength={6}
						keyboardType="default"
						returnKeyType="go"
						onSubmitEditing={() => handleLookup()}
						accessibilityLabel="Event code"
						accessibilityHint="Enter 6-character event code"
					/>
					{error && <Text style={styles.errorText}>{error}</Text>}
				</View>

				<TouchableOpacity
					style={[styles.button, (code.length !== 6 || isLoading) && styles.buttonDisabled]}
					onPress={() => handleLookup()}
					disabled={code.length !== 6 || isLoading}
					accessibilityRole="button"
					accessibilityLabel="Find Event"
					accessibilityHint="Look up event by code"
					accessibilityState={{ disabled: code.length !== 6 || isLoading }}
				>
					{isLoading ? (
						<ActivityIndicator color="#fff" />
					) : (
						<Text style={styles.buttonText}>Find Event</Text>
					)}
				</TouchableOpacity>

				<View style={styles.divider}>
					<View style={[styles.dividerLine, isDark && styles.dividerLineDark]} />
					<Text style={[styles.dividerText, isDark && styles.textMuted]}>or</Text>
					<View style={[styles.dividerLine, isDark && styles.dividerLineDark]} />
				</View>

				<TouchableOpacity
					style={[styles.scanButton, isDark && styles.scanButtonDark]}
					onPress={handleOpenScanner}
					accessibilityRole="button"
					accessibilityLabel="Scan QR Code"
					accessibilityHint="Opens camera to scan event QR code"
				>
					<FontAwesome name="qrcode" size={22} color={isDark ? "#fff" : "#000"} />
					<Text style={[styles.scanButtonText, isDark && styles.textDark]}>Scan QR Code</Text>
				</TouchableOpacity>
			</View>

			<Modal
				visible={scannerVisible}
				animationType="slide"
				presentationStyle="fullScreen"
				onRequestClose={() => setScannerVisible(false)}
			>
				<View style={styles.scannerContainer}>
					<CameraView
						style={styles.camera}
						facing="back"
						barcodeScannerSettings={{
							barcodeTypes: ["qr"],
						}}
						onBarcodeScanned={handleBarCodeScanned}
					/>
					<View style={styles.scannerOverlay}>
						<View style={styles.scannerHeader}>
							<TouchableOpacity
								style={styles.scannerCloseButton}
								onPress={() => setScannerVisible(false)}
								accessibilityRole="button"
								accessibilityLabel="Close scanner"
							>
								<FontAwesome name="times" size={24} color="#fff" />
							</TouchableOpacity>
						</View>
						<View style={styles.scannerContent}>
							<View style={styles.scannerFrame}>
								<View style={[styles.cornerTL, styles.corner]} />
								<View style={[styles.cornerTR, styles.corner]} />
								<View style={[styles.cornerBL, styles.corner]} />
								<View style={[styles.cornerBR, styles.corner]} />
							</View>
							<Text style={styles.scannerHint}>Point camera at QR code</Text>
						</View>
					</View>
				</View>
			</Modal>
		</KeyboardAvoidingView>
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
	content: {
		flex: 1,
		padding: 24,
		justifyContent: "center",
	},
	header: {
		alignItems: "center",
		marginBottom: 32,
	},
	title: {
		fontSize: 28,
		fontWeight: "700",
		color: "#000",
		marginBottom: 8,
	},
	subtitle: {
		fontSize: 16,
		color: "#666",
		textAlign: "center",
	},
	form: {
		marginBottom: 24,
	},
	codeInput: {
		backgroundColor: "#f5f5f5",
		borderRadius: 16,
		paddingVertical: 24,
		paddingHorizontal: 24,
		fontSize: 32,
		fontWeight: "700",
		fontFamily: "SpaceMono",
		color: "#000",
		textAlign: "center",
		letterSpacing: 8,
	},
	codeInputDark: {
		backgroundColor: "#1a1a1a",
		color: "#fff",
	},
	errorText: {
		color: "#ef4444",
		fontSize: 14,
		textAlign: "center",
		marginTop: 12,
	},
	button: {
		backgroundColor: "#000",
		paddingVertical: 18,
		borderRadius: 14,
		alignItems: "center",
	},
	buttonDisabled: {
		opacity: 0.5,
	},
	buttonText: {
		color: "#fff",
		fontSize: 18,
		fontWeight: "600",
	},
	divider: {
		flexDirection: "row",
		alignItems: "center",
		marginVertical: 24,
	},
	dividerLine: {
		flex: 1,
		height: 1,
		backgroundColor: "#e5e5e5",
	},
	dividerLineDark: {
		backgroundColor: "#333",
	},
	dividerText: {
		paddingHorizontal: 16,
		fontSize: 14,
		color: "#999",
	},
	scanButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 18,
		borderRadius: 14,
		borderWidth: 2,
		borderColor: "#000",
		gap: 12,
	},
	scanButtonDark: {
		borderColor: "#fff",
	},
	scanButtonText: {
		fontSize: 18,
		fontWeight: "600",
		color: "#000",
	},
	eventFullBanner: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 10,
		backgroundColor: "#fef2f2",
		borderRadius: 12,
		padding: 14,
		marginBottom: 24,
	},
	eventFullText: {
		flex: 1,
		fontSize: 14,
		color: "#991b1b",
		lineHeight: 20,
	},
	previewCard: {
		backgroundColor: "#f5f5f5",
		borderRadius: 20,
		padding: 24,
		alignItems: "center",
		marginBottom: 24,
	},
	previewCardDark: {
		backgroundColor: "#1a1a1a",
	},
	nameSection: {
		marginBottom: 24,
	},
	nameLabel: {
		fontSize: 16,
		fontWeight: "600",
		color: "#000",
		marginBottom: 8,
	},
	nameInput: {
		backgroundColor: "#f5f5f5",
		borderRadius: 14,
		paddingVertical: 16,
		paddingHorizontal: 20,
		fontSize: 18,
		color: "#000",
		borderWidth: 2,
		borderColor: "transparent",
	},
	nameInputDark: {
		backgroundColor: "#1a1a1a",
		color: "#fff",
	},
	inputError: {
		borderColor: "#ef4444",
	},
	nameHint: {
		fontSize: 14,
		color: "#666",
		marginTop: 8,
	},
	previewTitle: {
		fontSize: 24,
		fontWeight: "700",
		color: "#000",
		marginBottom: 12,
		textAlign: "center",
	},
	previewDate: {
		fontSize: 16,
		color: "#666",
		marginBottom: 4,
	},
	previewTime: {
		fontSize: 16,
		color: "#666",
		marginBottom: 16,
	},
	previewStats: {
		paddingTop: 16,
		borderTopWidth: 1,
		borderTopColor: "#e5e5e5",
		width: "100%",
		alignItems: "center",
	},
	previewParticipants: {
		fontSize: 14,
		color: "#666",
	},
	actions: {
		gap: 12,
	},
	backButton: {
		paddingVertical: 16,
		alignItems: "center",
	},
	backButtonText: {
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
	scannerContainer: {
		flex: 1,
		backgroundColor: "#000",
	},
	camera: {
		flex: 1,
	},
	scannerOverlay: {
		...StyleSheet.absoluteFillObject,
	},
	scannerHeader: {
		paddingTop: 60,
		paddingHorizontal: 20,
	},
	scannerCloseButton: {
		width: 44,
		height: 44,
		borderRadius: 22,
		backgroundColor: "rgba(0, 0, 0, 0.5)",
		justifyContent: "center",
		alignItems: "center",
	},
	scannerContent: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
	},
	scannerFrame: {
		width: 250,
		height: 250,
		position: "relative",
	},
	corner: {
		position: "absolute",
		width: 30,
		height: 30,
		borderColor: "#fff",
	},
	cornerTL: {
		top: 0,
		left: 0,
		borderTopWidth: 4,
		borderLeftWidth: 4,
		borderTopLeftRadius: 12,
	},
	cornerTR: {
		top: 0,
		right: 0,
		borderTopWidth: 4,
		borderRightWidth: 4,
		borderTopRightRadius: 12,
	},
	cornerBL: {
		bottom: 0,
		left: 0,
		borderBottomWidth: 4,
		borderLeftWidth: 4,
		borderBottomLeftRadius: 12,
	},
	cornerBR: {
		bottom: 0,
		right: 0,
		borderBottomWidth: 4,
		borderRightWidth: 4,
		borderBottomRightRadius: 12,
	},
	scannerHint: {
		color: "#fff",
		fontSize: 16,
		marginTop: 32,
		textAlign: "center",
	},
});
