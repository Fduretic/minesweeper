const { test } = require('node:test');
const assert = require('node:assert/strict');
const { LEVELS, createBoard, play, neighbors, visible, points } = require('../api/dist/engine');

test('every level: first click and its neighborhood are safe; no mines leak', () => {
  for (const [level, spec] of Object.entries(LEVELS)) for (const first of [0, spec.cols - 1, Math.floor(spec.rows * spec.cols / 2), spec.rows * spec.cols - 1]) {
    const b = createBoard(level, first);
    assert.equal(new Set(b.mines).size, spec.mines);
    assert.ok(![first, ...neighbors(first, spec.rows, spec.cols)].some(i => b.mines.includes(i)));
    assert.ok(b.revealed.includes(first));
    assert.ok(!Object.hasOwn(visible(b), 'mines'));
    assert.ok(!visible(b).cells.includes('mine'));
    assert.equal(visible(b).cells[first], 0);
  }
});
test('flood fill stops at numbers and flags are reversible', () => {
  const b = {level:'beginner', mines:[10,11,12,13,14,15,16,17,18,19], flags:[], revealed:[], status:'playing', exploded:null};
  play(b, 'flag', 0); play(b, 'reveal', 0); assert.deepEqual(b.revealed, []);
  play(b, 'flag', 0); play(b, 'reveal', 80);
  assert.ok(b.revealed.length > 30); assert.ok(!b.revealed.includes(0));
  assert.ok(b.revealed.every(i => !b.mines.includes(i)));
});
test('victory needs all safe cells, not flags; finished games cannot change', () => {
  const b = createBoard('beginner', 40);
  for (let i = 0; i < 81; i++) if (!b.mines.includes(i)) play(b, 'reveal', i);
  assert.equal(b.status, 'won'); assert.equal(b.revealed.length, 71); assert.equal(b.flags.length, 10);
  const before = JSON.stringify(b); play(b, 'reveal', b.mines[0]); assert.equal(JSON.stringify(b), before);
});
test('mine hit ends game and exposes bombs and incorrect flags', () => {
  const b = createBoard('beginner', 0);
  const safe = Array.from({length:81},(_,i)=>i).find(i => !b.mines.includes(i) && !b.revealed.includes(i));
  if(safe !== undefined) play(b, 'flag', safe);
  play(b, 'reveal', b.mines[0]); assert.equal(b.status, 'lost');
  assert.equal(visible(b).cells[b.mines[0]], 'mine');
  if(safe !== undefined) assert.equal(visible(b).cells[safe], 'wrong');
});
test('chord opens neighbors only with matching flags and wrong flags may lose', () => {
  const b = {level:'beginner', mines:[0,72,73,74,75,76,77,78,79,80], flags:[], revealed:[10], status:'playing', exploded:null};
  play(b, 'chord', 10); assert.deepEqual(b.revealed, [10]);
  play(b, 'flag', 0); play(b, 'chord', 10); assert.ok(b.revealed.includes(1)); assert.notEqual(b.status,'lost');
  const wrong = {level:'beginner', mines:[0,72,73,74,75,76,77,78,79,80], flags:[1], revealed:[10], status:'playing', exploded:null};
  play(wrong, 'chord', 10); assert.equal(wrong.status,'lost');
});
test('edges do not wrap; invalid indices rejected; score boundaries', () => {
  assert.deepEqual(neighbors(0,9,9), [1,9,10]); assert.ok(!neighbors(8,9,9).includes(9));
  assert.throws(() => play(createBoard('expert',0), 'reveal', -1));
  assert.equal(points('beginner',999),10000); assert.equal(points('beginner',1000),9990);
  assert.equal(points('expert',2000),49980); assert.equal(points('intermediate',99999999),1);
});
