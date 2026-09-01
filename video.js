// video.js
// Conversor de video 100% client-side. El trabajo pesado (FFmpeg compilado a
// WebAssembly) corre en video-worker.js para no congelar la UI.

// Config de codecs/formato por extensión de salida.
// `codecArgs` no incluye `-vf`: el filtro de video se arma aparte según
// el formato y si el usuario prioriza velocidad (fastMode).
const FORMAT_CONFIG = {
  mp4: {
    mime: "video/mp4",
    codecArgs: ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-c:a", "aac"],
  },
  webm: {
    mime: "video/webm",
    codecArgs: ["-c:v", "libvpx", "-deadline", "realtime", "-cpu-used", "5", "-b:v", "1M", "-c:a", "libvorbis"],
  },
  mov: {
    mime: "video/quicktime",
    codecArgs: ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-c:a", "aac"],
  },
  avi: {
    mime: "video/x-msvideo",
    codecArgs: ["-c:v", "mpeg4", "-q:v", "5", "-c:a", "libmp3lame"],
  },
  mkv: {
    mime: "video/x-matroska",
    codecArgs: ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-c:a", "aac"],
  },
  gif: {
    mime: "image/gif",
    codecArgs: [],
    noAudio: true,
    isGif: true,
  },
};

// Códecs de video que, copiados tal cual (sin recodificar) dentro de cada
// contenedor, reproducen en la gran mayoría de reproductores (incluido
// Windows Media Player / la app "Reproductor multimedia" sin extensiones
// pagas). Si el video de origen usa otro códec (p. ej. HEVC/H.265, típico
// de iPhone), el "copy" rápido igual copiaría ese códec sin tocarlo y el
// archivo resultante podría no reproducirse pese a tener la extensión
// correcta — por eso en ese caso forzamos la recodificación de abajo.
const SAFE_COPY_VIDEO_CODECS = {
  mp4: ["h264"],
  mov: ["h264"],
  mkv: ["h264"],
  avi: ["h264"],
  webm: ["vp8", "vp9"],
};

// Busca la primera línea "Stream ...: Video: <codec> ..." en el log de
// FFmpeg para saber con qué códec viene el video de entrada.
const detectVideoCodec = (logLines) => {
  for (const line of logLines) {
    const match = /Video:\s*([a-z0-9_]+)/i.exec(line);
    if (match) return match[1].toLowerCase();
  }
  return null;
};

// Niveles de compresión: siempre recodifican a MP4/H.264 (el formato con
// mejor relación peso/compatibilidad) variando CRF, bitrate de audio y un
// tope de resolución opcional para bajar más el peso final.
const COMPRESSION_LEVELS = {
  high: {
    crf: "20",
    maxWidth: null,
    audioBitrate: "192k",
    description:
      "Mantiene la resolución original y prioriza la nitidez. El ahorro de peso es moderado: usalo si necesitás la mejor calidad posible.",
  },
  balanced: {
    crf: "27",
    maxWidth: 1280,
    audioBitrate: "128k",
    description:
      "Recomendado: si el video supera 1280px lo achica un poco y baja levemente la nitidez, algo que casi no se nota a simple vista, a cambio de un ahorro de peso considerable. Es el mejor punto medio entre calidad y tamaño para la mayoría de los casos.",
  },
  small: {
    crf: "33",
    maxWidth: 854,
    audioBitrate: "96k",
    description:
      "Achica el video a 854px de ancho como máximo y prioriza el ahorro de peso por sobre la nitidez. La pérdida de calidad ya se nota, pero el archivo pesa mucho menos: ideal para enviar por chat o subir rápido.",
  },
};

const buildCompressArgs = (level) => {
  const cfg = COMPRESSION_LEVELS[level] || COMPRESSION_LEVELS.balanced;
  const args = [];
  if (cfg.maxWidth) args.push("-vf", `scale='min(${cfg.maxWidth},iw)':'-2'`);
  args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", cfg.crf, "-c:a", "aac", "-b:a", cfg.audioBitrate);
  return args;
};

// Construye los argumentos de recodificación. Si `fastMode` está activo,
// baja resolución y calidad para acelerar el encode (el usuario lo elige
// explícitamente; por defecto se mantiene la resolución original).
const buildTranscodeArgs = (outputExt, fastMode) => {
  const config = FORMAT_CONFIG[outputExt];
  const args = [];

  if (config.isGif) {
    const fps = fastMode ? 6 : 10;
    const width = fastMode ? 320 : 480;
    args.push("-vf", `fps=${fps},scale=${width}:-1:flags=lanczos`);
  } else {
    const codecArgs = [...config.codecArgs];

    if (fastMode) {
      const crfIdx = codecArgs.indexOf("-crf");
      if (crfIdx !== -1) codecArgs[crfIdx + 1] = "30";
      const qIdx = codecArgs.indexOf("-q:v");
      if (qIdx !== -1) codecArgs[qIdx + 1] = "15";

      // Cota la resolución a 854px en el lado más largo (mantiene proporción).
      args.push("-vf", "scale='min(854,iw)':'-2'");
    }

    args.push(...codecArgs);
  }

  if (config.noAudio) args.push("-an");

  return args;
};

