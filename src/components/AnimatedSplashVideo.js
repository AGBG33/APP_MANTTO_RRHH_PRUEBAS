// src/components/AnimatedSplashVideo.js
import React, { useEffect } from "react";
import { View, StyleSheet, Text } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";

export default function AnimatedSplashVideo({ onFinish }) {
  const player = useVideoPlayer(
    require("../../assets/splash_animado.mp4"),
    (player) => {
      player.loop = false;
      player.muted = true;
      player.play();
    }
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      onFinish?.();
    }, 5550);

    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <View style={styles.container}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="contain"
        nativeControls={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  video: {
    width: 260,
    height: 260,
    backgroundColor: "#FFFFFF",
  }
});