import { View, Text, TouchableOpacity, StyleSheet, Linking, Alert } from "react-native";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { Logo } from "@/components/logo";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

export default function SettingsScreen() {
  const colors = useColors();

  const menuItems = [
    {
      icon: "info.circle" as const,
      label: "關於迴響",
      subtitle: "了解應用理念與技術",
      onPress: () => {
        Alert.alert(
          "關於迴響",
          "迴響是一款運用 AI 語音克隆技術的應用，讓您能再次聽到親友的聲音。\n\n上傳親友生前的音檔，輸入想聽到的話，AI 將以親友的聲音為您說出。\n\n所有運算均在您的裝置上本地完成，音檔不會上傳至任何伺服器。",
          [{ text: "確定" }]
        );
      },
    },
    {
      icon: "person.fill" as const,
      label: "隱私政策",
      subtitle: "了解資料如何被保護",
      onPress: () => {
        Alert.alert(
          "隱私政策",
          "我們高度重視您的隱私：\n\n• 所有音檔僅儲存於您的裝置本地\n• 語音生成在裝置上離線完成\n• 不收集任何個人資料\n• 不上傳任何音檔至雲端\n• 歷史紀錄僅保存在您的裝置上",
          [{ text: "確定" }]
        );
      },
    },
    {
      icon: "gear" as const,
      label: "使用說明",
      subtitle: "快速上手指南",
      onPress: () => {
        Alert.alert(
          "使用說明",
          "1. 在首頁點擊「選擇音檔」上傳親友生前音檔\n2. 在文字框輸入想讓親友說的話\n3. 點擊「生成語音」等待生成\n4. 生成完成後可播放、下載或分享\n5. 所有紀錄保存在回憶庫中",
          [{ text: "確定" }]
        );
      },
    },
  ];

  return (
    <ScreenContainer className="flex-1">
      {/* 導覽列 */}
      <View style={[styles.navBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.navButton}
        >
          <IconSymbol name="chevron.left" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.foreground }]}>設定</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* LOGO 區 */}
      <View style={styles.logoSection}>
        <Logo height={64} />
        <Text style={[styles.appName, { color: colors.foreground }]}>迴響</Text>
        <Text style={[styles.appTagline, { color: colors.muted }]}>
          讓聲音跨越時空
        </Text>
        <View style={[styles.versionBadge, { backgroundColor: `${colors.primary}20` }]}>
          <Text style={[styles.versionText, { color: colors.primary }]}>v1.0.0</Text>
        </View>
      </View>

      {/* 選單 */}
      <View style={styles.menuSection}>
        {menuItems.map((item, index) => (
          <TouchableOpacity
            key={index}
            onPress={item.onPress}
            style={[
              styles.menuItem,
              {
                backgroundColor: colors.surface,
                borderBottomColor: colors.border,
                shadowColor: "#000",
                borderBottomWidth: index < menuItems.length - 1 ? 0.5 : 0,
              },
            ]}
          >
            <View style={[styles.menuIcon, { backgroundColor: `${colors.primary}15` }]}>
              <IconSymbol name={item.icon} size={22} color={colors.primary} />
            </View>
            <View style={styles.menuContent}>
              <Text style={[styles.menuLabel, { color: colors.foreground }]}>
                {item.label}
              </Text>
              <Text style={[styles.menuSubtitle, { color: colors.muted }]}>
                {item.subtitle}
              </Text>
            </View>
            <IconSymbol name="chevron.right" size={20} color={colors.muted} />
          </TouchableOpacity>
        ))}
      </View>

      {/* 底部資訊 */}
      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.muted }]}>
          本應用使用 AI 語音克隆技術
        </Text>
        <Text style={[styles.footerText, { color: colors.muted }]}>
          請尊重逝者隱私，謹慎使用
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  navButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  navTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  logoSection: {
    alignItems: "center",
    paddingTop: 32,
    paddingBottom: 24,
    gap: 8,
  },
  appName: {
    fontSize: 24,
    fontWeight: "700",
    marginTop: 8,
  },
  appTagline: {
    fontSize: 14,
  },
  versionBadge: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
  },
  versionText: {
    fontSize: 13,
    fontWeight: "600",
  },
  menuSection: {
    paddingHorizontal: 16,
    gap: 0,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 14,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  menuContent: {
    flex: 1,
    gap: 2,
  },
  menuLabel: {
    fontSize: 16,
    fontWeight: "600",
  },
  menuSubtitle: {
    fontSize: 13,
  },
  footer: {
    alignItems: "center",
    paddingTop: 32,
    paddingBottom: 16,
    gap: 4,
  },
  footerText: {
    fontSize: 12,
  },
});