class FFmpegWorkerClient {
  constructor() {
    this.worker = new Worker("./video-worker.js");
    this.nextId = 0;
    this.pending = new Map();
    this.onProgress = null;
    this.recentLogs = [];

    this.worker.onmessage = (event) => {
      const { id, type, result, error, data } = event.data;

      if (type === "progress") {
        if (this.onProgress) this.onProgress(data);
        return;
      }

      if (type === "log") {
        const message = data?.message ?? String(data);
        console.debug("[ffmpeg]", message);
        this.recentLogs.push(message);
        if (this.recentLogs.length > 100) this.recentLogs.shift();
        return;
      }

      const pending = this.pending.get(id);
      if (!pending) return;
      this.pending.delete(id);

      if (type === "error") pending.reject(new Error(error));
      else pending.resolve(result);
    };

    this.worker.onerror = (event) => {
      console.error("Error en video-worker.js:", event.message);
    };
  }

  send(type, payload, transfer) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, payload }, transfer || []);
    });
  }

  load() {
    return this.send("load");
  }

  writeFile(path, data) {
    return this.send("writeFile", { path, data }, [data.buffer]);
  }

  readFile(path) {
    return this.send("readFile", { path });
  }

  deleteFile(path) {
    return this.send("deleteFile", { path });
  }

  // Última línea de log de FFmpeg que parece describir un error real
  // (ignora las líneas de progreso tipo "frame=... fps=...").
  lastErrorLine() {
    for (let i = this.recentLogs.length - 1; i >= 0; i--) {
      const line = this.recentLogs[i]?.trim();
      if (line && !/^(frame=|size=|Aborted\(\)|video:.*audio:)/.test(line)) return line;
    }
    return "";
  }

  exec(args) {
    return this.send("exec", { args });
  }

  // Igual que exec(), pero además devuelve las líneas de log que FFmpeg
  // imprimió durante esta ejecución puntual (útil para inspeccionar, por
  // ejemplo, con qué códec viene el archivo de entrada).
  async execWithLogs(args) {
    const start = this.recentLogs.length;
    const ret = await this.exec(args);
    return { ret, logs: this.recentLogs.slice(start) };
  }
}

let client = null;

const getClient = () => {
  if (!client) client = new FFmpegWorkerClient();
  return client;
};

const getExtension = (filename) => {
  const match = /\.([a-z0-9]+)$/i.exec(filename);
  return match ? match[1].toLowerCase() : "mp4";
};

const replaceExtension = (filename, newExt) => {
  return filename.replace(/\.[a-z0-9]+$/i, `.${newExt}`);
};

const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx++;
  }
  return `${value.toFixed(1)} ${units[unitIdx]}`;
};

const ICON_SPINNER =
  '<svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-9-9" /></svg>';
const ICON_SUCCESS =
  '<svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>';
const ICON_WARNING =
  '<svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>';

const setStatus = (text, state) => {
  const status = document.querySelector("#status");
  if (!status) return;
  status.classList.remove("is-loading", "is-success", "is-error");
  if (!text) {
    status.innerHTML = "";
    return;
  }
  const icon = state === "loading" ? ICON_SPINNER : state === "success" ? ICON_SUCCESS : state === "error" ? ICON_WARNING : "";
  if (state) status.classList.add(`is-${state}`);
  status.innerHTML = `${icon}<span>${text}</span>`;
};

const addWarning = (gallery, text) => {
  if (!gallery) return;
  const warn = document.createElement("div");
  warn.classList.add("warning-item");
  warn.innerHTML = `${ICON_WARNING}<span>${text}</span>`;
  gallery.appendChild(warn);
};

const dropzone = document.querySelector("#dropzone");
const fileInputEl = document.querySelector("#fileInput");
const fileSummary = document.querySelector("#fileSummary");

const updateFileSummary = () => {
  if (!fileSummary || !fileInputEl) return;
  const count = fileInputEl.files ? fileInputEl.files.length : 0;
  fileSummary.textContent =
    count === 0 ? "" : count === 1 ? `1 archivo seleccionado: ${fileInputEl.files[0].name}` : `${count} archivos seleccionados`;
};

if (fileInputEl) {
  fileInputEl.addEventListener("change", updateFileSummary);
}

