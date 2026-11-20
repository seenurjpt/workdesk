/*
 * On-device speech-to-text for browsers without a working built-in speech
 * service (Brave, Firefox). Runs Moonshine base (8-bit) with
 * transformers.js on WebAssembly. The model (~63 MB) is downloaded once from
 * Hugging Face and cached by the browser; audio never leaves the device.
 *
 * Messages in:  { type: "load" } | { type: "transcribe", id, audio: Float32Array (16 kHz mono) }
 * Messages out: { type: "progress", loaded, total } | { type: "ready" }
 *               { type: "result", id, text } | { type: "error", id?, message }
 */

const LIB = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/transformers.min.js";
// Moonshine (Useful Sensors) instead of Whisper: its work scales with how long you spoke, while
// Whisper always processes a 30 s window. Measured warm on a 3 s command: ~0.85 s vs ~4.3 s.
// Previous model: "onnx-community/whisper-base.en" (77 MB).
const MODEL = "onnx-community/moonshine-base-ONNX";
/** encoder (20 MB) + merged decoder (43 MB), 8-bit. */
const EXPECTED_BYTES = 63_000_000;

let loading = null;

function load() {
  if (loading) return loading;
  loading = (async () => {
    const { pipeline, env } = await import(LIB);
    env.allowLocalModels = false;
    const files = new Map();
    const asr = await pipeline("automatic-speech-recognition", MODEL, {
      device: "wasm",
      dtype: "q8",
      progress_callback: (p) => {
        if (p.status !== "progress" || !p.file) return;
        files.set(p.file, { loaded: p.loaded || 0, total: p.total || 0 });
        let loaded = 0;
        let total = 0;
        for (const f of files.values()) {
          loaded += f.loaded;
          total += f.total;
        }
        // Hugging Face often doesn't send file sizes; fall back to the known model size.
        total = Math.max(total, EXPECTED_BYTES, loaded);
        self.postMessage({ type: "progress", loaded, total });
      },
    });
    // Warm-up: the first run compiles kernels and is slow, so do it now, while the user is still
    // talking, instead of on their first real command.
    try {
      await asr(new Float32Array(16_000), { max_new_tokens: 4 });
    } catch {
      /* warm-up is best effort */
    }
    self.postMessage({ type: "ready" });
    return asr;
  })();
  loading.catch(() => {
    loading = null; // allow a retry after a failed download
  });
  return loading;
}

// Speech models sometimes "hear" these in near-silence.
const HALLUCINATIONS = /^(?:thank you\.?|thanks for watching!?|you\.?|bye\.?|\.+|okay\.?|so\.?)$/i;

self.onmessage = async (event) => {
  const msg = event.data;
  if (msg.type === "load") {
    try {
      await load();
    } catch (error) {
      self.postMessage({ type: "error", message: String(error?.message || error) });
    }
    return;
  }
  if (msg.type === "transcribe") {
    try {
      const asr = await load();
      const seconds = msg.audio.length / 16_000;
      // ~6 tokens per second of speech is plenty; the cap stops runaway repeats on noise.
      const out = await asr(msg.audio, { max_new_tokens: Math.ceil(seconds * 6.5) + 10 });
      let text = (Array.isArray(out) ? out.map((o) => o.text).join(" ") : out.text) || "";
      text = text
        .replace(/\[[^\]]*\]|\([^)]*\)/g, " ") // [BLANK_AUDIO], (music) …
        .replace(/\s+/g, " ")
        .trim();
      if (HALLUCINATIONS.test(text)) text = "";
      self.postMessage({ type: "result", id: msg.id, text });
    } catch (error) {
      self.postMessage({ type: "error", id: msg.id, message: String(error?.message || error) });
    }
  }
};
