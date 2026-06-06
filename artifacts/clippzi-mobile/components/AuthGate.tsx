import React from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { fonts } from "@/constants/fonts";
import { useAuth } from "@/lib/auth";

export function AuthGate({ message }: { message?: string }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <LinearGradient
        colors={["rgba(0,238,255,0.18)", "rgba(255,0,60,0.10)", "transparent"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.content, { marginTop: topInset }]}>
        <View style={[styles.glyph, { borderColor: c.primary }]}>
          <Feather name="play" size={34} color={c.primary} />
        </View>
        <Text style={[styles.logo, { color: c.foreground }]}>Clippzi</Text>
        <Text style={[styles.tagline, { color: c.mutedForeground }]}>
          {message ?? "Log in to like, comment, and post your clips."}
        </Text>

        <Pressable
          onPress={login}
          style={[styles.button, { backgroundColor: c.primary }]}
        >
          <Text style={[styles.buttonText, { color: c.primaryForeground }]}>
            Log in
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { alignItems: "center", paddingHorizontal: 32, gap: 14 },
  glyph: {
    width: 88,
    height: 88,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  logo: { fontSize: 34, fontFamily: fonts.bold },
  tagline: {
    fontSize: 15,
    fontFamily: fonts.regular,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 14,
  },
  button: {
    paddingHorizontal: 48,
    height: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontSize: 16, fontFamily: fonts.bold },
});
