const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8').split('<script>')[1].split('</script>')[0];
const core = source.split('/* ------------------------------ wire')[0];

function setup(overrides = {}) {
  const storage = new Map();
  const nodes = new Map();
  function element() {
    const classes = new Set();
    return {
      children: [], style: {}, value: '', textContent: '', innerHTML: '', checked: false,
      classList: {
        add: name => classes.add(name), remove: name => classes.delete(name),
        contains: name => classes.has(name),
        toggle(name, force) { const add = force ?? !classes.has(name); add ? classes.add(name) : classes.delete(name); return add; },
      },
      appendChild(child) { this.children.push(child); }, setAttribute() {},
    };
  }
  const location = { hash: '', pathname: '/tracker/index.html', search: '?view=compact' };
  const ctx = vm.createContext({
    console, AbortController, setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {},
    document: { querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, element()); return nodes.get(selector); }, createElement: element },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    location, history: { replaceState(_state, _unused, url) { location.hash = new URL(url, 'https://tracker.test').hash; } },
    ...overrides,
  });
  vm.runInContext(core, ctx);
  return { run: code => vm.runInContext(code, ctx), storage, nodes, location, ctx };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

function deferredResponses(app) {
  app.run(`let pending = []; jmFetch = (url, opts) => new Promise((resolve, reject) => pending.push({url, opts, resolve, reject}));`);
}

test('old tournament roster and schedule cannot overwrite the new tournament or cache', async () => {
  const app = setup();
  deferredResponses(app);
  app.run(`comp={id:1}; let oldRefresh=refresh(true);
    comp={id:2}; let newRefresh=refresh(true);
    pending[2].resolve([{athlete:{idPerson:2, givenName:'New'}}]);
    pending[3].resolve([]);`);
  await tick();
  app.run(`pending[4].resolve({contests:[{idContest:202}]});`);
  await app.run('newRefresh');
  const saved = app.storage.get('jm_sched_2');
  app.run(`pending[0].resolve([{athlete:{idPerson:1,givenName:'Old'}}]); pending[1].resolve([]);`);
  await tick();
  assert.match(app.run('pending[5].url'), /IdCompetition=1/);
  app.run('pending[5].resolve({contests:[{idContest:101}]})');
  await app.run('oldRefresh');
  assert.equal(app.run('entries[0].athlete.idPerson'), 2);
  assert.equal(app.run('contests[0].idContest'), 202);
  assert.equal(app.storage.get('jm_sched_2'), saved);
  assert.equal(app.storage.has('jm_sched_1'), false);
});

test('only the latest overlapping refresh can commit within one tournament', async () => {
  const app = setup();
  deferredResponses(app);
  app.run(`comp={id:1}; entries=[{}]; let oldRefresh=refresh(true); let newRefresh=refresh(true);
    pending[1].resolve([]);`);
  await tick();
  app.run('pending[2].resolve({contests:[{idContest:2}]})');
  await app.run('newRefresh');
  app.run('pending[0].resolve([])');
  await tick();
  app.run('pending[3].resolve({contests:[{idContest:1}]})');
  await app.run('oldRefresh');
  assert.equal(app.run('contests[0].idContest'), 2);
});

test('leaving the tournament discards pending responses', async () => {
  const app = setup();
  deferredResponses(app);
  app.run(`comp={id:1}; entries=[{}]; let request=refresh(true); loadFeatured=()=>{}; showComp(); pending[0].resolve([]);`);
  await tick();
  app.run('pending[1].resolve({contests:[{idContest:1}]})');
  await app.run('request');
  assert.equal(app.run('contests.length'), 0);
  assert.equal(app.storage.size, 0);
});

for (const failure of ['fragment', 'fragment-list', 'invalid-payload']) {
  test(`${failure} failure retains complete schedule and cache and reports staleness`, async () => {
    const app = setup({ failure });
    app.run(`comp={id:1}; entries=[{}]; contests=[{idContest:101},{idContest:202}]; saveScheduleCache();
      jmFetch=async url=>{
        if(url.includes('GetCompCompetitionsFragments')) {
          if(failure==='fragment-list') throw Error('offline');
          return [{idFragment:1},{idFragment:2}];
        }
        if(url.includes('IdFragment=1')) return {contests:[{idContest:101}]};
        if(failure==='invalid-payload') return {};
        throw Error('offline');
      };`);
    const saved = app.storage.get('jm_sched_1');
    await app.run('refresh(true)');
    assert.equal(app.run('contests.length'), 2);
    assert.equal(app.storage.get('jm_sched_1'), saved);
    assert.match(app.nodes.get('#statusLine').textContent, /showing last schedule/);
  });
}

