import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

function formatDate(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const dateStr = start.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const startTime = start
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .replace(" ", "");
  const endTime = end
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .replace(" ", "");
  return `${dateStr} · ${startTime} – ${endTime}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const code = req.url?.split("/join/")[1]?.split("?")[0]?.toUpperCase();

  if (!code) {
    return res.redirect(302, "https://recapd.app");
  }

  const { data: event } = await supabase
    .from("events")
    .select("title, starts_at, ends_at")
    .eq("join_code", code)
    .single();

  const title = event?.title || "Join Event on Recapd";
  const description = event
    ? formatDate(event.starts_at, event.ends_at)
    : "Share photos together, privately.";

  const appStoreUrl = "https://apps.apple.com/app/recapd/id6745136939";
  const deepLink = `recapd://join/${code}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>

  <!-- Open Graph -->
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://recapd.app/join/${code}">
  <meta property="og:site_name" content="Recapd">

  <!-- Twitter -->
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">

  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #000;
      color: #fff;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 24px;
    }
    .container { max-width: 400px; }
    h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
    .date { font-size: 18px; color: #888; margin-bottom: 32px; }
    .code-label { font-size: 14px; color: #666; margin-bottom: 8px; }
    .code {
      font-size: 36px;
      font-weight: 700;
      font-family: monospace;
      letter-spacing: 4px;
      margin-bottom: 48px;
    }
    .btn {
      display: block;
      background: #fff;
      color: #000;
      text-decoration: none;
      padding: 16px 32px;
      border-radius: 12px;
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 16px;
    }
    .btn:hover { background: #eee; }
    .btn-secondary {
      background: transparent;
      color: #fff;
      border: 1px solid #333;
    }
    .btn-secondary:hover { background: #111; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${title}</h1>
    <p class="date">${description}</p>
    <p class="code-label">Join Code</p>
    <p class="code">${code}</p>
    <a href="${deepLink}" class="btn" id="openApp">Open in Recapd</a>
    <a href="${appStoreUrl}" class="btn btn-secondary">Download App</a>
  </div>
  <script>
    document.getElementById('openApp').addEventListener('click', function(e) {
      e.preventDefault();
      window.location = '${deepLink}';
      setTimeout(function() {
        window.location = '${appStoreUrl}';
      }, 1500);
    });
  </script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html");
  res.status(200).send(html);
}
