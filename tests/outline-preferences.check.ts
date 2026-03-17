import assert from 'node:assert/strict'
import test from 'node:test'

const outlinePreferencesModule = await import(
  new URL('../src/lib/outline-preferences.ts', import.meta.url).href
).catch(() => ({} as Record<string, unknown>))

const {
  DEFAULT_OUTLINE_POSITION,
  normalizeOutlinePosition,
  isOutlineOnLeft,
} = outlinePreferencesModule as {
  DEFAULT_OUTLINE_POSITION?: 'left' | 'right'
  normalizeOutlinePosition?: (value: unknown) => 'left' | 'right'
  isOutlineOnLeft?: (value: 'left' | 'right') => boolean
}

test('outline preferences default to the right side', () => {
  assert.equal(DEFAULT_OUTLINE_POSITION, 'right')
})

test('normalizeOutlinePosition accepts left and right values', () => {
  assert.equal(normalizeOutlinePosition?.('left'), 'left')
  assert.equal(normalizeOutlinePosition?.('right'), 'right')
})

test('normalizeOutlinePosition falls back to right for invalid values', () => {
  assert.equal(normalizeOutlinePosition?.(undefined), 'right')
  assert.equal(normalizeOutlinePosition?.('top'), 'right')
})

test('isOutlineOnLeft only returns true for left placement', () => {
  assert.equal(isOutlineOnLeft?.('left'), true)
  assert.equal(isOutlineOnLeft?.('right'), false)
})
