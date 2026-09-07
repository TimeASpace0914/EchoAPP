import { useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";

import { Logo } from "@/components/logo";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { VoiceIdentityManager } from "@/components/voice-identity-manager";
import { useColors } from "@/hooks/use-colors";
import { verifyDeveloperPassword } from "@/lib/developer-access";
import { useThemeContext } from "@/lib/theme-provider";

type PageType = "menu" | "about" | "privacy" | "usage" | "developer-lock" | "developer";

export default function SettingsScreen() {
  const colors = useColors();
  const { colorScheme, setColorScheme } = useThemeContext();
  const [currentPage, setCurrentPage] = useState<PageType>("menu");
  const [developerPassword, setDeveloperPassword] = useState("");
  const [developerUnlocked, setDeveloperUnlocked] = useState(false);
  const isDark = colorScheme === "dark";

  const navigateTo = (page: PageType) => {
    setCurrentPage(page);
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const toggleTheme = () => {
    setColorScheme(isDark ? "light" : "dark");
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const lockDeveloperOptions = () => {
    setDeveloperUnlocked(false);
    setDeveloperPassword("");
    navigateTo("menu");
  };

  const unlockDeveloperOptions = () => {
    if (verifyDeveloperPassword(developerPassword)) {
      setDeveloperUnlocked(true);
      setDeveloperPassword("");
      navigateTo("developer");
      if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }

    setDeveloperPassword("");
    Alert.alert("密碼不正確", "請確認後再試一次。");
    if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

  const openDeveloperOptions = () => navigateTo(developerUnlocked ? "developer" : "developer-lock");

  const menuItems = [
    { icon: "info.circle" as const, label: "關於迴響", subtitle: "了解應用理念與技術", onPress: () => navigateTo("about") },
    { icon: "person.fill" as const, label: "隱私政策", subtitle: "了解聲音資料的使用原則", onPress: () => navigateTo("privacy") },
    { icon: "gear" as const, label: "使用說明", subtitle: "家屬快速上手指南", onPress: () => navigateTo("usage") },
    { icon: "gear" as const, label: "開發者選項", subtitle: "聲音身份、候選預覽與品質核可", onPress: openDeveloperOptions },
  ];

  const renderAboutPage = () => (
    <ScrollView contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
      <Text style={[styles.pageHeading, { color: colors.foreground }]}>關於迴響</Text>
      <InfoCard title="理念緣起" colors={colors}>
        迴響希望以經過授權的聲音記憶，陪伴家屬在思念與告別之間，保留親友曾經帶來的溫度與關懷。
      </InfoCard>
      <InfoCard title="技術說明" colors={colors}>
        APP 透過固定的安全傳輸入口連接管理者 Windows 電腦上的本機 Voicebox 服務。模型、Profile 與音檔管理應由授權管理者妥善控管。
      </InfoCard>
      <InfoCard title="使用提醒" colors={colors}>
        生成內容為 AI 模擬語音，並非親友真實發聲。請以尊重、審慎的態度使用，且確認已取得聲音使用授權。
      </InfoCard>
    </ScrollView>
  );

  const renderPrivacyPage = () => (
    <ScrollView contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
      <Text style={[styles.pageHeading, { color: colors.foreground }]}>隱私政策</Text>
      <InfoCard title="授權與用途" colors={colors}>
        請僅使用已取得家屬或權利人同意的聲音。不可擷取網紅、名人或其他可識別真人的未授權語音進行克隆。
      </InfoCard>
      <InfoCard title="音檔處理" colors={colors}>
        參考音檔會傳送至管理者 Windows 電腦上的本機 Voicebox 服務，以建立或使用聲音 Profile。Tunnel 僅負責傳輸，並非將模型搬到雲端運算。
      </InfoCard>
      <InfoCard title="資料保護" colors={colors}>
        家屬音檔、Voicebox Profile、Tunnel 憑證與 Windows 模型資料不可提交到 GitHub；請依搬遷指南進行安全備份與刪除管理。
      </InfoCard>
    </ScrollView>
  );

  const renderUsagePage = () => (
    <ScrollView contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
      <Text style={[styles.pageHeading, { color: colors.foreground }]}>使用說明</Text>
      <Text style={[styles.pageIntro, { color: colors.muted }]}>管理者完成聲音設定後，家屬可依以下步驟使用。</Text>
      {[
        ["1", "確認正式聲音", "首頁會顯示目前已設定的聲音狀態。聲音身份建立、候選預覽與核可只會出現在受保護的開發者選項。"],
        ["2", "輸入文字", "輸入想讓親友說的話；若有專名或罕見字，可用「字(注音)」方式指定讀音。"],
        ["3", "調整語氣與語速", "選擇一種主情緒，必要時補充簡短說明，再以 0–2 倍速調整語速。"],
        ["4", "聆聽與保存", "生成完成後可播放、下載、分享或儲存至回憶庫，供日後回顧。"],
      ].map(([number, title, description]) => (
        <View key={number} style={[styles.stepCard, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
          <View style={[styles.stepNumber, { backgroundColor: colors.primary }]}><Text style={styles.stepNumberText}>{number}</Text></View>
          <Text style={[styles.stepTitle, { color: colors.foreground }]}>{title}</Text>
          <Text style={[styles.stepDescription, { color: colors.foreground }]}>{description}</Text>
        </View>
      ))}
    </ScrollView>
  );

  const renderDeveloperLockPage = () => (
    <ScrollView contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={[styles.lockCard, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
        <View style={[styles.lockIcon, { backgroundColor: `${colors.primary}15` }]}><IconSymbol name="gear" size={28} color={colors.primary} /></View>
        <Text style={[styles.pageHeading, { color: colors.foreground }]}>開發者選項</Text>
        <Text style={[styles.lockIntro, { color: colors.muted }]}>聲音身份、候選版本、固定三段預覽與核可僅限取得授權的管理者操作。</Text>
        <TextInput
          value={developerPassword}
          onChangeText={setDeveloperPassword}
          placeholder="輸入開發者密碼"
          placeholderTextColor={colors.muted}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={unlockDeveloperOptions}
          returnKeyType="done"
          style={[styles.passwordInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
        />
        <TouchableOpacity onPress={unlockDeveloperOptions} activeOpacity={0.85} style={[styles.unlockButton, { backgroundColor: colors.primary }]}>
          <Text style={[styles.unlockButtonText, { color: colors.background }]}>解鎖開發者選項</Text>
        </TouchableOpacity>
        <Text style={[styles.lockFootnote, { color: colors.muted }]}>此功能為 APP 操作介面鎖，目的在降低一般家屬誤操作的風險；Windows 主機與 Voicebox 管理權限仍應獨立控管。</Text>
      </View>
    </ScrollView>
  );

  const renderDeveloperPage = () => (
    <ScrollView contentContainerStyle={styles.developerPageContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.developerHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.pageHeading, { color: colors.foreground }]}>聲音身份管理</Text>
          <Text style={[styles.pageIntro, { color: colors.muted }]}>建立候選版本、完成三段預覽，並指定家屬首頁重用的正式聲音。</Text>
        </View>
        <TouchableOpacity onPress={lockDeveloperOptions} activeOpacity={0.8} style={[styles.lockButton, { borderColor: colors.border }]}><Text style={[styles.lockButtonText, { color: colors.foreground }]}>鎖定</Text></TouchableOpacity>
      </View>
      <VoiceIdentityManager />
    </ScrollView>
  );

  const renderMenuPage = () => (
    <ScrollView contentContainerStyle={styles.menuContent} showsVerticalScrollIndicator={false}>
      <View style={styles.logoSection}>
        <Logo height={64} />
        <Text style={[styles.appName, { color: colors.foreground }]}>迴響</Text>
        <Text style={[styles.appTagline, { color: colors.muted }]}>讓聲音跨越時空</Text>
      </View>
      <View style={styles.themeSection}>
        <TouchableOpacity onPress={toggleTheme} activeOpacity={0.8} style={[styles.themeCard, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
          <View style={[styles.menuIcon, { backgroundColor: `${colors.primary}15` }]}><IconSymbol name={isDark ? "moon.fill" : "sun.max.fill"} size={22} color={colors.primary} /></View>
          <View style={{ flex: 1 }}><Text style={[styles.menuLabel, { color: colors.foreground }]}>{isDark ? "深色模式" : "淺色模式"}</Text><Text style={[styles.menuSubtitle, { color: colors.muted }]}>點擊切換至{isDark ? "淺色" : "深色"}模式</Text></View>
        </TouchableOpacity>
      </View>
      <View style={styles.menuSection}>
        {menuItems.map((item) => (
          <TouchableOpacity key={item.label} onPress={item.onPress} activeOpacity={0.75} style={[styles.menuItem, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
            <View style={[styles.menuIcon, { backgroundColor: `${colors.primary}15` }]}><IconSymbol name={item.icon} size={22} color={colors.primary} /></View>
            <View style={{ flex: 1 }}><Text style={[styles.menuLabel, { color: colors.foreground }]}>{item.label}</Text><Text style={[styles.menuSubtitle, { color: colors.muted }]}>{item.subtitle}</Text></View>
            <IconSymbol name="chevron.right" size={20} color={colors.muted} />
          </TouchableOpacity>
        ))}
      </View>
      <Text style={[styles.footer, { color: colors.muted }]}>請尊重逝者隱私，謹慎使用 AI 語音克隆功能</Text>
    </ScrollView>
  );

  const title = currentPage === "menu" ? "設定" : currentPage === "about" ? "關於迴響" : currentPage === "privacy" ? "隱私政策" : currentPage === "usage" ? "使用說明" : currentPage === "developer-lock" ? "開發者選項" : "聲音身份管理";
  const returnToMenu = currentPage === "developer" ? lockDeveloperOptions : () => navigateTo("menu");

  return (
    <ScreenContainer className="flex-1">
      <View style={[styles.navBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        {currentPage === "menu" ? <View style={{ width: 40 }} /> : <TouchableOpacity onPress={returnToMenu} style={styles.navButton}><IconSymbol name="chevron.left" size={24} color={colors.foreground} /></TouchableOpacity>}
        <Text style={[styles.navTitle, { color: colors.foreground }]}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>
      {currentPage === "menu" && renderMenuPage()}
      {currentPage === "about" && renderAboutPage()}
      {currentPage === "privacy" && renderPrivacyPage()}
      {currentPage === "usage" && renderUsagePage()}
      {currentPage === "developer-lock" && renderDeveloperLockPage()}
      {currentPage === "developer" && renderDeveloperPage()}
    </ScreenContainer>
  );
}

function InfoCard({ title, children, colors }: { title: string; children: string; colors: ReturnType<typeof useColors> }) {
  return <View style={[styles.infoCard, { backgroundColor: colors.surface, shadowColor: "#000" }]}><Text style={[styles.infoTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.infoBody, { color: colors.foreground }]}>{children}</Text></View>;
}

const styles = StyleSheet.create({
  navBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5 },
  navButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  navTitle: { fontSize: 17, fontWeight: "600" },
  menuContent: { paddingBottom: 40 },
  logoSection: { alignItems: "center", paddingTop: 32, paddingBottom: 24, gap: 8 },
  appName: { fontSize: 24, fontWeight: "700", marginTop: 8 },
  appTagline: { fontSize: 14 },
  themeSection: { paddingHorizontal: 16, marginBottom: 12 },
  themeCard: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 16, padding: 16, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  menuSection: { paddingHorizontal: 16, gap: 10 },
  menuItem: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 16, padding: 16, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  menuIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  menuLabel: { fontSize: 16, fontWeight: "600" },
  menuSubtitle: { fontSize: 13, marginTop: 2 },
  footer: { fontSize: 12, lineHeight: 18, textAlign: "center", paddingHorizontal: 36, paddingTop: 28 },
  pageContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 16 },
  pageHeading: { fontSize: 25, fontWeight: "700" },
  pageIntro: { fontSize: 14, lineHeight: 21 },
  infoCard: { borderRadius: 20, padding: 20, gap: 10, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 },
  infoTitle: { fontSize: 17, fontWeight: "700" },
  infoBody: { fontSize: 15, lineHeight: 24 },
  stepCard: { borderRadius: 20, padding: 20, gap: 10, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 },
  stepNumber: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  stepNumberText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  stepTitle: { fontSize: 18, fontWeight: "700" },
  stepDescription: { fontSize: 15, lineHeight: 23 },
  lockCard: { borderRadius: 20, padding: 24, gap: 14, alignItems: "center", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 },
  lockIcon: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  lockIntro: { fontSize: 14, lineHeight: 22, textAlign: "center" },
  passwordInput: { width: "100%", minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: 15 },
  unlockButton: { width: "100%", minHeight: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  unlockButtonText: { fontSize: 15, fontWeight: "700" },
  lockFootnote: { fontSize: 12, lineHeight: 18, textAlign: "center" },
  developerPageContent: { paddingTop: 20, paddingBottom: 40, gap: 16 },
  developerHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 16 },
  lockButton: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 9 },
  lockButtonText: { fontSize: 13, fontWeight: "700" },
});
