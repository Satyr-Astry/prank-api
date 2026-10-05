// 端到端测试：真起一个本地服务，把所有协议各打一遍
import { spawn } from "node:child_process";

const PORT = 8791;
const BASE = `http://localhost:${PORT}`;

const server = spawn(process.execPath, ["server.mjs"], {
  cwd: new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  env: { ...process.env, PORT: String(PORT) },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stderr.on("data", (d) => process.stderr.write("[server] " + d));
server.stdout.on("data", () => {});

async function waitReady() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server 未启动");
}

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✅ ${name} ${extra}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
}

const postJSON = (path, body) =>
  fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

(async () => {
  await waitReady();
  console.log("\n=== prank-api 端到端测试 ===\n");

  // 1. /v1/models
  console.log("[1] OpenAI /v1/models");
  {
    const j = await (await fetch(`${BASE}/v1/models`)).json();
    check("返回模型列表", Array.isArray(j.data) && j.data.length > 0, `(${j.data.length} 个, 如 ${j.data[0].id})`);
  }

  // 2. chat non-stream
  console.log("[2] OpenAI /v1/chat/completions (非流式)");
  {
    const r = await postJSON("/v1/chat/completions", { model: "catgirl-4o", messages: [{ role: "user", content: "你好" }] });
    const j = await r.json();
    const txt = j.choices?.[0]?.message?.content;
    check("返回内容", !!txt, `-> "${txt}"`);
    check("结构正确", j.object === "chat.completion" && j.choices[0].finish_reason === "stop");
    check("usage 存在", !!j.usage?.total_tokens);
  }

  // 3. chat stream
  console.log("[3] OpenAI /v1/chat/completions (流式 SSE)");
  {
    const r = await postJSON("/v1/chat/completions", { model: "catgirl-4o", stream: true, messages: [{ role: "user", content: "猫" }] });
    const ct = r.headers.get("content-type");
    const text = await r.text();
    const hasData = text.includes("data: ") && text.includes("[DONE]");
    const pieces = (text.match(/"content":"/g) || []).length;
    check("SSE 头", /text\/event-stream/.test(ct), `(${ct})`);
    check("含 data: 与 [DONE]", hasData);
    check("分块输出", pieces >= 1, `(${pieces} 个增量块)`);
  }

  // 4. Anthropic
  console.log("[4] Anthropic /v1/messages");
  {
    const r = await postJSON("/v1/messages", { model: "claude-nyaa-9", messages: [{ role: "user", content: "hi" }] });
    const j = await r.json();
    check("返回 type=message", j.type === "message" && j.content?.[0]?.type === "text", `-> "${j.content?.[0]?.text}"`);
  }

  // 5. Anthropic stream
  console.log("[5] Anthropic /v1/messages (流式)");
  {
    const r = await postJSON("/v1/messages", { model: "claude-nyaa-9", stream: true, messages: [{ role: "user", content: "hi" }] });
    const text = await r.text();
    check("含 message_start/content_block_delta", text.includes("message_start") && text.includes("content_block_delta"));
  }

  // 6. Gemini
  console.log("[6] Gemini :generateContent");
  {
    const r = await postJSON("/v1beta/models/prank-gemini-9.9:generateContent", { contents: [{ parts: [{ text: "hi" }] }] });
    const j = await r.json();
    const t = j.candidates?.[0]?.content?.parts?.[0]?.text;
    check("返回 candidates", !!t, `-> "${t}"`);
  }

  // 7. Ollama
  console.log("[7] Ollama /api/chat");
  {
    const r = await postJSON("/api/chat", { model: "nyan-3.5-turbo", messages: [{ role: "user", content: "hi" }] });
    const j = await r.json();
    check("返回 message", j.done === true && !!j.message?.content, `-> "${j.message?.content}"`);
  }

  // 8. Ollama stream (NDJSON)
  console.log("[8] Ollama /api/chat (流式 NDJSON)");
  {
    const r = await postJSON("/api/chat", { model: "nyan-3.5-turbo", stream: true, messages: [{ role: "user", content: "hi" }] });
    const text = await r.text();
    const lines = text.trim().split("\n").map((l) => JSON.parse(l));
    check("NDJSON 多行", lines.length >= 2 && lines.at(-1).done === true, `(${lines.length} 行)`);
  }

  // 9. images
  console.log("[9] /v1/images/generations");
  {
    const r = await postJSON("/v1/images/generations", { prompt: "cat", n: 2 });
    const j = await r.json();
    check("返回 2 张图", j.data?.length === 2 && j.data[0].url, `(${j.data[0].url})`);
    check("含 b64_json", !!j.data[0].b64_json);
  }

  // 10. /img SVG
  console.log("[10] GET /img/42 (稳定 SVG)");
  {
    const r = await fetch(`${BASE}/img/42`);
    const ct = r.headers.get("content-type");
    const body = await r.text();
    check("SVG 内容类型", ct.includes("image/svg+xml"), `(${ct})`);
    check("含 <svg>", body.startsWith("<svg") && body.includes("</svg>"));
    const r2 = await fetch(`${BASE}/img/42`);
    check("同 seed 结果稳定", (await r2.text()) === body);
  }

  // 11. mode 参数
  console.log("[11] ?mode=ascii / kaomoji");
  {
    const a = await (await fetch(`${BASE}/v1/models?mode=ascii`)).json(); // 仅验证不报错
    const r = await postJSON("/v1/chat/completions?mode=kaomoji", { messages: [{ role: "user", content: "x" }] });
    const j = await r.json();
    check("mode 生效", !!j.choices?.[0]?.message?.content, `-> "${j.choices[0].message.content}"`);
  }

  // 12. 彩蛋
  console.log("[12] 关键词彩蛋");
  {
    const r = await postJSON("/v1/chat/completions", { messages: [{ role: "user", content: "你会写代码吗" }] });
    const j = await r.json();
    check("代码关键词触发彩蛋", /bug|TODO|颜文字/.test(j.choices[0].message.content), `-> "${j.choices[0].message.content.slice(0, 40)}..."`);
  }

  // 13. ?text= 自定义输出
  console.log("[13] ?text= 强制自定义内容");
  {
    const r = await fetch(`${BASE}/v1/chat/completions?text=` + encodeURIComponent("主人今天也要开心哦(=^･ω･^=)"), {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "anything" }] }),
    });
    const j = await r.json();
    const got = j.choices?.[0]?.message?.content;
    check("?text= 生效", got === "主人今天也要开心哦(=^･ω･^=)", `-> "${got}"`);
  }

  // 14. 回归：历史里的关键词不该污染最新一句的判断
  console.log("[14] 回归测试：历史含'你好'，但最新一句是别的");
  {
    const body = { messages: [
      { role: "user", content: "你好" },
      { role: "assistant", content: "( ・ω・)ﾉ 你好呀~" },
      { role: "user", content: "写个蛋" },
    ] };
    let hitEgg = 0, n = 12;
    for (let i = 0; i < n; i++) {
      const j = await (await postJSON("/v1/chat/completions", body)).json();
      if (/你好呀/.test(j.choices[0].message.content)) hitEgg++;
    }
    check("最新一句不含关键词时不再误触发彩蛋", hitEgg === 0, `(${hitEgg}/${n} 次误触发)`);

    const eggBody = { messages: [
      { role: "user", content: "随便" },
      { role: "user", content: "你好" },
    ] };
    const j2 = await (await postJSON("/v1/chat/completions", eggBody)).json();
    check("最新一句含'你好'时仍正常触发", /你好呀/.test(j2.choices[0].message.content), `-> "${j2.choices[0].message.content}"`);
  }

  // 15. 404
  console.log("[15] 未知路径 404");
  {
    const r = await fetch(`${BASE}/nope`);
    check("返回 404", r.status === 404);
  }

  console.log(`\n=== 结果: ${pass} 通过, ${fail} 失败 ===\n`);
  server.kill();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("测试崩溃:", e); server.kill(); process.exit(1); });
