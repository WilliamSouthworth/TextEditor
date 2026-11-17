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
- Extracting selected pages into a new PDF
- Converting PDFs to TXT, DOCX, or PNG images packaged as a ZIP
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
- **pdf2docx** - PDF-to-DOCX conversion
- **Web Speech API** - Text-to-speech functionality
- **Git/GitHub** - Version control and team collaboration

## Setup

### 1. Clone the Repository

```bash
git clone https://github.com/WilliamSouthworth/TextEditor.git
cd TextEditor
```

### 2. Create a Virtual Environment

```bash
python -m venv .venv
```

Activate the virtual environment.

On macOS/Linux:

```bash
source .venv/bin/activate
```

On Windows:

```bash
.venv\Scripts\activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure Environment Variables

Create a `.env` file in the root directory of the project.

You can use `.env.example` as a reference:

```text
SECRET_KEY=your-secret-key-here
```

Replace the example value with your own Flask secret key.

### 5. Run the Application

```bash
python run.py
```

Open the local Flask URL displayed in the terminal, typically:

```text
http://127.0.0.1:5000
```