if (dropzone && fileInputEl) {
  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add("is-dragover");
    });
  });

  ["dragleave", "dragend"].forEach((eventName) => {
    dropzone.addEventListener(eventName, () => {
      dropzone.classList.remove("is-dragover");
    });
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("is-dragover");
    if (e.dataTransfer?.files?.length) {
      fileInputEl.files = e.dataTransfer.files;
      updateFileSummary();
    }
  });
}

// ---------- Selector de modo: convertir formato vs. comprimir peso ----------

const modeConvertBtn = document.querySelector("#modeConvertBtn");
const modeCompressBtn = document.querySelector("#modeCompressBtn");
const formatRow = document.querySelector("#formatRow");
const compressionRow = document.querySelector("#compressionRow");
const fastModeRow = document.querySelector("#fastModeRow");
const button = document.querySelector("#convertBtn");

let mode = "convert";

const ACTION_LABELS = {
  convert: {
    cta: "Convertir videos",
    verb: "Convirtiendo",
    doneAll: "¡Conversión completa!",
    doneSome: (n, total) => `Conversión completa: ${n} de ${total} videos.`,
    doneNone: "No se pudo convertir ningún archivo.",
    zipName: "videos_convertidos",
    failPrefix: "No se pudo convertir",
  },
  compress: {
    cta: "Comprimir videos",
    verb: "Comprimiendo",
    doneAll: "¡Compresión completa!",
    doneSome: (n, total) => `Compresión completa: ${n} de ${total} videos.`,
    doneNone: "No se pudo comprimir ningún archivo.",
    zipName: "videos_comprimidos",
    failPrefix: "No se pudo comprimir",
  },
};

const setMode = (newMode) => {
  mode = newMode;
  const isCompress = mode === "compress";

  modeConvertBtn?.classList.toggle("is-active", !isCompress);
  modeConvertBtn?.setAttribute("aria-selected", String(!isCompress));
  modeCompressBtn?.classList.toggle("is-active", isCompress);
  modeCompressBtn?.setAttribute("aria-selected", String(isCompress));

  if (formatRow) formatRow.hidden = isCompress;
  if (compressionRow) compressionRow.hidden = !isCompress;
  if (fastModeRow) fastModeRow.hidden = isCompress;

  if (button) button.textContent = ACTION_LABELS[mode].cta;
};

modeConvertBtn?.addEventListener("click", () => setMode("convert"));
modeCompressBtn?.addEventListener("click", () => setMode("compress"));

// ---------- Explicación del nivel de compresión elegido ----------

const compressionLevelSelect = document.querySelector("#compressionLevel");
const compressionLevelHint = document.querySelector("#compressionLevelHint");

const updateCompressionHint = () => {
  if (!compressionLevelHint) return;
  const level = COMPRESSION_LEVELS[compressionLevelSelect?.value] || COMPRESSION_LEVELS.balanced;
  compressionLevelHint.textContent = level.description;
};

compressionLevelSelect?.addEventListener("change", updateCompressionHint);
updateCompressionHint();

