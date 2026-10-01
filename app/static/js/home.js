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

const pdfViewer =
    document.querySelector("#pdf-viewer");



/* =========================================
   FILE SELECTION
   ========================================= */

fileInput.addEventListener(
    "change",
    () => {

        const file =
            fileInput.files[0];


        if (!file) {
            return;
        }


        if (
            file.type !==
            "application/pdf"
        ) {

            statusElement.textContent =
                "Please select a valid PDF.";

            return;
        }


        statusElement.textContent =
            file.name;
    }
);



/* =========================================
   UPLOAD PDF
   ========================================= */

uploadForm.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();


        const file =
            fileInput.files[0];


        /* -------------------------------------
           Validate file
           ------------------------------------- */

        if (!file) {

            statusElement.textContent =
                "Please select a PDF.";

            return;
        }


        if (
            file.type !==
            "application/pdf"
        ) {

            statusElement.textContent =
                "Please select a valid PDF.";

            return;
        }


        /* -------------------------------------
           Create FormData
           ------------------------------------- */

        const formData =
            new FormData();

        formData.append(
            "file",
            file
        );


        /* -------------------------------------
           Show uploading state
           ------------------------------------- */

        uploadButton.disabled = true;

        uploadButton.textContent =
            "Uploading...";

        statusElement.textContent =
            "Uploading your PDF...";


        try {

            /* ---------------------------------
               Send PDF to Flask
               --------------------------------- */

            const response =
                await fetch(
                    "/upload",
                    {
                        method: "POST",
                        body: formData
                    }
                );


            /* ---------------------------------
               Read server response
               --------------------------------- */

            const result =
                await response.json();


            /* ---------------------------------
               Handle errors
               --------------------------------- */

            if (!response.ok) {

                throw new Error(
                    result.error ||
                    "Upload failed."
                );
            }


            /* ---------------------------------
               Make sure Flask gave us a URL
               --------------------------------- */

            if (!result.file_url) {

                throw new Error(
                    "The server did not return a PDF URL."
                );
            }

            /* ---------------------------------
               Display filename
               --------------------------------- */

            uploadedFileName.textContent =
                result.filename ||
                file.name;

            /* ---------------------------------
               Display success message
               --------------------------------- */

            workspaceStatus.textContent =
                "Your PDF is ready to edit.";

            /* ---------------------------------
               Load actual PDF
               --------------------------------- */

            pdfViewer.src =
                result.file_url;


            /* ---------------------------------
               Hide upload screen
               --------------------------------- */

            uploadSection.style.display =
                "none";


            /* ---------------------------------
               Show workspace
               --------------------------------- */

            workspace.style.display =
                "grid";


            /* ---------------------------------
               Scroll to workspace
               --------------------------------- */

            workspace.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });


        } catch (error) {

            statusElement.textContent =
                error.message;


        } finally {

            /* ---------------------------------
               Restore button
               --------------------------------- */

            uploadButton.disabled =
                false;

            uploadButton.textContent =
                "Upload PDF";

        }

    }
);