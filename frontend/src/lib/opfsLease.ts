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
 * How long to wait for another generation of this worker to release the lease.
 * A reload hands over in milliseconds; anything longer means a *different tab*
 * is holding it, and no amount of further waiting will help.
 */
const LEASE_WAIT_MS = 10_000

/** Thrown when the lease is held by another tab rather than a dying reload. */
export class OpfsLeaseBusyError extends Error {
  constructor() {
    super('SchreckNet is already open in another tab. Close the other tab and reload this page.')
    this.name = 'OpfsLeaseBusyError'
  }
}

/**
 * Holds one browser-wide lease for an OPFS SAH pool until its worker exits.
 * Rapid reloads can otherwise overlap worker generations and make Chromium
 * reject the replacement worker's exclusive synchronous access handles.
 *
 * The wait is bounded. An OPFS SAH pool genuinely cannot be opened twice — the
 * access handles are exclusive — so a second tab can never be served, and
 * waiting forever just produced a silent permanent "Loading card database…"
 * with no error anywhere (both this pool and the user-data pool hang together,
 * because each takes its own lease). Failing with something the user can act on
 * beats hanging: the message surfaces through the normal load-error path.
 */
export function installExclusiveOpfsPool<T>(
  lockName: string,
  install: () => Promise<T>,
): Promise<T> {
  if (!navigator.locks) return installWithRetry(install)

  return new Promise((resolve, reject) => {
    const abort = new AbortController()
    // Only bounds ACQUIRING the lease. Once held it is kept for the worker's
    // lifetime, so clearing this on acquisition avoids ever aborting a lease
    // we already own.
    let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(
      () => abort.abort(),
      LEASE_WAIT_MS,
    )
    const clearTimer = () => {
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
    }

    void navigator.locks
      .request(lockName, { signal: abort.signal }, async () => {
        clearTimer()
        try {
          resolve(await installWithRetry(install))
          await new Promise<void>(() => {
            // Hold the lease until this worker is terminated.
          })
        } catch (error) {
          reject(error)
        }
      })
      .catch((error: unknown) => {
        clearTimer()
        // An abort here means the timeout fired while still queued, i.e. some
        // other tab owns the lease.
        reject(abort.signal.aborted ? new OpfsLeaseBusyError() : error)
      })
  })
}
