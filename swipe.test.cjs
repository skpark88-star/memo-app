const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const html = readFileSync(`${__dirname}/index.html`, 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script); // Validate the entire app script too.
const gestures = script.split('// Swipe between tabs')[1].split("document.querySelectorAll('.tab')")[0];

function setup(initial = 'links') {
  const events = {};
  const state = { tab: initial };
  const context = vm.createContext({
    Date,
    tab: initial,
    setTab(next) { context.tab = state.tab = next; },
    listEl: {
      addEventListener(name, fn) { events[name] = fn; },
      setPointerCapture() {},
    },
  });
  vm.runInContext('// Swipe between tabs' + gestures, context);
  function fire(name, x, y, extra = {}) {
    const event = {
      pointerId: 1, isPrimary: true, pointerType: 'touch',
      clientX: x, clientY: y, target: { closest: () => false },
      preventDefault() { state.prevented = true; },
      stopImmediatePropagation() { state.blocked = true; },
      ...extra,
    };
    events[name](event);
  }
  function swipe(x1, y1, x2, y2, extra) {
    fire('pointerdown', x1, y1, extra);
    fire('pointermove', x2, y2);
    fire('pointerup', x2, y2);
  }
  return { fire, swipe, state };
}

test('left and right swipes switch tabs and suppress accidental clicks', () => {
  const app = setup();
  app.swipe(250, 100, 80, 110);
  assert.equal(app.state.tab, 'todos');
  app.fire('click');
  assert.equal(app.state.blocked, true);
  app.swipe(80, 100, 250, 110);
  assert.equal(app.state.tab, 'links');
});

test('taps still reach links', () => {
  const app = setup();
  app.swipe(100, 100, 103, 102);
  app.fire('click');
  assert.equal(app.state.blocked, undefined);
  assert.equal(app.state.tab, 'links');
});

test('short, vertical, and diagonal gestures do not switch tabs', () => {
  for (const [x, y] of [[210, 100], [240, 250], [150, 190]]) {
    const app = setup();
    app.swipe(250, 100, x, y);
    assert.equal(app.state.tab, 'links');
  }
});

test('reorder handles, controls and mouse gestures are excluded', () => {
  for (const extra of [{ target: { closest: () => true } }, { pointerType: 'mouse' }]) {
    const app = setup();
    app.swipe(250, 100, 80, 100, extra);
    assert.equal(app.state.tab, 'links');
  }
});

test('cancelled and multi-touch gestures do not switch tabs', () => {
  for (const cancel of ['pointercancel', 'lostpointercapture', 'pointerdown']) {
    const app = setup();
    app.fire('pointerdown', 250, 100);
    app.fire('pointermove', 80, 100);
    app.fire(cancel, 80, 100, { isPrimary: false, pointerId: 2 });
    app.fire('pointerup', 80, 100);
    assert.equal(app.state.tab, 'links');
  }
});

test('vertical scroll direction stays locked and outer swipes do not wrap', () => {
  const app = setup();
  app.fire('pointerdown', 250, 100);
  app.fire('pointermove', 245, 130);
  app.fire('pointermove', 80, 130);
  app.fire('pointerup', 80, 130);
  assert.equal(app.state.tab, 'links');
  app.swipe(80, 100, 250, 100);
  assert.equal(app.state.tab, 'links');
  const todos = setup('todos');
  todos.swipe(250, 100, 80, 100);
  assert.equal(todos.state.tab, 'todos');
});
