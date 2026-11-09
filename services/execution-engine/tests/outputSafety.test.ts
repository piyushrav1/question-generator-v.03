import test from 'node:test'
import assert from 'node:assert/strict'
import { appendOutputChunk, MAX_OUTPUT_BYTES } from '../src/dockerCodeRunner.js'

test('appendOutputChunk accumulates output under limit without truncation', () => {
  let output = ''
  const res1 = appendOutputChunk(output, 'Hello ')
  output = res1.output
  assert.equal(res1.truncated, false)

  const res2 = appendOutputChunk(output, 'World!')
  output = res2.output
  assert.equal(res2.truncated, false)
  assert.equal(output, 'Hello World!')
})

test('appendOutputChunk truncates output exceeding maxOutputBytes', () => {
  const smallLimit = 50 // 50 bytes for test
  let output = 'Initial content: '

  const largeChunk = 'A'.repeat(100)
  const res = appendOutputChunk(output, largeChunk, smallLimit)

  assert.equal(res.truncated, true)
  assert.ok(res.output.includes('[Output truncated: exceeded 100KB limit]'))
  assert.ok(res.output.startsWith('Initial content: AAAAA'))
})

test('appendOutputChunk rejects subsequent chunks once limit reached', () => {
  const smallLimit = 20
  const initial = 'A'.repeat(25)
  const truncatedInitial = appendOutputChunk('', initial, smallLimit)

  assert.equal(truncatedInitial.truncated, true)

  // Subsequent chunk after already reaching or exceeding limit
  const res = appendOutputChunk(truncatedInitial.output, 'More text', smallLimit)
  assert.equal(res.truncated, true)
  assert.equal(res.output, truncatedInitial.output)
})

test('MAX_OUTPUT_BYTES default is 100 KB', () => {
  assert.equal(MAX_OUTPUT_BYTES, 100 * 1024)
})
