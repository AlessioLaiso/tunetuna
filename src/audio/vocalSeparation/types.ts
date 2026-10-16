export type WorkerRequest =
  // Separates every segment not in `skip`, starting from the one containing `startSample`
  | { type: 'separate'; id: number; left: Float32Array; right: Float32Array; startSample: number; skip: number[] }
  // Continues from the segment containing `sample` (e.g. after a seek)
  | { type: 'prioritize'; id: number; sample: number }
  | { type: 'cancel'; id: number }

export type WorkerResponse =
  | { type: 'model-progress'; id: number; fraction: number }
  | { type: 'segment'; id: number; index: number; vocalsLeft: Float32Array<ArrayBuffer>; vocalsRight: Float32Array<ArrayBuffer> }
  | { type: 'done'; id: number }
  | { type: 'error'; id: number; message: string }
