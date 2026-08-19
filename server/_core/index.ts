import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { checkVoiceboxHealth, getVoiceboxProfiles, uploadVoiceProfile, generateVoiceboxSpeech } from "../voicebox";
import { storagePut } from "../storage";

type VoiceboxGenerationJob = {
  id: string;
  status: "queued" | "generating" | "completed" | "failed";
  profileId: string;
  text: string;
  createdAt: number;
  updatedAt: number;
  audioBase64?: string;
  duration?: number | null;
  error?: string;
  details?: string;
};

const voiceboxGenerationJobs = new Map<string, VoiceboxGenerationJob>();
const JOB_RETENTION_MS = 30 * 60 * 1000;

function pruneVoiceboxJobs() {
  const cutoff = Date.now() - JOB_RETENTION_MS;
  for (const [id, job] of voiceboxGenerationJobs) {
    if (job.updatedAt < cutoff) voiceboxGenerationJobs.delete(id);
  }
}

function publicVoiceboxJob(job: VoiceboxGenerationJob) {
  return {
    success: true,
    jobId: job.id,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    ...(job.status === "completed" && job.audioBase64
      ? { audioBase64: job.audioBase64, duration: job.duration ?? null, storageUrl: null }
      : {}),
    ...(job.status === "failed" ? { error: job.error, details: job.details } : {}),
  };
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Enable CORS for all routes - reflect the request origin to support credentials
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  // ─── Voicebox REST 端點（供 APP 呼叫） ──────────────────────────────
  app.get("/api/voicebox/health", async (_req, res) => {
    try {
      const status = await checkVoiceboxHealth();
      res.json(status);
    } catch (error) {
      res.status(500).json({ online: false, error: error instanceof Error ? error.message : "未知錯誤" });
    }
  });

  // 只回傳建立／重用聲音身份所需的摘要；APP 的候選／核可狀態由裝置端管理，
  // 不會改動 Voicebox 原始 Profile，也不會覆蓋既有最佳聲音。
  app.get("/api/voicebox/profiles", async (_req, res) => {
    try {
      const profiles = await getVoiceboxProfiles();
      if ("error" in profiles) {
        res.status(502).json({ success: false, error: profiles.error, details: profiles.details });
        return;
      }
      res.json({
        success: true,
        profiles: profiles.map((profile) => ({
          id: profile.id,
          name: profile.name,
          description: profile.description ?? null,
          sampleCount: profile.sample_count ?? 0,
        })),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "無法取得 Voicebox Profile 列表",
      });
    }
  });

  app.post("/api/voicebox/upload", async (req, res) => {
    try {
      const { name, audioBase64, mimeType, referenceText, personality, description } = req.body as {
        name: string;
        audioBase64: string;
        mimeType?: string;
        referenceText?: string;
        personality?: string;
        description?: string;
      };
      if (!name || !audioBase64) {
        res.status(400).json({ success: false, error: "缺少必要參數 name 或 audioBase64" });
        return;
      }
      // description 傳給 Voicebox 作為 design_prompt（聲音描述，輔助 AI 模仿）
      // personality 傳給 Voicebox 作為 personality（語氣與個性設定）
      // profile name 保持原始 name（自動產生的 echo_timestamp）
      const result = await uploadVoiceProfile(name, audioBase64, mimeType || "audio/wav", referenceText, personality, description);
      if ("error" in result) {
        res.status(result.code === "QUALITY_REJECTED" ? 422 : 502).json({ success: false, error: result.error, details: result.details });
        return;
      }
      res.json({ success: true, profileId: result.profile_id, name: result.name });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : "未知錯誤" });
    }
  });

  app.post("/api/voicebox/generate", async (req, res) => {
    try {
      const { text, profileId, speed, language, instruct, engine, seed } = req.body as {
        text: string;
        profileId: string;
        speed?: number;
        language?: string;
        instruct?: string;
        engine?: string;
        seed?: number;
      };
      if (!text || !profileId) {
        res.status(400).json({ success: false, error: "缺少必要參數 text 或 profileId" });
        return;
      }
      const result = await generateVoiceboxSpeech({
        text,
        profile_id: profileId,
        // 預設使用 qwen 引擎（Qwen-TTS 語音克隆效果最佳）
        engine: engine || "qwen",
        ...(speed !== undefined && { speed }),
        ...(language && { language }),
        ...(instruct && { instruct }),
        ...(seed !== undefined && { seed }),
      });
      if ("error" in result) {
        res.status(502).json({ success: false, error: result.error, details: result.details });
        return;
      }
      // 先回應音檔給用戶端，storage 上傳改為非阻塞
      res.json({
        success: true,
        audioBase64: result.audio,
        duration: result.duration ?? null,
        storageUrl: null,
      });

      // 背景上傳到 storage（不阻塞回應）
      storagePut(`voice-clone/${Date.now()}.wav`, Buffer.from(result.audio, "base64"), "audio/wav").catch(() => {});
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : "未知錯誤" });
    }
  });

  // 非同步生成任務：Cloudflare、Expo 開發代理等中介層可能在 CPU 推論完成前
  // 關閉長時間 HTTP 請求（504）。此端點只負責建立工作並立即回傳；實際推論在
  // 背景進行，APP 以短連線輪詢下方的 job 狀態端點。
  app.post("/api/voicebox/generate-jobs", (req, res) => {
    const { text, profileId, speed, language, instruct, engine, seed } = req.body as {
      text: string;
      profileId: string;
      speed?: number;
      language?: string;
      instruct?: string;
      engine?: string;
      seed?: number;
    };

    if (!text || !profileId) {
      res.status(400).json({ success: false, error: "缺少必要參數 text 或 profileId" });
      return;
    }

    pruneVoiceboxJobs();
    const job: VoiceboxGenerationJob = {
      id: crypto.randomUUID(),
      status: "queued",
      profileId,
      text,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    voiceboxGenerationJobs.set(job.id, job);
    res.status(202).json(publicVoiceboxJob(job));

    void (async () => {
      job.status = "generating";
      job.updatedAt = Date.now();
      console.log(`[Voicebox] Background generation job ${job.id} started for profile ${profileId}`);

      try {
        const result = await generateVoiceboxSpeech({
          text,
          profile_id: profileId,
          engine: engine || "qwen",
          ...(speed !== undefined && { speed }),
          ...(language && { language }),
          ...(instruct && { instruct }),
          ...(seed !== undefined && { seed }),
        });

        if ("error" in result) {
          job.status = "failed";
          job.error = result.error;
          job.details = result.details;
          console.error(`[Voicebox] Background job ${job.id} failed: ${result.error}`, result.details);
        } else {
          job.status = "completed";
          job.audioBase64 = result.audio;
          job.duration = result.duration ?? null;
          console.log(`[Voicebox] Background job ${job.id} completed`);
          storagePut(`voice-clone/${Date.now()}.wav`, Buffer.from(result.audio, "base64"), "audio/wav").catch(() => {});
        }
      } catch (error) {
        job.status = "failed";
        job.error = "背景語音生成發生未預期錯誤";
        job.details = error instanceof Error ? error.message : String(error);
        console.error(`[Voicebox] Background job ${job.id} crashed:`, error);
      } finally {
        job.updatedAt = Date.now();
      }
    })();
  });

  app.get("/api/voicebox/generate-jobs/:jobId", (req, res) => {
    const job = voiceboxGenerationJobs.get(req.params.jobId);
    if (!job) {
      res.status(404).json({ success: false, error: "找不到生成任務；伺服器可能已重新啟動" });
      return;
    }
    res.json(publicVoiceboxJob(job));
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
  });
}

startServer().catch(console.error);
