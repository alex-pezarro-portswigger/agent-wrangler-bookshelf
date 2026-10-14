import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampWidth, clampPreviewWidth, dragWidth, DEFAULT_WIDTH, MIN_WIDTH, MIN_PREVIEW_WIDTH } from './width.js';

test('missing or junk stored widths fall back to the default', () => {
  for (const v of [null, undefined, '', 'wide', '-5', NaN]) assert.equal(clampWidth(v, 1200), DEFAULT_WIDTH);
});

test('widths are kept between the minimum and a share of the space', () => {
  assert.equal(clampWidth(100, 1200), MIN_WIDTH);
  assert.equal(clampWidth('420', 1200), 420);
  assert.equal(clampWidth(2000, 1000), 600);
});

test('a narrow space still allows the minimum', () => {
  assert.equal(clampWidth(500, 300), MIN_WIDTH);
});

test('unknown space only applies the minimum', () => {
  assert.equal(clampWidth(900, 0), 900);
});

test('dragging away from the docked side widens the shelf', () => {
  assert.equal(dragWidth(420, 800, 750, 'right'), 470);
  assert.equal(dragWidth(420, 800, 850, 'right'), 370);
  assert.equal(dragWidth(420, 300, 350, 'left'), 470);
  assert.equal(dragWidth(420, 300, 250, 'left'), 370);
});

test('no stored preview width keeps the CSS default', () => {
  for (const v of [null, undefined, '', 'wide', '-5', NaN]) assert.equal(clampPreviewWidth(v, 1200, 420), null);
});

test('the preview is kept between its minimum and the space the shelf leaves', () => {
  assert.equal(clampPreviewWidth(100, 1200, 420), MIN_PREVIEW_WIDTH);
  assert.equal(clampPreviewWidth('500', 1200, 420), 500);
  assert.equal(clampPreviewWidth(2000, 1200, 420), 780);
  assert.equal(clampPreviewWidth(500, 500, 420), MIN_PREVIEW_WIDTH);
  assert.equal(clampPreviewWidth(900, 0, 420), 900);
});
