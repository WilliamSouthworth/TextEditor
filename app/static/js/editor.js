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

import * as pdfjsLib from
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.4.299/pdf.min.mjs";


pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.4.299/pdf.worker.min.mjs";


const pdfViewer =
    document.querySelector("#pdf-viewer");

const pdfPages =
    document.querySelector("#pdf-pages");

const loadingMessage =
    document.querySelector("#pdf-loading");


const pdfUrl =
    pdfViewer.dataset.pdfUrl;


/* =========================================
   RENDER PDF
   ========================================= */

async function renderPDF() {

    try {

        console.log(
            "PDF URL:",
            pdfUrl
        );


        const loadingTask =
            pdfjsLib.getDocument({
                url: pdfUrl
            });


        const pdf =
            await loadingTask.promise;


        /*
         * Render every page in the PDF.
         */
        for (
            let pageNumber = 1;
            pageNumber <= pdf.numPages;
            pageNumber++
        ) {

            await renderPage(
                pdf,
                pageNumber
            );

        }


        loadingMessage.style.display =
            "none";


    } catch (error) {

        console.error(
            "Unable to render PDF:",
            error
        );

        loadingMessage.textContent =
            "Unable to load PDF.";

    }

}


/* =========================================
   RENDER PAGE
   ========================================= */

async function renderPage(
    pdf,
    pageNumber
) {

    const page =
        await pdf.getPage(
            pageNumber
        );


    const scale = 1.25;

    const viewport =
        page.getViewport({
            scale: scale
        });


    /* -------------------------------------
       Page container
       ------------------------------------- */

    const pageContainer =
        document.createElement("div");

    pageContainer.className =
        "pdf-page";

    pageContainer.dataset.pageNumber =
        pageNumber;

    pageContainer.style.width =
        `${viewport.width}px`;

    pageContainer.style.height =
        `${viewport.height}px`;


    /* -------------------------------------
       Canvas
       ------------------------------------- */

    const canvas =
        document.createElement("canvas");

    canvas.className =
        "pdf-canvas";


    const context =
        canvas.getContext("2d");


    const outputScale =
        window.devicePixelRatio || 1;


    canvas.width =
        Math.floor(
            viewport.width *
            outputScale
        );

    canvas.height =
        Math.floor(
            viewport.height *
            outputScale
        );


    canvas.style.width =
        `${viewport.width}px`;

    canvas.style.height =
        `${viewport.height}px`;


    pageContainer.appendChild(
        canvas
    );


    /* -------------------------------------
       Text layer
       ------------------------------------- */

    const textLayerDiv =
        document.createElement("div");

    textLayerDiv.className =
        "textLayer";

    textLayerDiv.style.setProperty(
        "--total-scale-factor",
        String(scale)
    );

    pageContainer.appendChild(
        textLayerDiv
    );


    pdfPages.appendChild(
        pageContainer
    );


    /* -------------------------------------
       Render visible PDF
       ------------------------------------- */

    const transform =
        outputScale !== 1
            ? [
                outputScale,
                0,
                0,
                outputScale,
                0,
                0
            ]
            : null;


    await page.render({

        canvasContext:
            context,

        viewport:
            viewport,

        transform:
            transform

    }).promise;


    /* -------------------------------------
       Render selectable text
       ------------------------------------- */

    const textContent =
        await page.getTextContent();


    const textLayer =
        new pdfjsLib.TextLayer({

            textContentSource:
                textContent,

            container:
                textLayerDiv,

            viewport:
                viewport

        });


    await textLayer.render();

}


/* =========================================
   START VIEWER
   ========================================= */

renderPDF();