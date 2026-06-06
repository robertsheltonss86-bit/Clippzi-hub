import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  Platform,
  useWindowDimensions,
  RefreshControl,
  type ViewToken,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGetFeed } from "@workspace/api-client-react";
import type { Post } from "@workspace/api-client-react";

import { VideoFeedItem } from "@/components/VideoFeedItem";
import { CommentsSheet } from "@/components/CommentsSheet";
import { useColors } from "@/hooks/useColors";
import { fonts } from "@/constants/fonts";
import { useAuth } from "@/lib/auth";

export default function FeedScreen() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { user } = useAuth();
  const appUserId = user?.appUserId ?? null;

  const { data, isLoading, refetch, isRefetching } = useGetFeed({
    userId: appUserId ?? undefined,
    limit: 20,
  });
  const posts: Post[] = data ?? [];

  const [activeId, setActiveId] = useState<number | null>(null);
  const [commentsPost, setCommentsPost] = useState<Post | null>(null);

  useEffect(() => {
    if (posts.length && activeId == null) setActiveId(posts[0].id);
  }, [posts, activeId]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems[0]?.item as Post | undefined;
      if (first) setActiveId(first.id);
    },
  ).current;

  const requireAuth = () => {
    Alert.alert("Log in required", "Sign in to like and comment on clips.", [
      { text: "Not now", style: "cancel" },
      { text: "Log in", onPress: () => router.push("/profile") },
    ]);
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.primary} size="large" />
      </View>
    );
  }

  if (!posts.length) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <Text style={[styles.emptyTitle, { color: c.foreground }]}>
          No clips yet
        </Text>
        <Text style={[styles.emptyText, { color: c.mutedForeground }]}>
          Be the first to post a video.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <FlatList
        data={posts}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <VideoFeedItem
            post={item}
            isActive={item.id === activeId}
            appUserId={appUserId}
            onOpenComments={setCommentsPost}
            onRequireAuth={requireAuth}
          />
        )}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={height}
        snapToAlignment="start"
        decelerationRate="fast"
        getItemLayout={(_, index) => ({
          length: height,
          offset: height * index,
          index,
        })}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        windowSize={3}
        maxToRenderPerBatch={3}
        removeClippedSubviews
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={c.primary}
          />
        }
      />

      <View style={[styles.topBar, { top: topInset }]} pointerEvents="none">
        <Text style={[styles.logo, { fontFamily: fonts.bold }]}>Clippzi</Text>
      </View>

      <CommentsSheet
        postId={commentsPost?.id ?? null}
        appUserId={appUserId}
        onRequireAuth={requireAuth}
        onClose={() => setCommentsPost(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 24,
  },
  emptyTitle: { fontSize: 18, fontFamily: fonts.semibold },
  emptyText: { fontSize: 14, fontFamily: fonts.regular, textAlign: "center" },
  topBar: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  logo: {
    fontSize: 22,
    color: "#fff",
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowRadius: 6,
  },
});
