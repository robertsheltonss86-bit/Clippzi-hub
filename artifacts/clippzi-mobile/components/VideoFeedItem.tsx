import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  Platform,
} from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLikePost } from "@workspace/api-client-react";
import type { Post } from "@workspace/api-client-react";

import { useColors } from "@/hooks/useColors";
import { fonts } from "@/constants/fonts";
import { mediaUri, formatCount } from "@/lib/api";

interface Props {
  post: Post;
  isActive: boolean;
  appUserId: number | null;
  onOpenComments: (post: Post) => void;
  onRequireAuth: () => void;
}

export function VideoFeedItem({
  post,
  isActive,
  appUserId,
  onOpenComments,
  onRequireAuth,
}: Props) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const uri = mediaUri(post.mediaUrl);
  const isVideo = post.type === "video";

  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const likeMutation = useLikePost();

  const player = useVideoPlayer(isVideo && uri ? uri : null, (p) => {
    p.loop = true;
    p.muted = false;
  });

  useEffect(() => {
    if (!isVideo) return;
    try {
      if (isActive) player.play();
      else player.pause();
    } catch {
      // player may be released during fast scrolling
    }
  }, [isActive, isVideo, player]);

  const handleLike = () => {
    if (!appUserId) {
      onRequireAuth();
      return;
    }
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = !liked;
    setLiked(next);
    setLikeCount((n) => n + (next ? 1 : -1));
    likeMutation.mutate(
      { id: post.id, data: { userId: appUserId, liked: next } },
      {
        onSuccess: (res) => {
          setLiked(res.liked);
          setLikeCount(res.likeCount);
        },
        onError: () => {
          setLiked(!next);
          setLikeCount((n) => n + (next ? -1 : 1));
        },
      },
    );
  };

  const bottomPad = (Platform.OS === "web" ? 34 : insets.bottom) + 76;
  const author = post.user;
  const avatar = mediaUri(author?.avatarUrl);

  return (
    <View style={{ width, height, backgroundColor: c.background }}>
      {isVideo && uri ? (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
        />
      ) : uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Feather name="video-off" size={40} color={c.mutedForeground} />
        </View>
      )}

      <View style={styles.scrim} pointerEvents="none" />

      {/* Right action rail */}
      <View style={[styles.rail, { bottom: bottomPad }]}>
        <View style={styles.avatarWrap}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: c.muted }]}>
              <Feather name="user" size={20} color={c.mutedForeground} />
            </View>
          )}
        </View>

        <Action
          icon="heart"
          active={liked}
          activeColor={c.secondary}
          label={formatCount(likeCount)}
          onPress={handleLike}
        />
        <Action
          icon="message-circle"
          label={formatCount(post.commentCount)}
          onPress={() => onOpenComments(post)}
        />
        <Action icon="send" label={formatCount(post.shareCount ?? 0)} onPress={() => {}} />
      </View>

      {/* Bottom meta */}
      <View style={[styles.meta, { bottom: bottomPad, maxWidth: width - 96 }]}>
        <Text style={[styles.handle, { fontFamily: fonts.bold }]}>
          @{author?.username ?? "clippzi"}
        </Text>
        {!!post.title && (
          <Text
            style={[styles.caption, { fontFamily: fonts.regular }]}
            numberOfLines={2}
          >
            {post.title}
          </Text>
        )}
        {!!post.musicTitle && (
          <View style={styles.music}>
            <Feather name="music" size={12} color="#fff" />
            <Text
              style={[styles.musicText, { fontFamily: fonts.mono }]}
              numberOfLines={1}
            >
              {post.musicTitle}
              {post.musicArtist ? ` · ${post.musicArtist}` : ""}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function Action({
  icon,
  label,
  active,
  activeColor,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  active?: boolean;
  activeColor?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
      onPress={onPress}
      hitSlop={8}
    >
      <Feather name={icon} size={30} color={active ? activeColor : "#fff"} />
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  scrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 260,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  rail: {
    position: "absolute",
    right: 12,
    alignItems: "center",
    gap: 22,
  },
  avatarWrap: { marginBottom: 4 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  action: { alignItems: "center", gap: 5 },
  actionLabel: {
    color: "#fff",
    fontSize: 12,
    fontFamily: fonts.semibold,
  },
  meta: { position: "absolute", left: 16, gap: 8 },
  handle: { color: "#fff", fontSize: 17 },
  caption: { color: "#fff", fontSize: 14, lineHeight: 19 },
  music: { flexDirection: "row", alignItems: "center", gap: 6 },
  musicText: { color: "#fff", fontSize: 12 },
});
