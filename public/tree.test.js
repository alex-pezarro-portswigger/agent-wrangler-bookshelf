import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTree } from './tree.js';

const shape = (nodes) => nodes.map((n) => (n.type === 'dir' ? { [n.name]: shape(n.children) } : n.name));

test('groups by shelf, ordered by each shelf first addedAt', () => {
  const tree = buildTree([
    { path: '/r/b.md', shelf: 'Reports', addedAt: 5 },
    { path: '/p/a.md', shelf: 'Plans', addedAt: 1 },
    { path: '/r/c.md', shelf: 'Reports', addedAt: 0 },
    { path: '/p/z.md', shelf: 'Plans', addedAt: 9 },
  ]);
  assert.deepEqual(tree.map((s) => [s.shelf, s.count]), [['Reports', 2], ['Plans', 2]]);
});

test('a single file sits at the top level of its shelf', () => {
  const [shelf] = buildTree([{ path: '/a/b/c/plan.md', shelf: 'Plans', addedAt: 1 }]);
  assert.deepEqual(shape(shelf.children), ['plan.md']);
  assert.equal(shelf.children[0].path, '/a/b/c/plan.md');
});

test('nests relative to the common ancestor, folders first, by name', () => {
  const [shelf] = buildTree([
    { path: '/repo/docs/z.md', shelf: 'S', addedAt: 1 },
    { path: '/repo/docs/specs/b.md', shelf: 'S', addedAt: 2 },
    { path: '/repo/docs/plans/a.md', shelf: 'S', addedAt: 3 },
  ]);
  assert.deepEqual(shape(shelf.children), [{ plans: ['a.md'] }, { specs: ['b.md'] }, 'z.md']);
});

test('compacts single-child folder chains', () => {
  const [shelf] = buildTree([
    { path: '/x/a/b/c/one.md', shelf: 'S', addedAt: 1 },
    { path: '/x/a/b/c/two.md', shelf: 'S', addedAt: 2 },
    { path: '/x/d/three.md', shelf: 'S', addedAt: 3 },
  ]);
  assert.deepEqual(shape(shelf.children), [{ 'a/b/c': ['one.md', 'two.md'] }, { d: ['three.md'] }]);
});

test('does not compact a folder that also holds files', () => {
  const [shelf] = buildTree([
    { path: '/x/a/f.md', shelf: 'S', addedAt: 1 },
    { path: '/x/a/b/g.md', shelf: 'S', addedAt: 2 },
    { path: '/x/h.md', shelf: 'S', addedAt: 3 },
  ]);
  assert.deepEqual(shape(shelf.children), [{ a: [{ b: ['g.md'] }, 'f.md'] }, 'h.md']);
});

test('handles Windows separators and empty input', () => {
  const [shelf] = buildTree([
    { path: 'C:\\r\\a\\x.md', shelf: 'S', addedAt: 1 },
    { path: 'C:\\r\\b\\y.md', shelf: 'S', addedAt: 2 },
  ]);
  assert.deepEqual(shape(shelf.children), [{ a: ['x.md'] }, { b: ['y.md'] }]);
  assert.deepEqual(buildTree([]), []);
  assert.deepEqual(buildTree(), []);
});
