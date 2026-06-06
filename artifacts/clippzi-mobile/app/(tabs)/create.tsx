import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useVideoPlayer, VideoView } from "expo-video";
import { Feather } from "@expo/vector-icons";
import {
  useRequestUploadUrl,
  useCreatePost,
} from "@workspace/api-client-react";

import { useColors } from "@/hooks/useColors";
import { fonts } from "@/constants/fonts";
import { useAuth } from "@/lib/auth";
import { storageUri } from "@/lib/api";
import { AuthGate } from "@/components/AuthGate";

export default function CreateScreen() {
  const { user } = useAuth();
  const appUserId = user?.appUserId ?? null;

  if (!appUserId) {
    return <AuthGate message="Log in to upload your clips." />;
  }
  return <Uploader appUserId={appUserId} />;
}

function Uploader({ appUserId }: { appUserId: number }) {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const requestUpload = useRequestUploadUrl();
  const createPost = useCreatePost();

  const player = useVideoPlayer(asset?.uri ?? null, (p) => {
    p.loop = true;
    p.muted = true;
    if (asset?.uri) p.play();
  });

  const pickVideo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Permission needed",
        "Allow photo library access to choose a video.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      quality: 1,
      videoMaxDuration: 180,
    });
    if (!result.canceled && result.assets[0]) {
      setAsset(result.assets[0]);
    }
  };

  const publish = async () => {
    if (!asset) return;
    setBusy(true);
    try {
      const fileName = asset.fileName ?? `clip-${Date.now()}.mp4`;
      const contentType = asset.mimeType ?? "video/mp4";

      const fileResp = await fetch(asset.uri);
      const blob = await fileResp.blob();
      const size = asset.fileSize ?? blob.size;

      const { uploadURL, objectPath } = await requestUpload.mutateAsync({
        data: { name: fileName, size, contentType },
      });

      const putResp = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: blob,
      });
      if (!putResp.ok) throw new Error(`Upload failed (${putResp.status})`);

      await createPost.mutateAsync({
        data: {
          userId: appUserId,
          type: "video",
          mediaUrl: storageUri(objectPath),
          title: title.trim() || undefined,
          duration: asset.duration
            ? Math.round(asset.duration / 1000)
            : undefined,
        },
      });

      setAsset(null);
      setTitle("");
      Alert.alert("Posted!", "Your clip is live on Clippzi.", [
        { text: "View feed", onPress: () => router.replace("/") },
      ]);
    } catch (err: any) {
      Alert.alert("Upload failed", err?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const topInset = (Platform.OS === "web" ? 67 : insets.top) + 8;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={{
        paddingTop: topInset,
        paddingHorizontal: 16,
        paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom) + 100,
      }}
    >
      <Text style={[styles.title, { color: c.foreground }]}>New clip</Text>

      <Pressable
        onPress={pickVideo}
        style={[
          styles.picker,
          { backgroundColor: c.card, borderColor: c.border },
        ]}
      >
        {asset ? (
          <VideoView
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            nativeControls={false}
          />
        ) : (
          <View style={styles.pickerInner}>
            <View style={[styles.pickIcon, { backgroundColor: c.primary }]}>
              <Feather name="video" size={26} color={c.primaryForeground} />
            </View>
            <Text style={[styles.pickText, { color: c.foreground }]}>
              Choose a video
            </Text>
            <Text style={[styles.pickHint, { color: c.mutedForeground }]}>
              Up to 3 minutes
            </Text>
          </View>
        )}
        {asset && (
          <View style={styles.changeBadge}>
            <Feather name="refresh-cw" size={12} color="#fff" />
            <Text style={styles.changeText}>Change</Text>
          </View>
        )}
      </Pressable>

      <Text style={[styles.label, { color: c.mutedForeground }]}>Caption</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Say something about your clip..."
        placeholderTextColor={c.mutedForeground}
        multiline
        style={[
          styles.input,
          { backgroundColor: c.card, color: c.foreground, borderColor: c.border },
        ]}
      />

      <Pressable
        onPress={publish}
        disabled={!asset || busy}
        style={[
          styles.publish,
          {
            backgroundColor: asset && !busy ? c.primary : c.muted,
          },
        ]}
      >
        {busy ? (
          <ActivityIndicator color={c.primaryForeground} />
        ) : (
          <Text
            style={[
              styles.publishText,
              { color: asset ? c.primaryForeground : c.mutedForeground },
            ]}
          >
            Post clip
          </Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontFamily: fonts.bold, marginBottom: 20 },
  picker: {
    height: 360,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  pickerInner: { alignItems: "center", gap: 10 },
  pickIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  pickText: { fontSize: 16, fontFamily: fonts.semibold },
  pickHint: { fontSize: 13, fontFamily: fonts.regular },
  changeBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  changeText: { color: "#fff", fontSize: 12, fontFamily: fonts.semibold },
  label: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 22,
    marginBottom: 10,
  },
  input: {
    minHeight: 90,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    fontSize: 15,
    fontFamily: fonts.regular,
    textAlignVertical: "top",
  },
  publish: {
    marginTop: 28,
    height: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  publishText: { fontSize: 16, fontFamily: fonts.bold },
});
