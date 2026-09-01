# Image & Video Converter

This project allows users to convert images and videos between multiple formats directly in the browser — no software installation, no backend server.

## Image Converter (`index.html`)

Convert images between `.png`, `.jpeg`, `.jpg`, and `.webp` formats.  
It uses the `<canvas>` element to process images and provides an instant download link for each converted file.  
If multiple images are uploaded, they are compressed into a `.zip` file for easy download.

### Features

- Convert images between `.png`, `.jpeg`, `.jpg`, and `.webp` formats.
- Supports multiple image uploads at once.
- Allows selecting the output format (PNG / JPG / WebP).
- Provides a preview of the converted images.
- Generates a `.zip` file when downloading multiple images.
- No need to install software — works directly in the browser.

### How It Works

1. When an image file is uploaded, a `FileReader` reads its content.
2. The image is drawn onto an invisible `<canvas>`.
3. The canvas converts the image to the selected format using `canvas.toBlob()`.
4. A preview of the converted image is displayed.
5. A download link is created for each converted image, and if multiple images are uploaded, a `.zip` file is generated for batch downloading.

## Video Converter (`video.html`)

Convert videos between `.mp4`, `.webm`, `.mov`, `.avi`, `.mkv`, and `.gif` formats — entirely client-side, using [ffmpeg.wasm](https://ffmpegwasm.netlify.app/) (a WebAssembly build of FFmpeg).

### Features

- Convert videos between MP4, WebM, MOV, AVI, MKV, and GIF.
- Supports multiple video uploads at once.
- Shows real-time conversion progress.
- Provides a preview of each converted video.
- Generates a `.zip` file when converting multiple videos.
- Runs 100% in the browser — nothing is uploaded to a server.

### How It Works

1. FFmpeg's WebAssembly core is loaded lazily the first time you click "Convertir".
2. Each uploaded video is written into FFmpeg's in-memory virtual filesystem.
3. FFmpeg transcodes the video using format-appropriate codecs (e.g. libx264 for MP4/MOV/MKV, libvpx for WebM).
4. A preview and download link are generated for each converted file, and a `.zip` is created for batch downloads.

> Note: because everything runs in the browser, very large videos or long clips can be slow and memory-intensive depending on your device. For heavy workloads, a native tool like FFmpeg on your desktop will always be faster.

## Technologies Used

- **HTML**: Structure of the webpages.
- **JavaScript**: Image processing (`<canvas>`) and video transcoding (ffmpeg.wasm).
- **JSZip** – ZIP file generation for batch downloads.
- **ffmpeg.wasm** – Client-side video transcoding.

## How to Use

### Images

1. Upload one or more `.png`, `.jpg`, `.jpeg`, or `.webp` images.
2. Select the desired output format.
3. Click the convert button.
4. Download each converted image individually or all as a `.zip` file.

### Videos

1. Go to the Video Converter page.
2. Upload one or more video files.
3. Select the desired output format.
4. Click the convert button and wait for the progress to complete.
5. Download each converted video individually or all as a `.zip` file.

## Visit it Online

You can try the tool here:  
👉 [Image Converter](https://ggabi40.github.io/image-converter/)

Developed with ❤️ by **GGabi40**.
