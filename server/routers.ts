import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { storagePut, storageGetSignedUrl } from "./storage";
import {
  getVoiceboxProfiles,
  generateVoiceboxSpeech,
  uploadVoiceProfile,
  checkVoiceboxHealth,
} from "./voicebox";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Voicebox 語音克隆 API ───────────────────────────────────────────────
  voice: router({
    /**
     * 檢查 Voicebox 服務健康狀態
     */
    health: publicProcedure.query(async () => {
      return await checkVoiceboxHealth();
    }),

    /**
     * 取得所有可用的聲音檔案（在 Voicebox 中建立的 profiles）
     */
    profiles: publicProcedure.query(async () => {
      const result = await getVoiceboxProfiles();
      if ("error" in result) {
        return { profiles: [], error: result.error, code: result.code };
      }
      return { profiles: result, error: null, code: null };
    }),

    /**
     * 上傳參考音檔到 Voicebox，建立聲音檔案
     * 接收 base64 編碼的音檔
     */
    uploadProfile: publicProcedure
      .input(
        z.object({
          name: z.string().min(1).max(100),
          audioBase64: z.string(),
          mimeType: z.string().default("audio/wav"),
        }),
      )
      .mutation(async ({ input }) => {
        const result = await uploadVoiceProfile(
          input.name,
          input.audioBase64,
          input.mimeType,
        );
        if ("error" in result) {
          return { success: false, error: result.error, profileId: null };
        }
        return { success: true, error: null, profileId: result.profile_id };
      }),

    /**
     * 使用 Voicebox 生成語音
     * 接收文字與 profile_id，回傳 base64 WAV 音檔
     */
    generate: publicProcedure
      .input(
        z.object({
          text: z.string().min(1).max(5000),
          profileId: z.string().min(1),
          speed: z.number().min(0.5).max(2.0).optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const result = await generateVoiceboxSpeech({
          text: input.text,
          profile_id: input.profileId,
          speed: input.speed,
        });

        if ("error" in result) {
          return {
            success: false,
            error: result.error,
            audioBase64: null,
            duration: null,
            storageUrl: null,
          };
        }

        // 將生成的音檔上傳到 S3 儲存，方便 APP 下載
        let storageUrl: string | null = null;
        try {
          const audioBuffer = Buffer.from(result.audio, "base64");
          const { url } = await storagePut(
            `voice-clone/${Date.now()}.wav`,
            audioBuffer,
            "audio/wav",
          );
          storageUrl = url;
        } catch {
          // 儲存失敗不影響主流程，仍回傳 base64
        }

        return {
          success: true,
          error: null,
          audioBase64: result.audio,
          duration: result.duration ?? null,
          storageUrl,
        };
      }),

    /**
     * 直接上傳音檔到 S3，取得公開 URL（供 Voicebox 使用）
     */
    uploadAudio: publicProcedure
      .input(
        z.object({
          audioBase64: z.string(),
          mimeType: z.string().default("audio/wav"),
          filename: z.string().default("reference.wav"),
        }),
      )
      .mutation(async ({ input }) => {
        const audioBuffer = Buffer.from(input.audioBase64, "base64");
        const ext = input.mimeType.split("/")[1] || "wav";
        const { key, url } = await storagePut(
          `voice-reference/${Date.now()}.${ext}`,
          audioBuffer,
          input.mimeType,
        );
        // 取得可公開存取的 URL
        const signedUrl = await storageGetSignedUrl(key);
        return { url, signedUrl, key };
      }),
  }),
});

export type AppRouter = typeof appRouter;
