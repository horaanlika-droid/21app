#!/usr/bin/env node
/* ============================================================
   21 — http-wrapper
   Минимальный статический сервер (без зависимостей).
   Точка входа для node-хостинга: node http-wrapper.js
   Порт: env PORT (по умолчанию 8080), bind 0.0.0.0
   ============================================================ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = parseInt(process.env.PORT, 10) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

function send(res, code, body, headers) {
  res.writeHead(code, Object.assign({ 'Cache-Control': 'no-cache' }, headers));
  res.end(body);
}

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    return send(res, 400, 'Bad Request');
  }
  if (urlPath === '/') urlPath = '/index.html';

  // защита от выхода за корень
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
    return send(res, 403, 'Forbidden');
  }

  fs.stat(filePath, (err, st) => {
    let target = filePath;
    if (!err && st.isDirectory()) target = path.join(filePath, 'index.html');
    else if (err) {
      // SPA-фолбэк для путей без расширения (роуты приложения — через hash)
      if (!path.extname(urlPath)) target = path.join(ROOT, 'index.html');
      else return send(res, 404, '404 Not Found: ' + urlPath);
    }
    fs.readFile(target, (err2, data) => {
      if (err2) return send(res, 404, '404 Not Found: ' + urlPath);
      const type = MIME[path.extname(target).toLowerCase()] || 'application/octet-stream';
      const cache = target.includes(path.sep + 'assets' + path.sep)
        ? { 'Cache-Control': 'public, max-age=86400' }
        : {};
      send(res, 200, data, Object.assign({ 'Content-Type': type, 'Content-Length': data.length }, cache));
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('21 → http://0.0.0.0:' + PORT + '  (root: ' + ROOT + ')');
});
