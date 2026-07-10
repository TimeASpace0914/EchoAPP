import { useState, useCallback, useMemo } from "react";
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
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

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

  // 收集所有標籤
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    entries.forEach((e) => {
      e.tags?.forEach((t) => tagSet.add(t));
    });
    return Array.from(tagSet);
  }, [entries]);

  // 依篩選標籤過濾
  const filteredEntries = useMemo(() => {
    if (!activeFilter) return entries;
    return entries.filter((e) => e.tags?.includes(activeFilter));
  }, [entries, activeFilter]);

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
        entryId: entry.id,
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

  const renderTag = ({ item }: { item: string }) => (
    <TouchableOpacity
      onPress={() => {
        setActiveFilter(activeFilter === item ? null : item);
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }}
      style={[
        styles.filterChip,
        {
          backgroundColor: activeFilter === item ? colors.primary : `${colors.primary}15`,
          borderColor: activeFilter === item ? colors.primary : `${colors.primary}40`,
        },
      ]}
    >
      <Text
        style={[
          styles.filterChipText,
          { color: activeFilter === item ? "#FFFFFF" : colors.primary },
        ]}
      >
        {item}
      </Text>
    </TouchableOpacity>
  );

  const renderEntry = ({ item }: { item: HistoryEntry }) => (
    <View style={[styles.entryCard, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
      <View style={[styles.entryAccent, { backgroundColor: colors.primary }]} />
      <View style={styles.entryContent}>
        <View style={styles.entryHeader}>
          <View style={[styles.entryIcon, { backgroundColor: `${colors.primary}15` }]}>
            <IconSymbol name="waveform" size={20} color={colors.primary} />
          </View>
          <View style={styles.entryHeaderInfo}>
            {item.title && (
              <Text style={[styles.entryTitle, { color: colors.foreground }]} numberOfLines={1}>
                {item.title}
              </Text>
            )}
            <Text style={[styles.entryRefName, { color: colors.muted }]} numberOfLines={1}>
              {item.referenceAudioName}
            </Text>
          </View>
        </View>
        <Text style={[styles.entryText, { color: colors.foreground }]} numberOfLines={2}>
          {item.text}
        </Text>
        {/* 標籤顯示 */}
        {item.tags && item.tags.length > 0 && (
          <View style={styles.entryTagsRow}>
            {item.tags.map((tag) => (
              <View
                key={tag}
                style={[styles.entryTagChip, { backgroundColor: `${colors.primary}10` }]}
              >
                <Text style={[styles.entryTagText, { color: colors.primary }]}>{tag}</Text>
              </View>
            ))}
          </View>
        )}
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
        {activeFilter ? "沒有符合此標籤的紀錄" : "尚無回憶紀錄"}
      </Text>
      <Text style={[styles.emptyHint, { color: colors.muted }]}>
        {activeFilter ? "試試其他標籤或清除篩選" : "在首頁生成語音後，紀錄將顯示在這裡"}
      </Text>
      {activeFilter && (
        <TouchableOpacity
          onPress={() => setActiveFilter(null)}
          style={[styles.clearFilterButton, { borderColor: colors.border }]}
        >
          <Text style={[styles.clearFilterText, { color: colors.muted }]}>清除篩選</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <ScreenContainer className="flex-1">
      {/* 標題區 */}
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>回憶庫</Text>
        <Text style={[styles.headerSubtitle, { color: colors.muted }]}>
          {entries.length > 0 ? `共 ${entries.length} 筆紀錄` : ""}
        </Text>
      </View>

      {/* 標籤篩選列 */}
      {allTags.length > 0 && (
        <FlatList
          data={allTags}
          renderItem={renderTag}
          keyExtractor={(item) => item}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContent}
          style={[styles.filterBar, { borderBottomColor: colors.border }]}
        />
      )}

      <FlatList
        data={filteredEntries}
        renderItem={renderEntry}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmpty}
        onRefresh={loadHistory}
        refreshing={loading}
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
  filterBar: {
    borderBottomWidth: 0.5,
    maxHeight: 50,
  },
  filterContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: "500",
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
  entryHeaderInfo: {
    flex: 1,
    gap: 2,
  },
  entryTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  entryRefName: {
    fontSize: 13,
  },
  entryText: {
    fontSize: 15,
    lineHeight: 22,
  },
  entryTagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  entryTagChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  entryTagText: {
    fontSize: 12,
    fontWeight: "500",
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
  clearFilterButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 8,
  },
  clearFilterText: {
    fontSize: 14,
  },
});
