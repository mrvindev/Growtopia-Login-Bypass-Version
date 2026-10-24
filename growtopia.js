import https from 'node:https';
import dns from 'node:dns/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const configPath = fileURLToPath(new URL('./config.json', import.meta.url));

function readConfig() {
  let raw;
  try {
    raw = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read ${configPath}: ${error.message}`);
  }

  if (raw.gameVersion == null || raw.protocol == null) {
    throw new Error(`${configPath} must define gameVersion and protocol`);
  }

  return raw;
}

const config = readConfig();

const DEFAULTS = {
  valKey: '40db4045f2d8c572efe8c4a060605726',
  serverDataUrl: 'https://www.growtopia1.com/growtopia/server_data.php',
  dashboardUrl: 'https://login.growtopiagame.com/player/login/dashboard',
  gameVersion: String(config.gameVersion),
  protocol: String(config.protocol),
  platform: '0',
  country: 'id',
  timeout: 15000,
};

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0';

const CLIENT_HINTS =
  '"Chromium";v="128", "Not;A=Brand";v="24", "Microsoft Edge";v="128", "Microsoft Edge WebView2";v="128"';

const KLV =
  'd5b6a4db4c447f27ea82d5b1f88bee159346933659f635be5fe0b028c53408af';

export { DEFAULTS };

export function buildLoginBody({
  meta,
  country = DEFAULTS.country,
  gameVersion = DEFAULTS.gameVersion,
  protocol = DEFAULTS.protocol,
  random = Math.random,
} = {}) {
  if (!meta) {
    throw new Error('buildLoginBody requires a meta value');
  }

  const lines = [
    'tankIDName|',
    'tankIDPass|',
    `requestedName|${randomDigits(5, random)}`,
    'f|1',
    `protocol|${protocol}`,
    `game_version|${gameVersion}`,
    'fz|22745624',
    'lmode|0',
    'cbits|1024',
    'player_age|22',
    'GDPR|2',
    'category|_-5000',
    'totalPlaytime|0',
    `klv|${KLV}`,
    `hash2|-${randomDigits(9, random)}`,
    `meta|${encodeURIComponent(meta)}`,
    'fhash|-716928004',
    'rid|D50B04D059FE95BAAE390570F7866AD4',
    'platformID|0,1,1',
    'deviceVersion|0',
    `country|${country}`,
    `hash|-${randomDigits(10, random)}`,
    `mac|${randomMac(random)}`,
    `wk|${randomHex(32, random)}`,
    'zf|283949556',
  ];

  return lines.join('%0A');
}

export function parseMeta(text) {
  const match = /(?:^|\r?\n)meta\|([^\r\n]+)/.exec(text);
  return match ? match[1].trim() : null;
}

export function findGrowIdLogin(html) {
  const match = /href="([^"]*\/player\/growid\/login[^"]*)"/i.exec(html);
  if (!match) {
    return null;
  }

  const href = decodeHtmlEntities(match[1]);
  try {
    return new URL(href).toString();
  } catch {
    return new URL(href, DEFAULTS.dashboardUrl).toString();
  }
}

export function findGoogleRedirect(html) {
  const match = /href="([^"]*\/google\/redirect[^"]*)"/i.exec(html);
  if (!match) {
    return null;
  }

  const href = decodeHtmlEntities(match[1]);
  try {
    return new URL(href).toString();
  } catch {
    return new URL(href, DEFAULTS.dashboardUrl).toString();
  }
}

async function lookupHost(hostname) {
  try {
    const addresses = await dns.resolve4(hostname);
    if (addresses.length > 0) {
      return addresses[0];
    }
  } catch {}

  return dohLookup(hostname);
}

async function fetchMeta() {
  const hostname = new URL(DEFAULTS.serverDataUrl).hostname;
  const ip = await lookupHost(hostname);

  const body = `version=${encodeURIComponent(DEFAULTS.gameVersion)}&platform=${encodeURIComponent(DEFAULTS.platform)}&protocol=${encodeURIComponent(DEFAULTS.protocol)}`;
  const response = await request(DEFAULTS.serverDataUrl, {
    method: 'POST',
    headers: {
      'User-Agent': 'UbiServices_SDK_2022.Release.9_PC64_ansi_static',
      Accept: '*/*',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
    body,
    lookup: pinnedLookup(ip),
  });

  const meta = parseMeta(response.body);
  if (!meta) {
    throw new Error(
      `server_data.php did not return a meta value (HTTP ${response.status})`,
    );
  }

  return meta;
}

async function postLogin(body) {
  const url = `${DEFAULTS.dashboardUrl}?valKey=${encodeURIComponent(DEFAULTS.valKey)}`;
  const hostname = new URL(url).hostname;
  const ip = await lookupHost(hostname);

  const response = await request(url, {
    method: 'POST',
    headers: {
      'User-Agent': BROWSER_UA,
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-cache',
      'Upgrade-Insecure-Requests': '1',
      'Sec-CH-UA': CLIENT_HINTS,
      'Sec-CH-UA-Mobile': '?0',
      'Sec-CH-UA-Platform': '"Windows"',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-User': '?1',
      'Sec-Fetch-Dest': 'document',
      'Accept-Language': 'en-US,en;q=0.9',
      Origin: 'null',
    },
    body,
    lookup: pinnedLookup(ip),
  });

  return {
    status: response.status,
    body: response.body,
    googleUrl: findGoogleRedirect(response.body),
    growIdUrl: findGrowIdLogin(response.body),
  };
}

async function traceGoogle(redirectUrl) {
  let current = redirectUrl;

  for (let step = 0; step <= 6; step += 1) {
    const hostname = new URL(current).hostname;
    if (hostname === 'accounts.google.com') {
      return current;
    }

    const ip = await lookupHost(hostname);
    const response = await request(current, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      lookup: pinnedLookup(ip),
    });

    const location = response.headers.location;
    if (!location) {
      const fromBody = /https:\/\/accounts\.google\.com\/[^\s"'<>]+/.exec(response.body);
      if (fromBody) {
        return fromBody[0];
      }

      throw new Error(`No Google redirect found (HTTP ${response.status})`);
    }

    current = new URL(location, current).toString();
  }

  throw new Error('Too many redirects without reaching Google');
}

function rejectionReason(dashboard) {
  let reason = dashboard.body.slice(0, 300);
  try {
    const parsed = JSON.parse(dashboard.body);
    reason = parsed.message ?? parsed.error ?? reason;
  } catch {
    reason = reason.replace(/\s+/g, ' ').trim();
  }

  return `Growtopia rejected the login request: ${reason}`;
}

export async function googleLoginUrl() {
  const meta = await fetchMeta();
  const dashboard = await postLogin(buildLoginBody({ meta }));

  if (!dashboard.googleUrl) {
    throw new Error(rejectionReason(dashboard));
  }

  return {
    loginUrl: dashboard.googleUrl,
    oauthUrl: await traceGoogle(dashboard.googleUrl),
    meta,
    status: dashboard.status,
  };
}

export async function growIdLoginUrl() {
  const meta = await fetchMeta();
  const dashboard = await postLogin(buildLoginBody({ meta }));

  if (!dashboard.growIdUrl) {
    throw new Error(rejectionReason(dashboard));
  }

  return {
    loginUrl: dashboard.growIdUrl,
    meta,
    status: dashboard.status,
  };
}

function request(
  url,
  { method = 'GET', headers = {}, body, lookup, timeout = DEFAULTS.timeout } = {},
) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: `${parsed.pathname}${parsed.search}`,
      method,
      headers,
      servername: parsed.hostname,
      timeout,
      autoSelectFamily: false,
    };

    if (lookup) {
      options.lookup = lookup;
    }

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () =>
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        }),
      );
      res.on('error', reject);
    });

    req.on('timeout', () => {
      req.destroy(new Error(`Request timed out after ${timeout} ms: ${url}`));
    });
    req.on('error', reject);

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

function pinnedLookup(ip) {
  return (hostname, options, callback) => {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    if (options?.all) {
      callback(null, [{ address: ip, family: 4 }]);
      return;
    }

    callback(null, ip, 4);
  };
}

async function dohLookup(hostname) {
  const endpoints = [
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
    `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=A`,
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        headers: { Accept: 'application/dns-json' },
        signal: AbortSignal.timeout(8000),
      });
      const payload = await response.json();
      const answer = (payload.Answer ?? []).find((entry) => entry.type === 1);
      if (answer?.data) {
        return answer.data;
      }
    } catch {
      continue;
    }
  }

  throw new Error(`DNS-over-HTTPS lookup failed for ${hostname}`);
}

function randomDigits(length, random) {
  let value = String(1 + Math.floor(random() * 9));
  while (value.length < length) {
    value += String(Math.floor(random() * 10));
  }
  return value;
}

function randomHex(length, random) {
  const alphabet = '0123456789ABCDEF';
  let value = '';
  for (let index = 0; index < length; index += 1) {
    value += alphabet[Math.floor(random() * alphabet.length)];
  }
  return value;
}

function randomMac(random) {
  const octets = [];
  for (let index = 0; index < 6; index += 1) {
    octets.push(Math.floor(random() * 256).toString(16).toUpperCase().padStart(2, '0'));
  }
  return octets.join(':');
}

function decodeHtmlEntities(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}
