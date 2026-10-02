/*
    PDF Workspace - Home Page JavaScript

    Handles:
        - PDF uploads
        - Workspace uploads
        - Stored PDF selection
        - Select All
        - Open Selected
        - Delete Selected
        - Individual stored PDF open/delete
        - Workspace document list
        - PDF.js viewer
        - Page navigation
        - Session workspace persistence
*/


/* =========================================================
   DOM ELEMENTS
   ========================================================= */

const uploadForm =
    document.getElementById("upload-form");

const pdfInput =
    document.getElementById("pdf-file");

const workspacePdfInput =
    document.getElementById("workspace-pdf-input");

const selectedFiles =
    document.getElementById("selected-files");

const status =
    document.getElementById("status");

const uploadSection =
    document.getElementById("upload-section");

const workspace =
    document.getElementById("workspace");

const documentList =
    document.getElementById("document-list");

const pdfCount =
    document.getElementById("pdf-count");

const uploadedFileName =
    document.getElementById("uploaded-file-name");

const workspaceStatus =
    document.getElementById("workspace-status");

const mergeCard =
    document.getElementById("merge-card");

const pdfPages =
    document.getElementById("pdf-pages");

const pdfLoading =
    document.getElementById("pdf-loading");

const pdfError =
    document.getElementById("pdf-error");

const previousPageButton =
    document.getElementById("previous-page");

const nextPageButton =
    document.getElementById("next-page");

const currentPageElement =
    document.getElementById("current-page");

const totalPagesElement =
    document.getElementById("total-pages");


/* =========================================================
   STORED PDF ELEMENTS
   ========================================================= */

const storedPdfsSection =
    document.getElementById("stored-pdfs-section");

const storedPdfsList =
    document.getElementById("stored-pdfs-list");

const selectAllStoredPdfs =
    document.getElementById("stored-select-all");

const openSelectedStoredButton =
    document.getElementById("open-selected-stored");

const deleteSelectedStoredButton =
    document.getElementById("delete-selected-stored");


/* =========================================================
   STATE
   ========================================================= */

let pdfs =
    Array.isArray(window.initialPdfs)
        ? [...window.initialPdfs]
        : [];

let activePdfIndex =
    0;

let currentPdf =
    null;

let currentPdfDocument =
    null;

let currentPage =
    1;

let totalPages =
    1;

let renderingPage =
    false;


/* =========================================================
   PDF DATA NORMALIZATION
   ========================================================= */

/*
    The application can receive PDFs in slightly different
    shapes depending on which Flask route returned them.

    We normalize them so the rest of the application always
    has:

        {
            filename: "...",
            display_name: "...",
            file_url: "..."
        }
*/

function normalizePdf(pdf) {

    if (!pdf) {
        return null;
    }


    if (typeof pdf === "string") {

        return {
            filename: pdf,
            display_name: pdf,
            file_url: `/uploads/${encodeURIComponent(pdf)}`
        };
    }


    const filename =
        pdf.filename ||
        pdf.name ||
        pdf.original_filename ||
        "";


    const fileUrl =
        pdf.file_url ||
        pdf.url ||
        pdf.path ||
        pdf.href ||
        "";


    const displayName =
        pdf.display_name ||
        pdf.original_name ||
        pdf.name ||
        filename ||
        "PDF";


    if (!filename) {
        return null;
    }


    return {
        ...pdf,

        filename:
            filename,

        display_name:
            displayName,

        file_url:
            fileUrl
    };
}


function normalizePdfList(list) {

    if (!Array.isArray(list)) {
        return [];
    }


    return list
        .map(normalizePdf)
        .filter(Boolean);
}


/* =========================================================
   REMOVE DUPLICATES
   ========================================================= */

function removeDuplicatePdfs() {

    const seen =
        new Set();


    pdfs =
        normalizePdfList(pdfs)
            .filter(pdf => {

                if (!pdf.filename) {
                    return false;
                }


                if (
                    seen.has(
                        pdf.filename
                    )
                ) {
                    return false;
                }


                seen.add(
                    pdf.filename
                );


                return true;
            });
}


/* =========================================================
   PDF HELPERS
   ========================================================= */

function getPdfFilename(pdf) {

    const normalized =
        normalizePdf(pdf);

    return normalized
        ? normalized.filename
        : "";
}


function getPdfDisplayName(pdf) {

    const normalized =
        normalizePdf(pdf);

    return normalized
        ? normalized.display_name
        : "PDF";
}


function getPdfUrl(pdf) {

    const normalized =
        normalizePdf(pdf);


    if (!normalized) {
        return "";
    }


    /*
        IMPORTANT:

        Prefer Flask's file_url.

        This is what the existing application
        already returns from /upload.
    */

    if (normalized.file_url) {

        return normalized.file_url;
    }


    /*
        Fallback only if a route gives us a
        filename without a URL.
    */

    if (normalized.filename) {

        return `/uploads/${encodeURIComponent(
            normalized.filename
        )}`;
    }


    return "";
}


/* =========================================================
   STATUS
   ========================================================= */

function showStatus(
    message,
    isError = false
) {

    if (!status) {
        return;
    }


    status.textContent =
        message;


    status.classList.toggle(
        "error",
        isError
    );
}


