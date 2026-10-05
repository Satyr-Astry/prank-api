// 本地 Node 服务器：把 node:http 适配成 web 标准 Request/Response，
// 复用 src/worker.js 的 route()，这样本地和线上跑的是同一份代码。
// 用法: node server.mjs   然后访问 http://localhost:8787
import http from "node:http";
import { route } from "./src/worker.js";

const PORT = process.env.PORT || 8787;

const server = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const bodyBuf = Buffer.concat(chunks);

    const url = `http://${req.headers.host || "localhost"}${req.url}`;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v === undefined) continue;
      headers.set(k, Array.isArray(v) ? v.join(", ") : String(v));
    }
    const init = { method: req.method, headers };
    if (req.method !== "GET" && req.method !== "HEAD") init.body = bodyBuf;

    const request = new Request(url, init);
    const response = await route(request, process.env);

    const outHeaders = {};
    response.headers.forEach((v, k) => { if (k.toLowerCase() !== "content-encoding") outHeaders[k] = v; });
    res.writeHead(response.status, outHeaders);

    if (!response.body) { res.end(); return; }
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (e) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: String(e && e.stack || e) } }));
  }
});

server.listen(PORT, () => {
  console.log(`(=^･ω･^=) prank-api 已启动: http://localhost:${PORT}`);
  console.log(`   试试: curl http://localhost:${PORT}/v1/models`);
});
