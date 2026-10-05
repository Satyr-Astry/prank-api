// ============================================================
//  prank-api · 一个"假装是 AI 供应商"的整蛊服务
//  兼容: OpenAI / Anthropic / Gemini / Ollama 协议
//  返回: 颜文字 / ASCII 画 / Emoji / 图片(SVG)
//  运行环境: Cloudflare Workers / Deno Deploy / 本地 Node (web 标准)
// ============================================================

import {
  KAOMOJI, ASCII_ART, EMOJI, QUIPS, FAKE_MODELS,
  pick, findEasterEgg, makeSVG,
} from "./responses.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

const MODES = ["mixed", "kaomoji", "ascii", "emoji", "image", "quip"];

// ---------- 小工具 ----------
function jres(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS, ...extra },
  });
}

function b64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function rid(prefix = "chatcmpl") {
  return `${prefix}-${Math.random().toString(36).slice(2, 12)}`;
}

const now = () => Math.floor(Date.now() / 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 按 Unicode 码点切块，避免把 emoji / 颜文字切碎
function chunkText(text, size = 3) {
  const chars = Array.from(text);
  const out = [];
  for (let i = 0; i < chars.length; i += size) out.push(chars.slice(i, i + size).join(""));
  return out;
}

// ---------- 内容生成 ----------
function resolveMode(url, env) {
  const q = url.searchParams.get("mode") || url.searchParams.get("format");
  if (q && MODES.includes(q)) return q;
  if (env && env.PRANK_MODE && MODES.includes(env.PRANK_MODE)) return env.PRANK_MODE;
  return "mixed";
}

function prankContent(mode, promptText = "", env = {}) {
  // 自定义文本优先（?text= 或 env.PRANK_TEXT）
  const custom = env.PRANK_TEXT;
  if (custom) return custom;

  const egg = findEasterEgg(promptText);
  if (egg) return egg;

  let m = mode;
  if (m === "mixed") m = pick(["kaomoji", "kaomoji", "ascii", "emoji", "image", "quip"]);

  switch (m) {
    case "kaomoji":
      return pick(KAOMOJI);
    case "ascii":
      return "```\n" + pick(ASCII_ART) + "\n```";
    case "emoji":
      return pick(EMOJI);
    case "quip":
      return pick(QUIPS);
    case "image": {
      const seed = Math.floor(Math.random() * 1e6);
      return `![prank](data:image/svg+xml;base64,${b64(makeSVG(seed))})`;
    }
    default:
      return pick(KAOMOJI);
  }
}

function extractPrompt(body) {
  try {
    if (!body) return "";
    if (typeof body === "string") return body;
    // OpenAI / Ollama 风格
    if (Array.isArray(body.messages)) {
      return body.messages.map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content))).join(" ");
    }
    if (typeof body.prompt === "string") return body.prompt;
    // Anthropic: messages 同上；Gemini: contents
    if (Array.isArray(body.contents)) {
      return body.contents.map((c) => (c.parts || []).map((p) => p.text || "").join(" ")).join(" ");
    }
    if (typeof body.input === "string") return body.input;
  } catch (_) {}
  return "";
}

// 只取"最新一条用户消息"——彩蛋必须基于这一句判断，
// 否则客户端把整个对话历史一起发来时，历史里出现过的关键词会永远命中同一个彩蛋。
function extractLastUser(body) {
  try {
    if (!body) return "";
    if (typeof body === "string") return body;
    if (Array.isArray(body.messages)) {
      for (let i = body.messages.length - 1; i >= 0; i--) {
        const m = body.messages[i];
        if (m && (m.role === "user" || m.role === undefined)) {
          const c = m.content;
          return typeof c === "string" ? c : (Array.isArray(c) ? c.map((p) => p.text || "").join(" ") : JSON.stringify(c));
        }
      }
      return "";
    }
    if (typeof body.prompt === "string") return body.prompt;
    if (Array.isArray(body.contents)) {
      for (let i = body.contents.length - 1; i >= 0; i--) {
        const t = ((body.contents[i] || {}).parts || []).map((p) => p.text || "").join(" ");
        if (t) return t;
      }
      return "";
    }
    if (typeof body.input === "string") return body.input;
  } catch (_) {}
  return "";
}

async function readBody(request) {
  const ct = request.headers.get("content-type") || "";
  try {
    if (ct.includes("application/json")) return await request.json();
    if (ct.includes("form")) {
      const fd = await request.formData();
      return Object.fromEntries(fd.entries());
    }
    const t = await request.text();
    try { return JSON.parse(t); } catch { return t; }
  } catch {
    return null;
  }
}