/* =========================================================
   SAVE WORKSPACE
   ========================================================= */

async function saveWorkspace() {

    try {

        const response =
            await fetch(
                "/workspace/update",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        pdfs: pdfs
                    })
                }
            );


        if (!response.ok) {

            console.error(
                "Workspace update failed:",
                response.status
            );

            return false;
        }


        return true;


    } catch (error) {

        console.error(
            "Workspace save error:",
            error
        );

        return false;
    }
}


/* =========================================================
   UPDATE WORKSPACE UI
   ========================================================= */

function updateWorkspaceUI() {

    removeDuplicatePdfs();


    if (pdfCount) {

        pdfCount.textContent =
            pdfs.length;
    }


    if (pdfs.length === 0) {

        if (uploadSection) {
            uploadSection.style.display =
                "";
        }


        if (workspace) {
            workspace.style.display =
                "none";
        }


        if (uploadedFileName) {
            uploadedFileName.textContent =
                "PDF";
        }


        if (workspaceStatus) {
            workspaceStatus.textContent =
                "Upload a PDF to get started.";
        }


        renderDocumentList();

        updateMergeCard();

        return;
    }


    if (uploadSection) {

        /*
            Keep the upload area hidden once
            there are PDFs in the workspace.
        */

        uploadSection.style.display =
            "none";
    }


    if (workspace) {

        workspace.style.display =
            "";
    }


    if (
        activePdfIndex < 0 ||
        activePdfIndex >= pdfs.length
    ) {

        activePdfIndex =
            0;
    }


    if (uploadedFileName) {

        uploadedFileName.textContent =
            getPdfDisplayName(
                pdfs[activePdfIndex]
            );
    }


    if (workspaceStatus) {

        workspaceStatus.textContent =
            "Your PDFs are ready to edit.";
    }


    renderDocumentList();

    updateMergeCard();
}


/* =========================================================
   DOCUMENT LIST
   ========================================================= */

function renderDocumentList() {

    if (!documentList) {
        return;
    }


    documentList.innerHTML =
        "";


    pdfs.forEach(
        (pdf, index) => {

            const item =
                document.createElement(
                    "div"
                );


            item.className =
                "document-item";


            if (
                index ===
                activePdfIndex
            ) {

                item.classList.add(
                    "active"
                );
            }


            item.dataset.index =
                String(index);


            const button =
                document.createElement(
                    "button"
                );


            button.type =
                "button";


            button.className =
                "document-item-button";


            button.title =
                getPdfDisplayName(pdf);


            const name =
                document.createElement(
                    "span"
                );


            name.className =
                "document-item-name";


            name.textContent =
                getPdfDisplayName(pdf);


            button.appendChild(
                name
            );


            button.addEventListener(
                "click",
                () => {

                    switchToPdf(
                        index
                    );
                }
            );


            const deleteButton =
                document.createElement(
                    "button"
                );


            deleteButton.type =
                "button";


            deleteButton.className =
                "document-delete-button";


            deleteButton.title =
                `Remove ${getPdfDisplayName(pdf)}`;


            deleteButton.setAttribute(
                "aria-label",
                `Remove ${getPdfDisplayName(pdf)}`
            );


            deleteButton.textContent =
                "×";


            deleteButton.addEventListener(
                "click",
                event => {

                    event.stopPropagation();

                    deleteWorkspacePdf(
                        index
                    );
                }
            );


            item.appendChild(
                button
            );


            item.appendChild(
                deleteButton
            );


            documentList.appendChild(
                item
            );
        }
    );
}


/* =========================================================
   SWITCH WORKSPACE PDF
   ========================================================= */

async function switchToPdf(index) {

    if (
        index < 0 ||
        index >= pdfs.length
    ) {
        return;
    }


    activePdfIndex =
        index;


    currentPage =
        1;


    updateWorkspaceUI();


    await loadPdf(
        pdfs[activePdfIndex]
    );
}


/* =========================================================
   DELETE PDF FROM WORKSPACE
   ========================================================= */

async function deleteWorkspacePdf(index) {

    if (
        index < 0 ||
        index >= pdfs.length
    ) {
        return;
    }


    const pdf =
        pdfs[index];


    const filename =
        getPdfFilename(pdf);


    const confirmed =
        window.confirm(
            `Remove "${getPdfDisplayName(pdf)}" from your workspace?`
        );


    if (!confirmed) {
        return;
    }


    pdfs.splice(
        index,
        1
    );


    if (
        activePdfIndex >
        index
    ) {

        activePdfIndex--;
    }


    if (
        activePdfIndex >=
        pdfs.length
    ) {

        activePdfIndex =
            Math.max(
                0,
                pdfs.length - 1
            );
    }


    await saveWorkspace();


    updateWorkspaceUI();


    if (pdfs.length > 0) {

        await loadPdf(
            pdfs[activePdfIndex]
        );

    } else {

        clearPdfViewer();
    }


    console.log(
        "Removed workspace PDF:",
        filename
    );
}


/* =========================================================
   MERGE CARD
   ========================================================= */

