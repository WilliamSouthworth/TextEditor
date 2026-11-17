/*
 * PDF Converter
 *
 * Features:
 * - Choose an uploaded PDF and a target file type.
 * - Send the request to Flask and download the converted file
 * - Show loading, status, and error messages.
 */

"use strict"

document.addEventListener("DOMContentLoaded", () => {
    const app = document.getElementById("convert-app");

    if(!app) {
        return;
    }

    const form = document.getElementById("convert-form");

    const documentSelect = document.getElementById(
        "convert-document-select"
    );

    const formatSelect = document.getElementById(
        "convert-format-select"
    );

    const submitButton = document.getElementById(
        "convert-submit"
    );

    const statusElement = document.getElementById(
        "convert-status"
    );

    const errorElement = document.getElementById(
        "convert-error"
    );

    const convertUrl = app.dataset.convertUrl;

    if (
        !form ||
        !documentSelect ||
        !formatSelect ||
        !submitButton ||
        !statusElement ||
        !errorElement ||
        !convertUrl
    ) {
        console.error(
            "The PDF converter template is missing required elements."
        );

        return;
    }

    const readyLabel = submitButton.textContent.trim();

    let isConverting = false;

    //Helpers

    function showError(message) {
        errorElement.textContent = message;
        errorElement.hidden = false;
    }

    function clearError() {
        errorElement.textContent = "";
        errorElement.hidden = true;
    }

    function setStatus(message) {
        statusElement.textContent = message;
        statusElement.hidden = !message;
    }

    function setBusy(isBusy) {
        isConverting = isBusy;

        submitButton.disabled = isBusy;
        documentSelect.disabled = isBusy;
        formatSelect.disabled = isBusy;

        submitButton.textContent = isBusy ? "Converting..." : readyLabel;
    }

    function getSelectedFilename() {
        const option = documentSelect.options[documentSelect.selectedIndex];

        return option ? option.textContent.trim() : "";
    }

    function getExtension(format) {
        return format === "png" ? "zip" : format;
    }

    function getDownloadName(response, format) {
        const header = response.headers.get("Content-Disposition") || "";

        const encoded = header.match(
            /filename\*=UTF-8''([^;]+)/i
        );

        if (encoded) {
            try {
                return decodeURIComponent(encoded[1]);
            }
            catch (_) {

            }
        }

        const plain = header.match(/filename="?([^";]+)"?/i);

        if (plain) {
            return plain[1];
        }

        const baseName = getSelectedFilename()
            .replace(/\.pdf$/i, "")
            .replace(/[\\/:*?"<>|]/g, "_") || "document";

        return `${baseName}.${getExtension(format)}`;
    }

    async function readErrorMessage(response) {
        try {
            const result = await response.json();

            if (result.error) {
                return result.error;
            }

            if (result.message) {
                return result.message;
            }
        }
        catch(_) {

        }
        return "Could not convert the PDF. Please try again."
    }

    function downloadBlob(blob, filename) {
        const downloadUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");

        anchor.href = downloadUrl;
        anchor.download = filename;

        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();

        window.setTimeout(() => {
            URL.revokeObjectURL(downloadUrl);
        }, 1500);
    }

    async function convertPdf(event) {
        event.preventDefault();

        if (isConverting) {
            return;
        }

        const documentId = documentSelect.value;
        const format = formatSelect.value;

        clearError();

        if(!documentId) {
            showError("select a PDF to convert.")
            return;
        }

        if(!format) {
            showError("Select a file type.");
            return;
        }

        setBusy(true);
        setStatus("Converting your PDF. Large files can take a moment...");

        try {
            const response = await fetch(convertUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                }, 
                credentials: "same-origin",
                body: JSON.stringify({
                    document_id: documentId,
                    format: format
                })
            });

            if (!response.ok) {
                throw new Error(await readErrorMessage(response));
            }

            const blob = await response.blob();

            if (!blob.size) {
                throw new Error(
                    "The server returned an empty file."
                );
            }

            const filename = getDownloadName(response, format);

            downloadBlob(blob, filename);

            setStatus(
                `Downloaded ${filename}. ` +
                "The original uploaded PDF was not changed."
            );
        }
        catch(error) {
            console.error("Failed to convert the PDF:", error);

            showError(
                error.message || 
                "An unexpected error occurred while converting."
            );

            setStatus("Could not convert the PDF.");
        } finally{
            setBusy(false);
        }
    }

    form.addEventListener("submit", convertPdf);

    [documentSelect, formatSelect].forEach((select) => {
        select.addEventListener("change", () => {
            clearError();
            setStatus("");
        });
    });

    setStatus("");
});