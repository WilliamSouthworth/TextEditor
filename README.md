# TextEditor

TextEditor is a web-based PDF editing, organization, and accessibility tool developed for our CS 321 Software Engineering project. The application allows users to upload and manage PDF documents, edit and organize their contents, convert and split files, and use accessibility features such as text-to-speech.

## Current Features

The application supports:

- Uploading and managing multiple PDF documents
- Viewing PDFs directly in the browser using PDF.js
- Switching between uploaded PDFs
- Selecting and copying PDF text
- Highlighting selected text
- Moving and removing highlights
- Adding and modifying text
- Undo and redo for editor changes
- Saving and downloading an edited copy of a PDF
- Merging multiple PDFs in a selected order
- Reordering, rotating, and removing PDF pages
- Splitting PDFs into separate documents
- Converting PDFs to other supported file formats
- Exporting modified PDFs
- Reading PDF text aloud using text-to-speech
- Pausing, resuming, and stopping text-to-speech playback
- Adjusting text-to-speech reading speed
- Automatically continuing text-to-speech across PDF pages

## Minimum Viable Product

Our MVP focuses on providing the main tools needed to interact with, modify, organize, and access PDF documents in one application. Users can upload PDFs, view and edit them, highlight content, merge or split documents, reorganize pages, convert files, listen to PDF text using text-to-speech, and export modified versions.

## Technology Stack

The project uses:

- **Python** - Backend programming language
- **Flask** - Web application framework
- **HTML/CSS** - User interface and styling
- **JavaScript** - Client-side interaction and editor functionality
- **PDF.js** - PDF rendering, viewing, and text extraction
- **PDF-Lib** - Creating edited PDF copies in the browser
- **PyMuPDF** - PDF processing
- **pypdf** - PDF merging, splitting, sorting, and other document operations
- **Web Speech API** - Text-to-speech functionality
- **Git/GitHub** - Version control and team collaboration