function updateMergeCard() {

    if (!mergeCard) {
        return;
    }


    if (pdfs.length < 2) {

        mergeCard.classList.add(
            "disabled"
        );


        mergeCard.setAttribute(
            "aria-disabled",
            "true"
        );


        mergeCard.setAttribute(
            "tabindex",
            "-1"
        );


    } else {

        mergeCard.classList.remove(
            "disabled"
        );


        mergeCard.removeAttribute(
            "aria-disabled"
        );


        mergeCard.removeAttribute(
            "tabindex"
        );
    }
}


/* =========================================================
   FILE SELECTION DISPLAY
   ========================================================= */

if (pdfInput) {

    pdfInput.addEventListener(
        "change",
        () => {

            if (!selectedFiles) {
                return;
            }


            selectedFiles.innerHTML =
                "";


            Array.from(
                pdfInput.files || []
            ).forEach(
                file => {

                    const item =
                        document.createElement(
                            "div"
                        );


                    item.className =
                        "selected-file";


                    item.textContent =
                        file.name;


                    selectedFiles.appendChild(
                        item
                    );
                }
            );
        }
    );
}


/* =========================================================
   UPLOAD FILES
   ========================================================= */

/*
    IMPORTANT:

    The existing Flask /upload route expects:

        formData.append("file", file)

    and returns:

        {
            filename: "...",
            file_url: "..."
        }

    Therefore we upload each selected PDF individually.
*/

async function uploadFiles(files) {

    if (
        !files ||
        files.length === 0
    ) {

        return;
    }


    const validFiles =
        Array.from(files)
            .filter(
                file =>
                    file.type ===
                        "application/pdf" ||
                    file.name
                        .toLowerCase()
                        .endsWith(".pdf")
            );


    if (
        validFiles.length === 0
    ) {

        showStatus(
            "Please select PDF files only.",
            true
        );

        return;
    }


    showStatus(
        `Uploading ${validFiles.length} PDF${validFiles.length === 1 ? "" : "s"}...`
    );


    let uploadedCount =
        0;


    for (
        const file
        of validFiles
    ) {

        /*
            Do not upload a duplicate filename
            that is already in this workspace.
        */

        const alreadyExists =
            pdfs.some(
                pdf =>
                    getPdfFilename(pdf) ===
                    file.name
            );


        if (alreadyExists) {

            console.log(
                `Skipping duplicate: ${file.name}`
            );

            continue;
        }


        const formData =
            new FormData();


        /*
            THIS MUST BE "file".
        */

        formData.append(
            "file",
            file
        );


        try {

            const response =
                await fetch(
                    "/upload",
                    {
                        method: "POST",

                        body:
                            formData
                    }
                );


            /*
                Read as text first so we get a useful
                error if Flask returns HTML.
            */

            const responseText =
                await response.text();


            let data;


            try {

                data =
                    JSON.parse(
                        responseText
                    );

            } catch (jsonError) {

                console.error(
                    "Upload returned non-JSON:",
                    responseText
                );


                throw new Error(
                    `Upload failed. Server returned HTTP ${response.status}.`
                );
            }


            if (
                !response.ok ||
                data.success === false
            ) {

                throw new Error(
                    data.error ||
                    "Upload failed."
                );
            }


            /*
                The existing /upload route returns
                filename + file_url.
            */

            const uploadedPdf =
                normalizePdf({
                    filename:
                        data.filename,

                    file_url:
                        data.file_url,

                    display_name:
                        data.display_name ||
                        data.filename
                });


            if (!uploadedPdf) {

                throw new Error(
                    "The server did not return a valid uploaded PDF."
                );
            }


            pdfs.push(
                uploadedPdf
            );


            uploadedCount++;


        } catch (error) {

            console.error(
                `Upload error for ${file.name}:`,
                error
            );


            showStatus(
                error.message,
                true
            );
        }
    }


    removeDuplicatePdfs();


    /*
        Save the final workspace.
    */

    await saveWorkspace();


    /*
        Make sure the workspace is visible.
    */

    if (pdfs.length > 0) {

        if (
            activePdfIndex >=
            pdfs.length
        ) {

            activePdfIndex =
                0;
        }


        if (uploadSection) {

            uploadSection.style.display =
                "none";
        }


        if (workspace) {

            workspace.style.display =
                "";
        }
    }


    updateWorkspaceUI();


    /*
        Load the first active PDF.
    */

    if (
        pdfs.length > 0 &&
        pdfs[activePdfIndex]
    ) {

        await loadPdf(
            pdfs[activePdfIndex]
        );
    }


    if (
        uploadedCount > 0
    ) {

        showStatus(
            `${uploadedCount} PDF${uploadedCount === 1 ? "" : "s"} uploaded successfully.`
        );
    }


    /*
        Clear file inputs.
    */

    if (pdfInput) {
        pdfInput.value =
            "";
    }


    if (workspacePdfInput) {
        workspacePdfInput.value =
            "";
    }


    if (selectedFiles) {
        selectedFiles.innerHTML =
            "";
    }
}


/* =========================================================
   INITIAL UPLOAD FORM
   ========================================================= */

if (uploadForm) {

    uploadForm.addEventListener(
        "submit",
        event => {

            event.preventDefault();


            uploadFiles(
                pdfInput
                    ? pdfInput.files
                    : []
            );
        }
    );
}


