async function installWithRetry<T>(install: () => Promise<T>): Promise<T> {
  const attempts = 8
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await install()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const transient = message.includes('another open Access Handle')
      if (!transient || attempt === attempts - 1) throw error
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)))
    }
  }
  throw new Error('unreachable OPFS initialization state')
}

/**
 * Holds one browser-wide lease for an OPFS SAH pool until its worker exits.
 * Rapid reloads can otherwise overlap worker generations and make Chromium
 * reject the replacement worker's exclusive synchronous access handles.
 */
export function installExclusiveOpfsPool<T>(
  lockName: string,
  install: () => Promise<T>,
): Promise<T> {
  if (!navigator.locks) return installWithRetry(install)

  return new Promise((resolve, reject) => {
    void navigator.locks
      .request(lockName, async () => {
        try {
          resolve(await installWithRetry(install))
          await new Promise<void>(() => {
            // Hold the lease until this worker is terminated.
          })
        } catch (error) {
          reject(error)
        }
      })
      .catch(reject)
  })
}
