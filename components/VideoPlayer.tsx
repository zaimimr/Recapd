import { getMediaUrl } from "@/lib/storage";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { AVPlaybackStatus, ResizeMode, Video } from "expo-av";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MergedMediaItem } from "./MomentCluster";
import { formatDuration } from "@/lib/utils";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface VideoPlayerProps {
  media: MergedMediaItem;
}


export default function VideoPlayer({ media }: VideoPlayerProps) {
  const videoRef = useRef<Video>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(media.duration_milliseconds || 0);

  const videoUri =
    media.isPending && media.localUri
      ? media.localUri
      : getMediaUrl(media.storage_path);

  useEffect(() => {
    return () => {
      videoRef.current?.pauseAsync();
    };
  }, []);

  const handlePlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      setIsLoading(true);
      return;
    }

    setIsLoading(false);
    setIsPlaying(status.isPlaying);
    setPosition(status.positionMillis / 1000);

    if (status.durationMillis) {
      setDuration(status.durationMillis / 1000);
    }

    if (status.didJustFinish) {
      setIsPlaying(false);
      setShowControls(true);
      videoRef.current?.setPositionAsync(0);
    }
  }, []);

  const togglePlayPause = useCallback(async () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
      setShowControls(false);
    }
  }, [isPlaying]);

  const handleVideoPress = useCallback(() => {
    setShowControls((prev) => !prev);
  }, []);

  const progress = duration > 0 ? (position / duration) * 100 : 0;

  return (
    <TouchableOpacity
      activeOpacity={1}
      style={styles.container}
      onPress={handleVideoPress}
    >
      <Video
        ref={videoRef}
        source={{ uri: videoUri }}
        style={styles.video}
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay={false}
        isLooping={false}
        onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
        progressUpdateIntervalMillis={250}
      />

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}

      {showControls && !isLoading && (
        <View style={styles.controlsOverlay}>
          <TouchableOpacity
            style={styles.playButton}
            onPress={togglePlayPause}
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          >
            <FontAwesome
              name={isPlaying ? "pause" : "play"}
              size={36}
              color="#fff"
              style={isPlaying ? undefined : styles.playIcon}
            />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        <View style={styles.timeContainer}>
          <Text style={styles.timeText}>{formatDuration(position)}</Text>
          <Text style={styles.timeText}>{formatDuration(duration)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  video: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.75,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  playIcon: {
    marginLeft: 6,
  },
  progressContainer: {
    position: "absolute",
    bottom: 120,
    left: 20,
    right: 20,
  },
  progressBar: {
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#fff",
    borderRadius: 2,
  },
  timeContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  timeText: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 12,
    fontWeight: "500",
  },
});