/* =========================================================
   WORKSPACE UPLOAD
   ========================================================= */

if (workspacePdfInput) {

    workspacePdfInput.addEventListener(
        "change",
        () => {

            uploadFiles(
                workspacePdfInput.files
            );
        }
    );
}


/* =========================================================
   STORED PDF SELECTION
   ========================================================= */

function getStoredPdfCheckboxes() {

    if (!storedPdfsList) {
        return [];
    }


    return Array.from(
        storedPdfsList.querySelectorAll(
            ".stored-pdf-select[type='checkbox']"
        )
    );
}


function getSelectedStoredPdfFilenames() {

    return getStoredPdfCheckboxes()
        .filter(
            checkbox =>
                checkbox.checked
        )
        .map(
            checkbox =>
                checkbox.value
        )
        .filter(Boolean);
}


/* =========================================================
   UPDATE STORED PDF SELECTION UI
   ========================================================= */

function updateStoredPdfSelectionUI() {

    if (
        !storedPdfsList ||
        !selectAllStoredPdfs ||
        !openSelectedStoredButton ||
        !deleteSelectedStoredButton
    ) {

        return;
    }


    const checkboxes =
        getStoredPdfCheckboxes();


    const selectedCheckboxes =
        checkboxes.filter(
            checkbox =>
                checkbox.checked
        );


    const totalCount =
        checkboxes.length;


    const selectedCount =
        selectedCheckboxes.length;


    /*
        Select All.
    */

    selectAllStoredPdfs.checked =
        totalCount > 0 &&
        selectedCount === totalCount;


    selectAllStoredPdfs.indeterminate =
        selectedCount > 0 &&
        selectedCount < totalCount;


    /*
        Action buttons.
    */

    openSelectedStoredButton.disabled =
        selectedCount === 0;


    deleteSelectedStoredButton.disabled =
        selectedCount === 0;


    /*
        Highlight selected rows.
    */

    const rows =
        storedPdfsList.querySelectorAll(
            ".stored-pdf-row"
        );


    rows.forEach(
        row => {

            const checkbox =
                row.querySelector(
                    ".stored-pdf-select"
                );


            if (
                checkbox &&
                checkbox.checked
            ) {

                row.classList.add(
                    "selected"
                );

            } else {

                row.classList.remove(
                    "selected"
                );
            }
        }
    );
}


/* =========================================================
   INDIVIDUAL STORED CHECKBOXES
   ========================================================= */

if (storedPdfsList) {

    storedPdfsList.addEventListener(
        "change",
        event => {

            if (
                !event.target ||
                event.target.type !==
                    "checkbox"
            ) {

                return;
            }


            updateStoredPdfSelectionUI();
        }
    );
}


/* =========================================================
   SELECT ALL
   ========================================================= */

if (selectAllStoredPdfs) {

    selectAllStoredPdfs.addEventListener(
        "change",
        () => {

            const shouldSelect =
                selectAllStoredPdfs.checked;


            getStoredPdfCheckboxes()
                .forEach(
                    checkbox => {

                        checkbox.checked =
                            shouldSelect;
                    }
                );


            updateStoredPdfSelectionUI();
        }
    );
}


/* =========================================================
   FIND STORED ROW
   ========================================================= */

function findStoredPdfRow(filename) {

    if (!storedPdfsList) {
        return null;
    }


    const rows =
        storedPdfsList.querySelectorAll(
            ".stored-pdf-row"
        );


    for (
        const row
        of rows
    ) {

        if (
            row.dataset.filename ===
            filename
        ) {

            return row;
        }
    }


    return null;
}


/* =========================================================
   OPEN SELECTED STORED PDFs
   ========================================================= */