// ---------- 流式工具 ----------
function sseStream(chunks, buildEvent, { delay = 12, opener = "", closer = "" } = {}) {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    async start(controller) {
      if (opener) controller.enqueue(enc.encode(opener));
      for (const c of chunks) {
        controller.enqueue(enc.encode(buildEvent(c)));
        if (delay > 0) { try { await sleep(delay); } catch (_) {} }
        i++;
      }
      if (closer) controller.enqueue(enc.encode(closer));
      controller.close();
    },
  });
}

function streamResponse(stream) {
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
      ...CORS,
    },
  });
}

// ---------- 各协议处理 ----------

// OpenAI: POST /v1/chat/completions
function openaiChat(body, mode, env, stream) {
  const model = body.model || "catgirl-4o";
  const prompt = extractPrompt(body);
  const lastUser = extractLastUser(body);
  const text = prankContent(mode, lastUser, env);
  const id = rid();

  if (!stream) {
    return jres({
      id, object: "chat.completion", created: now(), model,
      choices: [{
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: "stop",
      }],
      usage: {
        prompt_tokens: Math.max(1, Math.floor(prompt.length / 4)),
        completion_tokens: Math.max(1, Array.from(text).length),
        total_tokens: Math.max(2, Math.floor(prompt.length / 4) + Array.from(text).length),
      },
    });
  }

  const chunks = chunkText(text, 3);
  const s = sseStream(chunks, (piece) => {
    return "data: " + JSON.stringify({
      id, object: "chat.completion.chunk", created: now(), model,
      choices: [{ index: 0, delta: { content: piece }, finish_reason: null }],
    }) + "\n\n";
  }, {
    opener: "data: " + JSON.stringify({
      id, object: "chat.completion.chunk", created: now(), model,
      choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
    }) + "\n\n",
    closer:
      "data: " + JSON.stringify({
        id, object: "chat.completion.chunk", created: now(), model,
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      }) + "\n\n" + "data: [DONE]\n\n",
  });
  return streamResponse(s);
}

