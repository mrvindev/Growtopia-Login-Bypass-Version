import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLoginBody,
  findGoogleRedirect,
  findGrowIdLogin,
  parseMeta,
} from '../growtopia.js';

test('buildLoginBody encodes meta and keeps the field layout', () => {
  const body = buildLoginBody({
    meta: 'a+b=c/d=',
    country: 'id',
    random: () => 0.5,
  });

  assert.match(body, /meta\|a%2Bb%3Dc%2Fd%3D/);
  assert.match(body, /country\|id/);
  assert.match(body, /protocol\|227/);
  assert.match(body, /^tankIDName\|%0AtankIDPass\|/);
  assert.ok(!body.includes('\n'));
});

test('buildLoginBody rejects a missing meta value', () => {
  assert.throws(() => buildLoginBody({}), /requires a meta value/);
});

test('parseMeta reads the meta line', () => {
  const text = 'server|1.2.3.4\r\nport|17091\r\nmeta|abc%2Bdef%3D\r\nRTENDMARKERBS1001';
  assert.equal(parseMeta(text), 'abc%2Bdef%3D');
  assert.equal(parseMeta('server|1.2.3.4'), null);
});

test('findGrowIdLogin finds the form link', () => {
  const html =
    '<a href="https://login.growtopiagame.com/player/growid/login?token=abc%2Bdef">GrowID</a>';
  assert.equal(
    findGrowIdLogin(html),
    'https://login.growtopiagame.com/player/growid/login?token=abc%2Bdef',
  );
  assert.equal(findGrowIdLogin('<a href="/apple/redirect">Apple</a>'), null);
});

test('findGoogleRedirect finds and unescapes the google link', () => {
  const html =
    '<a href="https://login.growtopiagame.com/google/redirect?token=abc&amp;x=1">Google</a>';
  assert.equal(
    findGoogleRedirect(html),
    'https://login.growtopiagame.com/google/redirect?token=abc&x=1',
  );
});

test('findGoogleRedirect ignores the apple link', () => {
  const html =
    '<a href="https://login.growtopiagame.com/apple/redirect?token=abc">Apple</a>';
  assert.equal(findGoogleRedirect(html), null);
});