if (openSelectedStoredButton) {

    openSelectedStoredButton.addEventListener(
        "click",
        async () => {

            const selectedFiles =
                getSelectedStoredPdfFilenames();


            if (
                selectedFiles.length === 0
            ) {

                return;
            }


            openSelectedStoredButton.disabled =
                true;


            deleteSelectedStoredButton.disabled =
                true;


            try {

                showStatus(
                    `Opening ${selectedFiles.length} PDF${selectedFiles.length === 1 ? "" : "s"}...`
                );


                /*
                    Use the existing Flask bulk route.
                */

                const response =
                    await fetch(
                        "/open-selected-stored-pdfs",
                        {
                            method:
                                "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body:
                                JSON.stringify({
                                    filenames:
                                        selectedFiles
                                })
                        }
                    );


                const responseText =
                    await response.text();


                let data;


                try {

                    data =
                        JSON.parse(
                            responseText
                        );

                } catch (jsonError) {

                    console.error(
                        "Open Selected returned non-JSON:",
                        responseText
                    );


                    throw new Error(
                        `Server returned HTTP ${response.status} instead of JSON.`
                    );
                }


                if (
                    !response.ok ||
                    data.success === false
                ) {

                    throw new Error(
                        data.error ||
                        "Unable to open selected PDF(s)."
                    );
                }


                /*
                    Accept the different names a Flask
                    response may use.
                */

                const returnedPdfs =
                    data.pdfs ||
                    data.files ||
                    data.documents ||
                    data.workspace_pdfs;


                if (
                    Array.isArray(
                        returnedPdfs
                    )
                ) {

                    pdfs =
                        normalizePdfList(
                            returnedPdfs
                        );

                } else {

                    /*
                        If the route does not return the
                        complete list, preserve existing
                        workspace PDFs and add the selected
                        stored PDFs when possible.
                    */

                    selectedFiles.forEach(
                        filename => {

                            const exists =
                                pdfs.some(
                                    pdf =>
                                        getPdfFilename(pdf) ===
                                        filename
                                );


                            if (!exists) {

                                pdfs.push(
                                    normalizePdf({
                                        filename:
                                            filename,

                                        display_name:
                                            filename,

                                        file_url:
                                            ""
                                    })
                                );
                            }
                        }
                    );
                }


                removeDuplicatePdfs();


                /*
                    Find the first selected PDF
                    in the returned workspace.
                */

                const firstSelected =
                    selectedFiles[0];


                let firstIndex =
                    pdfs.findIndex(
                        pdf =>
                            getPdfFilename(pdf) ===
                            firstSelected
                    );


                if (firstIndex < 0) {
                    firstIndex = 0;
                }


                activePdfIndex =
                    firstIndex;


                /*
                    Show workspace.
                */

                if (uploadSection) {

                    uploadSection.style.display =
                        "none";
                }


                if (workspace) {

                    workspace.style.display =
                        "";
                }


                updateWorkspaceUI();


                /*
                    Save the resulting workspace.
                */

                await saveWorkspace();


                /*
                    Load the actual PDF object.

                    IMPORTANT:
                    We use its file_url rather than
                    constructing a new URL.
                */

                if (
                    pdfs.length > 0 &&
                    pdfs[activePdfIndex]
                ) {

                    await loadPdf(
                        pdfs[activePdfIndex]
                    );
                }


                /*
                    Clear selections.
                */

                getStoredPdfCheckboxes()
                    .forEach(
                        checkbox => {

                            checkbox.checked =
                                false;
                        }
                    );


                if (selectAllStoredPdfs) {

                    selectAllStoredPdfs.checked =
                        false;

                    selectAllStoredPdfs.indeterminate =
                        false;
                }


                updateStoredPdfSelectionUI();


                showStatus(
                    `${selectedFiles.length} PDF${selectedFiles.length === 1 ? "" : "s"} opened successfully.`
                );


                if (workspace) {

                    workspace.scrollIntoView({
                        behavior:
                            "smooth",

                        block:
                            "start"
                    });
                }


            } catch (error) {

                console.error(
                    "Open Selected error:",
                    error
                );


                showStatus(
                    error.message ||
                    "Unable to open selected PDF(s).",
                    true
                );


                updateStoredPdfSelectionUI();
            }
        }
    );
}


/* =========================================================
   DELETE ONE STORED PDF
   ========================================================= */

async function deleteStoredPdf(
    filename
) {

    const response =
        await fetch(
            "/delete-stored-upload",
            {
                method:
                    "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify({
                        filename:
                            filename
                    })
            }
        );


    const responseText =
        await response.text();


    let data;


    try {

        data =
            JSON.parse(
                responseText
            );

    } catch (error) {

        console.error(
            "Delete returned non-JSON:",
            responseText
        );


        throw new Error(
            `Server returned HTTP ${response.status} instead of JSON.`
        );
    }


    if (
        !response.ok ||
        data.success === false
    ) {

        throw new Error(
            data.error ||
            `Unable to delete ${filename}.`
        );
    }


    return data;
}


/* =========================================================
   DELETE SELECTED STORED PDFs
   ========================================================= */

if (deleteSelectedStoredButton) {

    deleteSelectedStoredButton.addEventListener(
        "click",
        async () => {

            const selectedFiles =
                getSelectedStoredPdfFilenames();


            if (
                selectedFiles.length === 0
            ) {

                return;
            }


            const confirmed =
                window.confirm(
                    `Delete ${selectedFiles.length} selected PDF${selectedFiles.length === 1 ? "" : "s"} from the server? This cannot be undone.`
                );


            if (!confirmed) {
                return;
            }


            openSelectedStoredButton.disabled =
                true;


            deleteSelectedStoredButton.disabled =
                true;


            try {

                showStatus(
                    `Deleting ${selectedFiles.length} PDF${selectedFiles.length === 1 ? "" : "s"}...`
                );


                /*
                    Use the bulk Flask route.
                */

                const response =
                    await fetch(
                        "/delete-selected-stored-uploads",
                        {
                            method:
                                "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body:
                                JSON.stringify({
                                    filenames:
                                        selectedFiles
                                })
                        }
                    );


                const responseText =
                    await response.text();


                let data;


                try {

                    data =
                        JSON.parse(
                            responseText
                        );

                } catch (error) {

                    console.error(
                        "Bulk delete returned non-JSON:",
                        responseText
                    );


                    throw new Error(
                        `Server returned HTTP ${response.status} instead of JSON.`
                    );
                }


                if (
                    !response.ok ||
                    data.success === false
                ) {

                    throw new Error(
                        data.error ||
                        "Unable to delete selected PDF(s)."
                    );
                }


                /*
                    Remove the selected rows from
                    the stored-PDF list.
                */

                selectedFiles.forEach(
                    filename => {

                        const row =
                            findStoredPdfRow(
                                filename
                            );


                        if (row) {
                            row.remove();
                        }
                    }
                );


                /*
                    Clear Select All.
                */

                if (selectAllStoredPdfs) {

                    selectAllStoredPdfs.checked =
                        false;

                    selectAllStoredPdfs.indeterminate =
                        false;
                }


                /*
                    Remove section if empty.
                */

                const remainingRows =
                    storedPdfsList
                        ? storedPdfsList.querySelectorAll(
                            ".stored-pdf-row"
                        )
                        : [];


                if (
                    remainingRows.length === 0
                ) {

                    if (storedPdfsSection) {
                        storedPdfsSection.remove();
                    }

                } else {

                    updateStoredPdfSelectionUI();
                }


                showStatus(
                    `${selectedFiles.length} PDF${selectedFiles.length === 1 ? "" : "s"} deleted successfully.`
                );


            } catch (error) {

                console.error(
                    "Delete Selected error:",
                    error
                );


                showStatus(
                    error.message ||
                    "Unable to delete selected PDF(s).",
                    true
                );


                updateStoredPdfSelectionUI();
            }
        }
    );
}


