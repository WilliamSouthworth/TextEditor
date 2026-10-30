/*
 * PDF editor functionality:
 * - PDF.js document rendering and text selection
 * - Highlights with hover-to-delete and drag-to-move
 * - Inline text annotations using contenteditable (no prompt/input box)
 * - Per-document undo and redo
 * - Export annotations into a downloaded PDF copy
 */

(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", () => {
        const documentSelect = document.getElementById("editor-document-select");
        const pagesContainer = document.getElementById("pdf-pages");
        const loadingMessage = document.getElementById("pdf-loading");
        const errorMessage = document.getElementById("pdf-error");
        const statusMessage = document.getElementById("editor-status");
        const highlightButton = document.getElementById("highlight-tool");
        const editButton = document.getElementById("edit-tool");
        const undoButton = document.getElementById("undo-tool");
        const redoButton = document.getElementById("redo-tool");
        const saveButton = document.getElementById("save-pdf-tool");

        if (!documentSelect || !pagesContainer || !loadingMessage || !errorMessage) {
            console.error("PDF editor markup is missing required elements.");
            return;
        }

        if (!window.pdfjsLib || !window.PDFLib) {
            showError("The PDF libraries could not be loaded. Check your internet connection and reload the page.");
            return;
        }

        const pdfjsLib = window.pdfjsLib;
        const PDFLib = window.PDFLib;

        pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

        let currentPdf = null;
        let renderSequence = 0;
        let activeTool = null;
        let activeDrag = null;

        // All coordinates are stored in PDF points, not screen pixels.
        const annotationsByDocument = new Map();
        const historyByDocument = new Map();
        const pageViewports = new Map();
        const textEditSessions = new Map();

        function clone(value) {
            return JSON.parse(JSON.stringify(value));
        }

        function makeId() {
            if (window.crypto && typeof window.crypto.randomUUID === "function") {
                return window.crypto.randomUUID();
            }

            return `annotation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        }

        function getSelectedDocument() {
            const option = documentSelect.options[documentSelect.selectedIndex];

            if (!option || !option.value) {
                return null;
            }

            return {
                id: String(option.value),
                filename: option.textContent.trim(),
                fileUrl: option.dataset.fileUrl || "",
            };
        }

        function getAnnotations(documentId) {
            const key = String(documentId);

            if (!annotationsByDocument.has(key)) {
                annotationsByDocument.set(key, []);
            }

            return annotationsByDocument.get(key);
        }

        function currentAnnotations() {
            const selected = getSelectedDocument();
            return selected ? getAnnotations(selected.id) : [];
        }

        function getHistory(documentId) {
            const key = String(documentId);

            if (!historyByDocument.has(key)) {
                historyByDocument.set(key, {
                    undo: [],
                    redo: [],
                });
            }

            return historyByDocument.get(key);
        }

        function recordHistory(documentId, snapshot = clone(getAnnotations(documentId))) {
            const history = getHistory(documentId);

            history.undo.push(clone(snapshot));

            if (history.undo.length > 100) {
                history.undo.shift();
            }

            history.redo.length = 0;
            updateHistoryButtons();
        }

        function updateHistoryButtons() {
            const selected = getSelectedDocument();

            const history = selected
                ? getHistory(selected.id)
                : { undo: [], redo: [] };

            if (undoButton) {
                undoButton.disabled = history.undo.length === 0;
            }

            if (redoButton) {
                redoButton.disabled = history.redo.length === 0;
            }
        }

        function setStatus(message) {
            if (statusMessage) {
                statusMessage.textContent = message;
            }
        }

        function showError(message) {
            errorMessage.textContent = message;
            errorMessage.hidden = false;
            loadingMessage.hidden = true;
            setStatus(message);
        }

        function clearError() {
            errorMessage.textContent = "";
            errorMessage.hidden = true;
        }

        function setLoading(isLoading) {
            loadingMessage.hidden = !isLoading;
        }

        function clearPages() {
            pagesContainer.replaceChildren();
            pageViewports.clear();
        }

        function normaliseEditableText(value) {
            return String(value || "")
                .replace(/\r/g, "")
                .replace(/\u00a0/g, " ")
                .replace(/\n+$/g, "");
        }

        function getAnnotation(documentId, annotationId) {
            return getAnnotations(documentId).find(
                (item) => item.id === annotationId
            ) || null;
        }

        function finishTextEdit(annotationId, element) {
            const session = textEditSessions.get(annotationId);
            if (!session) return;

            const annotation = getAnnotation(session.documentId, annotationId);
            const nextText = normaliseEditableText(element.innerText);
            let removed = false;

            if (annotation) {
                annotation.text = nextText;
            }

            if (annotation && !nextText.trim()) {
                if (annotation.pairedEraseId) {
                    // Keep the cover so the original section remains visually blank.
                    // The original text remains in the PDF content stream.
                    const remaining = getAnnotations(session.documentId).filter(
                        (item) => item.id !== annotationId
                    );

                    annotationsByDocument.set(
                        String(session.documentId),
                        remaining
                    );

                    removed = true;
                } else {
                    // An empty new text box should disappear completely.
                    annotationsByDocument.set(
                        String(session.documentId),
                        getAnnotations(session.documentId).filter(
                            (item) => item.id !== annotationId
                        )
                    );

                    removed = true;
                }
            }

            textEditSessions.delete(annotationId);

            renderAnnotationsForPage(
                session.documentId,
                session.pageNumber
            );

            updateHistoryButtons();

            if (annotation && nextText.trim()) {
                setStatus(
                    "Text updated. Use Undo to reverse the change."
                );
            } else if (removed && session.wasReplacement) {
                setStatus(
                    "Selected text cleared. The original text remains covered."
                );
            } else if (removed) {
                setStatus("Empty text box removed.");
            }
        }

        function beginTextEdit(annotation, element) {
            if (!annotation || activeTool !== "edit") {
                return;
            }

            if (!textEditSessions.has(annotation.id)) {
                const beforeSnapshot = clone(
                    getAnnotations(annotation.documentId)
                );

                recordHistory(annotation.documentId, beforeSnapshot);

                textEditSessions.set(annotation.id, {
                    documentId: annotation.documentId,
                    pageNumber: annotation.pageNumber,
                    originalText: annotation.text,
                    beforeSnapshot,
                });
            }

            element.focus();
            placeCaretAtEnd(element);
        }

        function placeCaretAtEnd(element) {
            try {
                const selection = window.getSelection();
                const range = document.createRange();

                range.selectNodeContents(element);
                range.collapse(false);

                selection.removeAllRanges();
                selection.addRange(range);
            } catch (_) {
                // Focus is still usable if the browser cannot set the caret.
            }
        }

        function setActiveTool(tool) {
            // If switching away from an inline editor, its blur event commits the text.
            activeTool = tool;

            if (editButton) {
                editButton.classList.toggle("active", tool === "edit");
                editButton.setAttribute(
                    "aria-pressed",
                    String(tool === "edit")
                );
            }

            renderAllAnnotations();

            if (tool === "edit") {
                setStatus(
                    "Edit mode: click anywhere on the page to type. Click existing added text to edit it; clear it and click away to remove it."
                );
            }
        }

        function updateDocumentTitle(filename) {
            document.title = filename
                ? `${filename} - PDF Editor`
                : "PDF Editor";
        }

        function pdfRectFromViewport(viewport, left, top, width, height) {
            const first = viewport.convertToPdfPoint(left, top);
            const second = viewport.convertToPdfPoint(
                left + width,
                top + height
            );

            return {
                x: Math.min(first[0], second[0]),
                y: Math.min(first[1], second[1]),
                width: Math.abs(second[0] - first[0]),
                height: Math.abs(second[1] - first[1]),
            };
        }

        function viewportRectFromPdf(viewport, rect) {
            const points = viewport.convertToViewportRectangle([
                rect.x,
                rect.y,
                rect.x + rect.width,
                rect.y + rect.height,
            ]);

            return {
                left: Math.min(points[0], points[2]),
                top: Math.min(points[1], points[3]),
                width: Math.abs(points[2] - points[0]),
                height: Math.abs(points[3] - points[1]),
            };
        }

        function deleteAnnotation(documentId, annotationId) {
            const key = String(documentId);
            const annotations = getAnnotations(key);

            const annotation = annotations.find(
                (item) => item.id === annotationId
            );

            if (!annotation) return;

            recordHistory(key);

            if (
                annotation.type === "highlight" &&
                annotation.highlightGroupId
            ) {
                // Delete every line/rectangle belonging to this highlight selection.
                annotationsByDocument.set(
                    key,
                    annotations.filter(
                        (item) =>
                            !(
                                item.type === "highlight" &&
                                item.highlightGroupId ===
                                    annotation.highlightGroupId
                            )
                    )
                );
            } else if (
                annotation.type === "text" &&
                (annotation.pairedEraseId || annotation.pairedEraseIds)
            ) {
                const eraseIds = new Set(
                    annotation.pairedEraseIds ||
                    [annotation.pairedEraseId]
                );

                annotationsByDocument.set(
                    key,
                    annotations.filter(
                        (item) =>
                            item.id !== annotationId &&
                            !eraseIds.has(item.id)
                    )
                );
            } else {
                annotationsByDocument.set(
                    key,
                    annotations.filter(
                        (item) => item.id !== annotationId
                    )
                );
            }

            renderAnnotationsForPage(
                key,
                annotation.pageNumber
            );

            updateHistoryButtons();

            setStatus(
                annotation.type === "highlight"
                    ? "Entire highlighted selection deleted. Use Undo to restore it."
                    : "Annotation deleted. Use Undo to restore it."
            );
        }

        function makeHighlightGroup(annotation, viewport) {
            const rect = viewportRectFromPdf(viewport, annotation.rect);

            const group = document.createElement("div");
            group.className = "pdf-highlight-group";
            group.dataset.annotationId = annotation.id;

            group.style.left = `${rect.left}px`;
            group.style.top = `${rect.top}px`;
            group.style.width = `${Math.max(rect.width, 2)}px`;
            group.style.height = `${Math.max(rect.height, 4)}px`;

            const highlight = document.createElement("div");
            highlight.className =
                "pdf-annotation-item pdf-highlight-overlay";

            highlight.dataset.annotationId = annotation.id;
            highlight.title = "Drag to move this highlight";
            highlight.setAttribute(
                "aria-label",
                "Highlight; drag to move"
            );

            highlight.style.width = "100%";
            highlight.style.height = "100%";

            highlight.addEventListener("pointerdown", (event) => {
                if (event.button !== 0) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();

                const pageWrapper = group.closest(".pdf-page");
                const pageRect = pageWrapper.getBoundingClientRect();

                activeDrag = {
                    documentId: String(annotation.documentId),
                    annotationId: annotation.id,
                    pageNumber: annotation.pageNumber,
                    viewport,
                    pageRect,
                    startClientX: event.clientX,
                    startClientY: event.clientY,
                    currentDx: 0,
                    currentDy: 0,
                    moved: false,
                    beforeSnapshot: clone(
                        getAnnotations(annotation.documentId)
                    ),
                    elements: [group],
                };

                try {
                    highlight.setPointerCapture(event.pointerId);
                } catch (_) {
                    // Pointer capture is optional.
                }
            });

            const deleteButton = document.createElement("button");

            deleteButton.type = "button";
            deleteButton.className = "highlight-delete-button";
            deleteButton.textContent = "×";
            deleteButton.title = "Delete highlight";
            deleteButton.setAttribute(
                "aria-label",
                "Delete highlight"
            );

            deleteButton.addEventListener("pointerdown", (event) => {
                event.stopPropagation();
            });

            deleteButton.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();

                deleteAnnotation(
                    annotation.documentId,
                    annotation.id
                );
            });

            group.append(highlight, deleteButton);

            return group;
        }

        function makeTextAnnotationElement(annotation, viewport) {
            const point = viewport.convertToViewportPoint(
                annotation.x,
                annotation.y
            );

            const group = document.createElement("div");
            group.className = "pdf-annotation-item pdf-text-group";
            group.dataset.annotationId = annotation.id;

            group.style.left = `${point[0]}px`;
            group.style.top = `${point[1]}px`;

            if (annotation.boxWidth) {
                group.style.width =
                    `${annotation.boxWidth * viewport.scale}px`;
            }

            // Drag handle
            const handle = document.createElement("button");
            handle.type = "button";
            handle.className = "pdf-text-drag-handle";
            handle.textContent = "⋮⋮";
            handle.title = "Drag to move text";
            handle.setAttribute("aria-label", "Drag to move text");

            handle.addEventListener("pointerdown", (event) => {
                if (event.button !== 0) return;

                event.preventDefault();
                event.stopPropagation();

                const pageWrapper = group.closest(".pdf-page");

                activeDrag = {
                    kind: "text",
                    documentId: String(annotation.documentId),
                    annotationId: annotation.id,
                    pageNumber: annotation.pageNumber,
                    viewport,
                    pageRect: pageWrapper.getBoundingClientRect(),
                    startClientX: event.clientX,
                    startClientY: event.clientY,
                    currentDx: 0,
                    currentDy: 0,
                    moved: false,
                    beforeSnapshot: clone(
                        getAnnotations(annotation.documentId)
                    ),
                    elements: [group]
                };

                try {
                    handle.setPointerCapture(event.pointerId);
                } catch (_) {
                    // Pointer capture is optional.
                }
            });

            // Editable text
            const element = document.createElement("div");
            element.className = "pdf-text-annotation";
            element.dataset.annotationId = annotation.id;
            element.textContent = annotation.text;

            element.contentEditable =
                activeTool === "edit" ? "true" : "false";

            element.setAttribute("spellcheck", "true");

            element.style.fontSize =
                `${annotation.fontSize * viewport.scale}px`;

            element.style.fontFamily =
                annotation.fontFamily || "Arial, Helvetica, sans-serif";

            element.style.fontWeight =
                annotation.fontWeight || "400";

            element.style.fontStyle =
                annotation.fontStyle || "normal";

            element.style.color =
                annotation.color || "#111827";

            element.style.lineHeight =
                String(annotation.lineHeight || 1.15);

            if (activeTool === "edit" && !annotation.text) {
                element.dataset.placeholder = "Type here";
            }

            element.title = activeTool === "edit"
                ? "Click to edit text"
                : "Added text";

            element.addEventListener("click", (event) => {
                event.stopPropagation();
            });

            // Allow dragging the text itself outside Edit mode.
            element.addEventListener("pointerdown", (event) => {
                if (activeTool === "edit" || event.button !== 0) {
                    return;
                }

                event.preventDefault();

                const pageWrapper = group.closest(".pdf-page");

                activeDrag = {
                    kind: "text",
                    documentId: String(annotation.documentId),
                    annotationId: annotation.id,
                    pageNumber: annotation.pageNumber,
                    viewport,
                    pageRect: pageWrapper.getBoundingClientRect(),
                    startClientX: event.clientX,
                    startClientY: event.clientY,
                    currentDx: 0,
                    currentDy: 0,
                    moved: false,
                    beforeSnapshot: clone(
                        getAnnotations(annotation.documentId)
                    ),
                    elements: [group]
                };
            });

            element.addEventListener("focus", () => {
                beginTextEdit(annotation, element);
            });

            element.addEventListener("input", () => {
                const current = getAnnotation(
                    annotation.documentId,
                    annotation.id
                );

                if (current) {
                    current.text = normaliseEditableText(
                        element.innerText
                    );
                }
            });

            element.addEventListener("blur", () => {
                finishTextEdit(annotation.id, element);
            });

            element.addEventListener("keydown", (event) => {
                if (event.key === "Escape") {
                    event.preventDefault();
                    element.blur();
                }
            });

            // Delete button
            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.className = "pdf-text-delete-button";
            deleteButton.textContent = "×";
            deleteButton.title = "Delete text box";
            deleteButton.setAttribute(
                "aria-label",
                "Delete text box"
            );

            deleteButton.addEventListener("pointerdown", (event) => {
                event.stopPropagation();
            });

            deleteButton.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();

                deleteAnnotation(
                    annotation.documentId,
                    annotation.id
                );
            });

            group.append(handle, element, deleteButton);

            return group;
        }

        function renderAnnotationsForPage(documentId, pageNumber) {
            const viewport = pageViewports.get(
                `${documentId}:${pageNumber}`
            );

            const pageWrapper = pagesContainer.querySelector(
                `.pdf-page[data-document-id="${CSS.escape(String(documentId))}"][data-page-number="${pageNumber}"]`
            );

            if (!viewport || !pageWrapper) {
                return;
            }

            let layer = pageWrapper.querySelector(
                ".pdf-annotations-layer"
            );

            if (!layer) {
                layer = document.createElement("div");
                layer.className = "pdf-annotations-layer";
                pageWrapper.appendChild(layer);
            }

            layer.replaceChildren();

            const annotations = getAnnotations(documentId).filter(
                (annotation) => annotation.pageNumber === pageNumber
            );

            annotations.forEach((annotation) => {
                if (annotation.type === "highlight") {
                    layer.appendChild(
                        makeHighlightGroup(annotation, viewport)
                    );
                    return;
                }

                if (annotation.type === "erase") {
                    const rect = viewportRectFromPdf(
                        viewport,
                        annotation.rect
                    );

                    const erase = document.createElement("div");
                    erase.className =
                        "pdf-annotation-item pdf-erase-overlay";

                    erase.style.left = `${rect.left}px`;
                    erase.style.top = `${rect.top}px`;
                    erase.style.width = `${Math.max(rect.width, 1)}px`;
                    erase.style.height = `${Math.max(rect.height, 1)}px`;

                    erase.setAttribute(
                        "aria-label",
                        "Covered PDF text"
                    );

                    layer.appendChild(erase);
                    return;
                }

                if (annotation.type === "text") {
                    layer.appendChild(
                        makeTextAnnotationElement(annotation, viewport)
                    );
                }
            });
        }

        function renderAllAnnotations() {
            const selected = getSelectedDocument();

            if (!selected) {
                return;
            }

            pagesContainer.querySelectorAll(".pdf-page").forEach(
                (pageWrapper) => {
                    renderAnnotationsForPage(
                        selected.id,
                        Number(pageWrapper.dataset.pageNumber)
                    );
                }
            );
        }

        function renderPage(pdf, pageNumber, sequence, documentId) {
            return pdf.getPage(pageNumber).then(async (page) => {
                if (sequence !== renderSequence) {
                    return;
                }

                const scale = 1.25;
                const viewport = page.getViewport({ scale });

                pageViewports.set(
                    `${documentId}:${pageNumber}`,
                    viewport
                );

                const pageWrapper = document.createElement("div");
                pageWrapper.className = "pdf-page";
                pageWrapper.dataset.documentId = String(documentId);
                pageWrapper.dataset.pageNumber = String(pageNumber);

                pageWrapper.style.width = `${viewport.width}px`;
                pageWrapper.style.height = `${viewport.height}px`;

                const canvas = document.createElement("canvas");
                canvas.className = "pdf-canvas";

                const context = canvas.getContext("2d");
                const pixelRatio = Math.max(
                    window.devicePixelRatio || 1,
                    1
                );

                canvas.width = Math.floor(
                    viewport.width * pixelRatio
                );

                canvas.height = Math.floor(
                    viewport.height * pixelRatio
                );

                canvas.style.width = `${viewport.width}px`;
                canvas.style.height = `${viewport.height}px`;

                const textLayer = document.createElement("div");
                textLayer.className = "textLayer";
                textLayer.style.width = `${viewport.width}px`;
                textLayer.style.height = `${viewport.height}px`;

                pageWrapper.append(canvas, textLayer);
                pagesContainer.appendChild(pageWrapper);

                await page.render({
                    canvasContext: context,
                    viewport,
                    transform: pixelRatio !== 1
                        ? [pixelRatio, 0, 0, pixelRatio, 0, 0]
                        : null,
                }).promise;

                if (sequence !== renderSequence) {
                    pageWrapper.remove();
                    return;
                }

                const textContent = await page.getTextContent();

                const textTask = pdfjsLib.renderTextLayer({
                    textContent,
                    container: textLayer,
                    viewport,
                    textDivs: [],
                });

                await textTask.promise;

                if (sequence !== renderSequence) {
                    pageWrapper.remove();
                    return;
                }

                pageWrapper.addEventListener("click", (event) => {
                    if (activeDrag && activeDrag.moved) return;

                    if (
                        event.target.closest(
                            ".pdf-highlight-group, " +
                            ".pdf-text-group, " +
                            ".highlight-delete-button, " +
                            ".pdf-text-delete-button, " +
                            ".pdf-text-drag-handle"
                        )
                    ) {
                        return;
                    }

                    if (activeTool !== "edit") return;

                    // Existing PDF text is edited by selecting a range with the mouse.
                    // A plain click on existing text must not create a text box.
                    if (
                        event.target.closest(
                            ".textLayer span, .textLayer br"
                        )
                    ) {
                        return;
                    }

                    // Clicking a blank section creates a new text box.
                    addTextAtClick(
                        event,
                        pageWrapper,
                        viewport,
                        pageNumber,
                        documentId
                    );
                });

                renderAnnotationsForPage(documentId, pageNumber);
            });
        }

        async function loadPdf(fileUrl, filename, documentId) {
            if (!fileUrl) {
                showError("This document does not have a file URL.");
                return;
            }

            const sequence = ++renderSequence;

            clearError();
            clearPages();
            setLoading(true);
            setStatus(`Loading ${filename}...`);
            updateDocumentTitle(filename);
            setActiveTool(null);

            const previousPdf = currentPdf;
            currentPdf = null;

            if (previousPdf) {
                try {
                    await previousPdf.destroy();
                } catch (error) {
                    console.warn(
                        "Could not close previous PDF:",
                        error
                    );
                }
            }

            if (sequence !== renderSequence) {
                return;
            }

            try {
                const loadingTask = pdfjsLib.getDocument({
                    url: fileUrl,
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
                    pageNumber += 1
                ) {
                    if (sequence !== renderSequence) {
                        return;
                    }

                    await renderPage(
                        pdf,
                        pageNumber,
                        sequence,
                        documentId
                    );
                }

                if (sequence === renderSequence) {
                    setLoading(false);

                    setStatus(
                        `${filename} loaded. Changes are kept in this browser until you download an edited copy with Save PDF.`
                    );

                    updateHistoryButtons();
                }
            } catch (error) {
                if (sequence !== renderSequence) {
                    return;
                }

                console.error("PDF loading failed:", error);

                clearPages();

                showError(
                    "Unable to load this PDF. Check that the uploaded file is available and try again."
                );
            } finally {
                if (sequence === renderSequence) {
                    setLoading(false);
                }
            }
        }

        async function updateServerSelection(documentId) {
            const response = await fetch("/edit/current-document", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    document_id: documentId,
                }),
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(
                    data.message ||
                    "Could not update the selected document."
                );
            }

            return data;
        }

        async function selectDocument() {
            const selected = getSelectedDocument();

            if (!selected) {
                showError("No document is selected.");
                return;
            }

            try {
                clearError();
                setLoading(true);

                await updateServerSelection(selected.id);

                const latest = getSelectedDocument();

                if (!latest || latest.id !== selected.id) {
                    return;
                }

                await loadPdf(
                    latest.fileUrl,
                    latest.filename,
                    latest.id
                );
            } catch (error) {
                console.error("Document selection failed:", error);

                showError(
                    error.message ||
                    "Could not load the selected document."
                );
            }
        }

        function mergeSelectionRects(range, pageRect) {

            const rawRects =
                Array.from(range.getClientRects())
                    .map((clientRect) => {

                        const left = Math.max(
                            pageRect.left,
                            clientRect.left
                        );

                        const top = Math.max(
                            pageRect.top,
                            clientRect.top
                        );

                        const right = Math.min(
                            pageRect.right,
                            clientRect.right
                        );

                        const bottom = Math.min(
                            pageRect.bottom,
                            clientRect.bottom
                        );


                        return {
                            left:
                                left - pageRect.left,

                            top:
                                top - pageRect.top,

                            right:
                                right - pageRect.left,

                            bottom:
                                bottom - pageRect.top,

                            width:
                                right - left,

                            height:
                                bottom - top
                        };

                    })
                    .filter(
                        (rect) =>
                            rect.width > 0 &&
                            rect.height > 0
                    )
                    .sort(
                        (a, b) =>
                            a.top - b.top ||
                            a.left - b.left
                    );


            const mergedRects = [];


            rawRects.forEach((rect) => {

                const previous =
                    mergedRects[
                        mergedRects.length - 1
                    ];


                if (previous) {

                    /*
                    * Determine whether both rectangles
                    * belong to approximately the same
                    * line of text.
                    */

                    const verticalOverlap =
                        Math.min(
                            previous.bottom,
                            rect.bottom
                        ) -
                        Math.max(
                            previous.top,
                            rect.top
                        );


                    const minimumHeight =
                        Math.min(
                            previous.height,
                            rect.height
                        );


                    const sameLine =
                        verticalOverlap >=
                        minimumHeight * 0.5;


                    /*
                    * PDF.js may leave small gaps between
                    * individual text spans and words.
                    */

                    const horizontalGap =
                        rect.left -
                        previous.right;


                    const gapTolerance =
                        Math.max(
                            12,
                            minimumHeight * 0.8
                        );


                    if (
                        sameLine &&
                        horizontalGap <= gapTolerance
                    ) {

                        previous.left =
                            Math.min(
                                previous.left,
                                rect.left
                            );

                        previous.top =
                            Math.min(
                                previous.top,
                                rect.top
                            );

                        previous.right =
                            Math.max(
                                previous.right,
                                rect.right
                            );

                        previous.bottom =
                            Math.max(
                                previous.bottom,
                                rect.bottom
                            );


                        previous.width =
                            previous.right -
                            previous.left;

                        previous.height =
                            previous.bottom -
                            previous.top;


                        return;
                    }

                }


                mergedRects.push({
                    ...rect
                });

            });


            return mergedRects;
        }

        function highlightSelectedText() {
            const selection = window.getSelection();

            if (
                !selection ||
                selection.isCollapsed ||
                !selection.rangeCount
            ) {
                setStatus("Select the PDF text you want to highlight first.");
                return;
            }

            const range = selection.getRangeAt(0);
            const node = range.commonAncestorContainer;

            const commonElement =
                node.nodeType === Node.ELEMENT_NODE
                    ? node
                    : node.parentElement;

            const textLayer = commonElement
                ? commonElement.closest(".textLayer")
                : null;

            const pageWrapper = textLayer
                ? textLayer.closest(".pdf-page")
                : null;

            if (!pageWrapper) {
                setStatus(
                    "Select text on a single PDF page before highlighting it."
                );
                return;
            }

            const documentId = String(pageWrapper.dataset.documentId);
            const pageNumber = Number(
                pageWrapper.dataset.pageNumber
            );

            const viewport = pageViewports.get(
                `${documentId}:${pageNumber}`
            );

            if (!viewport) {
                setStatus("The selected page is not ready.");
                return;
            }

            const pageRect = pageWrapper.getBoundingClientRect();

            // Keep only visible selection rectangles and clip them to the page.
            const rects =
                mergeSelectionRects(
                    range,
                    pageRect
                )
                .map((rect) => {

                    return pdfRectFromViewport(
                        viewport,
                        rect.left,
                        rect.top,
                        rect.width,
                        rect.height
                    );

                })
                .filter(
                    (rect) =>
                        rect &&
                        rect.width > 0 &&
                        rect.height > 0
                );

            if (!rects.length) {
                setStatus("No visible selected text was found to highlight.");
                return;
            }

            const selected = getSelectedDocument();

            if (!selected) return;

            const highlightGroupId = makeId();

            recordHistory(selected.id);

            rects.forEach((rect) => {
                getAnnotations(selected.id).push({
                    id: makeId(),
                    highlightGroupId,
                    documentId: selected.id,
                    type: "highlight",
                    pageNumber,
                    rect,
                });
            });

            renderAnnotationsForPage(
                selected.id,
                pageNumber
            );

            selection.removeAllRanges();

            setStatus(
                "Highlight added. Hover over any line and click × to delete the entire highlighted selection."
            );

            updateHistoryButtons();
        }

        function eraseSelectedText(selection, range) {
            const node = range.commonAncestorContainer;

            const commonElement = node.nodeType === Node.ELEMENT_NODE
                ? node
                : node.parentElement;

            const textLayer = commonElement
                ? commonElement.closest(".textLayer")
                : null;

            const pageWrapper = textLayer
                ? textLayer.closest(".pdf-page")
                : null;

            if (!pageWrapper) {
                setStatus(
                    "To cover existing PDF text, select text within one PDF page first."
                );
                return false;
            }

            const documentId = pageWrapper.dataset.documentId;
            const pageNumber = Number(
                pageWrapper.dataset.pageNumber
            );

            const viewport = pageViewports.get(
                `${documentId}:${pageNumber}`
            );

            if (!viewport) {
                return false;
            }

            const pageRect = pageWrapper.getBoundingClientRect();

            const rects = Array.from(range.getClientRects())
                .filter((rect) => rect.width > 0 && rect.height > 0)
                .map((rect) => pdfRectFromViewport(
                    viewport,
                    rect.left - pageRect.left,
                    rect.top - pageRect.top,
                    rect.width,
                    rect.height
                ))
                .filter((rect) => rect.width > 0 && rect.height > 0);

            if (!rects.length) {
                return false;
            }

            recordHistory(documentId);

            rects.forEach((rect) => {
                getAnnotations(documentId).push({
                    id: makeId(),
                    documentId: String(documentId),
                    type: "erase",
                    pageNumber,
                    rect,
                });
            });

            selection.removeAllRanges();

            renderAnnotationsForPage(
                documentId,
                pageNumber
            );

            updateHistoryButtons();

            setStatus(
                "Selected text covered. This is a visual cover, not secure PDF redaction. Use Undo to reverse it."
            );

            return true;
        }

        function selectAllContent(element) {
            try {
                const selection = window.getSelection();
                const range = document.createRange();

                range.selectNodeContents(element);
                selection.removeAllRanges();
                selection.addRange(range);
            } catch (_) {
                // Keep focus if text selection is unavailable.
            }
        }


        function createReplacementFromSelection(selection, range) {
            const node = range.commonAncestorContainer;

            const commonElement = node.nodeType === Node.ELEMENT_NODE
                ? node
                : node.parentElement;

            const textLayer = commonElement
                ? commonElement.closest(".textLayer")
                : null;

            const pageWrapper = textLayer
                ? textLayer.closest(".pdf-page")
                : null;

            const selectedText = normaliseEditableText(
                selection.toString()
            );

            if (!pageWrapper || !selectedText.trim()) return false;

            const documentId = String(pageWrapper.dataset.documentId);
            const pageNumber = Number(pageWrapper.dataset.pageNumber);

            const viewport = pageViewports.get(
                `${documentId}:${pageNumber}`
            );

            if (!viewport) return false;

            const pageRect = pageWrapper.getBoundingClientRect();

            const clientRects = Array.from(range.getClientRects()).filter(
                (rect) => rect.width > 0 && rect.height > 0
            );

            if (!clientRects.length) return false;

            // Cover all selected text rectangles, including multi-line selections.
            const eraseRects = clientRects.map((rect) =>
                pdfRectFromViewport(
                    viewport,
                    Math.max(0, rect.left - pageRect.left - 1),
                    Math.max(0, rect.top - pageRect.top - 1),
                    rect.width + 2,
                    rect.height + 2
                )
            );

            const bounds = clientRects.reduce(
                (acc, rect) => ({
                    left: Math.min(acc.left, rect.left),
                    top: Math.min(acc.top, rect.top),
                    right: Math.max(acc.right, rect.right),
                    bottom: Math.max(acc.bottom, rect.bottom)
                }),
                {
                    left: clientRects[0].left,
                    top: clientRects[0].top,
                    right: clientRects[0].right,
                    bottom: clientRects[0].bottom
                }
            );

            // Take the closest available styling information from the selected text.
            const selectedSpans = Array.from(
                textLayer.querySelectorAll("span")
            ).filter((span) => {
                try {
                    return (
                        range.intersectsNode(span) &&
                        span.textContent.trim()
                    );
                } catch (_) {
                    return false;
                }
            });

            const sample = selectedSpans[0] || commonElement;
            const computed = sample
                ? window.getComputedStyle(sample)
                : null;

            const cssFontSize = computed
                ? parseFloat(computed.fontSize)
                : 14 * viewport.scale;

            const fontSize = Number.isFinite(cssFontSize)
                ? Math.max(
                    5,
                    Math.min(72, cssFontSize / viewport.scale)
                )
                : 14;

            const fontFamily = computed && computed.fontFamily
                ? computed.fontFamily
                : "Arial, Helvetica, sans-serif";

            const fontWeight =
                computed &&
                computed.fontWeight &&
                computed.fontWeight !== "normal"
                    ? computed.fontWeight
                    : "400";

            const fontStyle = computed && computed.fontStyle
                ? computed.fontStyle
                : "normal";

            // PDF.js commonly sets text-layer text to transparent.
            // When that happens, the original text color is not recoverable
            // from the text span's computed CSS color.
            const computedColor = computed ? computed.color : "";

            const color =
                computedColor &&
                !computedColor.includes("0, 0, 0, 0")
                    ? computedColor
                    : "#111827";

            const topLeft = viewport.convertToPdfPoint(
                bounds.left - pageRect.left,
                bounds.top - pageRect.top
            );

            const bottomRight = viewport.convertToPdfPoint(
                bounds.right - pageRect.left,
                bounds.bottom - pageRect.top
            );

            const beforeSnapshot = clone(
                getAnnotations(documentId)
            );

            const annotationId = makeId();

            const eraseAnnotations = eraseRects.map((rect) => ({
                id: makeId(),
                documentId,
                type: "erase",
                pageNumber,
                rect,
                pairedTextId: annotationId
            }));

            const annotation = {
                id: annotationId,
                documentId,
                type: "text",
                pageNumber,
                x: topLeft[0],
                y: topLeft[1],
                text: selectedText,
                fontSize,
                fontFamily,
                fontWeight,
                fontStyle,
                color,
                lineHeight:
                    computed && Number.isFinite(cssFontSize) &&
                    cssFontSize > 0
                        ? parseFloat(computed.lineHeight) / cssFontSize || 1.15
                        : 1.15,
                boxWidth: Math.max(
                    20,
                    Math.abs(bottomRight[0] - topLeft[0])
                ),
                pairedEraseIds: eraseAnnotations.map(
                    (item) => item.id
                ),
                pairedEraseId: eraseAnnotations.length
                    ? eraseAnnotations[0].id
                    : null
            };

            // Store the original state for Undo.
            recordHistory(documentId, beforeSnapshot);

            getAnnotations(documentId).push(
                ...eraseAnnotations,
                annotation
            );

            textEditSessions.set(annotationId, {
                documentId,
                pageNumber,
                originalText: selectedText,
                beforeSnapshot,
                wasReplacement: true
            });

            selection.removeAllRanges();

            renderAnnotationsForPage(documentId, pageNumber);

            const element = pagesContainer.querySelector(
                `.pdf-page[data-document-id="${CSS.escape(documentId)}"]` +
                `[data-page-number="${pageNumber}"]` +
                ` .pdf-text-annotation[data-annotation-id="${CSS.escape(annotationId)}"]`
            );

            if (element) {
                element.focus();
                selectAllContent(element);
            }

            setStatus(
                "Selected section ready to edit. Type to replace it. " +
                "Clear the text and click away to leave the section blank. " +
                "Use the drag handle to move the replacement or × to delete it."
            );

            updateHistoryButtons();

            return true;
        }


        function addTextAtClick(
            event,
            pageWrapper,
            viewport,
            pageNumber,
            documentId
        ) {
            const pageRect = pageWrapper.getBoundingClientRect();

            const xInViewport = event.clientX - pageRect.left;
            const yInViewport = event.clientY - pageRect.top;

            const point = viewport.convertToPdfPoint(
                xInViewport,
                yInViewport
            );

            const beforeSnapshot = clone(
                getAnnotations(documentId)
            );

            const annotation = {
                id: makeId(),
                documentId: String(documentId),
                type: "text",
                pageNumber,
                x: point[0],
                y: point[1],
                text: "",
                fontSize: 14,
                fontFamily: "Arial, Helvetica, sans-serif",
                fontWeight: "400",
                fontStyle: "normal",
                color: "#111827",
                lineHeight: 1.15,
                boxWidth: 180
            };

            recordHistory(documentId, beforeSnapshot);

            getAnnotations(documentId).push(annotation);

            textEditSessions.set(annotation.id, {
                documentId: String(documentId),
                pageNumber,
                originalText: "",
                beforeSnapshot,
                wasReplacement: false
            });

            renderAnnotationsForPage(documentId, pageNumber);

            const element = pagesContainer.querySelector(
                `.pdf-page[data-document-id="${CSS.escape(String(documentId))}"]` +
                `[data-page-number="${pageNumber}"]` +
                ` .pdf-text-annotation[data-annotation-id="${CSS.escape(annotation.id)}"]`
            );

            if (element) {
                element.focus();
                placeCaretAtEnd(element);
            }

            setStatus(
                "New text box added. Type directly on the page. " +
                "Use the drag handle to move it or × to delete it."
            );

            updateHistoryButtons();
        }

        function undo() {
            const selected = getSelectedDocument();

            if (!selected) {
                return;
            }

            const history = getHistory(selected.id);

            if (!history.undo.length) {
                return;
            }

            const current = clone(
                getAnnotations(selected.id)
            );

            const previous = history.undo.pop();

            history.redo.push(current);

            annotationsByDocument.set(
                selected.id,
                clone(previous)
            );

            renderAllAnnotations();
            updateHistoryButtons();

            setStatus(
                "Last change undone. Use Redo to restore it."
            );
        }

        function redo() {
            const selected = getSelectedDocument();

            if (!selected) {
                return;
            }

            const history = getHistory(selected.id);

            if (!history.redo.length) {
                return;
            }

            const current = clone(
                getAnnotations(selected.id)
            );

            const next = history.redo.pop();

            history.undo.push(current);

            annotationsByDocument.set(
                selected.id,
                clone(next)
            );

            renderAllAnnotations();
            updateHistoryButtons();

            setStatus(
                "Change restored. Use Undo to reverse it again."
            );
        }

        function processDragMove(event) {
            if (!activeDrag) {
                return;
            }

            const dx = event.clientX - activeDrag.startClientX;
            const dy = event.clientY - activeDrag.startClientY;

            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                activeDrag.moved = true;
            }

            activeDrag.currentDx = dx;
            activeDrag.currentDy = dy;

            if (activeDrag.moved) {
                activeDrag.elements.forEach((element) => {
                    element.style.transform =
                        `translate(${dx}px, ${dy}px)`;
                });
            }
        }

        function finishDrag() {
            if (!activeDrag) return;

            const drag = activeDrag;
            activeDrag = null;

            drag.elements.forEach((element) => {
                element.style.transform = "";
            });

            if (!drag.moved) return;

            const annotation = getAnnotation(
                drag.documentId,
                drag.annotationId
            );

            if (!annotation) return;

            const start = drag.viewport.convertToPdfPoint(
                drag.startClientX - drag.pageRect.left,
                drag.startClientY - drag.pageRect.top
            );

            const end = drag.viewport.convertToPdfPoint(
                drag.startClientX +
                    drag.currentDx -
                    drag.pageRect.left,
                drag.startClientY +
                    drag.currentDy -
                    drag.pageRect.top
            );

            const deltaX = end[0] - start[0];
            const deltaY = end[1] - start[1];

            recordHistory(
                drag.documentId,
                drag.beforeSnapshot
            );

            if (annotation.type === "highlight") {
                annotation.rect.x += deltaX;
                annotation.rect.y += deltaY;
            } else if (annotation.type === "text") {
                annotation.x += deltaX;
                annotation.y += deltaY;
            } else {
                return;
            }

            renderAnnotationsForPage(
                drag.documentId,
                drag.pageNumber
            );

            updateHistoryButtons();

            setStatus(
                annotation.type === "highlight"
                    ? "Highlight moved. Use Undo to reverse it."
                    : "Text moved. Use Undo to reverse it."
            );
        }

        async function saveEditedPdf() {
            const selected = getSelectedDocument();

            if (!selected || !selected.fileUrl) {
                showError("Select a PDF before saving.");
                return;
            }

            saveButton.disabled = true;

            const originalButtonText = saveButton.textContent;
            saveButton.textContent = "Exporting...";

            clearError();
            setStatus("Creating the edited PDF copy...");

            try {
                // Download the original PDF without changing the server copy.
                const response = await fetch(selected.fileUrl, {
                    credentials: "same-origin",
                });

                if (!response.ok) {
                    throw new Error(
                        `Could not load the original PDF (HTTP ${response.status}).`
                    );
                }

                const sourceBytes = await response.arrayBuffer();

                const pdfDocument = await PDFLib.PDFDocument.load(
                    sourceBytes
                );

                const annotations = clone(
                    getAnnotations(selected.id)
                );

                const fontCache = new Map();

                const yellow = PDFLib.rgb(1, 0.9, 0.15);
                const white = PDFLib.rgb(1, 1, 1);
                const defaultBlack = PDFLib.rgb(0.05, 0.05, 0.05);

                /*
                * Embed a standard PDF font that most closely matches
                * the replacement annotation's bold/italic styling.
                *
                * This does not reproduce arbitrary fonts embedded in
                * the original PDF. Exact font preservation requires
                * access to and embedding of the original font files.
                */
                async function getExportFont(annotation) {
                    const weight = String(
                        annotation.fontWeight || "400"
                    );

                    const style = String(
                        annotation.fontStyle || "normal"
                    );

                    const bold =
                        /bold/i.test(weight) ||
                        /^[6-9]00$/.test(weight);

                    const italic =
                        /italic|oblique/i.test(style);

                    const cacheKey = `${bold}-${italic}`;

                    if (!fontCache.has(cacheKey)) {
                        let standardFont;

                        if (bold && italic) {
                            standardFont =
                                PDFLib.StandardFonts.HelveticaBoldOblique;
                        } else if (bold) {
                            standardFont =
                                PDFLib.StandardFonts.HelveticaBold;
                        } else if (italic) {
                            standardFont =
                                PDFLib.StandardFonts.HelveticaOblique;
                        } else {
                            standardFont =
                                PDFLib.StandardFonts.Helvetica;
                        }

                        const embeddedFont =
                            await pdfDocument.embedFont(standardFont);

                        fontCache.set(cacheKey, embeddedFont);
                    }

                    return fontCache.get(cacheKey);
                }

                /*
                * Convert CSS colors into PDF colors.
                * Supports hexadecimal and rgb()/rgba() strings.
                */
                function getExportColor(cssColor) {
                    const value = String(
                        cssColor || ""
                    ).trim();

                    const hexMatch = value.match(
                        /^#?([0-9a-f]{6})$/i
                    );

                    if (hexMatch) {
                        const hex = hexMatch[1];

                        return PDFLib.rgb(
                            parseInt(hex.slice(0, 2), 16) / 255,
                            parseInt(hex.slice(2, 4), 16) / 255,
                            parseInt(hex.slice(4, 6), 16) / 255
                        );
                    }

                    const rgbMatch = value.match(
                        /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i
                    );

                    if (rgbMatch) {
                        return PDFLib.rgb(
                            Math.min(255, Number(rgbMatch[1])) / 255,
                            Math.min(255, Number(rgbMatch[2])) / 255,
                            Math.min(255, Number(rgbMatch[3])) / 255
                        );
                    }

                    return defaultBlack;
                }

                /*
                * Draw every annotation in its original page coordinate system.
                *
                * Highlight rectangles from a multi-line selection are exported
                * individually. Their shared highlightGroupId is for editing and
                * deletion in the browser; it does not change PDF rendering.
                */
                for (const annotation of annotations) {
                    const pageIndex = Number(annotation.pageNumber) - 1;

                    if (
                        !Number.isInteger(pageIndex) ||
                        pageIndex < 0 ||
                        pageIndex >= pdfDocument.getPageCount()
                    ) {
                        console.warn(
                            "Skipping annotation with invalid page number:",
                            annotation
                        );
                        continue;
                    }

                    const page = pdfDocument.getPage(pageIndex);

                    if (annotation.type === "highlight") {
                        const rect = annotation.rect;

                        if (
                            !rect ||
                            !Number.isFinite(rect.x) ||
                            !Number.isFinite(rect.y) ||
                            !Number.isFinite(rect.width) ||
                            !Number.isFinite(rect.height) ||
                            rect.width <= 0 ||
                            rect.height <= 0
                        ) {
                            continue;
                        }

                        page.drawRectangle({
                            x: rect.x,
                            y: rect.y,
                            width: rect.width,
                            height: rect.height,
                            color: yellow,
                            opacity: 0.4,
                            borderWidth: 0,
                        });

                        continue;
                    }

                    if (annotation.type === "erase") {
                        const rect = annotation.rect;

                        if (
                            !rect ||
                            !Number.isFinite(rect.x) ||
                            !Number.isFinite(rect.y) ||
                            !Number.isFinite(rect.width) ||
                            !Number.isFinite(rect.height) ||
                            rect.width <= 0 ||
                            rect.height <= 0
                        ) {
                            continue;
                        }

                        // This visually covers the original text.
                        // It does not securely remove the underlying PDF content.
                        page.drawRectangle({
                            x: rect.x,
                            y: rect.y,
                            width: rect.width,
                            height: rect.height,
                            color: white,
                            opacity: 1,
                            borderWidth: 0,
                        });

                        continue;
                    }

                    if (
                        annotation.type === "text" &&
                        typeof annotation.text === "string" &&
                        annotation.text.trim()
                    ) {
                        if (
                            !Number.isFinite(annotation.x) ||
                            !Number.isFinite(annotation.y)
                        ) {
                            continue;
                        }

                        const font = await getExportFont(annotation);
                        const color = getExportColor(annotation.color);
                        const fontSize = Number(annotation.fontSize) || 14;

                        const availablePageWidth = Math.max(
                            1,
                            page.getWidth() - annotation.x - 10
                        );

                        const requestedWidth =
                            Number(annotation.boxWidth) || availablePageWidth;

                        const maxWidth = Math.max(
                            1,
                            Math.min(
                                requestedWidth,
                                availablePageWidth
                            )
                        );

                        page.drawText(annotation.text, {
                            x: annotation.x,
                            y: annotation.y - fontSize,
                            size: fontSize,
                            font,
                            color,
                            maxWidth,
                            lineHeight:
                                fontSize *
                                (Number(annotation.lineHeight) || 1.15),
                        });
                    }
                }

                // Generate a new PDF file.
                const outputBytes = await pdfDocument.save();

                const blob = new Blob(
                    [outputBytes],
                    { type: "application/pdf" }
                );

                const downloadUrl = URL.createObjectURL(blob);
                const anchor = document.createElement("a");

                const safeBase = selected.filename
                    .replace(/\.pdf$/i, "")
                    .replace(/[\\/:*?"<>|]/g, "_");

                anchor.href = downloadUrl;
                anchor.download = `${safeBase}-edited.pdf`;

                document.body.appendChild(anchor);
                anchor.click();
                anchor.remove();

                // Allow the browser to begin the download before releasing the URL.
                window.setTimeout(() => {
                    URL.revokeObjectURL(downloadUrl);
                }, 1000);

                setStatus(
                    `Downloaded ${safeBase}-edited.pdf. The original uploaded PDF was not overwritten.`
                );
            } catch (error) {
                console.error("PDF export failed:", error);

                showError(
                    error.message ||
                    "Could not export the edited PDF."
                );
            } finally {
                saveButton.disabled = false;
                saveButton.textContent = originalButtonText;
            }
        }

        documentSelect.addEventListener("change", selectDocument);

        highlightButton.addEventListener(
            "click",
            highlightSelectedText
        );

        editButton.addEventListener("click", () => {
            setActiveTool(
                activeTool === "edit" ? null : "edit"
            );
        });

        undoButton.addEventListener("click", undo);
        redoButton.addEventListener("click", redo);
        saveButton.addEventListener("click", saveEditedPdf);

        window.addEventListener("pointermove", processDragMove);
        window.addEventListener("pointerup", finishDrag);
        window.addEventListener("pointercancel", finishDrag);

        // In Edit mode, dragging across original PDF text selects a section
        // and opens that section for inline editing.
        document.addEventListener("mouseup", () => {
            if (activeTool !== "edit") return;

            const selection = window.getSelection();

            if (
                !selection ||
                selection.isCollapsed ||
                !selection.rangeCount
            ) {
                return;
            }

            const range = selection.getRangeAt(0);
            const node = range.commonAncestorContainer;

            const commonElement = node.nodeType === Node.ELEMENT_NODE
                ? node
                : node.parentElement;

            if (
                !commonElement ||
                !commonElement.closest(".textLayer")
            ) {
                return;
            }

            createReplacementFromSelection(selection, range);
        });

        document.addEventListener("keydown", (event) => {
            const target = event.target;

            const editingText =
                target instanceof HTMLElement &&
                target.isContentEditable;

            const selection = window.getSelection();

            // In Edit mode, Delete/Backspace covers selected original PDF text.
            // Text being typed in a contenteditable annotation remains ordinary editable text.
            if (
                activeTool === "edit" &&
                !editingText &&
                (event.key === "Backspace" || event.key === "Delete") &&
                selection &&
                !selection.isCollapsed &&
                selection.rangeCount
            ) {
                const range = selection.getRangeAt(0);
                const node = range.commonAncestorContainer;

                const commonElement = node.nodeType === Node.ELEMENT_NODE
                    ? node
                    : node.parentElement;

                if (
                    commonElement &&
                    commonElement.closest(".textLayer")
                ) {
                    if (eraseSelectedText(selection, range)) {
                        event.preventDefault();
                    }

                    return;
                }
            }

            const isMac = navigator.platform
                .toLowerCase()
                .includes("mac");

            const modifier = isMac
                ? event.metaKey
                : event.ctrlKey;

            if (!modifier) {
                return;
            }

            // Preserve the browser's native text undo while a text annotation has focus.
            if (editingText) {
                return;
            }

            if (
                event.key.toLowerCase() === "z" &&
                event.shiftKey
            ) {
                event.preventDefault();
                redo();
            } else if (event.key.toLowerCase() === "z") {
                event.preventDefault();
                undo();
            } else if (event.key.toLowerCase() === "y") {
                event.preventDefault();
                redo();
            }
        });

        const initialDocument = getSelectedDocument();

        if (initialDocument) {
            loadPdf(
                initialDocument.fileUrl,
                initialDocument.filename,
                initialDocument.id
            );
        } else {
            setLoading(false);

            showError(
                "No uploaded PDF was found in this session. Return to Documents and upload a PDF first."
            );
        }
    });
})();