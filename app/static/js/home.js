document.addEventListener("DOMContentLoaded", () => {

    // =========================================
    // PAGE ELEMENTS
    // =========================================

    const uploadForm =
        document.querySelector("#upload-form");

    const fileInput =
        document.querySelector("#pdf-file");

    const statusElement =
        document.querySelector("#status");

    const uploadButton =
        document.querySelector(".upload-button");

    const uploadSection =
        document.querySelector("#upload-section");

    const workspace =
        document.querySelector("#workspace");

    const uploadedFileName =
        document.querySelector("#uploaded-file-name");

    const workspaceStatus =
        document.querySelector("#workspace-status");

    const pdfSelector =
        document.querySelector("#pdf-select");

    const additionalFileInput =
        document.querySelector("#additional-pdf-file");

    const addPdfButton =
        document.querySelector("#add-pdf-button");

    const deletePdfButton =
        document.querySelector("#delete-pdf-button");

    const pdfPages =
        document.querySelector("#pdf-pages");

    const pdfPreview =
        document.querySelector("#pdf-preview");

    const pageNumberInput =
        document.querySelector("#pdf-page-number");

    const pageCount =
        document.querySelector("#pdf-page-count");

    const previousPageButton =
        document.querySelector("#pdf-prev-page");

    const nextPageButton =
        document.querySelector("#pdf-next-page");

    const zoomOutButton =
        document.querySelector("#pdf-zoom-out");

    const zoomInButton =
        document.querySelector("#pdf-zoom-in");

    const zoomLevel =
        document.querySelector("#pdf-zoom-level");


    // =========================================
    // DOCUMENT STATE
    // =========================================

    // Store the PDFs associated with the current session.
    let documents = [];

    // Store the currently loaded PDF.js document.
    let pdfDocument = null;

    // Track the currently displayed page.
    let currentPage = 1;

    // Track the current zoom level.
    let zoom = 1;

    // Prevent an older PDF rendering operation from
    // replacing a newer selected document.
    let renderToken = 0;


    // =========================================
    // PDF.JS CONFIGURATION
    // =========================================

    // Configure the PDF.js worker.
    // The worker performs PDF processing separately
    // from the main browser thread.

    if (window.pdfjsLib) {

        pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

    }


    // =========================================
    // FILE VALIDATION
    // =========================================

    function isPdf(file) {

        // Some browsers do not provide the PDF MIME type.
        // Check the extension as a fallback.

        return (
            file.type === "application/pdf" ||
            file.name.toLowerCase().endsWith(".pdf")
        );

    }


    // =========================================
    // DISPLAY THE INITIAL UPLOAD SCREEN
    // =========================================

    function showUploadScreen() {

        // Show the initial upload section.
        uploadSection.style.display = "";

        // Hide the workspace.
        workspace.style.display = "none";

        // Clear the upload status.
        statusElement.textContent = "";

        // Clear the current document list.
        documents = [];

        // Remove all dropdown options.
        pdfSelector.replaceChildren();

        // Clear the PDF viewer.
        pdfPages.replaceChildren();

        // Reset the loaded PDF.
        pdfDocument = null;

        // Reset the displayed filename.
        uploadedFileName.textContent = "PDF";

        // Reset page navigation.
        pageNumberInput.value = "1";

        pageCount.textContent = "of 0";

        // Reset zoom.
        zoom = 1;

        updateZoomLabel();

        // Disable the delete button.
        deletePdfButton.disabled = true;

        // Disable the viewer controls.
        updateViewerControls();

        // Update the Merge card.
        updateMergeCard();

    }


    // =========================================
    // DISPLAY THE WORKSPACE
    // =========================================

    function showWorkspace() {

        // Hide the initial upload screen.
        uploadSection.style.display = "none";

        // Display the PDF workspace.
        workspace.style.display = "grid";

    }


    // =========================================
    // UPDATE THE ZOOM LABEL
    // =========================================

    function updateZoomLabel() {

        zoomLevel.textContent =
            `${Math.round(zoom * 100)}%`;

    }


    // =========================================
    // UPDATE PDF VIEWER CONTROLS
    // =========================================

    function updateViewerControls() {

        const hasPdf =
            Boolean(pdfDocument);

        const totalPages =
            pdfDocument ? pdfDocument.numPages : 0;

        // Previous page button.
        previousPageButton.disabled =
            !hasPdf || currentPage <= 1;

        // Next page button.
        nextPageButton.disabled =
            !hasPdf || currentPage >= totalPages;

        // Page number input.
        pageNumberInput.disabled =
            !hasPdf;

        // Zoom controls.
        zoomOutButton.disabled =
            !hasPdf || zoom <= 0.5;

        zoomInButton.disabled =
            !hasPdf || zoom >= 2.5;

        // Delete button.
        deletePdfButton.disabled =
            documents.length === 0;

    }


    // =========================================
    // UPDATE THE MERGE CARD
    // =========================================

    function updateMergeCard() {

        const mergeCard =
            document.querySelector(
                'a[href*="merge"]'
            );

        if (!mergeCard) {
            return;
        }

        // At least two PDFs are required to merge.
        const mergeDisabled =
            documents.length < 2;

        mergeCard.classList.toggle(
            "disabled",
            mergeDisabled
        );

        mergeCard.setAttribute(
            "aria-disabled",
            String(mergeDisabled)
        );

        mergeCard.title = mergeDisabled
            ? "Upload at least two PDFs to merge."
            : "";

    }


    // =========================================
    // DISPLAY THE CURRENT PDF
    // =========================================

    async function renderPdf(documentInfo) {

        // Create a new rendering token.
        const token = ++renderToken;

        // Clear the previous PDF pages.
        pdfPages.replaceChildren();

        // Reset the loaded PDF.
        pdfDocument = null;

        // Reset the current page.
        currentPage = 1;

        // Reset the page input.
        pageNumberInput.value = "1";

        // Reset the page count.
        pageCount.textContent = "of …";

        // Update the viewer controls.
        updateViewerControls();


        // -------------------------------------
        // Check that a PDF was selected
        // -------------------------------------

        if (!documentInfo) {

            pageCount.textContent = "of 0";

            statusElement.textContent =
                "Select a PDF to preview.";

            return;

        }


        // -------------------------------------
        // Check that PDF.js loaded
        // -------------------------------------

        if (!window.pdfjsLib) {

            pageCount.textContent = "of 0";

            statusElement.textContent =
                "PDF preview library failed to load. Refresh the page and try again.";

            return;

        }


        try {

            // ---------------------------------
            // LOAD THE PDF
            // ---------------------------------

            const loadedPdf =
                await pdfjsLib.getDocument(
                    documentInfo.file_url
                ).promise;


            // Stop if another PDF was selected.
            if (token !== renderToken) {
                return;
            }


            // Store the loaded PDF.
            pdfDocument = loadedPdf;


            // Update the page count.
            pageCount.textContent =
                `of ${loadedPdf.numPages}`;


            // ---------------------------------
            // RENDER PDF PAGES
            // ---------------------------------

            for (
                let pageNum = 1;
                pageNum <= loadedPdf.numPages;
                pageNum++
            ) {

                // Stop if another PDF was selected.
                if (token !== renderToken) {
                    return;
                }


                // Get the current PDF page.
                const page =
                    await loadedPdf.getPage(pageNum);


                // Create the page viewport.
                const viewport =
                    page.getViewport({
                        scale: 1.25 * zoom
                    });


                // Create a canvas for the page.
                const canvas =
                    document.createElement("canvas");


                canvas.className =
                    "pdf-page";


                // Store the page number.
                canvas.dataset.pageNumber =
                    String(pageNum);


                // Get the canvas rendering context.
                const context =
                    canvas.getContext("2d");


                // Use device pixel ratio for sharper rendering.
                const pixelRatio =
                    window.devicePixelRatio || 1;


                // Set the actual canvas dimensions.
                canvas.width =
                    Math.floor(
                        viewport.width * pixelRatio
                    );

                canvas.height =
                    Math.floor(
                        viewport.height * pixelRatio
                    );


                // Set the displayed canvas dimensions.
                canvas.style.width =
                    `${viewport.width}px`;

                canvas.style.height =
                    `${viewport.height}px`;


                // Add the page to the viewer.
                pdfPages.appendChild(canvas);


                // Render the PDF page.
                await page.render({

                    canvasContext: context,

                    viewport: viewport,

                    transform:
                        pixelRatio !== 1
                            ? [
                                pixelRatio,
                                0,
                                0,
                                pixelRatio,
                                0,
                                0
                            ]
                            : null

                }).promise;

            }


            // ---------------------------------
            // FINISH RENDERING
            // ---------------------------------

            if (token === renderToken) {

                // Clear previous errors.
                statusElement.textContent = "";

                // Display the first page.
                goToPage(1);

                // Update the controls.
                updateViewerControls();

            }


        } catch (error) {

            // Only display errors for the current PDF.
            if (token === renderToken) {

                pageCount.textContent = "of 0";

                statusElement.textContent =
                    `Could not display PDF: ${error.message}`;

                updateViewerControls();

            }

        }

    }


    // =========================================
    // NAVIGATE TO A PDF PAGE
    // =========================================

    function goToPage(page) {

        // Get all rendered PDF pages.
        const canvases =
            pdfPages.querySelectorAll(
                ".pdf-page"
            );


        // Stop if no pages are rendered.
        if (!canvases.length) {
            return;
        }


        // Keep the page number within the valid range.
        currentPage = Math.max(
            1,
            Math.min(
                Number(page) || 1,
                canvases.length
            )
        );


        // Update the page number input.
        pageNumberInput.value =
            String(currentPage);


        // Scroll to the selected page.
        canvases[currentPage - 1].scrollIntoView({

            behavior: "smooth",

            block: "start"

        });


        // Update the viewer controls.
        updateViewerControls();

    }


    // =========================================
    // DISPLAY THE SELECTED DOCUMENT
    // =========================================

    async function renderDocument(documentId) {

        // Remove the old dropdown options.
        pdfSelector.replaceChildren();


        // =====================================
        // POPULATE THE PDF SELECTOR
        // =====================================

        documents.forEach((pdfDocumentInfo) => {

            // Create a dropdown option.
            const option =
                document.createElement("option");


            // Store the unique PDF ID.
            option.value =
                pdfDocumentInfo.id;


            // Display the PDF filename.
            option.textContent =
                pdfDocumentInfo.filename;


            // Add the option to the dropdown.
            pdfSelector.appendChild(option);

        });


        // =====================================
        // FIND THE REQUESTED PDF
        // =====================================

        // Find the requested PDF.
        // Fall back to the first PDF if necessary.

        const selectedDocument =
            documents.find(
                document =>
                    String(document.id) ===
                    String(documentId)
            ) || documents[0];


        // Update the Merge card.
        updateMergeCard();


        // =====================================
        // CHECK WHETHER DOCUMENTS EXIST
        // =====================================

        if (!selectedDocument) {

            showUploadScreen();

            return;

        }


        // =====================================
        // UPDATE THE SELECTED DOCUMENT
        // =====================================

        // Update the dropdown selection.
        pdfSelector.value =
            selectedDocument.id;


        // Update the displayed filename.
        uploadedFileName.textContent =
            selectedDocument.filename;


        // Enable the delete button.
        deletePdfButton.disabled = false;


        // =====================================
        // LOAD THE SELECTED PDF
        // =====================================

        await renderPdf(
            selectedDocument
        );

    }


    // =========================================
    // UPDATE THE CURRENT DOCUMENT IN FLASK
    // =========================================

    async function postCurrentDocument(documentId) {

        // Tell Flask which PDF is now selected.
        const response =
            await fetch(
                "/documents/current",
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({
                        document_id: documentId
                    })
                }
            );


        // Read the server response.
        const result =
            await response.json();


        // Handle a failed selection update.
        if (!response.ok) {

            throw new Error(
                result.error ||
                "Could not update the selected PDF."
            );

        }

    }


    // =========================================
    // PREVENT INVALID MERGE NAVIGATION
    // =========================================

    const mergeCard =
        document.querySelector(
            'a[href*="merge"]'
        );


    if (mergeCard) {

        mergeCard.addEventListener(
            "click",
            (event) => {

                // Do not open Merge when there is
                // only one PDF in the workspace.

                if (documents.length < 2) {

                    event.preventDefault();

                    statusElement.textContent =
                        "Upload at least two PDFs to merge.";

                }

            }
        );

    }


    // =========================================
    // FILE SELECTION
    // =========================================

    fileInput.addEventListener(
        "change",
        () => {

            const files =
                Array.from(fileInput.files);


            // Clear the status if the selection is empty.
            if (!files.length) {

                statusElement.textContent = "";

                return;

            }


            // Make sure every selected file is a PDF.
            if (files.some(file => !isPdf(file))) {

                statusElement.textContent =
                    "Please select PDF files only.";

                return;

            }


            // Show how many PDFs have been selected.
            statusElement.textContent =
                `${files.length} PDF(s) selected.`;

        }
    );


    // =========================================
    // SWITCH BETWEEN UPLOADED PDFS
    // =========================================

    pdfSelector.addEventListener(
        "change",
        async () => {

            const documentId =
                pdfSelector.value;


            // Find the selected PDF.
            const selectedDocument =
                documents.find(
                    document =>
                        String(document.id) ===
                        String(documentId)
                );


            // Stop if the document was not found.
            if (!selectedDocument) {
                return;
            }


            // Update the preview immediately.
            await renderDocument(documentId);


            try {

                // Tell Flask which PDF is now selected.
                await postCurrentDocument(
                    documentId
                );

            } catch (error) {

                statusElement.textContent =
                    error.message;

            }

        }
    );


    // =========================================
    // UPLOAD PDF FILES
    // =========================================

    uploadForm.addEventListener(
        "submit",
        async (event) => {

            // Prevent the browser from reloading the page.
            event.preventDefault();


            const files =
                Array.from(fileInput.files);


            // -------------------------------------
            // VALIDATE THE SELECTED FILES
            // -------------------------------------

            if (!files.length) {

                statusElement.textContent =
                    "Please select at least one PDF.";

                return;

            }


            if (files.some(file => !isPdf(file))) {

                statusElement.textContent =
                    "Please select PDF files only.";

                return;

            }


            // -------------------------------------
            // CREATE FORMDATA
            // -------------------------------------

            const formData =
                new FormData();


            // Use the same "files" field for every PDF.
            files.forEach((file) => {

                formData.append(
                    "files",
                    file
                );

            });


            // -------------------------------------
            // SHOW THE UPLOADING STATE
            // -------------------------------------

            uploadButton.disabled = true;

            uploadButton.textContent =
                "Uploading...";

            statusElement.textContent =
                "Uploading your PDFs...";


            try {

                // ---------------------------------
                // SEND THE PDF FILES TO FLASK
                // ---------------------------------

                const response =
                    await fetch(
                        "/upload",
                        {
                            method: "POST",

                            body: formData
                        }
                    );


                // ---------------------------------
                // READ THE SERVER RESPONSE
                // ---------------------------------

                const result =
                    await response.json();


                // ---------------------------------
                // HANDLE UPLOAD ERRORS
                // ---------------------------------

                if (!response.ok) {

                    throw new Error(
                        result.error ||
                        "Upload failed."
                    );

                }


                // ---------------------------------
                // SAVE THE RETURNED DOCUMENT LIST
                // ---------------------------------

                documents =
                    result.files || [];


                if (!documents.length) {

                    throw new Error(
                        "The server did not return any PDF URLs."
                    );

                }


                // ---------------------------------
                // UPDATE THE WORKSPACE
                // ---------------------------------

                workspaceStatus.textContent =
                    `${documents.length} PDF(s) ready to edit.`;


                // Switch from upload screen to workspace.
                showWorkspace();


                // Display the most recently uploaded PDF.
                await renderDocument(
                    result.current_id
                );


                // ---------------------------------
                // SCROLL TO THE WORKSPACE
                // ---------------------------------

                workspace.scrollIntoView({

                    behavior: "smooth",

                    block: "start"

                });


                // Clear the selected files.
                fileInput.value = "";


                // Clear the status message.
                statusElement.textContent = "";


            } catch (error) {

                // Display any upload or server error.
                statusElement.textContent =
                    error.message;


            } finally {

                // ---------------------------------
                // RESTORE THE UPLOAD BUTTON
                // ---------------------------------

                uploadButton.disabled =
                    false;

                uploadButton.textContent =
                    "Upload PDF(s)";

            }

        }
    );


    // =========================================
    // ADD PDF BUTTON
    // =========================================

    addPdfButton.addEventListener(
        "click",
        () => {

            // Open the additional PDF file picker.
            additionalFileInput.click();

        }
    );


    // =========================================
    // ADD PDF FILES TO THE WORKSPACE
    // =========================================

    additionalFileInput.addEventListener(
        "change",
        async () => {

            const files =
                Array.from(
                    additionalFileInput.files
                );


            // Stop if no files were selected.
            if (!files.length) {
                return;
            }


            // -------------------------------------
            // VALIDATE THE SELECTED FILES
            // -------------------------------------

            if (files.some(file => !isPdf(file))) {

                statusElement.textContent =
                    "Please select PDF files only.";

                additionalFileInput.value = "";

                return;

            }


            // -------------------------------------
            // CREATE FORMDATA
            // -------------------------------------

            const formData =
                new FormData();


            // Add every selected PDF.
            files.forEach((file) => {

                formData.append(
                    "files",
                    file
                );

            });


            // -------------------------------------
            // SHOW THE ADDING STATE
            // -------------------------------------

            addPdfButton.disabled = true;

            addPdfButton.textContent =
                "Adding...";

            statusElement.textContent =
                "Adding PDFs to your workspace...";


            try {

                // ---------------------------------
                // SEND THE PDFs TO FLASK
                // ---------------------------------

                const response =
                    await fetch(
                        "/upload",
                        {
                            method: "POST",

                            body: formData
                        }
                    );


                // ---------------------------------
                // READ THE SERVER RESPONSE
                // ---------------------------------

                const result =
                    await response.json();


                // ---------------------------------
                // HANDLE UPLOAD ERRORS
                // ---------------------------------

                if (!response.ok) {

                    throw new Error(
                        result.error ||
                        "Could not add PDFs."
                    );

                }


                // ---------------------------------
                // UPDATE THE DOCUMENT LIST
                // ---------------------------------

                documents =
                    result.files || [];


                if (!documents.length) {

                    throw new Error(
                        "The server did not return any PDF URLs."
                    );

                }


                // ---------------------------------
                // UPDATE THE WORKSPACE
                // ---------------------------------

                workspaceStatus.textContent =
                    `${documents.length} PDF(s) ready to edit.`;


                // Display the newly uploaded PDF.
                await renderDocument(
                    result.current_id
                );


                // Clear the status message.
                statusElement.textContent = "";


            } catch (error) {

                // Display upload or server errors.
                statusElement.textContent =
                    error.message;


            } finally {

                // ---------------------------------
                // RESTORE THE ADD PDF BUTTON
                // ---------------------------------

                addPdfButton.disabled = false;

                addPdfButton.textContent =
                    "Add PDF(s)";


                // Clear the file picker.
                additionalFileInput.value = "";

            }

        }
    );


    // =========================================
    // DELETE THE SELECTED PDF
    // =========================================

    deletePdfButton.addEventListener(
        "click",
        async () => {

            // Get the selected PDF ID.
            const documentId =
                pdfSelector.value;


            // Stop if nothing is selected.
            if (!documentId) {
                return;
            }


            // Find the selected PDF.
            const selectedDocument =
                documents.find(
                    document =>
                        String(document.id) ===
                        String(documentId)
                );


            // Stop if the document was not found.
            if (!selectedDocument) {
                return;
            }


            // Confirm deletion.
            const confirmed =
                window.confirm(
                    `Delete "${selectedDocument.filename}" from this workspace?`
                );


            if (!confirmed) {
                return;
            }


            // -------------------------------------
            // SHOW THE DELETING STATE
            // -------------------------------------

            deletePdfButton.disabled = true;

            statusElement.textContent =
                "Deleting PDF...";


            try {

                // ---------------------------------
                // DELETE THE PDF FROM FLASK
                // ---------------------------------

                const response =
                    await fetch(
                        `/documents/${encodeURIComponent(documentId)}`,
                        {
                            method: "DELETE"
                        }
                    );


                // ---------------------------------
                // READ THE SERVER RESPONSE
                // ---------------------------------

                const result =
                    await response.json();


                // ---------------------------------
                // HANDLE DELETE ERRORS
                // ---------------------------------

                if (!response.ok) {

                    throw new Error(
                        result.error ||
                        "Could not delete PDF."
                    );

                }


                // ---------------------------------
                // UPDATE THE DOCUMENT LIST
                // ---------------------------------

                documents =
                    result.files || [];


                // ---------------------------------
                // CHECK WHETHER DOCUMENTS REMAIN
                // ---------------------------------

                // If the last PDF was deleted,
                // return to the initial upload screen.

                if (!documents.length) {

                    showUploadScreen();

                    return;

                }


                // ---------------------------------
                // UPDATE THE WORKSPACE
                // ---------------------------------

                workspaceStatus.textContent =
                    `${documents.length} PDF(s) ready to edit.`;


                // Display the remaining selected PDF.
                await renderDocument(
                    result.current_id
                );


                // Clear the status message.
                statusElement.textContent = "";


            } catch (error) {

                // Display delete or server errors.
                statusElement.textContent =
                    error.message;


            } finally {

                // Re-enable Delete if documents remain.
                deletePdfButton.disabled =
                    documents.length === 0;

            }

        }
    );


    // =========================================
    // PREVIOUS PAGE
    // =========================================

    previousPageButton.addEventListener(
        "click",
        () => {

            goToPage(
                currentPage - 1
            );

        }
    );


    // =========================================
    // NEXT PAGE
    // =========================================

    nextPageButton.addEventListener(
        "click",
        () => {

            goToPage(
                currentPage + 1
            );

        }
    );


    // =========================================
    // PAGE NUMBER INPUT
    // =========================================

    pageNumberInput.addEventListener(
        "change",
        () => {

            goToPage(
                pageNumberInput.value
            );

        }
    );


    // =========================================
    // CHANGE PDF ZOOM
    // =========================================

    async function changeZoom(amount) {

        // Stop if no PDF is loaded.
        if (!pdfDocument) {
            return;
        }


        // Limit the zoom level.
        zoom = Math.max(
            0.5,
            Math.min(
                2.5,
                zoom + amount
            )
        );


        // Update the zoom label.
        updateZoomLabel();


        // Find the currently selected PDF.
        const selectedDocument =
            documents.find(
                document =>
                    String(document.id) ===
                    String(pdfSelector.value)
            );


        // Re-render the selected PDF at the new zoom.
        if (selectedDocument) {

            await renderPdf(
                selectedDocument
            );

        }

    }


    // =========================================
    // ZOOM OUT
    // =========================================

    zoomOutButton.addEventListener(
        "click",
        () => {

            changeZoom(-0.1);

        }
    );


    // =========================================
    // ZOOM IN
    // =========================================

    zoomInButton.addEventListener(
        "click",
        () => {

            changeZoom(0.1);

        }
    );


    // =========================================
    // RESTORE DOCUMENTS AFTER PAGE REFRESH
    // =========================================

    async function restoreDocuments() {

        try {

            // Ask Flask for documents saved in the session.
            const response =
                await fetch(
                    "/documents"
                );


            // Leave the upload screen visible if
            // the server cannot restore the document list.

            if (!response.ok) {
                return;
            }


            // Read the server response.
            const result =
                await response.json();


            // Restore the document list.
            documents =
                result.files || [];


            // No previous uploads?
            // Keep the upload screen visible.

            if (!documents.length) {

                showUploadScreen();

                return;

            }


            // -------------------------------------
            // RESTORE THE WORKSPACE
            // -------------------------------------

            workspaceStatus.textContent =
                `${documents.length} PDF(s) available in this session.`;


            // Show the workspace.
            showWorkspace();


            // Restore the previously selected PDF.
            await renderDocument(
                result.current_id
            );


        } catch (error) {

            // Log restoration errors for debugging.
            console.error(
                "Could not restore uploaded PDFs:",
                error
            );

        }

    }


    // =========================================
    // INITIALIZE THE PAGE
    // =========================================

    // Run when the page loads to restore any PDFs
    // that were previously uploaded in this session.

    restoreDocuments();

});