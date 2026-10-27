/*
 * PDF Page Sorter
 *
 * Features:
 * - Render page thumbnails using PDF.js.
 * - Reorder pages through drag and drop.
 * - Rotate pages in 90-degree increments.
 * - Remove pages from the output.
 * - Undo and redo changes.
 * - Restore the original page order.
 * - Export the new PDF through Flask.
 */

"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const app = document.getElementById("sort-app");

    if (!app) {
        return;
    }

    const documentSelect = document.getElementById(
        "sort-document-select"
    );

    const pageGrid = document.getElementById(
        "sort-page-grid"
    );

    const statusElement = document.getElementById(
        "sort-status"
    );

    const errorElement = document.getElementById(
        "sort-error"
    );

    const pageCountElement = document.getElementById(
        "sort-page-count"
    );

    const undoButton = document.getElementById("sort-undo");
    const redoButton = document.getElementById("sort-redo");
    const resetButton = document.getElementById("sort-reset");
    const saveButton = document.getElementById("sort-save");

    const bottomSaveButton = document.getElementById(
        "sort-save-bottom"
    );

    const saveButtons = [
        saveButton,
        bottomSaveButton
    ].filter(Boolean);

    const sortUrl = app.dataset.sortUrl;

    const pdfjsLib = window.pdfjsLib;

    if (
        !documentSelect ||
        !pageGrid ||
        !statusElement ||
        !errorElement ||
        !pageCountElement ||
        !undoButton ||
        !redoButton ||
        !resetButton ||
        !saveButton ||
        !sortUrl
    ) {
        console.error(
            "The PDF sorter template is missing required elements."
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

    /*
     * Each PDF has its own page arrangement and history.
     * pageNumber always refers to the original page number.
     */
    const statesByDocument = new Map();

    let activeState = null;
    let currentPdf = null;

    let documentLoadSequence = 0;
    let thumbnailRenderSequence = 0;

    let draggedPageNumber = null;
    let isLoading = false;
    let isSaving = false;

    // ---------------------------------------------
    // General helpers
    // ---------------------------------------------

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

    function clonePages(pages) {
        return pages.map((page) => ({
            pageNumber: page.pageNumber,
            rotation: page.rotation
        }));
    }

    function normaliseRotation(rotation) {
        return ((rotation % 360) + 360) % 360;
    }

    function stateHasChanges(state) {
        if (!state) {
            return false;
        }

        if (state.pages.length !== state.originalPageCount) {
            return true;
        }

        return state.pages.some((page, index) => {
            return (
                page.pageNumber !== index + 1 ||
                page.rotation !== 0
            );
        });
    }

    function updateHistoryButtons() {
        const canEdit =
            Boolean(activeState) &&
            !isLoading &&
            !isSaving;

        undoButton.disabled =
            !canEdit ||
            activeState.history.undo.length === 0;

        redoButton.disabled =
            !canEdit ||
            activeState.history.redo.length === 0;

        resetButton.disabled =
            !canEdit ||
            !stateHasChanges(activeState);

        const canSave =
            canEdit &&
            activeState.pages.length > 0 &&
            Boolean(currentPdf);

        saveButtons.forEach((button) => {
            button.disabled = !canSave;
        });

        documentSelect.disabled = isLoading || isSaving;
    }

    function updateSummary() {
        if (!activeState) {
            pageCountElement.textContent = "No PDF loaded";
            updateHistoryButtons();
            return;
        }

        const remaining = activeState.pages.length;
        const original = activeState.originalPageCount;
        const removed = original - remaining;

        pageCountElement.textContent =
            `${remaining} of ${original} pages`;

        if (removed > 0) {
            pageCountElement.title =
                `${removed} page${removed === 1 ? "" : "s"} removed`;
        } else {
            pageCountElement.title = "All original pages included";
        }

        updateHistoryButtons();
    }

    function makeHistorySnapshot() {
        return clonePages(activeState.pages);
    }

    function recordHistory() {
        if (!activeState) {
            return;
        }

        activeState.history.undo.push(
            makeHistorySnapshot()
        );

        if (activeState.history.undo.length > 100) {
            activeState.history.undo.shift();
        }

        activeState.history.redo.length = 0;
        updateHistoryButtons();
    }

    function findPage(pageNumber) {
        if (!activeState) {
            return null;
        }

        return activeState.pages.find(
            (page) => page.pageNumber === pageNumber
        ) || null;
    }

    // ---------------------------------------------
    // Load PDF
    // ---------------------------------------------

    async function loadSelectedDocument() {
        const selected = getSelectedDocument();

        if (!selected || !selected.fileUrl) {
            showError("Select a PDF to organize its pages.");
            return;
        }

        const sequence = ++documentLoadSequence;

        isLoading = true;
        clearError();

        pageGrid.replaceChildren();
        thumbnailRenderSequence += 1;

        activeState = null;

        const previousPdf = currentPdf;
        currentPdf = null;

        updateSummary();

        pageCountElement.textContent = "Loading pages…";
        setStatus(`Loading ${selected.filename}…`);

        updateHistoryButtons();

        let newPdf = null;

        try {
            const loadingTask = pdfjsLib.getDocument({
                url: selected.fileUrl
            });

            newPdf = await loadingTask.promise;

            // Ignore an outdated load if another PDF was selected meanwhile.
            if (sequence !== documentLoadSequence) {
                await newPdf.destroy();
                return;
            }

            currentPdf = newPdf;

            const documentId = selected.id;

            if (!statesByDocument.has(documentId)) {
                const pages = [];

                for (
                    let pageNumber = 1;
                    pageNumber <= newPdf.numPages;
                    pageNumber += 1
                ) {
                    pages.push({
                        pageNumber,
                        rotation: 0
                    });
                }

                statesByDocument.set(documentId, {
                    id: documentId,
                    filename: selected.filename,
                    fileUrl: selected.fileUrl,
                    originalPageCount: newPdf.numPages,
                    pages,
                    history: {
                        undo: [],
                        redo: []
                    }
                });
            }

            activeState = statesByDocument.get(documentId);

            activeState.filename = selected.filename;
            activeState.fileUrl = selected.fileUrl;

            // If the loaded file differs from the cached state, reinitialize.
            if (
                activeState.originalPageCount !== newPdf.numPages
            ) {
                const pages = [];

                for (
                    let pageNumber = 1;
                    pageNumber <= newPdf.numPages;
                    pageNumber += 1
                ) {
                    pages.push({
                        pageNumber,
                        rotation: 0
                    });
                }

                activeState.originalPageCount = newPdf.numPages;
                activeState.pages = pages;
                activeState.history = {
                    undo: [],
                    redo: []
                };
            }

            if (previousPdf && previousPdf !== newPdf) {
                try {
                    await previousPdf.destroy();
                } catch (error) {
                    console.warn(
                        "Could not close the previous PDF:",
                        error
                    );
                }
            }

            if (sequence !== documentLoadSequence) {
                return;
            }

            updateSummary();

            await renderPageGrid();

            if (sequence === documentLoadSequence) {
                setStatus(
                    `${activeState.pages.length} pages loaded. ` +
                    "Drag pages to reorder them, or rotate and remove individual pages."
                );
            }
        } catch (error) {
            if (sequence !== documentLoadSequence) {
                return;
            }

            console.error("Could not load the PDF:", error);

            if (newPdf && newPdf !== currentPdf) {
                try {
                    await newPdf.destroy();
                } catch (_) {
                    // Nothing further is needed.
                }
            }

            currentPdf = null;
            activeState = null;

            pageGrid.replaceChildren();
            pageCountElement.textContent = "Unable to load pages";

            showError(
                "Could not load this PDF. Check that the uploaded file " +
                "exists and is a valid PDF."
            );
        } finally {
            if (sequence === documentLoadSequence) {
                isLoading = false;
                updateHistoryButtons();
            }
        }
    }

    // ---------------------------------------------
    // Build page cards and render thumbnails
    // ---------------------------------------------

    function createPageCard(pageInfo, position) {
        const card = document.createElement("article");

        card.className = "sort-page-card";
        card.dataset.pageNumber = String(pageInfo.pageNumber);

        const header = document.createElement("div");
        header.className = "sort-page-card-header";

        const pageLabel = document.createElement("span");
        pageLabel.className = "sort-page-number";
        pageLabel.textContent =
            `Page ${position} · Original ${pageInfo.pageNumber}`;

        const dragHandle = document.createElement("button");
        dragHandle.type = "button";
        dragHandle.className = "sort-drag-handle";
        dragHandle.textContent = "⠿";
        dragHandle.draggable = true;
        dragHandle.tabIndex = 0;
        dragHandle.title = "Drag to reorder";
        dragHandle.setAttribute(
            "aria-label",
            `Drag original page ${pageInfo.pageNumber} to reorder`
        );

        header.append(pageLabel, dragHandle);

        const thumbnailContainer =
            document.createElement("div");

        thumbnailContainer.className =
            "sort-thumbnail-container";

        const canvas = document.createElement("canvas");
        canvas.className = "sort-thumbnail-canvas";
        canvas.setAttribute(
            "aria-label",
            `Preview of original page ${pageInfo.pageNumber}`
        );

        const placeholder = document.createElement("div");
        placeholder.className = "sort-thumbnail-placeholder";
        placeholder.textContent = "Rendering preview…";

        thumbnailContainer.append(placeholder, canvas);

        const actions = document.createElement("div");
        actions.className = "sort-page-actions";

        const rotateButton = document.createElement("button");
        rotateButton.type = "button";
        rotateButton.className = "sort-page-action";
        rotateButton.dataset.action = "rotate";
        rotateButton.textContent = "Rotate ↻";
        rotateButton.title = "Rotate clockwise by 90 degrees";

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className =
            "sort-page-action sort-page-action-remove";

        removeButton.dataset.action = "remove";
        removeButton.textContent = "Remove";
        removeButton.title = "Remove this page from the output";

        actions.append(rotateButton, removeButton);

        card.append(header, thumbnailContainer, actions);

        return {
            card,
            canvas,
            placeholder
        };
    }

    async function renderThumbnail(
        canvas,
        placeholder,
        pageInfo,
        sequence
    ) {
        if (
            !currentPdf ||
            !activeState ||
            sequence !== thumbnailRenderSequence
        ) {
            return;
        }

        try {
            const page = await currentPdf.getPage(
                pageInfo.pageNumber
            );

            if (sequence !== thumbnailRenderSequence) {
                return;
            }

            const rotation = normaliseRotation(
                page.rotate + pageInfo.rotation
            );

            const initialViewport = page.getViewport({
                scale: 1,
                rotation
            });

            const maxWidth = 160;
            const maxHeight = 220;

            const scale = Math.min(
                maxWidth / initialViewport.width,
                maxHeight / initialViewport.height
            );

            const viewport = page.getViewport({
                scale,
                rotation
            });

            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);

            canvas.style.width = `${viewport.width}px`;
            canvas.style.height = `${viewport.height}px`;

            const context = canvas.getContext("2d");

            if (!context) {
                throw new Error(
                    "Could not create the page preview canvas."
                );
            }

            await page.render({
                canvasContext: context,
                viewport
            }).promise;

            if (sequence !== thumbnailRenderSequence) {
                return;
            }

            placeholder.remove();
        } catch (error) {
            if (sequence !== thumbnailRenderSequence) {
                return;
            }

            console.error(
                `Failed to render PDF page ${pageInfo.pageNumber}:`,
                error
            );

            placeholder.textContent = "Preview unavailable";
            canvas.style.display = "none";
        }
    }

    async function renderPageGrid() {
        if (!activeState || !currentPdf) {
            return;
        }

        const sequence = ++thumbnailRenderSequence;

        pageGrid.replaceChildren();

        if (activeState.pages.length === 0) {
            const empty = document.createElement("div");
            empty.className = "sort-thumbnail-placeholder";
            empty.textContent = "No pages remain.";

            pageGrid.appendChild(empty);
            updateSummary();
            return;
        }

        const renderJobs = [];

        activeState.pages.forEach((pageInfo, index) => {
            const result = createPageCard(
                pageInfo,
                index + 1
            );

            pageGrid.appendChild(result.card);

            renderJobs.push(
                renderThumbnail(
                    result.canvas,
                    result.placeholder,
                    pageInfo,
                    sequence
                )
            );
        });

        updateSummary();

        setStatus(
            `Rendering page previews… ${activeState.pages.length} pages.`
        );

        await Promise.all(renderJobs);
    }

    // ---------------------------------------------
    // Page ordering
    // ---------------------------------------------

    function movePage(fromIndex, toIndex) {
        if (
            !activeState ||
            fromIndex < 0 ||
            toIndex < 0 ||
            fromIndex >= activeState.pages.length ||
            toIndex >= activeState.pages.length ||
            fromIndex === toIndex
        ) {
            return false;
        }

        recordHistory();

        const [page] = activeState.pages.splice(
            fromIndex,
            1
        );

        activeState.pages.splice(
            toIndex,
            0,
            page
        );

        renderPageGrid();

        setStatus(
            `Page moved to position ${toIndex + 1}.`
        );

        updateSummary();

        return true;
    }

    function handleDragStart(event) {
        const handle = event.target.closest(
            ".sort-drag-handle"
        );

        if (!handle || !activeState || isLoading || isSaving) {
            event.preventDefault();
            return;
        }

        const card = handle.closest(".sort-page-card");

        if (!card) {
            event.preventDefault();
            return;
        }

        draggedPageNumber = Number(card.dataset.pageNumber);

        card.classList.add("is-dragging");

        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(
            "text/plain",
            String(draggedPageNumber)
        );
    }

    function handleDragOver(event) {
        if (draggedPageNumber === null) {
            return;
        }

        const targetCard = event.target.closest(
            ".sort-page-card"
        );

        if (!targetCard) {
            return;
        }

        event.preventDefault();

        event.dataTransfer.dropEffect = "move";

        pageGrid.querySelectorAll(
            ".sort-page-card.is-drop-target"
        ).forEach((card) => {
            card.classList.remove("is-drop-target");
        });

        if (
            Number(targetCard.dataset.pageNumber) !==
            draggedPageNumber
        ) {
            targetCard.classList.add("is-drop-target");
        }
    }

    function handleDrop(event) {
        if (draggedPageNumber === null || !activeState) {
            return;
        }

        const targetCard = event.target.closest(
            ".sort-page-card"
        );

        if (!targetCard) {
            return;
        }

        event.preventDefault();

        const targetPageNumber = Number(
            targetCard.dataset.pageNumber
        );

        if (targetPageNumber === draggedPageNumber) {
            clearDragState();
            return;
        }

        const fromIndex = activeState.pages.findIndex(
            (page) => page.pageNumber === draggedPageNumber
        );

        const targetIndex = activeState.pages.findIndex(
            (page) => page.pageNumber === targetPageNumber
        );

        if (fromIndex < 0 || targetIndex < 0) {
            clearDragState();
            return;
        }

        const bounds = targetCard.getBoundingClientRect();

        const insertAfter =
            event.clientY > bounds.top + bounds.height / 2;

        let destinationIndex = targetIndex;

        if (insertAfter) {
            destinationIndex += 1;
        }

        if (fromIndex < destinationIndex) {
            destinationIndex -= 1;
        }

        destinationIndex = Math.max(
            0,
            Math.min(
                destinationIndex,
                activeState.pages.length - 1
            )
        );

        if (fromIndex !== destinationIndex) {
            recordHistory();

            const [page] = activeState.pages.splice(
                fromIndex,
                1
            );

            activeState.pages.splice(
                destinationIndex,
                0,
                page
            );

            renderPageGrid();

            setStatus(
                `Page moved to position ${destinationIndex + 1}.`
            );

            updateSummary();
        }

        clearDragState();
    }

    function clearDragState() {
        draggedPageNumber = null;

        pageGrid.querySelectorAll(
            ".sort-page-card.is-dragging, " +
            ".sort-page-card.is-drop-target"
        ).forEach((card) => {
            card.classList.remove(
                "is-dragging",
                "is-drop-target"
            );
        });
    }

    function handleDragEnd() {
        clearDragState();
    }

    // ---------------------------------------------
    // Rotate and remove pages
    // ---------------------------------------------

    function handlePageAction(event) {
        const button = event.target.closest(
            "button[data-action]"
        );

        if (
            !button ||
            !activeState ||
            isLoading ||
            isSaving
        ) {
            return;
        }

        const card = button.closest(".sort-page-card");

        if (!card) {
            return;
        }

        const pageNumber = Number(
            card.dataset.pageNumber
        );

        const pageInfo = findPage(pageNumber);

        if (!pageInfo) {
            return;
        }

        const action = button.dataset.action;

        if (action === "rotate") {
            recordHistory();

            pageInfo.rotation = normaliseRotation(
                pageInfo.rotation + 90
            );

            renderPageGrid();

            setStatus(
                `Original page ${pageNumber} rotated clockwise.`
            );

            updateSummary();

            return;
        }

        if (action === "remove") {
            if (activeState.pages.length <= 1) {
                showError(
                    "At least one page must remain in the PDF."
                );

                return;
            }

            clearError();
            recordHistory();

            activeState.pages = activeState.pages.filter(
                (page) => page.pageNumber !== pageNumber
            );

            renderPageGrid();

            setStatus(
                `Original page ${pageNumber} removed from the output.`
            );

            updateSummary();
        }
    }

    // ---------------------------------------------
    // Undo, redo and reset
    // ---------------------------------------------

    function undo() {
        if (
            !activeState ||
            activeState.history.undo.length === 0
        ) {
            return;
        }

        activeState.history.redo.push(
            makeHistorySnapshot()
        );

        activeState.pages =
            activeState.history.undo.pop();

        renderPageGrid();

        setStatus("Last page change undone.");
        updateSummary();
    }

    function redo() {
        if (
            !activeState ||
            activeState.history.redo.length === 0
        ) {
            return;
        }

        activeState.history.undo.push(
            makeHistorySnapshot()
        );

        activeState.pages =
            activeState.history.redo.pop();

        renderPageGrid();

        setStatus("Page change restored.");
        updateSummary();
    }

    function resetPages() {
        if (!activeState || !currentPdf) {
            return;
        }

        if (!stateHasChanges(activeState)) {
            setStatus("The pages are already in their original order.");
            return;
        }

        const confirmed = window.confirm(
            "Restore every original page and reset all rotations?"
        );

        if (!confirmed) {
            return;
        }

        recordHistory();

        const originalPageCount =
            activeState.originalPageCount;

        activeState.pages = Array.from(
            { length: originalPageCount },
            (_, index) => ({
                pageNumber: index + 1,
                rotation: 0
            })
        );

        clearError();

        renderPageGrid();

        setStatus("Original page order and orientations restored.");
        updateSummary();
    }

    // ---------------------------------------------
    // Export sorted PDF
    // ---------------------------------------------

    async function saveSortedPdf() {
        if (
            isSaving ||
            isLoading ||
            !activeState ||
            !currentPdf
        ) {
            return;
        }

        if (activeState.pages.length === 0) {
            showError(
                "The PDF must contain at least one page."
            );
            return;
        }

        const selected = getSelectedDocument();

        if (!selected) {
            showError("Select a PDF before saving.");
            return;
        }

        clearError();

        isSaving = true;
        const originalButtonTexts = saveButtons.map(
            (button) => button.textContent
        );

        saveButtons.forEach((button) => {
            button.textContent = "Saving…";
        });

        updateHistoryButtons();

        setStatus("Creating the reorganized PDF…");

        try {
            const response = await fetch(sortUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                credentials: "same-origin",
                body: JSON.stringify({
                    document_id: activeState.id,
                    pages: activeState.pages.map((page) => ({
                        page_number: page.pageNumber,
                        rotation: page.rotation
                    }))
                })
            });

            if (!response.ok) {
                let message = "Could not create the sorted PDF.";

                try {
                    const result = await response.json();

                    if (result.message) {
                        message = result.message;
                    }
                } catch (_) {
                    // Keep the default error for non-JSON responses.
                }

                throw new Error(message);
            }

            const blob = await response.blob();

            if (!blob.size) {
                throw new Error(
                    "The server returned an empty PDF."
                );
            }

            const downloadUrl = URL.createObjectURL(blob);
            const anchor = document.createElement("a");

            const baseName = selected.filename
                .replace(/\.pdf$/i, "")
                .replace(/[\\/:*?"<>|]/g, "_") || "document";

            anchor.href = downloadUrl;
            anchor.download = `${baseName}-sorted.pdf`;

            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();

            window.setTimeout(() => {
                URL.revokeObjectURL(downloadUrl);
            }, 1500);

            setStatus(
                `Downloaded ${baseName}-sorted.pdf. ` +
                "The original uploaded PDF was not overwritten."
            );
        } catch (error) {
            console.error("Failed to save sorted PDF:", error);

            showError(
                error.message ||
                "An unexpected error occurred while saving."
            );

            setStatus("Could not create the sorted PDF.");
        } finally {
            isSaving = false;

            saveButtons.forEach((button, index) => {
                button.textContent = originalButtonTexts[index];
            });

            updateHistoryButtons();
        }
    }

    // ---------------------------------------------
    // Event listeners
    // ---------------------------------------------

    documentSelect.addEventListener(
        "change",
        loadSelectedDocument
    );

    undoButton.addEventListener("click", undo);
    redoButton.addEventListener("click", redo);
    resetButton.addEventListener("click", resetPages);

    saveButtons.forEach((button) => {
        button.addEventListener("click", saveSortedPdf);
    });

    pageGrid.addEventListener(
        "click",
        handlePageAction
    );

    pageGrid.addEventListener(
        "dragstart",
        handleDragStart
    );

    pageGrid.addEventListener(
        "dragover",
        handleDragOver
    );

    pageGrid.addEventListener(
        "drop",
        handleDrop
    );

    pageGrid.addEventListener(
        "dragend",
        handleDragEnd
    );

    pageGrid.addEventListener("keydown", (event) => {
        if (
            !event.target.classList.contains("sort-drag-handle") ||
            !activeState ||
            isLoading ||
            isSaving
        ) {
            return;
        }

        if (
            event.key !== "ArrowUp" &&
            event.key !== "ArrowDown"
        ) {
            return;
        }

        const card = event.target.closest(".sort-page-card");

        if (!card) {
            return;
        }

        event.preventDefault();

        const pageNumber = Number(card.dataset.pageNumber);

        const fromIndex = activeState.pages.findIndex(
            (page) => page.pageNumber === pageNumber
        );

        const toIndex = event.key === "ArrowUp"
            ? fromIndex - 1
            : fromIndex + 1;

        if (movePage(fromIndex, toIndex)) {
            const handle = pageGrid.querySelector(
                `.sort-page-card[data-page-number="${pageNumber}"] ` +
                ".sort-drag-handle"
            );

            if (handle) {
                handle.focus();
            }
        }
    });

    // ---------------------------------------------
    // Initial load
    // ---------------------------------------------

    updateHistoryButtons();

    if (documentSelect.options.length > 0) {
        loadSelectedDocument();
    } else {
        pageCountElement.textContent = "No PDFs available";

        setStatus(
            "Upload a PDF on the Documents page before sorting pages."
        );
    }
});