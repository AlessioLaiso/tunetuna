/// <reference lib="webworker" />
// Runs MDX-Net vocal separation off the main thread with ONNX Runtime Web (WebGPU)

import * as ort from 'onnxruntime-web/webgpu'
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'
import { MdxSeparator, KIM_VOCAL_2 } from './mdx'
import type { WorkerRequest, WorkerResponse } from './types'

const MODEL_URL = 'https://huggingface.co/Politrees/UVR_resources/resolve/main/models/MDXNet/Kim_Vocal_2.onnx'
const MODEL_CACHE = 'tunetuna-models-v1'

// Self-hosted wasm (CSP only allows same-origin scripts); single-threaded avoids
// needing cross-origin isolation, WebGPU does the heavy lifting anyway
ort.env.wasm.wasmPaths = { wasm: wasmUrl }
ort.env.wasm.numThreads = 1

const ctx = self as unknown as DedicatedWorkerGlobalScope
let sessionPromise: Promise<ort.InferenceSession> | null = null

function post(message: WorkerResponse, transfer: Transferable[] = []) {
  ctx.postMessage(message, transfer)
}

async function downloadModel(onProgress: (fraction: number) => void): Promise<ArrayBuffer> {
  const cache = await caches.open(MODEL_CACHE).catch(() => null)
  const cached = await cache?.match(MODEL_URL)
  if (cached) return cached.arrayBuffer()

  const response = await fetch(MODEL_URL)
  if (!response.ok || !response.body) throw new Error(`Model download failed: ${response.status}`)
  const total = Number(response.headers.get('content-length')) || 0
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    if (total) onProgress(received / total)
  }
  const data = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    data.set(chunk, offset)
    offset += chunk.length
  }
  await cache?.put(MODEL_URL, new Response(data)).catch(() => undefined)
  return data.buffer
}

function getSession(id: number): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const model = await downloadModel((fraction) => post({ type: 'model-progress', id, fraction }))
      return ort.InferenceSession.create(model, {
        executionProviders: ['webgpu'],
        graphOptimizationLevel: 'all',
      })
    })()
    // Allow a retry after a failed load
    sessionPromise.catch(() => { sessionPromise = null })
  }
  return sessionPromise
}

interface Job {
  id: number
  separator: MdxSeparator
  pending: Set<number>
  next: number
  cancelled: boolean
}

let currentJob: Job | null = null
let runQueue: Promise<unknown> = Promise.resolve()

// Next pending segment at or after job.next, wrapping around to the start
function takeNextSegment(job: Job): number | null {
  const count = job.separator.segmentCount
  for (let k = 0; k < count; k++) {
    const index = (job.next + k) % count
    if (job.pending.has(index)) {
      job.pending.delete(index)
      job.next = index + 1
      return index
    }
  }
  return null
}

async function runJob(job: Job) {
  const session = await getSession(job.id)
  const { dimF, dimT } = KIM_VOCAL_2
  const [inputName] = session.inputNames
  const [outputName] = session.outputNames
  const runModel = (input: Float32Array) => {
    // A cancelled job may still be mid-run when the next one starts; never overlap runs
    const run = runQueue.then(async () => {
      const results = await session.run({ [inputName]: new ort.Tensor('float32', input, [1, 4, dimF, dimT]) })
      const output = results[outputName]
      const data = (await output.getData()) as Float32Array
      output.dispose()
      return data
    })
    runQueue = run.catch(() => undefined)
    return run
  }

  for (;;) {
    if (job.cancelled) return
    const index = takeNextSegment(job)
    if (index === null) break
    const [vocalsLeft, vocalsRight] = await job.separator.separateSegment(index, runModel)
    if (job.cancelled) return
    post({ type: 'segment', id: job.id, index, vocalsLeft, vocalsRight }, [vocalsLeft.buffer, vocalsRight.buffer])
  }
  post({ type: 'done', id: job.id })
}

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data
  if (message.type === 'cancel') {
    if (currentJob?.id === message.id) {
      currentJob.cancelled = true
      currentJob = null
    }
    return
  }
  if (message.type === 'prioritize') {
    if (currentJob?.id === message.id) {
      currentJob.next = Math.floor(message.sample / currentJob.separator.segmentLength)
    }
    return
  }

  if (currentJob) currentJob.cancelled = true
  const separator = new MdxSeparator(message.left, message.right, KIM_VOCAL_2)
  const skip = new Set(message.skip)
  const pending = new Set<number>()
  for (let i = 0; i < separator.segmentCount; i++) {
    if (!skip.has(i)) pending.add(i)
  }
  const job: Job = {
    id: message.id,
    separator,
    pending,
    next: Math.floor(message.startSample / separator.segmentLength),
    cancelled: false,
  }
  currentJob = job
  runJob(job)
    .catch((error: unknown) => {
      if (job.cancelled) return
      post({ type: 'error', id: job.id, message: error instanceof Error ? error.message : String(error) })
    })
    .finally(() => {
      if (currentJob === job) currentJob = null
    })
}
