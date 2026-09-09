const createIdleSnapshot = () => ({
  status: 'idle',
  payload: null,
  result: null,
  error: null,
  startedAt: null,
  finishedAt: null,
})

export function createAiJobStore() {
  let snapshot = createIdleSnapshot()
  let activePromise = null
  let version = 0
  const listeners = new Set()

  const notify = () => listeners.forEach((listener) => listener())
  const setSnapshot = (nextSnapshot) => {
    snapshot = nextSnapshot
    notify()
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    start: ({ payload = null, run }) => {
      if (activePromise) return activePromise

      version += 1
      const jobVersion = version
      const startedAt = Date.now()
      setSnapshot({ status: 'running', payload, result: null, error: null, startedAt, finishedAt: null })

      let runPromise
      try {
        runPromise = Promise.resolve(run())
      } catch (error) {
        runPromise = Promise.reject(error)
      }

      activePromise = runPromise
        .then((result) => {
          if (jobVersion !== version) return result
          setSnapshot({ status: 'success', payload, result, error: null, startedAt, finishedAt: Date.now() })
          return result
        })
        .catch((error) => {
          if (jobVersion !== version) throw error
          setSnapshot({ status: 'error', payload, result: null, error, startedAt, finishedAt: Date.now() })
          throw error
        })
        .finally(() => {
          if (jobVersion === version) activePromise = null
        })

      return activePromise
    },
    clear: () => {
      version += 1
      activePromise = null
      setSnapshot(createIdleSnapshot())
    },
  }
}

export const shoppingEstimateJobStore = createAiJobStore()
