/* ============================================================
   Nitish Kumar Yadav — Portfolio backend
   Zero-dependency Node.js server:
     • Serves the static site (index.html, css, js, assets)
     • POST /api/contact → validates + stores contact messages
     • GET  /admin?key=… → protected inbox to read messages
     • Optional email notifications via nodemailer + SMTP env vars
   Run:  node server.js   (or: npm start)
   ============================================================ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

// Set ADMIN_KEY (env or .env) for a stable inbox URL; otherwise a random
// key is generated on every start and printed in the console below.
const ADMIN_KEY = process.env.ADMIN_KEY || crypto.randomBytes(8).toString('hex');

/* ---------- Optional email notifications ---------- */
let mailer = null;
try {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    const nodemailer = require('nodemailer'); // npm install (optional)
    mailer = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || 'false') === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }
} catch (_err) {
  console.warn('[mail] nodemailer not installed — messages will only be saved locally.');
}

function sendEmail(msg) {
  if (!mailer) return;
  const to = process.env.CONTACT_TO || process.env.SMTP_USER;
  mailer
    .sendMail({
      from: `"Portfolio" <${process.env.SMTP_USER}>`,
      to: to,
      replyTo: msg.email,
      subject: `Portfolio message from ${msg.name}`,
      text:
        `Name: ${msg.name}\n` +
        `Email: ${msg.email}\n` +
        `IP: ${msg.ip}\n` +
        `Date: ${msg.date}\n\n` +
        msg.message
    })
    .catch(function (err) { console.error('[mail] send failed:', err.message); });
}

/* ---------- Storage ---------- */
function readMessages() {
  try { return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8')); }
  catch (_err) { return []; }
}

function saveMessage(msg) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const all = readMessages();
  all.push(msg);
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(all, null, 2));
}

/* ---------- Rate limiting: 3 messages / 10 min / IP ---------- */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 3;
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(function (t) { return now - t < WINDOW_MS; });
  if (recent.length >= MAX_PER_WINDOW) { hits.set(ip, recent); return true; }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

/* ---------- Validation ---------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validate(body) {
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const message = String(body.message || '').trim();
  if (name.length < 2 || name.length > 80) return { error: 'Please enter your name (2–80 characters).' };
  if (!EMAIL_RE.test(email) || email.length > 120) return { error: 'Please enter a valid email address.' };
  if (message.length < 10 || message.length > 2000) return { error: 'Message must be between 10 and 2000 characters.' };
  return { name: name, email: email, message: message };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

/* ---------- Static file serving ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2'
};

function serveStatic(req, res, pathname) {
  const safePath = path.normalize(path.join(ROOT, pathname === '/' ? 'index.html' : pathname));
  if (!safePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Forbidden');
  }
  fs.stat(safePath, function (err, stat) {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(safePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': pathname.indexOf('/assets/') === 0 ? 'public, max-age=604800' : 'no-cache'
    });
    fs.createReadStream(safePath).pipe(res);
  });
}

/* ---------- Admin inbox page ---------- */
function renderAdmin(res, messages) {
  const rows = messages
    .slice()
    .reverse()
    .map(function (m) {
      return (
        '<tr>' +
        '<td>' + escapeHtml(m.date) + '</td>' +
        '<td>' + escapeHtml(m.name) + '<br><a href="mailto:' + escapeHtml(m.email) + '">' + escapeHtml(m.email) + '</a></td>' +
        '<td>' + escapeHtml(m.message) + '</td>' +
        '</tr>'
      );
    })
    .join('');

  const html =
    '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
    '<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '<title>Message Inbox — Nitish Portfolio</title>\n' +
    '<style>\n' +
    '  body{font-family:system-ui,-apple-system,sans-serif;background:#f5f8fb;color:#14273f;margin:0;padding:32px}\n' +
    '  h1{font-size:1.4rem}\n' +
    '  table{border-collapse:collapse;width:100%;background:#fff;box-shadow:0 8px 24px rgba(11,31,58,.08);border-radius:12px;overflow:hidden}\n' +
    '  th,td{padding:14px 16px;border-bottom:1px solid #dce6ef;text-align:left;vertical-align:top;font-size:.92rem}\n' +
    '  th{background:#0b1f3a;color:#fff;font-size:.8rem;text-transform:uppercase;letter-spacing:.06em}\n' +
    '  tr:last-child td{border-bottom:0}\n' +
    '  .count{color:#52657d;margin:6px 0 18px}\n' +
    '</style>\n</head>\n<body>\n' +
    '<h1>&#128237; Contact messages</h1>\n' +
    '<p class="count">' + messages.length + ' message(s) — stored in data/messages.json</p>\n' +
    '<table>\n<thead><tr><th>Date</th><th>From</th><th>Message</th></tr></thead>\n' +
    '<tbody>' + (rows || '<tr><td colspan="3">No messages yet.</td></tr>') + '</tbody>\n' +
    '</table>\n</body>\n</html>';

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

/* ---------- Server ---------- */
const server = http.createServer(function (req, res) {
  let pathname;
  try {
    const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
    pathname = decodeURIComponent(url.pathname);
  } catch (_err) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    return res.end('Bad Request');
  }

  /* --- Contact API --- */
  if (req.method === 'POST' && pathname === '/api/contact') {
    let raw = '';
    let tooBig = false;

    req.on('data', function (chunk) {
      raw += chunk;
      if (raw.length > 10240) { tooBig = true; req.destroy(); }
    });

    req.on('end', function () {
      if (tooBig) return;

      let body = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch (_e) {
        // Fallback: classic form-encoded submission (no-JS path)
        try { body = Object.fromEntries(new URLSearchParams(raw)); } catch (_e2) { body = {}; }
      }

      // Honeypot: real users never fill the hidden "company" field.
      // Respond as success so bots learn nothing.
      if (String(body.company || '').trim() !== '') {
        console.log('[contact] honeypot triggered — submission discarded');
        return json(res, 200, { ok: true });
      }

      const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
      if (rateLimited(ip)) {
        return json(res, 429, { ok: false, error: 'Too many messages sent. Please try again in a few minutes.' });
      }

      const check = validate(body);
      if (check.error) return json(res, 400, { ok: false, error: check.error });

      const msg = {
        id: crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(12).toString('hex'),
        name: check.name,
        email: check.email,
        message: check.message,
        ip: ip,
        date: new Date().toISOString()
      };

      saveMessage(msg);
      console.log('[contact] saved message from ' + msg.email + ' (' + msg.name + ')');
      sendEmail(msg);
      json(res, 200, { ok: true });
    });
    return;
  }

  /* --- Admin inbox --- */
  if (req.method === 'GET' && pathname === '/admin') {
    const urlKey = new URL(req.url, 'http://x').searchParams.get('key');
    if (urlKey !== ADMIN_KEY) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      return res.end('Forbidden — invalid admin key.');
    }
    return renderAdmin(res, readMessages());
  }

  /* --- Static site --- */
  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, pathname);

  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method Not Allowed');
});

server.listen(PORT, function () {
  console.log('──────────────────────────────────────────────');
  console.log('  Portfolio server running');
  console.log('  Site : http://localhost:' + PORT);
  console.log('  Inbox: http://localhost:' + PORT + '/admin?key=' + ADMIN_KEY);
  console.log('──────────────────────────────────────────────');
});
