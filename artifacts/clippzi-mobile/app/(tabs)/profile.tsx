import React from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import {
  useGetUser,
  useGetUserStats,
  useListPosts,
} from "@workspace/api-client-react";
import type { Post } from "@workspace/api-client-react";

import { useColors } from "@/hooks/useColors";
import { fonts } from "@/constants/fonts";
import { useAuth } from "@/lib/auth";
import { mediaUri, formatCount } from "@/lib/api";
import { AuthGate } from "@/components/AuthGate";

export default function ProfileScreen() {
  const { user, isLoading } = useAuth();
  const c = useColors();
  const appUserId = user?.appUserId ?? null;

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }
  if (!appUserId) {
    return <AuthGate />;
  }
  return <Profile appUserId={appUserId} />;
}

function Profile({ appUserId }: { appUserId: number }) {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { logout } = useAuth();

  const { data: profile } = useGetUser(appUserId);
  const { data: stats } = useGetUserStats(appUserId);
  const { data: posts } = useListPosts({ userId: appUserId, limit: 30 });

  const list: Post[] = posts ?? [];
  const avatar = mediaUri(profile?.avatarUrl);
  const topInset = (Platform.OS === "web" ? 67 : insets.top) + 8;
  const gap = 2;
  const tileSize = (width - gap * 2) / 3;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <FlatList
        data={list}
        keyExtractor={(item) => String(item.id)}
        numColumns={3}
        columnWrapperStyle={{ gap }}
        contentContainerStyle={{
          paddingTop: topInset,
          paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom) + 90,
          gap,
        }}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.topRow}>
              <View style={{ width: 24 }} />
              <Text style={[styles.username, { color: c.foreground }]}>
                @{profile?.username ?? "you"}
              </Text>
              <Pressable onPress={logout} hitSlop={10}>
                <Feather name="log-out" size={22} color={c.mutedForeground} />
              </Pressable>
            </View>

            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: c.muted }]}>
                <Feather name="user" size={34} color={c.mutedForeground} />
              </View>
            )}

            <Text style={[styles.name, { color: c.foreground }]}>
              {profile?.displayName ?? "Clippzi creator"}
            </Text>
            {!!profile?.bio && (
              <Text style={[styles.bio, { color: c.mutedForeground }]}>
                {profile.bio}
              </Text>
            )}

            <View style={styles.statsRow}>
              <Stat
                label="Followers"
                value={formatCount(stats?.followerCount ?? profile?.followerCount ?? 0)}
              />
              <Stat
                label="Following"
                value={formatCount(stats?.followingCount ?? profile?.followingCount ?? 0)}
              />
              <Stat
                label="Posts"
                value={formatCount(stats?.postCount ?? list.length)}
              />
            </View>
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
                <Image source={{ uri: thumb }} style={styles.tile} contentFit="cover" />
              ) : (
                <View style={[styles.tile, { backgroundColor: c.muted }]} />
              )}
              <View style={styles.tileMeta}>
                <Feather name="play" size={11} color="#fff" />
                <Text style={styles.tileCount}>{formatCount(item.viewCount)}</Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyPosts}>
            <Feather name="film" size={28} color={c.mutedForeground} />
            <Text style={[styles.emptyText, { color: c.mutedForeground }]}>
              No clips posted yet
            </Text>
          </View>
        }
      />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: c.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: c.mutedForeground }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { alignItems: "center", paddingHorizontal: 16, marginBottom: 18 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 18,
  },
  username: { fontSize: 17, fontFamily: fonts.semibold },
  avatar: { width: 92, height: 92, borderRadius: 46, marginBottom: 12 },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  name: { fontSize: 20, fontFamily: fonts.bold },
  bio: {
    fontSize: 14,
    fontFamily: fonts.regular,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 20,
  },
  statsRow: { flexDirection: "row", gap: 36, marginTop: 20 },
  stat: { alignItems: "center", gap: 3 },
  statValue: { fontSize: 19, fontFamily: fonts.bold },
  statLabel: { fontSize: 12, fontFamily: fonts.regular },
  tile: { width: "100%", height: "100%" },
  tileMeta: {
    position: "absolute",
    left: 6,
    bottom: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tileCount: { color: "#fff", fontSize: 11, fontFamily: fonts.semibold },
  emptyPosts: { alignItems: "center", gap: 10, paddingTop: 50 },
  emptyText: { fontSize: 14, fontFamily: fonts.regular },
});
