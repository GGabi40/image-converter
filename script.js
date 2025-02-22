const button = document.querySelector("#convertBtn");
button.addEventListener("click", () => {
  const files = document.querySelector("#fileInput").files;
  const gallery = document.querySelector("#gallery");
  const divDownload = document.querySelector('#zip-download');
  gallery.innerHTML = ""; // limpia la galería
  
  if(divDownload) divDownload.innerText = "";

  if (files.length === 0) {
    alert("Por favor, subí al menos 1 imagen.");
    return;
  }

  const zip = new JSZip();
  let processedImages = 0;

  for (let file of files) {
    const reader = new FileReader();
    reader.onload = function (ev) {
      const img = new Image();
      img.src = ev.target.result; // image en formato base64 (Texto ASCII)

      img.onload = function () {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        if (files.length > 1) {
          canvas.toBlob(
            (blob) => {
              const webpFileName = file.name.replace(
                /\.(png|jpeg|jpg)$/i,
                ".webp"
              );
              zip.file(webpFileName, blob);
              const container = document.createElement("div");
              container.classList.add("image-container");

              const convertedImg = document.createElement("img");
              convertedImg.src = URL.createObjectURL(blob);

              container.appendChild(convertedImg);
              gallery.appendChild(container);

              processedImages++;

              // Si todas las imágenes están procesadas, descargar ZIP
              if (processedImages === files.length) {
                zip.generateAsync({ type: "blob" }).then((zipBlob) => {
                  const zipLink = document.createElement("a");
                  zipLink.href = URL.createObjectURL(zipBlob);
                  zipLink.download = "imagenes_webp.zip";
                  zipLink.innerText = 'Descargar .zip';
                  divDownload.appendChild(zipLink);
                });
              }
            },
            "image/webp",
            0.9
          );
        } else {
          // lo convierte a WebP
          const webpURL = canvas.toDataURL("image/webp", 0.9);

          // contenedor
          const container = document.createElement("div");
          container.classList.add("image-container");

          // muestra imagen
          const convertedImage = document.createElement("img");
          convertedImage.src = webpURL;

          // enlace para descargarla
          const downloadL = document.createElement("a");
          downloadL.href = webpURL;
          downloadL.download = file.name.replace(/\.(png|jpeg|jpg)$/i, ".webp");
          downloadL.innerText = "Desargar WebP";

          // agg elementos al contenedor y a galería
          container.appendChild(convertedImage);
          container.appendChild(downloadL);
          gallery.appendChild(container);
        }
      };
    };

    reader.readAsDataURL(file);
  }
});
