import assert from 'node:assert/strict'
import test from 'node:test'
import { createAiJobStore } from './aiJobStore.js'

test('a cleared job cannot overwrite a newer result', async () => {
  const store = createAiJobStore()
  let resolveOld
  const oldPromise = store.start({
    payload: { query: 'old' },
    run: () => new Promise((resolve) => { resolveOld = resolve }),
  })

  store.clear()
  await store.start({
    payload: { query: 'new' },
    run: async () => ({ recommendedPrice: 200000 }),
  })

  resolveOld({ recommendedPrice: 100000 })
  await oldPromise
  assert.equal(store.getSnapshot().payload.query, 'new')
  assert.equal(store.getSnapshot().result.recommendedPrice, 200000)
})

test('a second start while a job is running reuses the active request', async () => {
  const store = createAiJobStore()
  let resolveJob
  const first = store.start({
    run: () => new Promise((resolve) => { resolveJob = resolve }),
  })
  const second = store.start({ run: async () => ({ unexpected: true }) })
  assert.equal(first, second)
  resolveJob({ ok: true })
  await first
  assert.deepEqual(store.getSnapshot().result, { ok: true })
})
