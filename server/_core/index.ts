import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { checkVoiceboxHealth, uploadVoiceProfile, generateVoiceboxSpeech } from "../voicebox";
import { storagePut } from "../storage";

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
        res.status(502).json({ success: false, error: result.error, details: result.details });
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
