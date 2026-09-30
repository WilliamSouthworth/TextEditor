const uploadForm = document.querySelector("#upload-form");
const fileInput = document.querySelector("#pdf-file");
const statusElement = document.querySelector("#status");

uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const file = fileInput.files[0];

    if (!file) {
        statusElement.textContent = "Please select a PDF.";
        return;
    }

    const formData = new FormData();
    formData.append("file", file);

    statusElement.textContent = "Uploading...";

    try {
        const response = await fetch("/upload", {
            method: "POST",
            body: formData,
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Upload failed.");
        }

        statusElement.textContent = result.message;
    } catch (error) {
        statusElement.textContent = error.message;
    }
});