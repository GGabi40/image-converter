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

    this.worker.onmessage = (event) => {
      const { id, type, result, error, data } = event.data;

      if (type === "progress") {
        if (this.onProgress) this.onProgress(data);
        return;
      }

      if (type === "log") return;

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

  exec(args) {
    return this.send("exec", { args });
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

const setStatus = (text) => {
  const status = document.querySelector("#status");
  if (status) status.textContent = text;
};

const button = document.querySelector("#convertBtn");

button.addEventListener("click", async () => {
  const input = document.querySelector("#fileInput");
  const files = input?.files;

  const gallery = document.querySelector("#gallery");
  const zipContainer = document.querySelector("#zip-download");
  const formatSelect = document.querySelector("#formatSelect");
  const outputExt = formatSelect?.value || "mp4";
  const config = FORMAT_CONFIG[outputExt];
  const fastMode = document.querySelector("#fastMode")?.checked || false;

  // Limpieza UI
  if (gallery) gallery.innerHTML = "";
  if (zipContainer) zipContainer.innerHTML = "";

  if (!files || files.length === 0) {
    alert("Por favor, subí al menos 1 video.");
    return;
  }

  button.disabled = true;

  try {
    const engine = getClient();

    setStatus("Cargando motor de conversión (FFmpeg)... puede tardar unos segundos la primera vez.");
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
        // instantáneo). Solo funciona si el códec de origen es compatible
        // con el contenedor de destino; si no, FFmpeg falla y recodificamos.
        if (!config.isGif) {
          setStatus(`Analizando ${file.name}...`);
          try {
            const ret = await engine.exec(["-i", inputName, "-map", "0", "-c", "copy", outputName]);
            if (ret === 0) {
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

          setStatus(`Convirtiendo ${file.name} (0%)...`);
          engine.onProgress = (progressData) => {
            const pct = Math.min(100, Math.max(0, Math.round((progressData?.progress || 0) * 100)));
            setStatus(`Convirtiendo ${file.name} (${pct}%)...`);
          };

          const args = ["-i", inputName, ...buildTranscodeArgs(outputExt, fastMode), outputName];
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
        label.textContent = outName;
        container.appendChild(label);

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
        if (gallery) {
          const warn = document.createElement("p");
          warn.textContent = `⚠️ No se pudo convertir: ${file.name}`;
          gallery.appendChild(warn);
        }
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
      setStatus("Generando archivo .zip...");
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const zipLink = document.createElement("a");
      zipLink.href = URL.createObjectURL(zipBlob);
      zipLink.download = `videos_convertidos_${outputExt}.zip`;
      zipLink.textContent = "Descargar .zip";
      if (zipContainer) zipContainer.appendChild(zipLink);
    }

    setStatus(convertedCount > 0 ? "¡Conversión completa!" : "No se pudo convertir ningún archivo.");
  } catch (err) {
    console.error(err);
    setStatus("Ocurrió un error cargando o ejecutando FFmpeg. Revisá la consola para más detalles.");
  } finally {
    button.disabled = false;
  }
});
