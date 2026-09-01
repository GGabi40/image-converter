// script.js

const button = document.querySelector("#convertBtn");
const dropzone = document.querySelector("#dropzone");
const fileInput = document.querySelector("#fileInput");
const fileSummary = document.querySelector("#fileSummary");
const statusEl = document.querySelector("#status");

const ICON_SPINNER =
  '<svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-9-9" /></svg>';
const ICON_SUCCESS =
  '<svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>';
const ICON_WARNING =
  '<svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>';

const setStatus = (text, state) => {
  if (!statusEl) return;
  statusEl.classList.remove("is-loading", "is-success", "is-error");
  if (!text) {
    statusEl.innerHTML = "";
    return;
  }
  const icon = state === "loading" ? ICON_SPINNER : state === "success" ? ICON_SUCCESS : state === "error" ? ICON_WARNING : "";
  if (state) statusEl.classList.add(`is-${state}`);
  statusEl.innerHTML = `${icon}<span>${text}</span>`;
};

const updateFileSummary = () => {
  if (!fileSummary || !fileInput) return;
  const count = fileInput.files ? fileInput.files.length : 0;
  fileSummary.textContent =
    count === 0 ? "" : count === 1 ? `1 archivo seleccionado: ${fileInput.files[0].name}` : `${count} archivos seleccionados`;
};

if (fileInput) {
  fileInput.addEventListener("change", updateFileSummary);
}

if (dropzone && fileInput) {
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
      fileInput.files = e.dataTransfer.files;
      updateFileSummary();
    }
  });
}

const mimeToExt = (mime) => {
  switch (mime) {
    case "image/webp":
      return "webp";
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    default:
      return "webp";
  }
};

const replaceExtension = (filename, newExt) => {
  // Reemplaza .png/.jpg/.jpeg/.webp por la nueva extensión
  return filename.replace(/\.(png|jpe?g|webp)$/i, `.${newExt}`);
};

const addWarning = (gallery, text) => {
  if (!gallery) return;
  const warn = document.createElement("div");
  warn.classList.add("warning-item");
  warn.innerHTML = `${ICON_WARNING}<span>${text}</span>`;
  gallery.appendChild(warn);
};

button.addEventListener("click", () => {
  const input = document.querySelector("#fileInput");
  const files = input?.files;

  const gallery = document.querySelector("#gallery");
  const zipContainer = document.querySelector("#zip-download");

  // Limpieza UI
  if (gallery) gallery.innerHTML = "";
  if (zipContainer) zipContainer.innerHTML = "";

  if (!files || files.length === 0) {
    setStatus("Elegí al menos una imagen antes de convertir.", "error");
    return;
  }

  // Formato de salida (requiere que agregues <select id="formatSelect"> en el HTML)
  const formatSelect = document.querySelector("#formatSelect");
  const outputMime = formatSelect?.value || "image/webp";

  setStatus(files.length === 1 ? "Convirtiendo imagen..." : `Convirtiendo ${files.length} imágenes...`, "loading");
  button.disabled = true;

  // Para zip (múltiples)
  const zip = new JSZip();
  let processed = 0;
  let converted = 0;

  const checkDone = () => {
    if (processed !== files.length) return;

    button.disabled = false;

    const finish = () => {
      setStatus(
        converted > 0
          ? converted === files.length
            ? "¡Conversión completa!"
            : `Conversión completa: ${converted} de ${files.length} imágenes.`
          : "No se pudo convertir ninguna imagen.",
        converted > 0 ? "success" : "error"
      );
    };

    if (files.length > 1 && converted > 0) {
      zip.generateAsync({ type: "blob" }).then((zipBlob) => {
        const zipLink = document.createElement("a");
        zipLink.href = URL.createObjectURL(zipBlob);
        zipLink.download = `imagenes_convertidas_${mimeToExt(outputMime)}.zip`;
        zipLink.textContent = "Descargar .zip";
        if (zipContainer) zipContainer.appendChild(zipLink);
        finish();
      });
    } else {
      finish();
    }
  };

  for (const file of files) {
    // Validación rápida (por si suben algo raro)
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
      processed++;
      addWarning(gallery, `Archivo no soportado: ${file.name}`);
      checkDone();
      continue;
    }

    const reader = new FileReader();

    reader.onload = (ev) => {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;

        const ctx = canvas.getContext("2d");

        // JPG no soporta alpha → fondo blanco
        if (outputMime === "image/jpeg") {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.drawImage(img, 0, 0);

        const quality =
          outputMime === "image/jpeg" || outputMime === "image/webp" ? 0.9 : undefined;

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              processed++;
              addWarning(gallery, `No se pudo convertir: ${file.name}`);
              checkDone();
              return;
            }

            const ext = mimeToExt(outputMime);
            const outName = replaceExtension(file.name, ext);

            // Preview + link
            const container = document.createElement("div");
            container.classList.add("image-container");

            const preview = document.createElement("img");
            const blobUrl = URL.createObjectURL(blob);
            preview.src = blobUrl;
            container.appendChild(preview);

            const label = document.createElement("p");
            label.classList.add("result-name");
            label.textContent = outName;
            container.appendChild(label);

            if (files.length === 1) {
              const a = document.createElement("a");
              a.href = blobUrl;
              a.download = outName;
              a.textContent = `Descargar .${ext}`;
              container.appendChild(a);
            } else {
              // Zip para múltiples
              zip.file(outName, blob);
            }

            if (gallery) gallery.appendChild(container);

            processed++;
            converted++;
            checkDone();
          },
          outputMime,
          quality
        );
      };

      img.onerror = () => {
        processed++;
        addWarning(gallery, `No se pudo cargar la imagen: ${file.name}`);
        checkDone();
      };

      img.src = ev.target.result;
    };

    reader.onerror = () => {
      processed++;
      addWarning(gallery, `No se pudo leer el archivo: ${file.name}`);
      checkDone();
    };

    reader.readAsDataURL(file);
  }
});
