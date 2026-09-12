import Feather from "@expo/vector-icons/Feather";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
	Alert,
	KeyboardAvoidingView,
	Modal,
	Platform,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import {
	Button,
	Card,
	Eyebrow,
	Field,
	IconButton,
	NavBar,
	Pill,
	Screen,
	ScreenScroll,
	SectionHeader,
} from "@/components/ui";
import { radius, space, theme, type } from "@/constants/theme";
import { SUBSCRIPTIONS_ENABLED } from "@/lib/billing/config";
import { formatLocalizedDate, formatLocalizedTimeRange } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { type EventWithParticipants, useEventStore } from "@/store/eventStore";
import { useSubscriptionPlans } from "@/store/subscriptionStore";
import { getParticipantLimit } from "@/types/subscription";

export default function JoinEventScreen() {
	const router = useRouter();
	const user = useAuthStore((state) => state.user);
	const createUser = useAuthStore((state) => state.createUser);
	const authLoading = useAuthStore((state) => state.isLoading);
	const { fetchEventByCode, joinEvent, isLoading, error, clearError } = useEventStore();

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

	const plans = useSubscriptionPlans();
	const isJoining = isLoading || authLoading;
	const canJoin = user || displayName.trim().length >= 2;
	const participantLimit = getParticipantLimit(eventPreview?.hostIsPro, plans);
	const isEventFull =
		SUBSCRIPTIONS_ENABLED &&
		participantLimit !== Number.POSITIVE_INFINITY &&
		(eventPreview?.participant_count || 0) >= participantLimit;

	if (step === "preview" && eventPreview) {
		return (
			<Screen edges="both">
				<NavBar title="Join album" onBack={handleBack} />
				<KeyboardAvoidingView
					style={styles.flex}
					behavior={Platform.OS === "ios" ? "padding" : "height"}
				>
					<ScreenScroll contentContainerStyle={styles.content}>
						<Card>
							<Eyebrow>You're invited to</Eyebrow>
							<Text style={styles.previewTitle}>{eventPreview.title}</Text>
							<Text style={styles.previewMeta}>
								{formatLocalizedDate(eventPreview.starts_at, {
									weekday: "long",
									month: "long",
									day: "numeric",
								})}
								{"\n"}
								{formatLocalizedTimeRange(eventPreview.starts_at, eventPreview.ends_at)}
							</Text>
							<View style={styles.previewPills}>
								<Pill
									label={`${eventPreview.participant_count || 0} ${
										eventPreview.participant_count === 1 ? "guest" : "guests"
									}`}
									icon="users"
								/>
								{eventPreview.hostDisplayName ? (
									<Pill label={`Hosted by ${eventPreview.hostDisplayName}`} />
								) : null}
							</View>
						</Card>

						{isEventFull ? (
							<Card accent style={styles.fullCard}>
								<View style={styles.fullRow}>
									<Feather name="alert-circle" size={18} color={theme.danger} />
									<Text style={styles.fullText}>
										This album is at its {participantLimit}-guest limit. Ask the host to upgrade for
										more spots.
									</Text>
								</View>
							</Card>
						) : null}

						{!user && !isEventFull ? (
							<Field
								label="What should we call you?"
								placeholder="Your first name"
								value={displayName}
								onChangeText={(text) => {
									setDisplayName(text);
									setNameError("");
								}}
								error={nameError || null}
								hint="This is how you show up on the photos you add."
								autoCapitalize="words"
								autoCorrect={false}
								maxLength={30}
								returnKeyType="go"
								onSubmitEditing={handleJoin}
								accessibilityLabel="Your name"
							/>
						) : null}

						<Button
							label={isEventFull ? "Album is full" : "Join the album"}
							icon={isEventFull ? undefined : "log-in"}
							loading={isJoining}
							disabled={!canJoin || isEventFull}
							onPress={handleJoin}
						/>
						<Button label="Use a different code" variant="ghost" size="md" onPress={handleBack} />
					</ScreenScroll>
				</KeyboardAvoidingView>
			</Screen>
		);
	}

	return (
		<Screen edges="both">
			<NavBar title="Join an album" onBack={() => router.back()} />
			<KeyboardAvoidingView
				style={styles.flex}
				behavior={Platform.OS === "ios" ? "padding" : "height"}
			>
				<ScreenScroll contentContainerStyle={styles.content}>
					<SectionHeader eyebrow="10 seconds to join" title="Got a code from the host?" />
					<Text style={styles.lede}>
						Type the six characters, or scan the QR they're holding up. No account needed.
					</Text>

					<Card>
						<TextInput
							style={styles.codeInput}
							placeholder="ABC123"
							placeholderTextColor={theme.textDisabled}
							selectionColor={theme.accent}
							value={code}
							onChangeText={(text) => setCode(formatCode(text))}
							autoCapitalize="characters"
							autoCorrect={false}
							maxLength={6}
							returnKeyType="go"
							onSubmitEditing={() => handleLookup()}
							accessibilityLabel="Album code"
							accessibilityHint="Enter the six character album code"
						/>
						{error ? (
							<Text style={styles.errorText} accessibilityLiveRegion="polite">
								{error}
							</Text>
						) : null}
					</Card>

					<Button
						label="Find the album"
						loading={isLoading}
						disabled={code.length !== 6}
						onPress={() => handleLookup()}
					/>

					<View style={styles.divider}>
						<View style={styles.dividerLine} />
						<Text style={styles.dividerText}>or</Text>
						<View style={styles.dividerLine} />
					</View>

					<Button
						label="Scan QR code"
						icon="camera"
						variant="secondary"
						onPress={handleOpenScanner}
						accessibilityHint="Opens the camera to scan the album QR code"
					/>
				</ScreenScroll>
			</KeyboardAvoidingView>

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
						barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
						onBarcodeScanned={handleBarCodeScanned}
					/>
					<View style={styles.scannerOverlay}>
						<View style={styles.scannerHeader}>
							<IconButton
								icon="x"
								accessibilityLabel="Close scanner"
								onPress={() => setScannerVisible(false)}
								size={44}
							/>
						</View>
						<View style={styles.scannerContent}>
							<View style={styles.scannerFrame}>
								<View style={[styles.corner, styles.cornerTL]} />
								<View style={[styles.corner, styles.cornerTR]} />
								<View style={[styles.corner, styles.cornerBL]} />
								<View style={[styles.corner, styles.cornerBR]} />
							</View>
							<Text style={styles.scannerHint}>Point the camera at the host's code</Text>
						</View>
					</View>
				</View>
			</Modal>
		</Screen>
	);
}

