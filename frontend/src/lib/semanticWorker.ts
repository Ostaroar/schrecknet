// Local-only sentence embedding worker. The model and ONNX runtime are served
// by SchreckNet itself; remote Hugging Face/CDN fallbacks are disabled.

import { env, pipeline } from '@huggingface/transformers'

type EmbedRequest = {
  id: number
  kind: 'embed'
  query: string
  modelId: string
  dimensions: number
}

type WorkerProgress = {
  id: number
  kind: 'progress'
  phase: 'loading' | 'downloading' | 'ready'
  file?: string
  loaded?: number
  total?: number
  percent?: number
}

env.allowLocalModels = true
env.allowRemoteModels = false
env.localModelPath = '/models/semantic/'
env.useBrowserCache = true
const onnxWasm = env.backends.onnx.wasm
if (!onnxWasm) throw new Error('ONNX Runtime WebAssembly backend is unavailable')
// Transformers.js's package export defaults to a public CDN. Resolve the
// package's own pinned JSEP runtime through Vite instead, yielding local,
// content-hashed assets that the app-shell service worker can cache.
onnxWasm.wasmPaths = {
  mjs: new URL(
    '../../node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.mjs',
    import.meta.url,
  ),
  wasm: new URL(
    '../../node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.wasm',
    import.meta.url,
  ),
}
// Cross-origin isolation is intentionally off because card scans are hotlinked.
// Inference already runs away from the UI thread, so use the universal single-
// threaded WASM baseline rather than silently requiring SharedArrayBuffer.
onnxWasm.numThreads = 1

async function createExtractor(modelId: string, requestId: number) {
  return pipeline('feature-extraction', modelId, {
    device: 'wasm',
    dtype: 'q8',
    local_files_only: true,
    progress_callback: (progress) => {
      if (progress.status === 'progress') {
        const message: WorkerProgress = {
          id: requestId,
          kind: 'progress',
          phase: 'downloading',
          file: progress.file,
          loaded: progress.loaded,
          total: progress.total,
          percent: progress.progress,
        }
        self.postMessage(message)
      }
    },
  })
}

type Extractor = Awaited<ReturnType<typeof createExtractor>>
let extractor: Promise<Extractor> | null = null
let loadedModelId: string | null = null

function getExtractor(modelId: string, requestId: number): Promise<Extractor> {
  if (!extractor || loadedModelId !== modelId) {
    loadedModelId = modelId
    self.postMessage({ id: requestId, kind: 'progress', phase: 'loading' } satisfies WorkerProgress)
    extractor = createExtractor(modelId, requestId)
  }
  return extractor
}

self.onmessage = async (event: MessageEvent<EmbedRequest>) => {
  const message = event.data
  try {
    const model = await getExtractor(message.modelId, message.id)
    const output = await model(message.query, { pooling: 'mean', normalize: true })
    if (!(output.data instanceof Float32Array)) {
      throw new Error('semantic model returned a non-f32 embedding')
    }
    if (output.data.length !== message.dimensions) {
      throw new Error(
        `semantic model returned ${output.data.length} dimensions; expected ${message.dimensions}`,
      )
    }
    const embedding = output.data.slice()
    self.postMessage(
      { id: message.id, kind: 'result', embedding },
      { transfer: [embedding.buffer] },
    )
  } catch (error) {
    // A failed initialization must be retryable after connectivity/storage is
    // restored. The main-thread adapter also replaces this worker on failure.
    extractor = null
    loadedModelId = null
    self.postMessage({
      id: message.id,
      kind: 'error',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
