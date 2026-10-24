# Growtopia Login Bypass

Generate a ready-to-open Growtopia login link for Google or GrowID, without the
launcher and without touching the game client.

The tool talks to Growtopia's own login server: it fetches `meta` from
`server_data.php`, asks the login dashboard for a fresh session, and prints the
redirect that normally sits behind the Google button. Open it in a browser and
the regular Google account flow takes over.

Inspired by [BarisSenel/selenium-growtopia-login](https://github.com/BarisSenel/selenium-growtopia-login/).

> Unofficial project. Not affiliated with Ubisoft, Growtopia, or Google. Use it
> at your own risk and follow the game's terms of service.

## Why

Growtopia normally hides the login URL behind its launcher and WebView. This
project exposes the same URL directly, so it can be used from a terminal, a
script, or any browser. No credentials are collected or stored, and no game
client is modified.

## Requirements

- Node.js 18 or newer
- No external dependencies

## Setup

```bash
git clone <this-repo-url>
cd growtopia-login-bypass
```

Nothing to install.

## Quick start

```bash
node cli.js
```

You will be asked which provider to use:

```
Login with? [1] Google [2] GrowID (default 1):
```

Or skip the prompt:

```bash
node cli.js google
node cli.js growid
```

Open the generated link immediately:

```bash
node cli.js --open
node cli.js growid --open
```

Print JSON instead of the bare URL:

```bash
node cli.js --json
```

With npm:

```bash
npm start
```

## Configuration

Protocol and game version live in `config.json` in the project root:

```json
{
  "gameVersion": "5.61",
  "protocol": "227"
}
```

Update this file when Growtopia changes its protocol. The values are sent to
`server_data.php` and are part of the login request.

## How the Google login works

Growtopia's login is a small OAuth relay. The client never talks to Google
directly; it asks Growtopia for a redirect first, and Growtopia keeps the session
state on its side.

```
browser / client
      |
      | 1. POST server_data.php        -> meta
      | 2. POST login/dashboard        -> HTML with the Google button
      | 3. GET  google/redirect?token=  -> 302 + session cookie
      v
accounts.google.com
      |
      | 4. user signs in
      v
login.growtopiagame.com/google/callback?code=...&state=...
      |
      | 5. Growtopia validates the state, links the Google account,
      |    and hands the game its login token
      v
Growtopia
```

Step by step:

1. **Get a server ticket.** `POST https://www.growtopia1.com/growtopia/server_data.php`
   with the game version, platform, and protocol. The response contains a `meta`
   value that the login dashboard expects.
2. **Create a login session.** `POST https://login.growtopiagame.com/player/login/dashboard?valKey=...`
   with the standard Growtopia login body. The HTML response contains the
   provider links, including the Google button.
3. **Follow the Growtopia redirect.** `GET .../google/redirect?token=...` does not
   return a page. It responds with `302` to `accounts.google.com` and sets the
   `growtopia_game_session` cookie that ties the upcoming callback to this
   session.
4. **Sign in with Google.** The browser goes through the normal Google account
   picker and consent screen. The OAuth `state` is the token created in step 2.
5. **Callback.** Google returns to `login.growtopiagame.com/google/callback`.
   Growtopia matches the `state` against its session, links the Google identity,
   and the game receives its login token.

The generated link is the output of step 3:

```
https://login.growtopiagame.com/google/redirect?token=<token>
```

`--json` also resolves and prints the `accounts.google.com` URL from step 4 for
inspection.

### Why you should not open the Google URL directly

Opening `accounts.google.com/...` yourself skips step 3. Without the Growtopia
redirect, the session cookie is never set, so the callback cannot match the
`state` and ends with **"Token is invalid."** Always open the
`google/redirect` link (or use `--open`).

## GrowID

`node cli.js growid` prints the GrowID form with a session token:

```
https://login.growtopiagame.com/player/growid/login?token=<token>
```

Open it and enter your GrowID name and password on that page. GrowID has no
OAuth step, so there is no Google URL and no callback; the page itself is the
whole flow.

## Options

| Option | Description |
|---|---|
| `google`, `growid` | Provider; asks interactively when omitted |
| `--open` | Open the resulting URL in the default browser |
| `--json` | Print the full result as JSON |
| `-h`, `--help` | Show help |

## Troubleshooting

**"Token is invalid."**
The Google callback could not find the session. Re-run the tool and open the
`google/redirect` link it prints; do not open the `accounts.google.com` URL.

**Wrong server or DNS**
The tool resolves hosts with `dns.resolve4` and falls back to DNS-over-HTTPS
instead of `dns.lookup`, so local `hosts` entries do not redirect the login
request.

**Expired link**
`token` and `state` belong to a freshly created session and are short-lived.
Generate a new link for each login attempt. The Google `loginUrl` can be opened
more than once, but it still refers to that session.

**No terminal prompt**
When stdin is not a TTY (for example, output is piped), the tool defaults to
Google instead of asking.

## Notes

- The tool never stores credentials and never sends an email or password.
- It only creates the login URL. The actual Google sign-in happens in your
  browser.
- `config.json` is required; the tool exits with a clear error if it is missing
  or if `gameVersion`/`protocol` are absent.

## License

No license file is included yet. Add one before distributing or accepting
contributions.
