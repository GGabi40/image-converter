// video-worker.js
// Web Worker que carga el núcleo de FFmpeg (WebAssembly, vía CDN) y ejecuta
// las conversiones fuera del hilo principal para no bloquear la UI.

const CORE_JS_URL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js";
const CORE_WASM_URL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm";

let corePromise = null;

const loadCore = () => {
  if (corePromise) return corePromise;

  corePromise = (async () => {
    importScripts(CORE_JS_URL);

    const mainScriptUrlOrBlob =
      CORE_JS_URL + "#" + btoa(JSON.stringify({ wasmURL: CORE_WASM_URL }));

    const core = await self.createFFmpegCore({ mainScriptUrlOrBlob });

    core.setLogger((data) => self.postMessage({ type: "log", data }));
    core.setProgress((data) => self.postMessage({ type: "progress", data }));

    return core;
  })();

  return corePromise;
};

self.onmessage = async (event) => {
  const { id, type, payload } = event.data;

  try {
    const core = await loadCore();
    let result;

    switch (type) {
      case "load":
        result = true;
        break;

      case "writeFile":
        core.FS.writeFile(payload.path, payload.data);
        result = true;
        break;

      case "readFile":
        result = core.FS.readFile(payload.path);
        break;

      case "deleteFile":
        core.FS.unlink(payload.path);
        result = true;
        break;

      case "exec":
        core.setTimeout(-1);
        core.exec(...payload.args);
        result = core.ret;
        core.reset();
        break;

      default:
        throw new Error("Tipo de mensaje desconocido: " + type);
    }

    const transfer = result instanceof Uint8Array ? [result.buffer] : [];
    self.postMessage({ id, type: "result", result }, transfer);
  } catch (err) {
    self.postMessage({ id, type: "error", error: (err && err.message) || String(err) });
  }
};