/* =========================================================
   INDIVIDUAL STORED PDF BUTTONS
   ========================================================= */

if (storedPdfsList) {

    storedPdfsList.addEventListener(
        "click",
        async event => {

            /* =================================================
               OPEN ONE STORED PDF
               ================================================= */

            const openButton =
                event.target.closest(
                    ".stored-pdf-open-single"
                );


            if (openButton) {

                const filename =
                    openButton.dataset.filename;


                if (!filename) {
                    return;
                }


                try {

                    openButton.disabled = true;


                    showStatus(
                        `Opening ${filename}...`
                    );


                    /*
                        Ask Flask to put the stored PDF
                        into the workspace.
                    */

                    const response =
                        await fetch(
                            "/open-selected-stored-pdfs",
                            {
                                method: "POST",

                                headers: {
                                    "Content-Type":
                                        "application/json"
                                },

                                body:
                                    JSON.stringify({
                                        filenames: [
                                            filename
                                        ]
                                    })
                            }
                        );


                    const responseText =
                        await response.text();


                    let data;


                    try {

                        data =
                            JSON.parse(
                                responseText
                            );

                    } catch (error) {

                        console.error(
                            "Open stored PDF returned non-JSON:",
                            responseText
                        );

                        throw new Error(
                            `Server returned HTTP ${response.status} instead of JSON.`
                        );
                    }


                    if (
                        !response.ok ||
                        data.success === false
                    ) {

                        throw new Error(
                            data.error ||
                            `Unable to open ${filename}.`
                        );
                    }


                    /*
                        The server should return the complete
                        workspace PDF objects.
                    */

                    if (
                        Array.isArray(data.pdfs)
                    ) {

                        pdfs =
                            normalizePdfList(
                                data.pdfs
                            );

                    } else {

                        /*
                            If the endpoint only returns the
                            filename, preserve the existing
                            workspace PDF data if we already
                            have it.
                        */

                        const existingPdf =
                            pdfs.find(
                                pdf =>
                                    getPdfFilename(pdf) ===
                                    filename
                            );


                        if (!existingPdf) {

                            /*
                                IMPORTANT:
                                We cannot load the PDF until
                                we have a URL.
                            */

                            throw new Error(
                                `The server opened ${filename}, but did not return its PDF URL.`
                            );
                        }
                    }


                    /*
                        Find the selected PDF in the workspace.
                    */

                    let foundIndex =
                        pdfs.findIndex(
                            pdf =>
                                getPdfFilename(pdf) ===
                                filename
                        );


                    if (
                        foundIndex < 0
                    ) {

                        throw new Error(
                            `${filename} was opened by the server, but could not be added to the workspace.`
                        );
                    }


                    /*
                        Make absolutely sure the selected PDF
                        has a usable URL.
                    */

                    const selectedPdf =
                        pdfs[foundIndex];


                    if (
                        !selectedPdf.file_url
                    ) {

                        /*
                            Try to use the standard Flask
                            uploaded-file URL.
                        */

                        selectedPdf.file_url =
                            `/uploads/${encodeURIComponent(
                                filename
                            )}`;
                    }


                    /*
                        Verify that we actually have a URL.
                    */

                    if (
                        !selectedPdf.file_url
                    ) {

                        throw new Error(
                            `No PDF URL was returned for ${filename}.`
                        );
                    }


                    activePdfIndex =
                        foundIndex;


                    /*
                        Show workspace.
                    */

                    if (uploadSection) {

                        uploadSection.style.display =
                            "none";
                    }


                    if (workspace) {

                        workspace.style.display =
                            "";
                    }


                    /*
                        Update document header/list.
                    */

                    updateWorkspaceUI();


                    /*
                        Save workspace.
                    */

                    await saveWorkspace();


                    /*
                        IMPORTANT:
                        Load the actual PDF.
                    */

                    await loadPdf(
                        selectedPdf
                    );


                    /*
                        Clear stored selections.
                    */

                    getStoredPdfCheckboxes()
                        .forEach(
                            checkbox => {

                                checkbox.checked =
                                    false;
                            }
                        );


                    if (
                        selectAllStoredPdfs
                    ) {

                        selectAllStoredPdfs.checked =
                            false;

                        selectAllStoredPdfs.indeterminate =
                            false;
                    }


                    updateStoredPdfSelectionUI();


                    showStatus(
                        `${filename} opened successfully.`
                    );


                    if (workspace) {

                        workspace.scrollIntoView({
                            behavior:
                                "smooth",

                            block:
                                "start"
                        });
                    }


                } catch (error) {

                    console.error(
                        "Individual stored PDF open error:",
                        error
                    );


                    showStatus(
                        error.message ||
                        `Unable to open ${filename}.`,
                        true
                    );


                } finally {

                    openButton.disabled =
                        false;
                }


                return;
            }


            /* =================================================
               DELETE ONE STORED PDF
               ================================================= */

            const deleteButton =
                event.target.closest(
                    ".stored-pdf-delete-single"
                );


            if (deleteButton) {

                const filename =
                    deleteButton.dataset.filename;


                if (!filename) {
                    return;
                }


                const confirmed =
                    window.confirm(
                        `Delete "${filename}" from the server? This cannot be undone.`
                    );


                if (!confirmed) {
                    return;
                }


                try {

                    deleteButton.disabled =
                        true;


                    showStatus(
                        `Deleting ${filename}...`
                    );


                    await deleteStoredPdf(
                        filename
                    );


                    const row =
                        findStoredPdfRow(
                            filename
                        );


                    if (row) {
                        row.remove();
                    }


                    showStatus(
                        `${filename} deleted successfully.`
                    );


                    const remainingRows =
                        storedPdfsList
                            ? storedPdfsList.querySelectorAll(
                                ".stored-pdf-row"
                            )
                            : [];


                    if (
                        remainingRows.length === 0
                    ) {

                        if (storedPdfsSection) {

                            storedPdfsSection.remove();
                        }

                    } else {

                        updateStoredPdfSelectionUI();
                    }


                } catch (error) {

                    console.error(
                        "Delete stored PDF error:",
                        error
                    );


                    showStatus(
                        error.message ||
                        `Unable to delete ${filename}.`,
                        true
                    );


                    deleteButton.disabled =
                        false;
                }
            }
        }
    );
}