const CORNER = 34;

const styles = StyleSheet.create({
	flex: {
		flex: 1,
	},
	content: {
		paddingHorizontal: space.lg,
		paddingTop: space.sm,
		paddingBottom: space.xxl,
		gap: space.lg,
	},
	lede: {
		...type.body,
		color: theme.textMuted,
		marginTop: -space.sm,
	},

	previewTitle: {
		...type.title,
		color: theme.textPrimary,
		marginTop: space.sm,
	},
	previewMeta: {
		...type.body,
		color: theme.textMuted,
		marginTop: space.sm,
		lineHeight: 22,
	},
	previewPills: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 6,
		marginTop: space.lg,
	},
	fullCard: {
		borderColor: theme.danger,
	},
	fullRow: {
		flexDirection: "row",
		gap: space.md,
		alignItems: "flex-start",
	},
	fullText: {
		...type.callout,
		color: theme.textMuted,
		flex: 1,
	},

	codeInput: {
		fontSize: 34,
		fontWeight: "800",
		letterSpacing: 10,
		textAlign: "center",
		color: theme.textPrimary,
		paddingVertical: space.md,
	},
	errorText: {
		...type.caption,
		fontWeight: "600",
		color: theme.danger,
		textAlign: "center",
		marginTop: space.sm,
	},

	divider: {
		flexDirection: "row",
		alignItems: "center",
		gap: space.md,
	},
	dividerLine: {
		flex: 1,
		height: StyleSheet.hairlineWidth,
		backgroundColor: theme.border,
	},
	dividerText: {
		...type.caption,
		color: theme.textFaint,
	},

	scannerContainer: {
		flex: 1,
		backgroundColor: "#000",
	},
	camera: {
		...StyleSheet.absoluteFillObject,
	},
	scannerOverlay: {
		flex: 1,
	},
	scannerHeader: {
		paddingTop: 56,
		paddingHorizontal: space.lg,
		alignItems: "flex-start",
	},
	scannerContent: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: space.xxl,
		paddingBottom: 80,
	},
	scannerFrame: {
		width: 244,
		height: 244,
	},
	corner: {
		position: "absolute",
		width: CORNER,
		height: CORNER,
		borderColor: theme.accent,
	},
	cornerTL: {
		top: 0,
		left: 0,
		borderTopWidth: 3,
		borderLeftWidth: 3,
		borderTopLeftRadius: radius.lg,
	},
	cornerTR: {
		top: 0,
		right: 0,
		borderTopWidth: 3,
		borderRightWidth: 3,
		borderTopRightRadius: radius.lg,
	},
	cornerBL: {
		bottom: 0,
		left: 0,
		borderBottomWidth: 3,
		borderLeftWidth: 3,
		borderBottomLeftRadius: radius.lg,
	},
	cornerBR: {
		bottom: 0,
		right: 0,
		borderBottomWidth: 3,
		borderRightWidth: 3,
		borderBottomRightRadius: radius.lg,
	},
	scannerHint: {
		...type.bodyStrong,
		color: "#FFFFFF",
		textAlign: "center",
	},
});
