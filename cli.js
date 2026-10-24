#!/usr/bin/env node
import { spawn } from 'node:child_process';
import * as readline from 'node:readline/promises';
import { googleLoginUrl, growIdLoginUrl } from './growtopia.js';

const HELP = `Usage: growtopia-login-bypass [google|growid]

Growtopia login bypass for Google and GrowID.

Options:
  --open       Open the login URL in the default browser
  --json       Print the full result as JSON
  -h, --help   Show this help
`;

function parseArgs(argv) {
  const opts = { json: false, open: false };

  for (const arg of argv) {
    switch (arg) {
      case '--json':
        opts.json = true;
        break;
      case '--open':
        opts.open = true;
        break;
      case '-h':
      case '--help':
        opts.help = true;
        break;
      default: {
        if (arg.startsWith('-')) {
          throw new Error(`Unknown argument: ${arg}`);
        }
        if (opts.provider) {
          throw new Error(`Unexpected argument: ${arg}`);
        }

        const provider = arg.toLowerCase();
        if (provider !== 'google' && provider !== 'growid') {
          throw new Error(`Unknown provider: ${arg} (use google or growid)`);
        }
        opts.provider = provider;
        break;
      }
    }
  }

  return opts;
}

function openInBrowser(url) {
  const platform = process.platform;
  const command =
    platform === 'win32'
      ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
      : platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];

  const child = spawn(command[0], command[1], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

async function askProvider() {
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    return 'google';
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  try {
    while (true) {
      const answer = (
        await rl.question('Login Bypass Growtopia with?\n[1] Google\n[2] GrowID\n(default 1): ')
      )
        .trim()
        .toLowerCase();

      if (!answer || answer === '1' || answer === 'google') {
        return 'google';
      }
      if (answer === '2' || answer === 'growid') {
        return 'growid';
      }

      process.stderr.write('Pick 1 (Google) or 2 (GrowID).\n');
    }
  } finally {
    rl.close();
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    process.stdout.write(HELP);
    return;
  }

  opts.provider ??= await askProvider();

  const result =
    opts.provider === 'growid' ? await growIdLoginUrl() : await googleLoginUrl();

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`${result.loginUrl}\n`);
  }

  if (opts.open) {
    openInBrowser(result.loginUrl);
  }
}

main().catch((error) => {
  process.stderr.write(`error: ${error.message}\n`);
  process.exitCode = 1;
});
