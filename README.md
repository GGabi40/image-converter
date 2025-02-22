# Image Converter to WebP

This project allows users to convert multiple `.png` or `.jpeg` images to `.webp` format directly in the browser. It uses the `<canvas>` element to process images and provides an instant download link for each converted file. If multiple images are uploaded, they are compressed into a `.zip` file for easy download.

## Features

- Convert `.png` and `.jpeg` images to `.webp` format.
- Supports multiple image uploads at once.
- Provides a preview of the converted images.
- Generates a `.zip` file when downloading multiple images.
- No need to install software—works directly in the browser.

## Technologies Used

- **HTML**: Structure of the webpage.
- **JavaScript**: Image processing and conversion using `<canvas>`.

## How to Use

1. Upload one or more `.png` or `.jpeg` images.
2. The images will be automatically converted to `.webp`.
3. Download each converted image individually or all as a `.zip` file.

## How It Works

1. When an image file is uploaded, a `FileReader` reads its content.
2. The image is drawn onto an invisible `<canvas>`.
3. The canvas converts the image to `.webp` format using `toDataURL('image/webp', 0.9)`, where `0.9` is the quality setting.
4. A preview of the converted image is displayed.
5. A download link is created for each converted image, and if multiple images are uploaded, a `.zip` file is generated for batch downloading.

## Visit it Online

You can try the tool here: [Image Converter to WebP](https://ggabi40.github.io/image-converter/)

Developed With ❤️ by GGabi40.