test('successful fragments are deduplicated and an empty authoritative schedule replaces cache', async () => {
  const app = setup();
  app.run(`comp={id:1}; entries=[{}]; jmFetch=async url=>url.includes('GetCompCompetitionsFragments')
    ? [{idFragment:1},{idFragment:2}] : {contests:[{idContest:101}]};`);
  await app.run('refresh(true)');
  assert.equal(app.run('contests.length'), 1);
  app.run(`jmFetch=async url=>url.includes('GetCompCompetitionsFragments') ? [] : {contests:[]};`);
  await app.run('refresh(true)');
  assert.equal(JSON.parse(app.storage.get('jm_sched_1')).c.length, 0);
});

test('a stalled body is aborted at the deadline after headers arrive', async () => {
  let deadline, signal, cleared = false;
  const app = setup({
    setTimeout(callback) { deadline = callback; return 1; },
    clearTimeout() { cleared = true; },
    fetch: async (_url, opts) => {
      signal = opts.signal;
      return { ok: true, text: () => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))) };
    },
  });
  const result = app.run(`fetchWithTimeout('https://api.test', {})`);
  await tick();
  assert.equal(cleared, false);
  const rejected = assert.rejects(result, /aborted/);
  deadline();
  await rejected;
  assert.equal(signal.aborted, true);
  assert.equal(cleared, true);
});

test('a completed JSON response clears its timeout', async () => {
  let cleared = false;
  const app = setup({ setTimeout: () => 1, clearTimeout: () => { cleared = true; }, fetch: async () => ({ ok: true, text: async () => '{"ok":true}' }) });
  assert.equal((await app.run(`fetchWithTimeout('https://api.test', {})`)).ok, true);
  assert.equal(cleared, true);
});

test('switching from a deep link preserves the selected tournament on reload', () => {
  const app = setup();
  app.location.hash = '#tournament-a';
  app.run(`loadFeatured=()=>{}; refresh=()=>{}; comp={id:1,slug:'tournament-a'};
    showComp(); comp={id:2,slug:'tournament-b'}; showMain();`);
  assert.equal(app.location.hash, '');
  app.run(`comp=null; let loadedSlug=null; doLoad=slug=>{loadedSlug=slug};`);
  app.run(source.slice(source.indexOf('(function init()')));
  assert.equal(app.run('comp.slug'), 'tournament-b');
  assert.equal(app.run('loadedSlug'), null);
});

test('entering a new tournament also updates any existing deep link', () => {
  const app = setup();
  app.location.hash = '#tournament-a';
  app.run(`refresh=()=>{}; comp={id:2,slug:'tournament-b'}; showMain();`);
  assert.equal(app.location.hash, '#tournament-b');
});

test('Uster queue includes five awaiting bouts but excludes byes, finished bouts, and other mats', () => {
  const fixture = require('./fixtures/uster-queue.json');
  const app = setup({ fixture });
  app.run('contests=fixture.contests');
  assert.equal(app.run('fightsAhead(contests.find(c=>c.idContest===fixture.targetId))'), fixture.expectedAhead);
  app.run('comp={id:1}; saveScheduleCache(); contests=loadScheduleCache().c');
  assert.equal(app.run('fightsAhead(contests.find(c=>c.idContest===fixture.targetId))'), fixture.expectedAhead);
});

test('a fighter awaiting an opponent still has an upcoming bout', () => {
  const app = setup();
  app.run(`contests=[{idContest:1,mat:1,fightNo:1,bye:true,personWhite:{idPerson:7}},
    {idContest:2,mat:1,fightNo:2,bye:false,personWhite:{idPerson:7},personBlue:null}];`);
  assert.equal(app.run('nextBoutKey(7)'), 0);
  assert.equal(app.run(`opponentOf(contests[1], 'white').name`), 'Awaiting opponent');
  const card = app.run(`fighterCard({id:7,name:'Test'})`);
  assert.match(card.children[1].innerHTML, /Awaiting opponent/);
  assert.doesNotMatch(card.children[1].innerHTML, /competition finished|Bye/);
});
