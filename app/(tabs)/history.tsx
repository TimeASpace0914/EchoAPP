import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useFocusEffect, router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import {
  getHistory,
  deleteHistoryEntry,
  formatTimestamp,
  formatDuration,
  type HistoryEntry,
} from "@/lib/voice-service";

export default function HistoryScreen() {
  const colors = useColors();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [])
  );

  const loadHistory = async () => {
    setLoading(true);
    const data = await getHistory();
    setEntries(data);
    setLoading(false);
  };

  const handlePlay = (entry: HistoryEntry) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push({
      pathname: "/result" as any,
      params: {
        audioUri: entry.audioUri,
        text: entry.text,
        duration: entry.duration.toString(),
        createdAt: entry.createdAt.toString(),
      },
    });
  };

  const handleDelete = (entry: HistoryEntry) => {
    Alert.alert(
      "刪除紀錄",
      "確定要刪除這筆回憶嗎？此操作無法復原。",
      [
        { text: "取消", style: "cancel" },
        {
          text: "刪除",
          style: "destructive",
          onPress: async () => {
            await deleteHistoryEntry(entry.id);
            loadHistory();
            if (Platform.OS !== "web") {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          },
        },
      ]
    );
  };

  const renderEntry = ({ item }: { item: HistoryEntry }) => (
    <View style={[styles.entryCard, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
      <View style={[styles.entryAccent, { backgroundColor: colors.primary }]} />
      <View style={styles.entryContent}>
        <View style={styles.entryHeader}>
          <View style={[styles.entryIcon, { backgroundColor: `${colors.primary}15` }]}>
            <IconSymbol name="waveform" size={20} color={colors.primary} />
          </View>
          <Text style={[styles.entryRefName, { color: colors.muted }]} numberOfLines={1}>
            {item.referenceAudioName}
          </Text>
        </View>
        <Text style={[styles.entryText, { color: colors.foreground }]} numberOfLines={2}>
          {item.text}
        </Text>
        <View style={styles.entryFooter}>
          <Text style={[styles.entryMeta, { color: colors.muted }]}>
            {formatTimestamp(item.createdAt)} · {formatDuration(item.duration)}
          </Text>
          <View style={styles.entryActions}>
            <TouchableOpacity
              onPress={() => handlePlay(item)}
              style={[styles.entryPlayButton, { backgroundColor: colors.primary }]}
            >
              <IconSymbol name="play.fill" size={16} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleDelete(item)}
              style={styles.entryDeleteButton}
            >
              <IconSymbol name="trash" size={18} color={colors.muted} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: `${colors.primary}10` }]}>
        <IconSymbol name="clock.fill" size={48} color={colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
        尚無回憶紀錄
      </Text>
      <Text style={[styles.emptyHint, { color: colors.muted }]}>
        在首頁生成語音後，紀錄將顯示在這裡
      </Text>
    </View>
  );

  return (
    <ScreenContainer className="flex-1">
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>回憶庫</Text>
        <Text style={[styles.headerSubtitle, { color: colors.muted }]}>
          {entries.length > 0 ? `共 ${entries.length} 筆紀錄` : ""}
        </Text>
      </View>

      <FlatList
        data={entries}
        renderItem={renderEntry}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmpty}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 12,
  },
  entryCard: {
    flexDirection: "row",
    borderRadius: 20,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  entryAccent: {
    width: 4,
  },
  entryContent: {
    flex: 1,
    padding: 16,
    gap: 10,
  },
  entryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  entryIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  entryRefName: {
    fontSize: 13,
    flex: 1,
  },
  entryText: {
    fontSize: 15,
    lineHeight: 22,
  },
  entryFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  entryMeta: {
    fontSize: 12,
  },
  entryActions: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  entryPlayButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  entryDeleteButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 16,
  },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  emptyHint: {
    fontSize: 14,
    textAlign: "center",
  },
});
