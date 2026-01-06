# Image Converter ↔️ PNG · JPG · WebP · ZIP

This project allows users to convert images between `.png`, `.jpeg`, `.jpg`, and `.webp` formats directly in the browser.  
It uses the `<canvas>` element to process images and provides an instant download link for each converted file.  
If multiple images are uploaded, they are compressed into a `.zip` file for easy download.

---

## Features

- Convert images between `.png`, `.jpeg`, `.jpg`, and `.webp` formats.
- Supports multiple image uploads at once.
- Allows selecting the output format (PNG / JPG / WebP).
- Provides a preview of the converted images.
- Generates a `.zip` file when downloading multiple images.
- No need to install software — works directly in the browser.

## Technologies Used

- **HTML**: Structure of the webpage.
- **JavaScript**: Image processing and conversion using `<canvas>`.
- **JSZip** – ZIP file generation for batch downloads

---

## How to Use

1. Upload one or more `.png`, `.jpg`, `.jpeg`, or `.webp` images.
2. Select the desired output format.
3. Click the convert button.
4. Download each converted image individually or all as a `.zip` file.

## How It Works

1. When an image file is uploaded, a `FileReader` reads its content.
2. The image is drawn onto an invisible `<canvas>`.
3. The canvas converts the image to the selected format using `canvas.toBlob()`.
4. A preview of the converted image is displayed.
5. A download link is created for each converted image, and if multiple images are uploaded, a `.zip` file is generated for batch downloading.

## Visit it Online

You can try the tool here:  
👉 [Image Converter](https://ggabi40.github.io/image-converter/)

Developed with ❤️ by **GGabi40**.
