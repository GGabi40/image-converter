// script.js

const button = document.querySelector("#convertBtn");

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

button.addEventListener("click", () => {
  const input = document.querySelector("#fileInput");
  const files = input?.files;

  const gallery = document.querySelector("#gallery");
  const zipContainer = document.querySelector("#zip-download");

  // Limpieza UI
  if (gallery) gallery.innerHTML = "";
  if (zipContainer) zipContainer.innerHTML = "";

  if (!files || files.length === 0) {
    alert("Por favor, subí al menos 1 imagen.");
    return;
  }

  // Formato de salida (requiere que agregues <select id="formatSelect"> en el HTML)
  const formatSelect = document.querySelector("#formatSelect");
  const outputMime = formatSelect?.value || "image/webp";

  // Para zip (múltiples)
  const zip = new JSZip();
  let processed = 0;

  for (const file of files) {
    // Validación rápida (por si suben algo raro)
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
      processed++;
      if (gallery) {
        const warn = document.createElement("p");
        warn.textContent = `⚠️ Archivo no soportado: ${file.name}`;
        gallery.appendChild(warn);
      }
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
              alert(`No se pudo convertir: ${file.name}`);
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

            // Cuando termina todo, genero zip
            if (files.length > 1 && processed === files.length) {
              zip.generateAsync({ type: "blob" }).then((zipBlob) => {
                const zipLink = document.createElement("a");
                zipLink.href = URL.createObjectURL(zipBlob);

                // Nombre del zip según formato elegido
                zipLink.download = `imagenes_convertidas_${mimeToExt(outputMime)}.zip`;
                zipLink.textContent = "Descargar .zip";

                if (zipContainer) zipContainer.appendChild(zipLink);
              });
            }
          },
          outputMime,
          quality
        );
      };

      img.onerror = () => {
        processed++;
        if (gallery) {
          const warn = document.createElement("p");
          warn.textContent = `⚠️ No se pudo cargar la imagen: ${file.name}`;
          gallery.appendChild(warn);
        }
      };

      img.src = ev.target.result;
    };

    reader.onerror = () => {
      processed++;
      if (gallery) {
        const warn = document.createElement("p");
        warn.textContent = `⚠️ No se pudo leer el archivo: ${file.name}`;
        gallery.appendChild(warn);
      }
    };

    reader.readAsDataURL(file);
  }
});
