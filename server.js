import { createServer } from "node:http";
import { readFile } from "node:fs";
import { resolve, relative, isAbsolute, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};
const port = Number(process.env.PORT || 4173);

createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname
    );
  } catch (error) {
    response.writeHead(400).end();
    return;
  }

  const filename = pathname === "/" ? "index.html" : pathname.slice(1);
  const filepath = resolve(root, filename);
  const relativePath = relative(root, filepath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    response.writeHead(403).end();
    return;
  }

  readFile(filepath, (error, content) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500).end();
      if (error.code !== "ENOENT") {
        console.error(error);
      }
      return;
    }
    response.writeHead(200, {
      "Content-Type":
        contentTypes[extname(filepath)] || "application/octet-stream"
    });
    response.end(content);
  });
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(`Kamgar Compass: http://127.0.0.1:${port}\n`);
});
