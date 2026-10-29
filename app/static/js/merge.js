/*
 * PDF Merger
 *
 * Responsibilities:
 * - Select PDFs uploaded in the current Flask session.
 * - Reorder documents using drag and drop.
 * - Send selected document IDs to the Flask merge endpoint.
 * - Download the resulting PDF.
 */

"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const app = document.getElementById("merge-app");

    if (!app) {
        return;
    }

    const mergeUrl = app.dataset.mergeUrl;
    const fileList = document.getElementById("merge-file-list");
    const selectAllButton = document.getElementById("merge-select-all");
    const clearButton = document.getElementById("merge-clear-selection");
    const mergeButton = document.getElementById("merge-submit");
    const statusElement = document.getElementById("merge-status");
    const errorElement = document.getElementById("merge-error");
    const selectedCountElement = document.getElementById(
        "merge-selected-count"
    );

    if (
        !mergeUrl ||
        !selectAllButton ||
        !clearButton ||
        !mergeButton ||
        !statusElement ||
        !errorElement ||
        !selectedCountElement
    ) {
        console.error("PDF merger page is missing required elements.");
        return;
    }

    let draggedRow = null;
    let isMerging = false;

    function getRows() {
        if (!fileList) {
            return [];
        }

        return Array.from(
            fileList.querySelectorAll(".merge-file-row")
        );
    }

    function getSelectedDocumentIds() {
        return getRows()
            .filter((row) => {
                const checkbox = row.querySelector(
                    ".merge-file-checkbox"
                );

                return checkbox && checkbox.checked;
            })
            .map((row) => row.dataset.documentId);
    }

    function setStatus(message) {
        statusElement.textContent = message;
    }

    function showError(message) {
        errorElement.textContent = message;
        errorElement.hidden = false;
    }

    function clearError() {
        errorElement.textContent = "";
        errorElement.hidden = true;
    }

    function updateOrderNumbers() {
        getRows().forEach((row, index) => {
            const orderNumber = row.querySelector(
                ".merge-order-number"
            );

            if (orderNumber) {
                orderNumber.textContent = String(index + 1);
                orderNumber.setAttribute(
                    "aria-label",
                    `Document order ${index + 1}`
                );
            }
        });
    }

    function updateSelectionState() {
        const rows = getRows();
        const selectedIds = getSelectedDocumentIds();
        const selectedCount = selectedIds.length;

        selectedCountElement.textContent =
            `${selectedCount} selected`;

        rows.forEach((row) => {
            const checkbox = row.querySelector(
                ".merge-file-checkbox"
            );

            row.classList.toggle(
                "is-selected",
                Boolean(checkbox && checkbox.checked)
            );
        });

        mergeButton.disabled =
            isMerging || selectedCount < 2;

        selectAllButton.disabled =
            isMerging || rows.length === 0;

        clearButton.disabled =
            isMerging || selectedCount === 0;

        if (!isMerging) {
            if (selectedCount < 2) {
                setStatus(
                    "Select at least two PDFs to merge. " +
                    "Drag documents to change their order."
                );
            } else {
                setStatus(
                    `${selectedCount} PDFs selected. ` +
                    "They will be merged in the order shown above."
                );
            }
        }
    }

    function selectAll() {
        getRows().forEach((row) => {
            const checkbox = row.querySelector(
                ".merge-file-checkbox"
            );

            if (checkbox) {
                checkbox.checked = true;
            }
        });

        updateSelectionState();
    }

    function clearSelection() {
        getRows().forEach((row) => {
            const checkbox = row.querySelector(
                ".merge-file-checkbox"
            );

            if (checkbox) {
                checkbox.checked = false;
            }
        });

        updateSelectionState();
    }

    function startDrag(event) {
        const handle = event.target.closest(
            ".merge-drag-handle"
        );

        if (!handle || !fileList) {
            event.preventDefault();
            return;
        }

        const row = handle.closest(".merge-file-row");

        if (!row || isMerging) {
            event.preventDefault();
            return;
        }

        draggedRow = row;
        row.classList.add("is-dragging");

        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(
            "text/plain",
            row.dataset.documentId || ""
        );
    }

    function dragOver(event) {
        if (!draggedRow || !fileList) {
            return;
        }

        event.preventDefault();
        event.dataTransfer.dropEffect = "move";

        const targetRow = event.target.closest(
            ".merge-file-row"
        );

        getRows().forEach((row) => {
            row.classList.remove("is-drop-target");
        });

        if (!targetRow || targetRow === draggedRow) {
            return;
        }

        targetRow.classList.add("is-drop-target");

        const bounds = targetRow.getBoundingClientRect();
        const insertAfter =
            event.clientY > bounds.top + bounds.height / 2;

        if (insertAfter) {
            fileList.insertBefore(
                draggedRow,
                targetRow.nextElementSibling
            );
        } else {
            fileList.insertBefore(
                draggedRow,
                targetRow
            );
        }
    }

    function finishDrag() {
        if (draggedRow) {
            draggedRow.classList.remove("is-dragging");
        }

        getRows().forEach((row) => {
            row.classList.remove("is-drop-target");
        });

        draggedRow = null;

        updateOrderNumbers();
        updateSelectionState();
    }

    async function mergePdfs() {
        if (isMerging) {
            return;
        }

        const documentIds = getSelectedDocumentIds();

        if (documentIds.length < 2) {
            showError("Select at least two PDFs to merge.");
            return;
        }

        clearError();

        isMerging = true;
        mergeButton.disabled = true;
        selectAllButton.disabled = true;
        clearButton.disabled = true;

        const originalButtonText = mergeButton.textContent;

        mergeButton.textContent = "Merging...";
        setStatus("Combining the selected PDF documents...");

        let downloadUrl = null;

        try {
            const response = await fetch(mergeUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                credentials: "same-origin",
                body: JSON.stringify({
                    document_ids: documentIds
                })
            });

            if (!response.ok) {
                let message = "The PDFs could not be merged.";

                try {
                    const result = await response.json();

                    if (result.message) {
                        message = result.message;
                    }
                } catch (_) {
                    // Retain the default error if the server response
                    // isn't JSON.
                }

                throw new Error(message);
            }

            const blob = await response.blob();

            if (!blob.size) {
                throw new Error(
                    "The server returned an empty PDF."
                );
            }

            downloadUrl = URL.createObjectURL(blob);

            const anchor = document.createElement("a");
            anchor.href = downloadUrl;
            anchor.download = "merged.pdf";

            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();

            setStatus(
                `Successfully merged ${documentIds.length} PDFs. ` +
                "Your merged.pdf download should begin shortly."
            );
        } catch (error) {
            console.error("PDF merge failed:", error);

            showError(
                error.message || "An unexpected error occurred."
            );

            setStatus("The merge operation failed.");
        } finally {
            if (downloadUrl) {
                window.setTimeout(() => {
                    URL.revokeObjectURL(downloadUrl);
                }, 1500);
            }

            isMerging = false;
            mergeButton.textContent = originalButtonText;

            updateSelectionState();
        }
    }

    if (fileList) {
        fileList.addEventListener("change", (event) => {
            if (
                event.target.classList.contains(
                    "merge-file-checkbox"
                )
            ) {
                updateSelectionState();
            }
        });

        fileList.addEventListener("dragstart", startDrag);
        fileList.addEventListener("dragover", dragOver);

        fileList.addEventListener("drop", (event) => {
            if (draggedRow) {
                event.preventDefault();
            }
        });

        fileList.addEventListener("dragend", finishDrag);

        fileList.addEventListener("keydown", (event) => {
            const handle = event.target.closest(
                ".merge-drag-handle"
            );

            if (!handle || !fileList) {
                return;
            }

            if (
                event.key !== "ArrowUp" &&
                event.key !== "ArrowDown"
            ) {
                return;
            }

            event.preventDefault();

            const row = handle.closest(".merge-file-row");

            if (!row) {
                return;
            }

            if (event.key === "ArrowUp") {
                const previous = row.previousElementSibling;

                if (previous) {
                    fileList.insertBefore(row, previous);
                }
            } else {
                const next = row.nextElementSibling;

                if (next) {
                    fileList.insertBefore(next, row);
                }
            }

            updateOrderNumbers();
            updateSelectionState();
        });
    }

    selectAllButton.addEventListener(
        "click",
        selectAll
    );

    clearButton.addEventListener(
        "click",
        clearSelection
    );

    mergeButton.addEventListener(
        "click",
        mergePdfs
    );

    updateOrderNumbers();
    updateSelectionState();
});