const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const script = html.split('/* --------------------- installable app (PWA) ---------------------- */')[1].split('/* ----------------------------- startup')[0];
function setup({ standalone = false, secure = true } = {}) {
  const nodes = new Map();
  const events = {};
  const $ = selector => {
    if (!nodes.has(selector)) {
      const classes = new Set(['hidden']);
      nodes.set(selector, { textContent: '', disabled: false, focus() {}, setAttribute() {}, classList: {
        add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c),
        toggle(c, force) { force ? classes.add(c) : classes.delete(c); },
      } });
    }
    return nodes.get(selector);
  };
  vm.runInNewContext(script, { $, navigator: {}, window: {
    isSecureContext: secure,
    matchMedia: () => ({ matches: standalone, addEventListener() {} }),
    addEventListener: (name, fn) => { events[name] = fn; },
  } });
  return { $, events };
}
test('install is hidden in standalone mode', () => {
  assert.equal(setup({ standalone: true }).$('#btnInstall').classList.contains('hidden'), true);
});
test('fallback provides Android home-screen instructions and HTTPS guidance', async () => {
  for (const secure of [true, false]) {
    const { $ } = setup({ secure });
    await $('#btnInstall').onclick();
    assert.equal($('#installHelp').classList.contains('hidden'), false);
    assert.match($('#installMessage').textContent, secure ? /Add to Home screen/ : /HTTPS/);
  }
});
test('native prompt is consumed once and dismissal allows fallback or a fresh prompt', async () => {
  const { $, events } = setup();
  let calls = 0;
  let prevented = false;
  const event = { preventDefault() { prevented = true; }, async prompt() { calls++; }, userChoice: Promise.resolve({ outcome: 'dismissed' }) };
  events.beforeinstallprompt(event);
  await $('#btnInstall').onclick();
  assert.equal(prevented, true);
  assert.equal(calls, 1);
  await $('#btnInstall').onclick();
  assert.equal(calls, 1);
  events.beforeinstallprompt(event);
  await $('#btnInstall').onclick();
  assert.equal(calls, 2);
  assert.equal($('#btnInstall').disabled, false);
});
test('installation through browser menu hides the button and help', async () => {
  const { $, events } = setup();
  await $('#btnInstall').onclick();
  events.appinstalled();
  assert.equal($('#btnInstall').classList.contains('hidden'), true);
  assert.equal($('#installHelp').classList.contains('hidden'), true);
});
test('failed native prompt restores the button and shows manual instructions', async () => {
  const { $, events } = setup();
  events.beforeinstallprompt({ preventDefault() {}, async prompt() { throw Error('unavailable'); } });
  await $('#btnInstall').onclick();
  assert.equal($('#btnInstall').disabled, false);
  assert.equal($('#installHelp').classList.contains('hidden'), false);
});
