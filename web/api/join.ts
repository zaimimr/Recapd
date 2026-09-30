import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { normalizeCode } from "../kit/event.js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

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
	const code = normalizeCode(req.url?.split("/join/")[1]?.split("?")[0]);

	if (!code) {
		return res.redirect(302, "https://recapd.app");
	}

	const { data, error } = await supabase.rpc("get_event_preview", {
		join_code_input: code,
	});

	if (error) {
		return res.redirect(302, "https://recapd.app");
	}

	const event = data?.[0];
	const rawTitle = event?.title || "Join Event on Recapd";
	const rawDescription = event
		? formatDate(event.starts_at, event.ends_at)
		: "Share photos together, privately.";
	const title = escapeHtml(rawTitle);
	const description = escapeHtml(rawDescription);

	const appStoreUrl = "https://apps.apple.com/no/app/recapd/id6758083751";
	const playStoreUrl = "https://play.google.com/store/apps/details?id=com.zaimimran.recapd";
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
  <meta property="og:image" content="https://recapd.app/api/kit/image?code=${code}&amp;format=social&amp;tz=Europe/Oslo">
  <meta property="og:image:width" content="1920">
  <meta property="og:image:height" content="1005">
  <meta property="og:site_name" content="Recapd">

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="https://recapd.app/api/kit/image?code=${code}&amp;format=social&amp;tz=Europe/Oslo">

  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #fff;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 24px;
    }
    .container { max-width: 400px; width: 100%; }
    h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
    .date { font-size: 18px; color: rgba(255,255,255,0.6); margin-bottom: 32px; }
    .code-label { font-size: 14px; color: rgba(255,255,255,0.5); margin-bottom: 8px; }
    .code {
      font-size: 48px;
      font-weight: 800;
      font-family: 'SF Mono', Monaco, monospace;
      letter-spacing: 8px;
      margin-bottom: 12px;
    }
    .copy {
      background: rgba(255,255,255,0.12);
      color: #fff;
      border: 0;
      border-radius: 999px;
      padding: 10px 20px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      margin-bottom: 20px;
    }
    .howto { font-size: 16px; color: rgba(255,255,255,0.8); margin-bottom: 32px; line-height: 1.5; }
    .btn {
      display: block;
      background: #22c55e;
      color: #fff;
      text-decoration: none;
      padding: 16px 32px;
      border-radius: 12px;
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 16px;
      transition: all 0.2s;
    }
    .btn:hover { background: #16a34a; transform: translateY(-2px); }
    .btn-secondary {
      background: rgba(255,255,255,0.1);
      color: #fff;
    }
    .btn-secondary:hover { background: rgba(255,255,255,0.2); }
    .store-buttons { display: none; margin-top: 24px; }
    .store-buttons.show { display: block; }
    .footer { margin-top: 48px; }
    .footer a { color: rgba(255,255,255,0.5); font-size: 14px; text-decoration: none; }
    .footer a:hover { color: #fff; }
    .spinner {
      width: 24px;
      height: 24px;
      border: 3px solid rgba(255,255,255,0.2);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 16px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .status { color: rgba(255,255,255,0.7); font-size: 14px; margin-bottom: 24px; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${title}</h1>
    <p class="date">${description}</p>
    <p class="code-label">Join Code</p>
    <p class="code">${code}</p>
    <button class="copy" id="copyCode" type="button">Copy code</button>
    <p class="howto">Get Recapd, then tap <strong>Join an album</strong> and enter <strong>${code}</strong>.</p>

    <div id="loading">
      <div class="spinner"></div>
      <p class="status">Opening Recapd...</p>
    </div>

    <div id="fallback" class="hidden">
      <a href="${deepLink}" class="btn" id="openApp">Open in Recapd</a>
      <a href="${appStoreUrl}" class="btn btn-secondary ios-only">Download on App Store</a>
      <a href="${playStoreUrl}" class="btn btn-secondary android-only">Get it on Google Play</a>
    </div>

    <div class="footer">
      <a href="https://recapd.app">recapd.app</a>
    </div>
  </div>
  <script>
    (function() {
      var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      var isAndroid = /Android/.test(navigator.userAgent);

      var copyButton = document.getElementById('copyCode');
      copyButton.addEventListener('click', function() {
        function fallback() {
          var node = document.querySelector('.code');
          var range = document.createRange();
          range.selectNodeContents(node);
          var selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          copyButton.textContent = 'Long-press the code to copy';
        }
        if (!navigator.clipboard || !navigator.clipboard.writeText) {
          fallback();
          return;
        }
        navigator.clipboard.writeText('${code}').then(function() {
          copyButton.textContent = 'Copied';
        }).catch(fallback);
      });

      // Try to open the app
      window.location = '${deepLink}';

      // Show fallback after timeout
      setTimeout(function() {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('fallback').classList.remove('hidden');

        // Show platform-specific buttons
        if (isIOS) {
          document.querySelectorAll('.android-only').forEach(function(el) { el.style.display = 'none'; });
        } else if (isAndroid) {
          document.querySelectorAll('.ios-only').forEach(function(el) { el.style.display = 'none'; });
        }
      }, 2500);

      // Detect if app opened
      document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
          document.getElementById('loading').classList.add('hidden');
        }
      });
    })();
  </script>
</body>
</html>`;

	res.setHeader("Content-Type", "text/html");
	res.status(200).send(html);
}