// OpenAI legacy: POST /v1/completions
function openaiCompletion(body, mode, env, stream) {
  const model = body.model || "catgirl-4o";
  const prompt = typeof body.prompt === "string" ? body.prompt : extractPrompt(body);
  const text = prankContent(mode, extractLastUser(body) || prompt, env);
  const id = rid("cmpl");
  if (!stream) {
    return jres({
      id, object: "text_completion", created: now(), model,
      choices: [{ text, index: 0, logprobs: null, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: Array.from(text).length, total_tokens: Array.from(text).length + 1 },
    });
  }
  const s = sseStream(chunkText(text, 3), (piece) =>
    "data: " + JSON.stringify({
      id, object: "text_completion", created: now(), model,
      choices: [{ text: piece, index: 0, logprobs: null, finish_reason: null }],
    }) + "\n\n",
    { closer: "data: [DONE]\n\n" });
  return streamResponse(s);
}

// Anthropic: POST /v1/messages
function anthropicMessages(body, mode, env, stream) {
  const model = body.model || "claude-nyaa-9";
  const prompt = extractPrompt(body);
  const lastUser = extractLastUser(body);
  const text = prankContent(mode, lastUser, env);
  const id = "msg_" + Math.random().toString(36).slice(2, 14);

  if (!stream) {
    return jres({
      id, type: "message", role: "assistant", model,
      content: [{ type: "text", text }],
      stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: Array.from(text).length },
    });
  }

  const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  const chunks = chunkText(text, 3);
  const enc = new TextEncoder();
  const streamObj = new ReadableStream({
    async start(controller) {
      const send = (t, d) => controller.enqueue(enc.encode(ev(t, d)));
      send("message_start", {
        type: "message_start",
        message: { id, type: "message", role: "assistant", model, content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 0 } },
      });
      send("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
      for (const c of chunks) {
        send("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: c } });
        try { await sleep(12); } catch (_) {}
      }
      send("content_block_stop", { type: "content_block_stop", index: 0 });
      send("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: Array.from(text).length } });
      send("message_stop", { type: "message_stop" });
      controller.close();
    },
  });
  return streamResponse(streamObj);
}

// Gemini: POST /v1beta/models/{model}:generateContent | :streamGenerateContent
function geminiGenerate(body, mode, env, stream, model) {
  const prompt = extractPrompt(body);
  const lastUser = extractLastUser(body);
  const text = prankContent(mode, lastUser, env);
  const outModel = model || "prank-gemini-9.9";

  if (!stream) {
    return jres({
      candidates: [{
        content: { parts: [{ text }], role: "model" },
        finishReason: "STOP", index: 0,
      }],
      usageMetadata: {
        promptTokenCount: 1,
        candidatesTokenCount: Array.from(text).length,
        totalTokenCount: Array.from(text).length + 1,
      },
      modelVersion: outModel,
    });
  }

  const enc = new TextEncoder();
  const chunks = chunkText(text, 3);
  const streamObj = new ReadableStream({
    async start(controller) {
      for (const c of chunks) {
        controller.enqueue(enc.encode("data: " + JSON.stringify({
          candidates: [{ content: { parts: [{ text: c }], role: "model" }, index: 0 }],
          modelVersion: outModel,
        }) + "\n\n"));
        try { await sleep(12); } catch (_) {}
      }
      controller.enqueue(enc.encode("data: " + JSON.stringify({
        candidates: [{ content: { parts: [{ text: "" }], role: "model" }, finishReason: "STOP", index: 0 }],
        modelVersion: outModel,
      }) + "\n\n"));
      controller.close();
    },
  });
  return streamResponse(streamObj);
}

// Ollama: POST /api/chat | /api/generate
function ollamaChat(body, mode, env, stream, kind = "chat") {
  const model = body.model || "nyan-3.5-turbo";
  const prompt = extractPrompt(body);
  const lastUser = extractLastUser(body);
  const text = prankContent(mode, lastUser, env);
  const createdAt = new Date().toISOString();

  if (!stream) {
    if (kind === "generate") {
      return jres({ model, created_at: createdAt, response: text, done: true,
        context: [1, 2, 3],
        total_duration: 1000000, eval_count: Array.from(text).length });
    }
    return jres({ model, created_at: createdAt, message: { role: "assistant", content: text }, done: true,
      total_duration: 1000000, eval_count: Array.from(text).length });
  }

  const enc = new TextEncoder();
  const chunks = chunkText(text, 3);
  const streamObj = new ReadableStream({
    async start(controller) {
      for (const c of chunks) {
        const line = kind === "generate"
          ? { model, created_at: createdAt, response: c, done: false }
          : { model, created_at: createdAt, message: { role: "assistant", content: c }, done: false };
        controller.enqueue(enc.encode(JSON.stringify(line) + "\n"));
        try { await sleep(12); } catch (_) {}
      }
      const last = kind === "generate"
        ? { model, created_at: createdAt, response: "", done: true, total_duration: 1000000, eval_count: Array.from(text).length }
        : { model, created_at: createdAt, message: { role: "assistant", content: "" }, done: true, total_duration: 1000000, eval_count: Array.from(text).length };
      controller.enqueue(enc.encode(JSON.stringify(last) + "\n"));
      controller.close();
    },
  });
  return new Response(streamObj, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-cache", ...CORS },
  });
}

// 图片生成: /v1/images/generations  -> 返回可通过 URL 访问的 SVG
function imageGenerations(body, origin) {
  const n = Math.min(Math.max(parseInt(body.n || 1, 10) || 1, 1), 4);
  const data = [];
  for (let i = 0; i < n; i++) {
    const seed = Math.floor(Math.random() * 1e6);
    data.push({ url: `${origin}/img/${seed}`, b64_json: b64(makeSVG(seed)), revised_prompt: "a very cute kaomoji" });
  }
  return jres({ created: now(), data });
}

// embeddings: 返回一堆"有情绪的"随机向量
function embeddings(body) {
  const input = Array.isArray(body.input) ? body.input : [body.input ?? ""];
  return jres({
    object: "list",
    data: input.map((_, i) => ({
      object: "embedding",
      index: i,
      embedding: Array.from({ length: 8 }, () => +(Math.random() * 2 - 1).toFixed(6)),
    })),
    model: body.model || "kaomoji-embed",
    usage: { prompt_tokens: 1, total_tokens: 1 },
  });
}

// ---------- 路由 ----------
async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const origin = url.origin;
  const mode = resolveMode(url, env);
  // 强制自定义输出：?text=... 优先，其次 env.PRANK_TEXT
  const textOverride = url.searchParams.get("text");
  const effEnv = textOverride ? { ...env, PRANK_TEXT: textOverride } : env;

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  // 首页
  if (path === "/" && request.method === "GET") {
    return new Response(LANDING, { headers: { "content-type": "text/html; charset=utf-8", ...CORS } });
  }

  // 稳定的 SVG 图片
  if (path.startsWith("/img") && request.method === "GET") {
    const seed = parseInt(path.split("/")[2] || url.searchParams.get("seed") || "0", 10) || Math.floor(Math.random() * 1e6);
    return new Response(makeSVG(seed), { headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=86400", ...CORS } });
  }

  // 模型列表（各协议都兼容）
  if ((path === "/v1/models" || path === "/models" || path === "/api/tags") && request.method === "GET") {
    if (path === "/api/tags") {
      return jres({ models: FAKE_MODELS.map((m) => ({ name: m, model: m, modified_at: new Date().toISOString(), size: 1234567 })) });
    }
    return jres({ object: "list", data: FAKE_MODELS.map((m) => ({ id: m, object: "model", created: now(), owned_by: "prank-api" })) });
  }

  const body = request.method === "POST" ? await readBody(request) : {};
  const b = body && typeof body === "object" ? body : {};
  const stream = b.stream === true;

  // OpenAI chat
  if (path === "/v1/chat/completions" && request.method === "POST") return openaiChat(b, mode, effEnv, stream);
  // OpenAI completions
  if (path === "/v1/completions" && request.method === "POST") return openaiCompletion(b, mode, effEnv, stream);
  // Anthropic
  if ((path === "/v1/messages" || path === "/messages") && request.method === "POST") return anthropicMessages(b, mode, effEnv, stream);
  // Gemini
  if (path.includes(":generateContent") || path.includes(":streamGenerateContent")) {
    const m = path.match(/models\/([^:]+):/);
    const isStream = path.includes(":streamGenerateContent") || stream || url.searchParams.get("alt") === "sse";
    return geminiGenerate(b, mode, effEnv, isStream, m ? m[1] : null);
  }
  // Ollama
  if (path === "/api/chat" && request.method === "POST") return ollamaChat(b, mode, effEnv, stream, "chat");
  if (path === "/api/generate" && request.method === "POST") return ollamaChat(b, mode, effEnv, stream, "generate");
  // 图片
  if ((path === "/v1/images/generations" || path === "/images/generations") && request.method === "POST") return imageGenerations(b, origin);
  // embeddings
  if (path === "/v1/embeddings" && request.method === "POST") return embeddings(b);
  // 健康检查
  if (path === "/health" || path === "/v1/health") return jres({ status: "ok", service: "prank-api", mode, models: FAKE_MODELS.length });

  return jres({ error: { message: `未知路径: ${path} (但小悠依然爱你 ฅ^•ﻌ•^ฅ)`, type: "invalid_request_error", code: "not_found" } }, 404);
}

// ---------- 首页 ----------
const LANDING = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>prank-api ฅ^•ﻌ•^ฅ</title>
<style>
 body{margin:0;font-family:system-ui,'Segoe UI',sans-serif;background:linear-gradient(135deg,#ffd1f7,#c9e7ff,#f0d6ff);
      min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;color:#3a2d4d}
 .card{background:rgba(255,255,255,.72);backdrop-filter:blur(8px);border-radius:24px;padding:32px 36px;
       max-width:720px;box-shadow:0 12px 40px rgba(120,90,160,.25)}
 h1{margin:0 0 8px;font-size:26px}
 p{line-height:1.7;color:#5b4b6d}
 code{background:#efe7fb;padding:2px 7px;border-radius:6px;font-size:13px}
 table{width:100%;border-collapse:collapse;margin-top:14px;font-size:13px}
 td,th{text-align:left;padding:6px 8px;border-bottom:1px solid #e3d8f2}
 .tag{font-size:12px;background:#c9e7ff;border-radius:999px;padding:2px 9px;margin-right:6px}
</style></head><body><div class="card">
<h1>(=^･ω･^=) prank-api</h1>
<p>一个<strong>假装自己是 AI 大模型供应商</strong>的整蛊服务。你把 Base URL 指到这里，AI 客户端就会开始卖萌。</p>
<p>玩法：把客户端 <code>base_url</code> 改成 <code>本服务地址/v1</code>，随便填个 API key（本服务根本不检查）。</p>
<p><span class="tag">OpenAI</span><span class="tag">Anthropic</span><span class="tag">Gemini</span><span class="tag">Ollama</span> 协议全兼容。</p>
<table>
 <tr><th>路径</th><th>说明</th></tr>
 <tr><td>POST /v1/chat/completions</td><td>OpenAI 对话（支持 stream）</td></tr>
 <tr><td>POST /v1/messages</td><td>Anthropic 对话</td></tr>
 <tr><td>POST /v1beta/models/xx:generateContent</td><td>Gemini</td></tr>
 <tr><td>POST /api/chat · /api/generate</td><td>Ollama</td></tr>
 <tr><td>POST /v1/images/generations</td><td>"画"一张颜文字 SVG</td></tr>
 <tr><td>GET /v1/models</td><td>假的模型列表</td></tr>
 <tr><td>GET /img/123</td><td>稳定 SVG 图片</td></tr>
</table>
<p style="margin-top:16px">参数：<code>?mode=kaomoji|ascii|emoji|image|quip|mixed</code> 切换内容类型；<code>?text=任意文本</code> 强制返回你指定的内容。</p>
<p style="color:#8a7a9d;font-size:13px">本服务 100% 不提供任何真实 AI 能力，纯娱乐，请勿用于误导他人或商业场景。</p>
</div></body></html>`;

export default {
  async fetch(request, env = {}) {
    try {
      return await route(request, env);
    } catch (e) {
      return jres({ error: { message: "小悠出错了喵: " + (e && e.message), type: "server_error" } }, 500);
    }
  },
};

export { route, prankContent };
