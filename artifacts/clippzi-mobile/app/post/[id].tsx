import React, { useState } from "react";
import { View, StyleSheet, Pressable, ActivityIndicator, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useGetPost } from "@workspace/api-client-react";
import type { Post } from "@workspace/api-client-react";

import { VideoFeedItem } from "@/components/VideoFeedItem";
import { CommentsSheet } from "@/components/CommentsSheet";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";

export default function PostDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = Number(id);
  const { user } = useAuth();
  const appUserId = user?.appUserId ?? null;

  const { data: post, isLoading } = useGetPost(postId);
  const [showComments, setShowComments] = useState(false);

  const topInset = Platform.OS === "web" ? 20 : insets.top;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {isLoading || !post ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.primary} size="large" />
        </View>
      ) : (
        <VideoFeedItem
          post={post as Post}
          isActive
          appUserId={appUserId}
          onOpenComments={() => setShowComments(true)}
          onRequireAuth={() => router.push("/profile")}
        />
      )}

      <Pressable
        onPress={() => router.back()}
        style={[styles.close, { top: topInset + 8 }]}
        hitSlop={10}
      >
        <Feather name="x" size={26} color="#fff" />
      </Pressable>

      <CommentsSheet
        postId={showComments ? postId : null}
        appUserId={appUserId}
        onRequireAuth={() => router.push("/profile")}
        onClose={() => setShowComments(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  close: {
    position: "absolute",
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
});