/* =========================================================
   CLEAR PDF VIEWER
   ========================================================= */

function clearPdfViewer() {

    if (pdfPages) {

        pdfPages.innerHTML =
            "";
    }


    if (pdfLoading) {

        pdfLoading.style.display =
            "none";
    }


    if (pdfError) {

        pdfError.style.display =
            "none";
    }


    currentPdf =
        null;


    currentPdfDocument =
        null;


    currentPage =
        1;


    totalPages =
        1;


    updatePageControls();
}


/* =========================================================
   LOAD PDF
   ========================================================= */

async function loadPdf(pdf) {

    const normalizedPdf =
        normalizePdf(pdf);


    if (!normalizedPdf) {

        console.error(
            "Invalid PDF:",
            pdf
        );

        clearPdfViewer();

        return;
    }


    const pdfUrl =
        getPdfUrl(
            normalizedPdf
        );


    if (!pdfUrl) {

        console.error(
            "PDF has no file URL:",
            normalizedPdf
        );


        if (pdfError) {

            pdfError.textContent =
                "PDF file URL is missing.";

            pdfError.style.display =
                "flex";
        }


        return;
    }


    /*
        PDF.js may load after this script.
    */

    if (!window.pdfjsLib) {

        window.addEventListener(
            "pdfjs-ready",
            () => {

                loadPdf(
                    normalizedPdf
                );
            },
            {
                once:
                    true
            }
        );


        return;
    }


    currentPdf =
        normalizedPdf;


    currentPdfDocument =
        null;


    currentPage =
        1;


    totalPages =
        1;


    renderingPage =
        false;


    if (pdfPages) {

        pdfPages.innerHTML =
            "";
    }


    if (pdfError) {

        pdfError.style.display =
            "none";
    }


    if (pdfLoading) {

        pdfLoading.style.display =
            "flex";
    }


    updatePageControls();


    console.log(
        "Loading PDF:",
        normalizedPdf.filename
    );


    console.log(
        "PDF URL:",
        pdfUrl
    );


    try {

        const loadingTask =
            window.pdfjsLib.getDocument(
                pdfUrl
            );


        const pdfDocument =
            await loadingTask.promise;


        /*
            Make sure an older request did not
            replace this PDF while we were loading.
        */

        if (
            currentPdf !==
            normalizedPdf
        ) {

            return;
        }


        currentPdfDocument =
            pdfDocument;


        totalPages =
            pdfDocument.numPages;


        if (totalPagesElement) {

            totalPagesElement.textContent =
                totalPages;
        }


        if (pdfLoading) {

            pdfLoading.style.display =
                "none";
        }


        await renderPage(
            1
        );


    } catch (error) {

        console.error(
            "PDF loading error:",
            error
        );


        if (
            currentPdf !==
            normalizedPdf
        ) {

            return;
        }


        if (pdfLoading) {

            pdfLoading.style.display =
                "none";
        }


        if (pdfError) {

            pdfError.textContent =
                "Unable to display this PDF.";

            pdfError.style.display =
                "flex";
        }
    }
}


