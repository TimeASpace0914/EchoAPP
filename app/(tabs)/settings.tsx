import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { Logo } from "@/components/logo";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

type PageType = "menu" | "about" | "privacy" | "usage";

export default function SettingsScreen() {
  const colors = useColors();
  const [currentPage, setCurrentPage] = useState<PageType>("menu");

  const navigateTo = (page: PageType) => {
    setCurrentPage(page);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const menuItems = [
    {
      icon: "info.circle" as const,
      label: "關於迴響",
      subtitle: "了解應用理念與技術",
      onPress: () => navigateTo("about"),
    },
    {
      icon: "person.fill" as const,
      label: "隱私政策",
      subtitle: "了解資料如何被保護",
      onPress: () => navigateTo("privacy"),
    },
    {
      icon: "gear" as const,
      label: "使用說明",
      subtitle: "快速上手指南",
      onPress: () => navigateTo("usage"),
    },
  ];

  // === 關於迴響頁面 ===
  const renderAboutPage = () => (
    <ScrollView contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
      <Text style={[styles.pageHeading, { color: colors.foreground }]}>關於迴響</Text>

      <View style={[styles.sectionCard, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>理念緣起</Text>
        <Text style={[styles.sectionBody, { color: colors.foreground }]}>
         近年來，殯葬業界積極推行環保葬，鼓勵家屬以樹葬、花葬、海葬等自然方式讓逝者回歸大地。然而，許多家屬在接受這些新興殯葬文化的同時，往往也因為沒有實體的墓碑或塔位可依，失去了傳統的心靈寄託。
        </Text>
        <Text style={[styles.sectionBody, { color: colors.foreground }]}>
         迴響的誕生，正是為了回應這份失落。我們希望透過 AI 語音克隆技術，讓家屬在尊重並推行環保葬的同時，仍能聽到親友的聲音，撫慰失落期的心靈，讓愛與記憶不因形式的改變而消散。
        </Text>
      </View>

      <View style={[styles.sectionCard, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>技術說明</Text>
        <Text style={[styles.sectionBody, { color: colors.foreground }]}>
         迴響運用 AI 語音克隆技術，透過您上傳的親友生前音檔，學習其聲音特徵，再根據您輸入的文字，生成以親友聲音說出的語音。所有運算均在您的裝置上本地完成，音檔不會上傳至任何伺服器，確保隱私安全。
        </Text>
      </View>

      <View style={[styles.sectionCard, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>使用提醒</Text>
        <Text style={[styles.sectionBody, { color: colors.foreground }]}>
         本應用旨在撫慰家屬心靈，請以尊重逝者的態度謹慎使用。生成的語音為 AI 模擬，非逝者真實發聲，請理性看待。我們鼓勵您將此作為個人情感寄託的工具，而非其他用途。
        </Text>
      </View>

      <TouchableOpacity
        onPress={() => navigateTo("menu")}
        style={[styles.backButton, { borderColor: colors.border }]}
      >
        <IconSymbol name="chevron.left" size={18} color={colors.foreground} />
        <Text style={[styles.backText, { color: colors.foreground }]}>返回設定</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  // === 隱私政策頁面 ===
  const renderPrivacyPage = () => (
    <ScrollView contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
      <Text style={[styles.pageHeading, { color: colors.foreground }]}>隱私政策</Text>

      <View style={[styles.sectionCard, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>資料收集</Text>
        <Text style={[styles.sectionBody, { color: colors.foreground }]}>
         迴響不收集任何個人資料。我們不要求註冊帳號，不追蹤使用行為，不收集設備資訊。您的使用完全匿名。
        </Text>
      </View>

      <View style={[styles.sectionCard, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>音檔處理</Text>
        <Text style={[styles.sectionBody, { color: colors.foreground }]}>
         您上傳的親友音檔及生成的語音，均僅儲存於您的裝置本地。所有語音克隆運算在您的裝置上離線完成，不會將任何音檔上傳至雲端伺服器。歷史紀錄同樣僅保存在您的裝置上，不會同步至任何外部服務。
        </Text>
      </View>

      <View style={[styles.sectionCard, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>尊重逝者隱私</Text>
        <Text style={[styles.sectionBody, { color: colors.foreground }]}>
         我們高度重視逝者的隱私與尊嚴。請您在使用本應用時，確保已獲得逝者家屬的同意，並以尊重的態度使用逝者的聲音資料。請勿將生成的語音用於商業用途、公開散播或其他可能損害逝者名譽的行為。
        </Text>
        <Text style={[styles.sectionBody, { color: colors.foreground }]}>
         逝者的聲音是其人格權的一部分，即使逝者已不在人世，其聲音仍應受到妥善保護。我們信任您會以最謹慎的態度對待這份珍貴的聲音記憶。
        </Text>
      </View>

      <View style={[styles.sectionCard, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>資料刪除</Text>
        <Text style={[styles.sectionBody, { color: colors.foreground }]}>
         您可以隨時在回憶庫中刪除任何語音紀錄，刪除後資料將從您的裝置中永久移除，無法復原。若您解除安裝本應用，所有本地資料將一併清除。
        </Text>
      </View>

      <TouchableOpacity
        onPress={() => navigateTo("menu")}
        style={[styles.backButton, { borderColor: colors.border }]}
      >
        <IconSymbol name="chevron.left" size={18} color={colors.foreground} />
        <Text style={[styles.backText, { color: colors.foreground }]}>返回設定</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  // === 使用說明頁面 ===
  const renderUsagePage = () => {
    const steps = [
      {
        num: "1",
        title: "上傳音檔",
        desc: "在首頁點擊「選擇音檔」，上傳親友生前的聲音錄音。支援 MP3、WAV、M4A 等常見格式，建議音檔長度至少 3 秒以上。上傳後可先試聽確認內容無誤。",
        icon: "cloud.fill" as const,
      },
      {
        num: "2",
        title: "輸入文字",
        desc: "在文字框中輸入您想讓親友說的話。例如：「孩子，你要好好的，我會一直在你身邊。」輸入完成後點擊「生成語音」。",
        icon: "pencil" as const,
      },
      {
        num: "3",
        title: "生成語音",
        desc: "AI 將分析音檔中的聲音特徵，並根據您輸入的文字生成語音。生成過程中會顯示進度，請耐心等待。",
        icon: "waveform" as const,
      },
      {
        num: "4",
        title: "建立連結",
        desc: "生成完成後，您可以在播放頁面聆聽、下載或分享這段語音。為語音命名並添加標籤，日後可在回憶庫中隨時回顧，與逝者建立永恆的聲音連結。",
        icon: "heart.fill" as const,
      },
    ];

    return (
      <ScrollView contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.pageHeading, { color: colors.foreground }]}>使用說明</Text>
        <Text style={[styles.pageIntro, { color: colors.muted }]}>
         三個簡單步驟，讓您再次聽到親友的聲音
        </Text>

        {steps.map((step, index) => (
          <View key={index} style={[styles.stepCard, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
            <View style={styles.stepHeader}>
              <View style={[styles.stepIcon, { backgroundColor: `${colors.primary}15` }]}>
                <IconSymbol name={step.icon} size={24} color={colors.primary} />
              </View>
              <View style={[styles.stepNumber, { backgroundColor: colors.primary }]}>
                <Text style={styles.stepNumberText}>{step.num}</Text>
              </View>
            </View>
            <Text style={[styles.stepTitle, { color: colors.foreground }]}>{step.title}</Text>
            <Text style={[styles.stepDesc, { color: colors.foreground }]}>{step.desc}</Text>
            {index < steps.length - 1 && (
              <View style={[styles.stepConnector, { backgroundColor: colors.border }]} />
            )}
          </View>
        ))}

        <TouchableOpacity
          onPress={() => navigateTo("menu")}
          style={[styles.backButton, { borderColor: colors.border }]}
        >
          <IconSymbol name="chevron.left" size={18} color={colors.foreground} />
          <Text style={[styles.backText, { color: colors.foreground }]}>返回設定</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  // === 主選單頁面 ===
  const renderMenuPage = () => (
    <>
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
    </>
  );

  return (
    <ScreenContainer className="flex-1">
      {/* 導覽列 */}
      <View style={[styles.navBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        {currentPage !== "menu" ? (
          <TouchableOpacity
            onPress={() => navigateTo("menu")}
            style={styles.navButton}
          >
            <IconSymbol name="chevron.left" size={24} color={colors.foreground} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
        <Text style={[styles.navTitle, { color: colors.foreground }]}>
          {currentPage === "menu" ? "設定" : currentPage === "about" ? "關於迴響" : currentPage === "privacy" ? "隱私政策" : "使用說明"}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {currentPage === "menu" && renderMenuPage()}
      {currentPage === "about" && renderAboutPage()}
      {currentPage === "privacy" && renderPrivacyPage()}
      {currentPage === "usage" && renderUsagePage()}
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
  // 內容頁面樣式
  pageContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 16,
  },
  pageHeading: {
    fontSize: 26,
    fontWeight: "700",
  },
  pageIntro: {
    fontSize: 15,
    marginBottom: 4,
  },
  sectionCard: {
    borderRadius: 20,
    padding: 20,
    gap: 10,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  sectionBody: {
    fontSize: 15,
    lineHeight: 24,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    alignSelf: "center",
    marginTop: 8,
  },
  backText: {
    fontSize: 15,
    fontWeight: "600",
  },
  // 使用說明步驟
  stepCard: {
    borderRadius: 20,
    padding: 20,
    gap: 10,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stepIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumberText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  stepDesc: {
    fontSize: 15,
    lineHeight: 24,
  },
  stepConnector: {
    width: 2,
    height: 20,
    alignSelf: "center",
    marginTop: 4,
  },
});
