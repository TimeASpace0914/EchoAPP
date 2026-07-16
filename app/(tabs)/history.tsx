import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  TextInput,
  Modal,
} from "react-native";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { saveAudioToDevice } from "@/lib/download-utils";
import { useFocusEffect, router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import {
  getHistory,
  deleteHistoryEntry,
  updateHistoryEntry,
  formatTimestamp,
  formatDuration,
  type HistoryEntry,
} from "@/lib/voice-service";

async function handleDownloadEntry(entry: HistoryEntry) {
  try {
    const fileName = `迴響_${entry.title || formatTimestamp(entry.createdAt).replace(/[^\d]/g, "")}.wav`;
    const result = await saveAudioToDevice(entry.audioUri, fileName);
    if (result.success) {
      Alert.alert("下載完成", "音檔已儲存至手機媒體庫");
    } else {
      Alert.alert("下載失敗", result.error || "無法下載此音檔");
    }
  } catch {
    Alert.alert("下載失敗", "無法下載此音檔");
  }
}

async function handleShareEntry(entry: HistoryEntry) {
  try {
    if (Platform.OS === "web") {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("提醒", "此平台不支援分享功能");
        return;
      }
    }
    await Sharing.shareAsync(entry.audioUri, {
      dialogTitle: "分享親友的聲音",
      mimeType: "audio/wav",
      UTI: "com.microsoft.waveform",
    });
  } catch {
    Alert.alert("分享失敗", "無法分享此音檔");
  }
}

export default function HistoryScreen() {
  const colors = useColors();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // 編輯 Modal 狀態
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingEntry, setEditingEntry] = useState<HistoryEntry | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editTags, setEditTags] = useState("");

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

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    entries.forEach((e) => {
      e.tags?.forEach((t) => tagSet.add(t));
    });
    return Array.from(tagSet);
  }, [entries]);

  // 依搜尋關鍵字與標籤過濾
  const filteredEntries = useMemo(() => {
    let result = entries;
    if (activeFilter) {
      result = result.filter((e) => e.tags?.includes(activeFilter));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (e) =>
          (e.title?.toLowerCase().includes(q) ?? false) ||
          (e.tags?.some((t) => t.toLowerCase().includes(q)) ?? false) ||
          e.text.toLowerCase().includes(q) ||
          e.referenceAudioName.toLowerCase().includes(q)
      );
    }
    return result;
  }, [entries, activeFilter, searchQuery]);

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
        isRealVoice: entry.isRealVoice ? "1" : "0",
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

  const openEditModal = (entry: HistoryEntry) => {
    setEditingEntry(entry);
    setEditTitle(entry.title || "");
    setEditTags(entry.tags?.join("、") || "");
    setEditModalVisible(true);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingEntry) return;
    const tags = editTags
      .split(/[、,，\s]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    await updateHistoryEntry(editingEntry.id, {
      title: editTitle.trim() || undefined,
      tags: tags.length > 0 ? tags : undefined,
    });
    setEditModalVisible(false);
    loadHistory();
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
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
          {/* 編輯按鈕 */}
          <TouchableOpacity
            onPress={() => openEditModal(item)}
            style={styles.entryEditButton}
          >
            <IconSymbol name="pencil" size={16} color={colors.muted} />
          </TouchableOpacity>
        </View>
        <Text style={[styles.entryText, { color: colors.foreground }]} numberOfLines={2}>
          {item.text}
        </Text>
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
              onPress={() => handleDownloadEntry(item)}
              style={styles.entryActionButton}
            >
              <IconSymbol name="arrow.down.to.line" size={18} color={colors.muted} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleShareEntry(item)}
              style={styles.entryActionButton}
            >
              <IconSymbol name="square.and.arrow.up" size={18} color={colors.muted} />
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
        {searchQuery || activeFilter ? "沒有符合的紀錄" : "尚無回憶紀錄"}
      </Text>
      <Text style={[styles.emptyHint, { color: colors.muted }]}>
        {searchQuery || activeFilter ? "試試其他關鍵字或清除篩選" : "在首頁生成語音後，紀錄將顯示在這裡"}
      </Text>
      {(searchQuery || activeFilter) && (
        <TouchableOpacity
          onPress={() => {
            setSearchQuery("");
            setActiveFilter(null);
          }}
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

      {/* 搜尋列 */}
      <View style={[styles.searchBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={[styles.searchInputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <IconSymbol name="magnifyingglass" size={18} color={colors.muted} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="搜尋名稱、標籤或內容..."
            placeholderTextColor={colors.muted}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <IconSymbol name="xmark" size={16} color={colors.muted} />
            </TouchableOpacity>
          )}
        </View>
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

      {/* 編輯 Modal */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.editModal, { backgroundColor: colors.surface }]}>
            <Text style={[styles.editModalTitle, { color: colors.foreground }]}>
              編輯回憶
            </Text>

            <Text style={[styles.editLabel, { color: colors.muted }]}>名稱</Text>
            <TextInput
              style={[styles.editInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="為這段語音取個名字..."
              placeholderTextColor={colors.muted}
              maxLength={30}
            />

            <Text style={[styles.editLabel, { color: colors.muted }]}>標籤（以頓號分隔）</Text>
            <TextInput
              style={[styles.editInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              value={editTags}
              onChangeText={setEditTags}
              placeholder="例如：生日、叮嚀、祝福"
              placeholderTextColor={colors.muted}
              maxLength={50}
            />

            <View style={styles.editModalActions}>
              <TouchableOpacity
                onPress={() => setEditModalVisible(false)}
                style={[styles.editCancelButton, { borderColor: colors.border }]}
              >
                <Text style={[styles.editCancelText, { color: colors.muted }]}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveEdit}
                style={[styles.editSaveButton, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.editSaveText}>儲存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  searchBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  searchInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
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
  entryEditButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
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
  entryActionButton: {
    width: 32,
    height: 32,
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
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  editModal: {
    width: "100%",
    borderRadius: 24,
    padding: 24,
    gap: 8,
  },
  editModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 12,
  },
  editLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 8,
    marginBottom: 4,
  },
  editInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  editModalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  editCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
  },
  editCancelText: {
    fontSize: 16,
    fontWeight: "600",
  },
  editSaveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: "center",
  },
  editSaveText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
