import assert from 'node:assert/strict'
import test from 'node:test'

const outlineStylesModule = await import(
  new URL('../src/lib/outline-styles.ts', import.meta.url).href
).catch(() => ({} as Record<string, unknown>))

const { getOutlineHeadingTextClass } = outlineStylesModule as {
  getOutlineHeadingTextClass?: () => string
}

const { getOutlinePanelClass } = outlineStylesModule as {
  getOutlinePanelClass?: (position?: 'left' | 'right') => string
}

test('getOutlineHeadingTextClass allows long headings to wrap instead of truncating', () => {
  assert.equal(typeof getOutlineHeadingTextClass, 'function')

  const className = getOutlineHeadingTextClass?.() || ''

  assert.match(className, /\bbreak-all\b/)
  assert.match(className, /\bwhitespace-normal\b/)
  assert.doesNotMatch(className, /\btruncate\b/)
})

test('getOutlinePanelClass keeps the outline sidebar from shrinking', () => {
  assert.equal(typeof getOutlinePanelClass, 'function')

  const className = getOutlinePanelClass?.('right') || ''

  assert.match(className, /\bshrink-0\b/)
  assert.match(className, /\bw-64\b/)
  assert.match(className, /\bmin-w-64\b/)
  assert.match(className, /\bborder-l\b/)
})

test('getOutlinePanelClass flips the border side when outline is on the left', () => {
  const className = getOutlinePanelClass?.('left') || ''

  assert.match(className, /\bborder-r\b/)
  assert.doesNotMatch(className, /\bborder-l\b/)
})