button.addEventListener("click", async () => {
  const input = document.querySelector("#fileInput");
  const files = input?.files;

  const gallery = document.querySelector("#gallery");
  const zipContainer = document.querySelector("#zip-download");
  const isCompress = mode === "compress";
  const labels = ACTION_LABELS[mode];
  const formatSelect = document.querySelector("#formatSelect");
  const outputExt = isCompress ? "mp4" : formatSelect?.value || "mp4";
  const config = FORMAT_CONFIG[outputExt];
  const fastMode = document.querySelector("#fastMode")?.checked || false;
  const compressionLevel = document.querySelector("#compressionLevel")?.value || "balanced";

  // Limpieza UI
  if (gallery) gallery.innerHTML = "";
  if (zipContainer) zipContainer.innerHTML = "";

  if (!files || files.length === 0) {
    setStatus(`Elegí al menos un video antes de ${isCompress ? "comprimir" : "convertir"}.`, "error");
    return;
  }

  button.disabled = true;

  try {
    const engine = getClient();

    setStatus("Cargando motor de conversión (FFmpeg)... puede tardar unos segundos la primera vez.", "loading");
    engine.onProgress = null;
    await engine.load();

    const zip = new JSZip();
    let convertedCount = 0;

    for (const file of files) {
      const inExt = getExtension(file.name);
      const inputName = `input.${inExt}`;
      const outputName = `output.${outputExt}`;

      try {
        const buffer = new Uint8Array(await file.arrayBuffer());
        await engine.writeFile(inputName, buffer);

        engine.onProgress = null;
        let data = null;

        // Intento rápido: copiar los streams sin recodificar (casi
        // instantáneo). Solo mapeamos video+audio (no subtítulos/timecode/
        // metadata) porque esas pistas suelen ser las que el contenedor de
        // destino rechaza con "codec not supported in container". Además,
        // solo aceptamos el resultado si el códec de video de origen es uno
        // ampliamente compatible (p. ej. H.264): copiar tal cual un origen
        // HEVC/H.265 (típico de iPhone) produciría un archivo con la
        // extensión correcta pero que muchos reproductores (Windows Media
        // Player sin extensiones pagas, etc.) no pueden reproducir. En
        // cualquier otro caso recodificamos abajo. En modo compresión nunca
        // copiamos: el objetivo es siempre recodificar para reducir el peso.
        if (!isCompress && !config.isGif) {
          setStatus(`Analizando ${file.name}...`, "loading");
          try {
            const { ret, logs } = await engine.execWithLogs([
              "-i",
              inputName,
              "-map",
              "0:v:0?",
              "-map",
              "0:a:0?",
              "-c",
              "copy",
              outputName,
            ]);
            const sourceCodec = detectVideoCodec(logs);
            const safeCodecs = SAFE_COPY_VIDEO_CODECS[outputExt];
            const codecIsSafe = !sourceCodec || !safeCodecs || safeCodecs.includes(sourceCodec);
            if (ret === 0 && codecIsSafe) {
              const probe = await engine.readFile(outputName);
              if (probe && probe.length > 0) data = probe;
            }
          } catch {
            // No se pudo copiar sin recodificar, seguimos abajo con el fallback.
          }
        }

        if (!data) {
          try {
            await engine.deleteFile(outputName);
          } catch {}

          setStatus(`${labels.verb} ${file.name} (0%)...`, "loading");
          engine.onProgress = (progressData) => {
            const pct = Math.min(100, Math.max(0, Math.round((progressData?.progress || 0) * 100)));
            setStatus(`${labels.verb} ${file.name} (${pct}%)...`, "loading");
          };

          const transcodeArgs = isCompress ? buildCompressArgs(compressionLevel) : buildTranscodeArgs(outputExt, fastMode);
          const args = ["-i", inputName, ...transcodeArgs, outputName];
          await engine.exec(args);
          data = await engine.readFile(outputName);
        }

        engine.onProgress = null;
        const blob = new Blob([data.buffer], { type: config.mime });
        const outName = replaceExtension(file.name, outputExt);

        const container = document.createElement("div");
        container.classList.add("video-container");

        if (outputExt === "gif") {
          const preview = document.createElement("img");
          preview.classList.add("gif-preview");
          preview.src = URL.createObjectURL(blob);
          container.appendChild(preview);
        } else {
          const preview = document.createElement("video");
          preview.src = URL.createObjectURL(blob);
          preview.controls = true;
          container.appendChild(preview);
        }

        const label = document.createElement("p");
        label.classList.add("result-name");
        label.textContent = outName;
        container.appendChild(label);

        if (isCompress) {
          const reduction = Math.round((1 - blob.size / file.size) * 100);
          const sizeInfo = document.createElement("p");
          sizeInfo.classList.add("result-size");
          sizeInfo.textContent =
            reduction > 0
              ? `${formatBytes(file.size)} → ${formatBytes(blob.size)} (-${reduction}%)`
              : `${formatBytes(file.size)} → ${formatBytes(blob.size)}`;
          container.appendChild(sizeInfo);
        }

        if (files.length === 1) {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = outName;
          a.textContent = `Descargar .${outputExt}`;
          container.appendChild(a);
        } else {
          zip.file(outName, blob);
        }

        if (gallery) gallery.appendChild(container);
        convertedCount++;
      } catch (err) {
        console.error(err);
        const detail = engine.lastErrorLine();
        addWarning(gallery, detail ? `${labels.failPrefix}: ${file.name} (${detail})` : `${labels.failPrefix}: ${file.name}`);
      } finally {
        try {
          await engine.deleteFile(inputName);
        } catch {}
        try {
          await engine.deleteFile(outputName);
        } catch {}
      }
    }

    engine.onProgress = null;

    if (files.length > 1 && convertedCount > 0) {
      setStatus("Generando archivo .zip...", "loading");
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const zipLink = document.createElement("a");
      zipLink.href = URL.createObjectURL(zipBlob);
      zipLink.download = `${labels.zipName}_${outputExt}.zip`;
      zipLink.textContent = "Descargar .zip";
      if (zipContainer) zipContainer.appendChild(zipLink);
    }

    setStatus(
      convertedCount > 0
        ? convertedCount === files.length
          ? labels.doneAll
          : labels.doneSome(convertedCount, files.length)
        : labels.doneNone,
      convertedCount > 0 ? "success" : "error"
    );
  } catch (err) {
    console.error(err);
    setStatus("Ocurrió un error cargando o ejecutando FFmpeg. Revisá la consola para más detalles.", "error");
  } finally {
    button.disabled = false;
  }
});
