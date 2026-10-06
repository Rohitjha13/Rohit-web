const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const ragHandler = require("./api/rag");

const root = __dirname;
const port = Number(process.env.PORT || 8000);
const maxApiBodyBytes = 64 * 1024;
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".aac": "audio/aac",
  ".aif": "audio/aiff",
  ".aiff": "audio/aiff",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".mid": "audio/midi",
  ".midi": "audio/midi",
  ".mp3": "audio/mpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".oga": "audio/ogg",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".weba": "audio/webm",
  ".webp": "image/webp"
};

function serveRagApi(request, response) {
  let body = "";
  let bodyBytes = 0;
  let finished = false;

  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    if (finished) return;
    bodyBytes += Buffer.byteLength(chunk);
    if (bodyBytes > maxApiBodyBytes) {
      finished = true;
      response.writeHead(413, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "The request is too large." }));
      request.resume();
      return;
    }
    body += chunk;
  });

  request.on("end", async () => {
    if (finished) return;

    let parsedBody;
    try {
      parsedBody = JSON.parse(body);
    } catch {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Send a valid JSON request." }));
      return;
    }

    const apiResponse = {
      statusCode: 200,
      headers: {},
      setHeader(name, value) {
        this.headers[name] = value;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        if (response.writableEnded) return this;
        response.writeHead(this.statusCode, this.headers);
        response.end(JSON.stringify(payload));
        return this;
      }
    };

    try {
      await ragHandler({ method: request.method, body: parsedBody }, apiResponse);
    } catch (error) {
      console.error("Local RAG API request failed", error);
      if (!response.writableEnded) {
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "The local RAG API could not complete the request." }));
      }
    }
  });
}

http.createServer((request, response) => {
  const pathnameForApi = new URL(request.url, "http://localhost").pathname;
  if (pathnameForApi === "/api/rag") {
    if (request.method !== "POST") {
      response.writeHead(405, { Allow: "POST", "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Use POST to ask a question." }));
      return;
    }
    serveRagApi(request, response);
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }

  const route = pathname === "/" ? "/index.html" : pathname === "/rag" ? "/rag.html" : pathname;
  const target = path.resolve(root, `.${route}`);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  fs.stat(target, (statError, stats) => {
    if (statError || !stats.isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Length": stats.size,
      "Content-Type": contentTypes[path.extname(target).toLowerCase()] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff"
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }

    const stream = fs.createReadStream(target);
    stream.on("error", () => {
      if (!response.headersSent) response.writeHead(500);
      response.end("Could not read the requested file");
    });
    stream.pipe(response);
  });
}).listen(port, "127.0.0.1", () => {
  console.log(`Rohit site available at http://127.0.0.1:${port}`);
});
