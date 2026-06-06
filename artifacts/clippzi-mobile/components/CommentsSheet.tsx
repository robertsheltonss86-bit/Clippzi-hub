import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useListComments, useCreateComment } from "@workspace/api-client-react";
import type { Comment, CommentInput } from "@workspace/api-client-react";

import { useColors } from "@/hooks/useColors";
import { fonts } from "@/constants/fonts";
import { mediaUri, formatCount } from "@/lib/api";

interface Props {
  postId: number | null;
  appUserId: number | null;
  onRequireAuth: () => void;
  onClose: () => void;
}

export function CommentsSheet({ postId, appUserId, onRequireAuth, onClose }: Props) {
  const c = useColors();
  const visible = postId != null;
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      {visible && (
        <CommentsBody
          postId={postId}
          appUserId={appUserId}
          onRequireAuth={onRequireAuth}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}

function CommentsBody({
  postId,
  appUserId,
  onRequireAuth,
  onClose,
}: {
  postId: number;
  appUserId: number | null;
  onRequireAuth: () => void;
  onClose: () => void;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { data, isLoading, refetch } = useListComments({ postId });
  const create = useCreateComment();
  const [text, setText] = useState("");

  const comments = data ?? [];
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    if (!appUserId) {
      onRequireAuth();
      return;
    }
    create.mutate(
      {
        data: {
          userId: appUserId,
          text: value,
          postId,
        } as CommentInput & { postId: number },
      },
      {
        onSuccess: () => {
          setText("");
          refetch();
        },
      },
    );
  };

  return (
    <View
      style={[
        styles.sheet,
        { backgroundColor: c.card, borderColor: c.border },
      ]}
    >
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <Text style={[styles.title, { color: c.foreground }]}>
          {formatCount(comments.length)} comments
        </Text>
        <Pressable onPress={onClose} hitSlop={10}>
          <Feather name="x" size={22} color={c.mutedForeground} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : (
        <FlatList
          data={comments}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 16, gap: 18, flexGrow: 1 }}
          scrollEnabled={comments.length > 0}
          renderItem={({ item }) => <CommentRow item={item} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather
                name="message-circle"
                size={28}
                color={c.mutedForeground}
              />
              <Text style={[styles.emptyText, { color: c.mutedForeground }]}>
                Be the first to comment
              </Text>
            </View>
          }
        />
      )}

      <KeyboardAvoidingView behavior="padding">
        <View
          style={[
            styles.inputRow,
            {
              borderTopColor: c.border,
              paddingBottom: bottomInset + 10,
              backgroundColor: c.card,
            },
          ]}
        >
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Add a comment..."
            placeholderTextColor={c.mutedForeground}
            style={[
              styles.input,
              {
                backgroundColor: c.muted,
                color: c.foreground,
                borderRadius: 999,
              },
            ]}
            onSubmitEditing={submit}
            returnKeyType="send"
          />
          <Pressable
            onPress={submit}
            disabled={!text.trim() || create.isPending}
            style={[
              styles.send,
              {
                backgroundColor: text.trim() ? c.primary : c.muted,
              },
            ]}
          >
            <Feather
              name="arrow-up"
              size={20}
              color={text.trim() ? c.primaryForeground : c.mutedForeground}
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function CommentRow({ item }: { item: Comment }) {
  const c = useColors();
  const avatar = mediaUri(item.user?.avatarUrl);
  return (
    <View style={styles.row}>
      {avatar ? (
        <Image source={{ uri: avatar }} style={styles.rowAvatar} />
      ) : (
        <View style={[styles.rowAvatar, { backgroundColor: c.muted }]}>
          <Feather name="user" size={16} color={c.mutedForeground} />
        </View>
      )}
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[styles.rowName, { color: c.mutedForeground }]}>
          @{item.user?.username ?? "clippzi"}
        </Text>
        <Text style={[styles.rowText, { color: c.foreground }]}>
          {item.text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "72%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 15, fontFamily: fonts.semibold },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", justifyContent: "center", gap: 10, paddingTop: 60 },
  emptyText: { fontSize: 14, fontFamily: fonts.regular },
  row: { flexDirection: "row", gap: 12 },
  rowAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  rowName: { fontSize: 12, fontFamily: fonts.medium },
  rowText: { fontSize: 14, fontFamily: fonts.regular, lineHeight: 19 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    fontSize: 15,
    fontFamily: fonts.regular,
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
