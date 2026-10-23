/*
    File Purpose:
        - Renders the active PDF inside the editor using PDF.js
        - Creates a selectable text layer over each rendered PDF page
        - Prepares the editor for future tools such as highlighting,
          text modification, and annotations

    Supporting Files:
        - Template: app/templates/editor.html
        - CSS: app/static/css/editor.css
        - Python:
            - app/routes/editor.py

    Notes:
        - The PDF URL is passed into the page through the
          data-pdf-url attribute in editor.html
        - Each PDF page is rendered to a canvas
        - A PDF.js text layer is placed over the canvas so users
          can select and copy text from the document

    Problems:
        - Editing tools are not functional yet
        - Selected text cannot yet be permanently highlighted
        - Save/export functionality has not been implemented

    Stuff to add:
        - Highlight selected text
        - Add text functionality
        - Remove annotations or edits
        - Save/export edited PDF
*/

import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.4.299/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.4.299/pdf.worker.min.mjs";

document.addEventListener("DOMContentLoaded", () => {
    const documentSelect = document.getElementById("editor-document-select");
    const pagesContainer = document.getElementById("pdf-pages");
    const loadingMessage = document.getElementById("editor-loading");
    const errorMessage = document.getElementById("editor-error");
    const filenameElement = document.getElementById("editor-filename");

    const toolButtons = document.querySelectorAll("[data-tool]");

    let currentPdf = null;
    let renderSequence = 0;

    /**
     * Display an error message.
     */
    function showError(message) {
        if (errorMessage) {
            errorMessage.textContent = message;
            errorMessage.hidden = false;
        }

        if (loadingMessage) {
            loadingMessage.hidden = true;
        }
    }

    /**
     * Clear the error message.
     */
    function clearError() {
        if (errorMessage) {
            errorMessage.textContent = "";
            errorMessage.hidden = true;
        }
    }

    /**
     * Display or hide the loading message.
     */
    function setLoading(isLoading) {
        if (loadingMessage) {
            loadingMessage.hidden = !isLoading;
        }
    }

    /**
     * Remove previously rendered PDF pages.
     */
    function clearPages() {
        if (pagesContainer) {
            pagesContainer.innerHTML = "";
        }
    }

    /**
     * Update the displayed filename.
     */
    function updateFilename(filename) {
        if (filenameElement) {
            filenameElement.textContent = filename || "PDF Editor";
        }

        document.title = filename
            ? `${filename} - PDF Editor`
            : "PDF Editor";
    }

    /**
     * Get the currently selected document option.
     */
    function getSelectedDocument() {
        if (!documentSelect) {
            return null;
        }

        const selectedOption = documentSelect.options[
            documentSelect.selectedIndex
        ];

        if (!selectedOption || !selectedOption.value) {
            return null;
        }

        return {
            id: selectedOption.value,
            filename: selectedOption.textContent.trim(),
            fileUrl: selectedOption.dataset.fileUrl
        };
    }

    /**
     * Render one PDF page.
     */
    async function renderPage(pdf, pageNumber, sequence) {
        if (sequence !== renderSequence) {
            return;
        }

        const page = await pdf.getPage(pageNumber);

        if (sequence !== renderSequence) {
            return;
        }

        const scale = 1.25;
        const viewport = page.getViewport({ scale });

        const pageWrapper = document.createElement("div");
        pageWrapper.className = "pdf-page";
        pageWrapper.dataset.pageNumber = String(pageNumber);

        pageWrapper.style.width = `${viewport.width}px`;
        pageWrapper.style.height = `${viewport.height}px`;

        const canvas = document.createElement("canvas");
        canvas.className = "pdf-canvas";

        const context = canvas.getContext("2d");

        const pixelRatio = window.devicePixelRatio || 1;

        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);

        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        pageWrapper.appendChild(canvas);

        const textLayerContainer = document.createElement("div");
        textLayerContainer.className = "textLayer";

        textLayerContainer.style.width = `${viewport.width}px`;
        textLayerContainer.style.height = `${viewport.height}px`;

        pageWrapper.appendChild(textLayerContainer);

        pagesContainer.appendChild(pageWrapper);

        await page.render({
            canvasContext: context,
            viewport: viewport,
            transform: pixelRatio !== 1
                ? [pixelRatio, 0, 0, pixelRatio, 0, 0]
                : null
        }).promise;

        if (sequence !== renderSequence) {
            pageWrapper.remove();
            return;
        }

        const textContent = await page.getTextContent();

        if (sequence !== renderSequence) {
            pageWrapper.remove();
            return;
        }

        const textLayer = new pdfjsLib.TextLayer({
            textContentSource: textContent,
            container: textLayerContainer,
            viewport: viewport
        });

        await textLayer.render();

        if (sequence !== renderSequence) {
            pageWrapper.remove();
        }
    }

    /**
     * Load and render all pages of a selected PDF.
     */
    async function loadPdf(fileUrl, filename) {
        if (!fileUrl) {
            showError("No PDF file URL was provided.");
            return;
        }

        const sequence = ++renderSequence;

        clearError();
        clearPages();
        setLoading(true);

        updateFilename(filename);

        if (currentPdf) {
            try {
                await currentPdf.destroy();
            } catch (error) {
                console.warn("Could not destroy previous PDF:", error);
            }

            currentPdf = null;
        }

        try {
            const loadingTask = pdfjsLib.getDocument({
                url: fileUrl
            });

            const pdf = await loadingTask.promise;

            if (sequence !== renderSequence) {
                await pdf.destroy();
                return;
            }

            currentPdf = pdf;

            for (
                let pageNumber = 1;
                pageNumber <= pdf.numPages;
                pageNumber++
            ) {
                if (sequence !== renderSequence) {
                    return;
                }

                await renderPage(pdf, pageNumber, sequence);
            }

            if (sequence === renderSequence) {
                setLoading(false);
            }
        } catch (error) {
            if (sequence !== renderSequence) {
                return;
            }

            console.error("PDF loading failed:", error);

            clearPages();

            showError(
                "Unable to load this PDF. Check that the file exists and try again."
            );
        } finally {
            if (sequence === renderSequence) {
                setLoading(false);
            }
        }
    }

    /**
     * Tell Flask which PDF is currently selected.
     */
    async function setCurrentDocument(documentId) {
        const response = await fetch("/documents/current", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                document_id: documentId
            })
        });

        let data = {};

        try {
            data = await response.json();
        } catch (error) {
            console.warn("Could not read document selection response:", error);
        }

        if (!response.ok) {
            throw new Error(
                data.message || "Could not update the selected PDF."
            );
        }

        return data;
    }

    /**
     * Select a PDF, update Flask session, and render it.
     */
    async function selectDocument(documentId) {
        const selectedDocument = getSelectedDocument();

        if (
            !selectedDocument ||
            selectedDocument.id !== documentId
        ) {
            return;
        }

        if (!selectedDocument.fileUrl) {
            showError("The selected PDF does not have a file URL.");
            return;
        }

        clearError();
        setLoading(true);

        try {
            await setCurrentDocument(documentId);

            // The selection may have changed while the request was running.
            const latestDocument = getSelectedDocument();

            if (
                !latestDocument ||
                latestDocument.id !== documentId
            ) {
                return;
            }

            await loadPdf(
                latestDocument.fileUrl,
                latestDocument.filename
            );
        } catch (error) {
            console.error("Document selection failed:", error);

            showError(
                error.message || "Could not select this PDF."
            );
        }
    }

    /**
     * Switch between uploaded PDFs.
     */
    if (documentSelect) {
        documentSelect.addEventListener("change", async () => {
            const selectedDocument = getSelectedDocument();

            if (!selectedDocument) {
                clearPages();
                updateFilename("");
                return;
            }

            await selectDocument(selectedDocument.id);
        });
    }

    /**
     * Tool button selection.
     *
     * These buttons only update the selected tool.
     * Actual editing actions are not implemented here.
     */
    toolButtons.forEach((button) => {
        button.addEventListener("click", () => {
            toolButtons.forEach((otherButton) => {
                otherButton.classList.remove("active");
                otherButton.setAttribute("aria-pressed", "false");
            });

            button.classList.add("active");
            button.setAttribute("aria-pressed", "true");
        });
    });

    /**
     * Load the PDF selected by the server-rendered template.
     */
    const initialDocument = getSelectedDocument();

    if (initialDocument) {
        loadPdf(
            initialDocument.fileUrl,
            initialDocument.filename
        );
    } else {
        setLoading(false);
        showError("No PDF is selected.");
    }
});