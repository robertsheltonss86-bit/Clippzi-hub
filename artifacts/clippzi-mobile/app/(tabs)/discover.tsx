import React from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Alert,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import {
  useGetTrendingPosts,
  useListLivestreams,
} from "@workspace/api-client-react";
import type { Post, Livestream } from "@workspace/api-client-react";

import { useColors } from "@/hooks/useColors";
import { fonts } from "@/constants/fonts";
import { mediaUri, formatCount } from "@/lib/api";

export default function DiscoverScreen() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const { data: trending, isLoading } = useGetTrendingPosts({ limit: 30 });
  const { data: livestreams } = useListLivestreams({ limit: 10 });

  const posts: Post[] = trending ?? [];
  const lives: Livestream[] = (livestreams ?? []).filter(
    (l) => l.status === "live",
  );

  const topInset = (Platform.OS === "web" ? 67 : insets.top) + 8;
  const gap = 2;
  const tileSize = (width - gap * 2) / 3;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <FlatList
        data={posts}
        keyExtractor={(item) => String(item.id)}
        numColumns={3}
        columnWrapperStyle={{ gap }}
        contentContainerStyle={{
          paddingTop: topInset,
          paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom) + 90,
          gap,
        }}
        ListHeaderComponent={
          <View>
            <Text style={[styles.title, { color: c.foreground }]}>Discover</Text>
            {lives.length > 0 && (
              <LiveRail lives={lives} onPress={(l) => openLive(l, c)} />
            )}
            <Text style={[styles.section, { color: c.mutedForeground }]}>
              Trending now
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const thumb = mediaUri(item.thumbnailUrl ?? item.mediaUrl);
          return (
            <Pressable
              onPress={() => router.push(`/post/${item.id}`)}
              style={{ width: tileSize, height: tileSize * 1.4 }}
            >
              {thumb ? (
                <Image
                  source={{ uri: thumb }}
                  style={styles.tile}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.tile, { backgroundColor: c.muted }]} />
              )}
              <View style={styles.tileMeta}>
                <Feather name="play" size={11} color="#fff" />
                <Text style={styles.tileCount}>
                  {formatCount(item.viewCount)}
                </Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={c.primary} />
            </View>
          ) : (
            <View style={styles.center}>
              <Text style={[styles.empty, { color: c.mutedForeground }]}>
                Nothing trending yet.
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

function openLive(l: Livestream, _c: ReturnType<typeof useColors>) {
  Alert.alert(
    l.title ?? "Live stream",
    "Watching live streams requires the full Clippzi app build (coming soon to the App Store). Live browsing is available now.",
    [{ text: "Got it" }],
  );
}

function LiveRail({
  lives,
  onPress,
}: {
  lives: Livestream[];
  onPress: (l: Livestream) => void;
}) {
  const c = useColors();
  return (
    <View>
      <Text style={[styles.section, { color: c.mutedForeground }]}>
        Live now
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 12 }}
      >
        {lives.map((l) => {
          const thumb = mediaUri(l.thumbnailUrl);
          return (
            <Pressable
              key={l.id}
              onPress={() => onPress(l)}
              style={[styles.liveCard, { backgroundColor: c.card }]}
            >
              {thumb ? (
                <Image source={{ uri: thumb }} style={styles.liveThumb} />
              ) : (
                <View style={[styles.liveThumb, { backgroundColor: c.muted }]} />
              )}
              <View style={[styles.liveBadge, { backgroundColor: c.secondary }]}>
                <Text style={styles.liveBadgeText}>LIVE</Text>
              </View>
              <View style={styles.liveViewers}>
                <Feather name="eye" size={11} color="#fff" />
                <Text style={styles.liveViewersText}>
                  {formatCount(l.viewerCount ?? 0)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    fontFamily: fonts.bold,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  section: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    marginTop: 14,
    marginBottom: 10,
  },
  tile: { width: "100%", height: "100%", backgroundColor: "#111" },
  tileMeta: {
    position: "absolute",
    left: 6,
    bottom: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tileCount: { color: "#fff", fontSize: 11, fontFamily: fonts.semibold },
  center: { padding: 40, alignItems: "center" },
  empty: { fontSize: 14, fontFamily: fonts.regular },
  liveCard: {
    width: 130,
    height: 180,
    borderRadius: 12,
    overflow: "hidden",
  },
  liveThumb: { width: "100%", height: "100%" },
  liveBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  liveBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: fonts.bold,
    letterSpacing: 0.5,
  },
  liveViewers: {
    position: "absolute",
    bottom: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  liveViewersText: { color: "#fff", fontSize: 11, fontFamily: fonts.semibold },
});
