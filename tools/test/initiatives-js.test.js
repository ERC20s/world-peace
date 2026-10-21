// js/initiatives.js, loaded the way a browser loads it (a classic script with
// `this` as the global object), minus the DOM.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ROOT } = require('../data-checks');

function load() {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'initiatives.js'), 'utf8'), sandbox);
  return sandbox.WorldPeaceInitiatives;
}

const { matches, parseQuery, toQuery } = load();

const wipnet = { text: 'WIPNET (Women in Peacebuilding Network) — trained women peace activists in Liberia', country: 'LR', type: 'capacity-building', year: 2002 };
const corrymeela = { text: 'Corrymeela Community — residential programmes', country: 'GB', type: 'dialogue', year: 1965 };

test('no criteria matches everything', () => {
  assert.equal(matches(wipnet, {}), true);
  assert.equal(matches(corrymeela, { q: '  ', country: '', type: '', from: '', to: '' }), true);
});

test('every search term must appear, case-insensitively', () => {
  assert.equal(matches(wipnet, { q: 'women LIBERIA' }), true);
  assert.equal(matches(wipnet, { q: 'women belfast' }), false);
});

test('country and type filter exactly', () => {
  assert.equal(matches(wipnet, { country: 'LR' }), true);
  assert.equal(matches(wipnet, { country: 'GB' }), false);
  assert.equal(matches(corrymeela, { type: 'dialogue' }), true);
  assert.equal(matches(corrymeela, { type: 'trauma-support' }), false);
});

test('the year range is inclusive and ignores non-years', () => {
  assert.equal(matches(wipnet, { from: '2002', to: '2002' }), true);
  assert.equal(matches(wipnet, { from: '2003' }), false);
  assert.equal(matches(corrymeela, { to: '1964' }), false);
  assert.equal(matches(corrymeela, { from: 'abc', to: '' }), true);
});

test('filters combine', () => {
  assert.equal(matches(wipnet, { q: 'women', country: 'LR', type: 'capacity-building', from: '2000', to: '2010' }), true);
  assert.equal(matches(wipnet, { q: 'women', country: 'LR', type: 'dialogue' }), false);
});

test('the query string round-trips', () => {
  const criteria = { q: 'women & peace', country: 'LR', type: '', from: '2000', to: '' };
  assert.equal(toQuery(criteria), '?q=women%20%26%20peace&country=LR&from=2000');
  assert.deepEqual({ ...parseQuery(toQuery(criteria)) }, { q: 'women & peace', country: 'LR', type: '', from: '2000', to: '' });
  assert.equal(parseQuery('?q=a+b&unknown=1&country=%E0%A4%A').q, 'a b');
  assert.equal(toQuery({}), '');
});
