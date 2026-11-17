"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const app = document.getElementById("split-app");

    if (!app) {
        return;
    }

    const documentSelect = document.getElementById(
        "split-document-select"
    );

    const pageGrid = document.getElementById(
        "split-page-grid"
    );

    const statusElement = document.getElementById(
        "split-status"
    );

    const errorElement = document.getElementById(
        "split-error"
    );

    const pageCountElement = document.getElementById(
        "split-page-count"
    );

    const selectAllButton = document.getElementById(
        "split-select-all"
    );

    const clearButton = document.getElementById("split-clear");
    const saveButton = document.getElementById("split-save");

    const bottomSaveButton = document.getElementById(
        "split-save-bottom"
    );

    const saveButtons = [
        saveButton,
        bottomSaveButton
    ].filter(Boolean);

    const extractUrl = app.dataset.extractUrl;

    const pdfjsLib = window.pdfjsLib;

    if (
        !documentSelect ||
        !pageGrid ||
        !statusElement ||
        !errorElement ||
        !pageCountElement ||
        !selectAllButton ||
        !clearButton ||
        !saveButton ||
        !extractUrl
    ) {
        console.error(
            "The PDF splitter template is missing required elements."
        );

        return;
    }

    if (!pdfjsLib) {
        showError(
            "PDF.js could not load. Check your internet connection " + 
            "and reload the page."
        );

        return;
    }

    pdfjsLib.GlobalWorkerOptions.workerSrc = 
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

    const selectionsByDocument = new Map();

    let activeSelection = new Set();
    let totalPages = 0;
    let currentPdf = null;

    let documentLoadSequence = 0;
    let thumbnailRenderSequence = 0;

    let isLoading = false;
    let isSaving = false;

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
    }

    function getSelectedDocument() {
        const option = 
            documentSelect.options[documentSelect.selectedIndex];

        if (!option || !option.value) {
            return null;
        }

        return {
            id: String(option.value),
            filename:
                option.dataset.filename ||
                option.textContent.trim(),
            fileUrl: option.dataset.fileUrl || ""
        };
    }

    function getSortedSelection() {
        return Array.from(activeSelection).sort((a,b) => a -b);
    }

    function updateControls() {
        const busy = isLoading || isSaving;
        const hasPages = totalPages > 0;
        const selectedCount = activeSelection.size;

        selectAllButton.disabled = 
            busy ||
            !hasPages ||
            selectedCount === totalPages;

        clearButton.disabled = 
            busy ||
            selectedCount === 0;

        const canSave = !busy && selectedCount > 0;

        saveButtons.forEach((button) => {
            button.disabled = !canSave;
        });

        documentSelect.disabled = busy;
    }

    function updateSummary() {
        if (totalPages === 0) {
            pageCountElement.textContent = "No PDF loaded";
            updateControls();
            return;
        }

        pageCountElement.textContent = 
            `${activeSelection.size} of ${totalPages} pages selected`;

        updateControls();
    }

    function applyCardState(card, isSelected) {
        card.classList.toggle("is-selected", isSelected);
        card.setAttribute("aria-checked", String(isSelected));

        const checkbox = card.querySelector(
            ".split-page-checkbox"
        );

        if (checkbox) {
            checkbox.checked = isSelected;
        }
    }

    function setPageSelected(pageNumber, isSelected) {
        if(isSelected) {
            activeSelection.add(pageNumber);
        }
        else {
            activeSelection.delete(pageNumber);
        }

        const card = pageGrid.querySelector(
            `.split-page-card[data-page-number = "${pageNumber}"]`
        );

        if (card) {
            applyCardState(card, isSelected);
        }

        updateSummary();
    }

    function selectAllPages() {
        if (isLoading || isSaving || totalPages === 0) {
            return;
        }

        clearError();

        for(let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
            activeSelection.add(pageNumber);
        }

        pageGrid.querySelectorAll(".split-page-card").forEach(
            (card) => applyCardState(card, true)
        );

        setStatus("All pages selected.");
        updateSummary();
    }

    function clearSelection() {
        if (isLoading || isSaving) {
            return;
        }

        clearError();

        activeSelection.clear();

        pageGrid.querySelectorAll(".split-page-card").forEach(
            (card) => applyCardState(card,false)
        );

        setStatus("Selection cleared.");
        updateSummary();
    }

    function createPageCard(pageNumber) {
        const isSelected = activeSelection.has(pageNumber);

        const card = document.createElement("article");

        card.className = "split-page-card";
        card.dataset.pageNumber = String(pageNumber);
        card.tabIndex = 0;
        card.setAttribute("role", "checkbox");
        card.setAttribute(
            "aria-label", 
            `Page ${pageNumber}`
        );

        const header = document.createElement("div");
        header.className = "split-page-card-header";

        const pageLabel = document.createElement("span");
        pageLabel.className = "split-page-number";
        pageLabel.textContent = `Page ${pageNumber}`;

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "split-page-checkbox";
        checkbox.setAttribute(
            "aria-label",
            `Select page ${pageNumber}`
        );

        header.append(pageLabel, checkbox);

        const thumbnailContainer = 
            document.createElement("div");

        thumbnailContainer.className = 
            "split-thumbnail-container";
        
        const canvas = document.createElement("canvas");
        canvas.className = "split-thumbnail-canvas";

        const placeholder = document.createElement("div");
        placeholder.className = "split-thumbnail-placeholder";
        placeholder.textContent = "Rendering preview...";

        thumbnailContainer.append(placeholder, canvas);

        card.append(header, thumbnailContainer);

        applyCardState(card, isSelected);

        return card;
    }

    function buildPageGrid() {
        pageGrid.replaceChildren();

        const fragment = document.createDocumentFragment();

        for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
            fragment.appendChild(createPageCard(pageNumber));
        }

        pageGrid.appendChild(fragment);
    }

    async function renderThumbnail(card, sequence) {
        const canvas = card.querySelector(
            ".split-thumbnail-canvas"
        );

        const placeholder = card.querySelector(
            ".split-thumbnail-placeholder"
        );

        const pageNumber = Number(card.dataset.pageNumber);

        if (
            !currentPdf ||
            sequence !== thumbnailRenderSequence
        ) {
            return;
        }

        try {
            const page = await currentPdf.getPage(pageNumber);

            if (sequence !== thumbnailRenderSequence) {
                return;
            }

            const initialViewport = page.getViewport({
                scale: 1
            });

            const maxWidth = 160;
            const maxHeight = 220;

            const scale = Math.min(
                maxWidth / initialViewport.width,
                maxHeight / initialViewport.height
            );

            const pixelRatio = window.devicePixelRatio || 1;

            const displayViewport = page.getViewport({scale});

            const renderViewport = page.getViewport({
                scale: scale * pixelRatio
            });

            canvas.width = Math.ceil(renderViewport.width);
            canvas.height = Math.ceil(renderViewport.height);

            canvas.style.width = `${displayViewport.width}px`;
            canvas.style.height = `${displayViewport.height}px`;

            const context = canvas.getContext("2d");

            if (!context) {
                throw new Error(
                    "Could not create the page preview canvas."
                );
            }

            await page.render({
                canvasContext: context,
                viewport: renderViewport
            }).promise;

            if (sequence !== thumbnailRenderSequence) {
                return;
            }

            if (placeholder) {
                placeholder.remove();
            }
        } 
        catch (error) {
            if (sequence !== thumbnailRenderSequence) {
                return;
            }

            console.error(
                `Failed to render PDF page ${pageNumber}:`,
                error
            );

            if (placeholder) {
                placeholder.textContent = "Preview unavailable";
            }

            canvas.style.display = "none";
        }

    }

    async function renderThumbnails(sequence) {
        const cards = Array.from(
            pageGrid.querySelectorAll(".split-page-card")
        );

        for (const card of cards) {
            if (sequence !== thumbnailRenderSequence) {
                return;
            }

            await renderThumbnail(card, sequence);
        }
    }

    async function loadSelectedDocument() {
        const selected = getSelectedDocument();

        if (!selected || !selected.fileUrl) {
            showError("Select a PDF to split.");
            return;
        }

        const sequence =  ++documentLoadSequence;

        thumbnailRenderSequence += 1;

        isLoading = true;
        clearError();

        pageGrid.replaceChildren();

        totalPages = 0;
        activeSelection = new Set();

        const previousPDF = currentPdf;
        currentPdf = null;

        pageCountElement.textContent = "Loading pages...";
        setStatus(`Loading ${selected.filename}...`);

        updateControls();

        if (previousPDF) {
            try {
                await previousPDF.destroy();
            }
            catch (error) {
                console.warn(
                    "Could not close the previous PDF:",
                    error
                );
            }
        }

        let newPdf = null;

        try {
            const loadingTask = pdfjsLib.getDocument({
                url: selected.fileUrl
            });

            newPdf = await loadingTask.promise;

            if(sequence !== documentLoadSequence) {
                await newPdf.destroy();
                return;
            }

            currentPdf = newPdf;
            totalPages = newPdf.numPages;

            if (!selectionsByDocument.has(selected.id)) {
                selectionsByDocument.set(selected.id, new Set());
            }

            activeSelection = selectionsByDocument.get(selected.id);

            Array.from(activeSelection).forEach((pageNumber) => {
                if (pageNumber > totalPages) {
                    activeSelection.delete(pageNumber);
                }
            });

            buildPageGrid();

            isLoading = false;
            updateSummary();

            setStatus(
                `${totalPages} page${totalPages === 1 ? "" : "s"} loaded. ` + 
                "Rendering previews..."
            );

            const renderSequence = ++thumbnailRenderSequence;

            await renderThumbnails(renderSequence);

            if (
                sequence === documentLoadSequence &&
                renderSequence === thumbnailRenderSequence
            ) {
                setStatus(
                    "Click pages to select them, then download " + 
                    "the selected pages."
                );
            }
        }
        catch(error) {
            if (sequence !== documentLoadSequence) {
                return;
            }

            console.error("Could not load the PDF:", error);

            if (newPdf && newPdf !== currentPdf) {
                try {
                    await newPdf.destroy();
                }
                catch(_) {

                }
            }

            currentPdf = null;
            totalPages = 0;
            activeSelection = new Set();

            pageGrid.replaceChildren();
            pageCountElement.textContent = "Unable to load pages";

            showError(
                "Could not load this PDF. Check that the uploaded file " +
                "exists and is a valid PDF."
            );
        }
        finally {
            if (sequence === documentLoadSequence) {
                isLoading = false;
                updateControls();
            }
        }
    }

    function getDownloadName(response, selectedFilename) {
        const header = 
            response.headers.get("Content-Disposition") || "";

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

        const baseName = selectedFilename
            .replace(/\.pdf$/i, "")
            .replace(/[\\/:*?"<>|]/g, "_") || "document";

        return `${baseName}-split.pdf`;
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
        catch (_) {

        }

        return "Could not create the new PDF. Please try again.";
    }

    function downloadBlob(blob, filename) {
        const downloadUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");

        anchor.href = downloadUrl;
        anchor.download = filename;

        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();

        window.setTimeout(()=> {
            URL.revokeObjectURL(downloadUrl);
        }, 1500);
    }

    async function saveSelectedPages() {
        if(isSaving || isLoading || !currentPdf) {
            return;
        }

        const selected = getSelectedDocument();

        if (!selected) {
            showError("Select a PDF before downloading. ");
            return;
        }

        const pages = getSortedSelection();

        if (pages.length === 0) {
            showError("Select at least one page to keep. ");
            return;
        }

        clearError();

        isSaving = true;

        const originalButtonTexts = saveButtons.map(
            (button) => button.textContent
        );

        saveButtons.forEach((button) => {
            button.textContent = "Creating PDF...";
        });

        updateControls();

        setStatus("Creating the new PDF...");

        try {
            const response = await fetch(extractUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                credentials: "same-origin",
                body: JSON.stringify({
                    document_id: selected.id,
                    pages:pages
                })
            });

            if (!response.ok) {
                throw new Error(await readErrorMessage(response));
            }

            const blob = await response.blob();

            if(!blob.size){
                throw new Error(
                    "The server returned an empty PDF."
                );
            }

            const filename = getDownloadName(
                response,
                selected.filename
            );

            downloadBlob(blob, filename);

            setStatus(
                `Downloaded ${filename} with ${pages.length} ` +
                `page${pages.length === 1 ? "" : "s"}. `
            );
        }
        catch (error) {
            console.error("Failed to create the new PDF:", error);

            showError(
                error.message ||
                "An unexpected error occurred while creating the PDF."
            );

            setStatus("Could not create the new PDF.");
        }
        finally {
            isSaving = false;

            saveButtons.forEach((button, index) => {
                button.textContent = originalButtonTexts[index];
            });

            updateControls();
        }
    }

    documentSelect.addEventListener(
        "change",
        loadSelectedDocument
    );

    selectAllButton.addEventListener("click", selectAllPages);
    clearButton.addEventListener("click", clearSelection);

    saveButtons.forEach((button) => {
        button.addEventListener("click", saveSelectedPages);
    });

    pageGrid.addEventListener("click", (event) => {
        if (isLoading || isSaving) {
            return;
        }

        const card = event.target.closest(".split-page-card");

        if (!card) {
            return;
        }

        const pageNumber = Number(card.dataset.pageNumber);

        clearError();

        if (event.target.classList.contains("split-page-checkbox")) {
            setPageSelected(pageNumber, event.target.checked);
            return;
        }

        setPageSelected(
            pageNumber,
            !activeSelection.has(pageNumber)
        );
    });

    pageGrid.addEventListener("keydown", (event) => {
        if (
            !event.target.classList.contains("split-page-card") ||
            isLoading ||
            isSaving 
        ) {
            return;
        }

        if (event.key !== " " && event.key !== "Enter") {
            return;
        }

        event.preventDefault();

        const pageNumber = Number(event.target.dataset.pageNumber);

        clearError();

        setPageSelected(
            pageNumber,
            !activeSelection.has(pageNumber)
        );
    });

    updateControls();

    if (documentSelect.options.length > 0) {
        loadSelectedDocument();
    }
    else {
        pageCountElement.textContent = "No PDFs available";

        setStatus(
            "Upload a PDF on the Documents page before splitting it."
        );
    }
});