/* =========================================================
   RENDER PAGE
   ========================================================= */

async function renderPage(
    pageNumber
) {

    if (
        !currentPdfDocument ||
        renderingPage
    ) {

        return;
    }


    if (
        pageNumber < 1 ||
        pageNumber >
            currentPdfDocument.numPages
    ) {

        return;
    }


    renderingPage =
        true;


    try {

        const page =
            await currentPdfDocument.getPage(
                pageNumber
            );


        /*
            Use a scale that gives a readable
            preview while respecting the panel width.
        */

        const baseViewport =
            page.getViewport({
                scale:
                    1
            });


        const containerWidth =
            pdfPages
                ? pdfPages.clientWidth
                : 800;


        const horizontalPadding =
            40;


        const availableWidth =
            Math.max(
                300,
                containerWidth -
                    horizontalPadding
            );


        let scale =
            availableWidth /
            baseViewport.width;


        /*
            Prevent extremely tiny/huge pages.
        */

        scale =
            Math.max(
                0.75,
                Math.min(
                    scale,
                    2
                )
            );


        const viewport =
            page.getViewport({
                scale:
                    scale
            });


        if (pdfPages) {

            pdfPages.innerHTML =
                "";


            const canvas =
                document.createElement(
                    "canvas"
                );


            canvas.className =
                "pdf-page-canvas";


            const context =
                canvas.getContext(
                    "2d"
                );


            canvas.width =
                viewport.width;


            canvas.height =
                viewport.height;


            pdfPages.appendChild(
                canvas
            );


            await page.render(
                {
                    canvasContext:
                        context,

                    viewport:
                        viewport
                }
            ).promise;
        }


        currentPage =
            pageNumber;


        updatePageControls();


    } catch (error) {

        console.error(
            "PDF page rendering error:",
            error
        );


    } finally {

        renderingPage =
            false;
    }
}


/* =========================================================
   PAGE CONTROLS
   ========================================================= */

function updatePageControls() {

    if (previousPageButton) {

        previousPageButton.disabled =
            currentPage <= 1;
    }


    if (nextPageButton) {

        nextPageButton.disabled =
            currentPage >=
            totalPages;
    }


    if (currentPageElement) {

        currentPageElement.textContent =
            currentPage;
    }


    if (totalPagesElement) {

        totalPagesElement.textContent =
            totalPages;
    }
}


if (previousPageButton) {

    previousPageButton.addEventListener(
        "click",
        async () => {

            if (
                currentPage <= 1 ||
                renderingPage
            ) {

                return;
            }


            await renderPage(
                currentPage - 1
            );
        }
    );
}


if (nextPageButton) {

    nextPageButton.addEventListener(
        "click",
        async () => {

            if (
                currentPage >=
                    totalPages ||
                renderingPage
            ) {

                return;
            }


            await renderPage(
                currentPage + 1
            );
        }
    );
}


/* =========================================================
   RESIZE VIEWER
   ========================================================= */

let resizeTimeout;


window.addEventListener(
    "resize",
    () => {

        clearTimeout(
            resizeTimeout
        );


        resizeTimeout =
            setTimeout(
                () => {

                    if (
                        currentPdfDocument
                    ) {

                        renderPage(
                            currentPage
                        );
                    }

                },
                200
            );
    }
);


/* =========================================================
   GO TO WORKSPACE
   ========================================================= */

const goToWorkspaceButton =
    document.getElementById(
        "go-to-workspace-button"
    );


if (goToWorkspaceButton) {

    goToWorkspaceButton.addEventListener(
        "click",
        () => {

            if (workspace) {

                workspace.style.display =
                    "";
            }


            updateWorkspaceUI();
        }
    );
}


/* =========================================================
   INITIALIZATION
   ========================================================= */

removeDuplicatePdfs();

updateWorkspaceUI();

updatePageControls();

updateStoredPdfSelectionUI();


/*
    If PDFs already exist in the Flask session,
    load the active PDF once PDF.js is ready.
*/

if (pdfs.length > 0) {

    if (
        activePdfIndex >=
        pdfs.length
    ) {

        activePdfIndex =
            0;
    }


    const loadInitialPdf =
        () => {

            if (
                pdfs.length > 0 &&
                pdfs[activePdfIndex]
            ) {

                loadPdf(
                    pdfs[activePdfIndex]
                );
            }
        };


    if (window.pdfjsLib) {

        loadInitialPdf();

    } else {

        window.addEventListener(
            "pdfjs-ready",
            loadInitialPdf,
            {
                once:
                    true
            }
        );
    }
}


/* =========================================================
   DEBUG INFORMATION
   ========================================================= */

console.log(
    "PDF Workspace initialized."
);

console.log(
    "Workspace PDFs:",
    pdfs
);

console.log(
    "Stored PDF list:",
    storedPdfsList
);

console.log(
    "Stored PDF checkboxes:",
    getStoredPdfCheckboxes()
);