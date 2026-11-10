document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const documentSelect =
        document.getElementById("reader-document-select");

    const canvas =
        document.getElementById("reader-canvas");

    const pageStatus =
        document.getElementById("reader-page-status");

    const readerStatus =
        document.getElementById("reader-status");

    const textDisplay =
        document.getElementById("reader-text");

    const previousButton =
        document.getElementById("reader-previous");

    const nextButton =
        document.getElementById("reader-next");

    const playButton =
        document.getElementById("reader-play");

    const pauseButton =
        document.getElementById("reader-pause");

    const stopButton =
        document.getElementById("reader-stop");

    const speedSelect =
        document.getElementById("reader-speed");


    if (
        !documentSelect ||
        !canvas ||
        !window.pdfjsLib
    ) {
        console.error(
            "PDF Reader is missing required elements."
        );

        return;
    }


    // ---------------------------------------------
    // PDF.js configuration
    // ---------------------------------------------

    const pdfjsLib =
        window.pdfjsLib;

    pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";


    // ---------------------------------------------
    // Reader state
    // ---------------------------------------------

    let pdfDocument = null;

    let currentPage = 1;

    let currentPageText = "";

    let renderSequence = 0;

    let isSpeaking = false;

    let isPaused = false;

    let speechRun = 0;

    let speechChunks = [];

    let speechChunkIndex = 0;


    const speech =
        window.speechSynthesis;


    // ---------------------------------------------
    // General helpers
    // ---------------------------------------------

    function getSelectedDocument() {
        const option =
            documentSelect.options[
                documentSelect.selectedIndex
            ];

        if (!option) {
            return null;
        }

        return {
            id: option.value,

            filename:
                option.textContent.trim(),

            fileUrl:
                option.dataset.fileUrl
        };
    }


    function setStatus(message) {
        readerStatus.textContent =
            message;
    }


    function updateControls() {
        const hasDocument =
            Boolean(pdfDocument);

        previousButton.disabled =
            !hasDocument ||
            currentPage <= 1;

        nextButton.disabled =
            !hasDocument ||
            currentPage >=
                pdfDocument.numPages;

        playButton.disabled =
            !currentPageText.trim() ||
            isSpeaking;

        pauseButton.disabled =
            !isSpeaking;

        stopButton.disabled =
            !isSpeaking;

        pauseButton.textContent =
            isPaused
                ? "Resume"
                : "Pause";
    }


    function normalizeText(text) {
        return String(text || "")
            .replace(/\s+/g, " ")
            .trim();
    }


    // ---------------------------------------------
    // Break long page text into smaller sections
    // ---------------------------------------------

    function splitTextIntoChunks(
        text,
        maxLength = 220
    ) {
        const words =
            normalizeText(text)
                .split(" ");

        const chunks = [];

        let currentChunk = "";

        words.forEach((word) => {
            const next =
                currentChunk
                    ? `${currentChunk} ${word}`
                    : word;

            if (
                next.length >
                    maxLength &&
                currentChunk
            ) {
                chunks.push(
                    currentChunk
                );

                currentChunk =
                    word;
            } else {
                currentChunk =
                    next;
            }
        });


        if (currentChunk) {
            chunks.push(
                currentChunk
            );
        }


        return chunks;
    }


    // ---------------------------------------------
    // Render current PDF page
    // ---------------------------------------------

    async function renderCurrentPage() {
        if (!pdfDocument) {
            return;
        }

        const sequence =
            ++renderSequence;

        setStatus(
            `Loading page ${currentPage}...`
        );


        try {
            const page =
                await pdfDocument.getPage(
                    currentPage
                );


            if (
                sequence !==
                renderSequence
            ) {
                return;
            }


            const viewport =
                page.getViewport({
                    scale: 1.15
                });


            const context =
                canvas.getContext("2d");


            const pixelRatio =
                Math.max(
                    window.devicePixelRatio || 1,
                    1
                );


            canvas.width =
                Math.floor(
                    viewport.width *
                    pixelRatio
                );

            canvas.height =
                Math.floor(
                    viewport.height *
                    pixelRatio
                );


            canvas.style.width =
                `${viewport.width}px`;

            canvas.style.height =
                `${viewport.height}px`;


            await page.render({
                canvasContext:
                    context,

                viewport,

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


            // ---------------------------------
            // Extract text from the page
            // ---------------------------------

            const textContent =
                await page.getTextContent();


            currentPageText =
                normalizeText(
                    textContent.items
                        .map(
                            (item) =>
                                item.str
                        )
                        .join(" ")
                );


            pageStatus.textContent =
                `Page ${currentPage} of ${pdfDocument.numPages}`;


            if (
                currentPageText
            ) {
                textDisplay.textContent =
                    currentPageText;

                setStatus(
                    `Page ${currentPage} ready to read.`
                );
            } else {
                textDisplay.textContent =
                    "No readable text was found on this page.";

                setStatus(
                    "This page does not contain extractable text."
                );
            }


            updateControls();

        } catch (error) {
            console.error(
                "Could not render PDF page:",
                error
            );

            setStatus(
                "Could not load this PDF page."
            );
        }
    }


    // ---------------------------------------------
    // Load selected PDF
    // ---------------------------------------------

    async function loadSelectedDocument() {
        const selected =
            getSelectedDocument();

        if (
            !selected ||
            !selected.fileUrl
        ) {
            return;
        }


        stopReading(false);

        setStatus(
            `Loading ${selected.filename}...`
        );

        textDisplay.textContent =
            "Loading text...";


        try {
            if (pdfDocument) {
                try {
                    await pdfDocument.destroy();
                } catch (_) {
                    // Ignore cleanup errors.
                }
            }


            const loadingTask =
                pdfjsLib.getDocument({
                    url:
                        selected.fileUrl
                });


            pdfDocument =
                await loadingTask.promise;


            currentPage =
                1;


            // Keep the selected PDF in sync
            // with the rest of the application.
            await fetch(
                "/documents/current",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        document_id:
                            selected.id
                    })
                }
            );


            await renderCurrentPage();

        } catch (error) {
            console.error(
                "Could not load PDF:",
                error
            );

            pdfDocument =
                null;

            currentPageText =
                "";

            textDisplay.textContent =
                "Unable to extract PDF text.";

            setStatus(
                "Unable to load the selected PDF."
            );

            updateControls();
        }
    }


    // ---------------------------------------------
    // Stop speech
    // ---------------------------------------------

    function stopReading(
        showMessage = true
    ) {
        speechRun += 1;

        speech.cancel();

        isSpeaking =
            false;

        isPaused =
            false;

        speechChunks =
            [];

        speechChunkIndex =
            0;


        if (showMessage) {
            setStatus(
                "Reading stopped."
            );
        }


        updateControls();
    }


    // ---------------------------------------------
    // Speak the next text chunk
    // ---------------------------------------------

    function speakNextChunk(runId) {
        if (
            runId !== speechRun ||
            !isSpeaking
        ) {
            return;
        }


        // Finished this page.
        if (
            speechChunkIndex >=
            speechChunks.length
        ) {

            // Automatically move to
            // the next page.
            if (
                pdfDocument &&
                currentPage <
                    pdfDocument.numPages
            ) {
                currentPage += 1;


                renderCurrentPage()
                    .then(() => {

                        if (
                            runId !==
                            speechRun
                        ) {
                            return;
                        }


                        speechChunks =
                            splitTextIntoChunks(
                                currentPageText
                            );

                        speechChunkIndex =
                            0;


                        if (
                            speechChunks.length
                        ) {
                            setStatus(
                                `Reading page ${currentPage}...`
                            );

                            speakNextChunk(
                                runId
                            );
                        } else {
                            speakNextChunk(
                                runId
                            );
                        }

                    });


                return;
            }


            // Finished the PDF.
            isSpeaking =
                false;

            isPaused =
                false;

            setStatus(
                "Finished reading the PDF."
            );

            updateControls();

            return;
        }


        const text =
            speechChunks[
                speechChunkIndex
            ];


        speechChunkIndex +=
            1;


        const utterance =
            new SpeechSynthesisUtterance(
                text
            );


        utterance.rate =
            Number(
                speedSelect.value
            ) || 1;


        utterance.pitch =
            1;

        utterance.volume =
            1;


        utterance.onend =
            () => {

                if (
                    runId === speechRun &&
                    isSpeaking
                ) {
                    speakNextChunk(
                        runId
                    );
                }

            };


        utterance.onerror =
            (event) => {

                if (
                    runId !== speechRun
                ) {
                    return;
                }


                console.error(
                    "Speech error:",
                    event.error
                );


                stopReading(
                    false
                );


                setStatus(
                    "Text-to-speech encountered an error."
                );

            };


        speech.speak(
            utterance
        );
    }


    // ---------------------------------------------
    // Start reading
    // ---------------------------------------------

    function startReading() {
        if (
            !currentPageText.trim()
        ) {
            setStatus(
                "There is no readable text on this page."
            );

            return;
        }


        speech.cancel();

        speechRun += 1;


        const runId =
            speechRun;


        speechChunks =
            splitTextIntoChunks(
                currentPageText
            );


        speechChunkIndex =
            0;


        isSpeaking =
            true;

        isPaused =
            false;


        setStatus(
            `Reading page ${currentPage}...`
        );


        updateControls();


        speakNextChunk(
            runId
        );
    }


    // ---------------------------------------------
    // Pause / Resume
    // ---------------------------------------------

    function togglePause() {
        if (!isSpeaking) {
            return;
        }


        if (speech.paused) {
            speech.resume();

            isPaused =
                false;

            setStatus(
                `Reading page ${currentPage}...`
            );

        } else {
            speech.pause();

            isPaused =
                true;

            setStatus(
                "Reading paused."
            );
        }


        updateControls();
    }


    // ---------------------------------------------
    // Page navigation
    // ---------------------------------------------

    async function changePage(
        amount
    ) {
        if (!pdfDocument) {
            return;
        }


        const newPage =
            currentPage +
            amount;


        if (
            newPage < 1 ||
            newPage >
                pdfDocument.numPages
        ) {
            return;
        }


        stopReading(
            false
        );


        currentPage =
            newPage;


        await renderCurrentPage();
    }


    // ---------------------------------------------
    // Event listeners
    // ---------------------------------------------

    documentSelect.addEventListener(
        "change",
        loadSelectedDocument
    );


    previousButton.addEventListener(
        "click",
        () => {
            changePage(-1);
        }
    );


    nextButton.addEventListener(
        "click",
        () => {
            changePage(1);
        }
    );


    playButton.addEventListener(
        "click",
        startReading
    );


    pauseButton.addEventListener(
        "click",
        togglePause
    );


    stopButton.addEventListener(
        "click",
        () => {
            stopReading(true);
        }
    );


    window.addEventListener(
        "beforeunload",
        () => {
            speech.cancel();
        }
    );


    // ---------------------------------------------
    // Initialize Reader
    // ---------------------------------------------

    updateControls();

    loadSelectedDocument();
});