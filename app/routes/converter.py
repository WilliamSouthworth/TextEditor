import io
import tempfile
import zipfile
from pathlib import Path

from flask import (
    Blueprint,
    current_app,
    jsonify,
    render_template,
    request,
    send_file,
    session,
)
from werkzeug.utils import secure_filename

converter = Blueprint(
    "converter",
    __name__
)

class ConversionError(Exception):
    """Raised when a PDF conversion fails."""

MAX_PNG_PAGES = 100
PNG_DPI = 150

def pdf_to_txt(pdf_path: Path, output_path: Path) -> None:
    import fitz

    with fitz.open(pdf_path) as doc:
        if doc.needs_pass:
            raise ConversionError("this PDF is password-protected")
        pages = [page.get_text() for page in doc]

    text = "\n\n".join(pages).strip()

    if not text:
        raise ConversionError("no text found")

    output_path.write_text(text, encoding="utf-8")

def pdf_to_png(pdf_path: Path, output_path: Path) -> None:
    
    import fitz

    with fitz.open(pdf_path) as doc:
        if doc.needs_pass:
            raise ConversionError("This PDF is password protected")

        if doc.page_count > MAX_PNG_PAGES:
            raise ConversionError(
                f"PDF has {doc.page_count} pages, which exceeds the limit of {MAX_PNG_PAGES} pages for PNG conversion."
            )

        with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for number, page in enumerate(doc, start = 1):
                pixmap = page.get_pixmap(dpi=PNG_DPI)
                zf.writestr(f"page_{number:03d}.png", pixmap.tobytes("png"))

def pdf_to_docx(pdf_path: Path, output_path) -> None:
    from pdf2docx import Converter

    cv = Converter(str(pdf_path))
    try:
        cv.convert(str(output_path))
    finally:
        cv.close()

CONVERTERS = {
    "txt": (pdf_to_txt, "txt", "text/plain"),
    "png": (pdf_to_png, "zip", "application/zip"),
    "docx": (pdf_to_docx, "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 
    ),
}

@converter.route("/converter")
def converter_page():
    """
    Display the PDF converter page.
    """

    documents = _get_convertable_documents()

    public_documents = [
        {
            "id": document["id"],
            "filename": document["filename"],
        }
        for document in documents
    ]

    current_document_id = session.get(
        "current_pdf_id"
    )

    return render_template(
        "converter.html",
        documents=public_documents,
        current_document_id=current_document_id,
    )

@converter.route("/converter/convert", methods=["POST"])
def convert_document():
    data = request.get_json(silent=True) or request.form

    document_id = data.get("document_id")
    target = str(data.get("format", "")).lower()

    if target not in CONVERTERS:
        return jsonify(error="Unsupported format."), 400

    document = next(
        (
        d for d in _get_convertable_documents()
        if str(d["id"]) == str(document_id)
        ),
        None,
    )
    if document is None:
        return jsonify(error = "Document not found."), 404

    convert_fn, extension, mimetype = CONVERTERS[target]

    with tempfile.TemporaryDirectory() as tmp:
        output_path = Path(tmp) / f"output.{extension}"

        try:
            convert_fn(document["path"], output_path)
        except ConversionError as exc:
            return jsonify(error=str(exc)), 400
        except Exception:
            current_app.logger.exception("PDF conversion failed")
            return jsonify(error="The PDF could not be converted."), 500

        payload = io.BytesIO(output_path.read_bytes())

    safe_stem = secure_filename(Path(document["filename"]).stem) or "converted"

    return send_file(
        payload, 
        mimetype=mimetype,
        as_attachment = True,
        download_name = f"{safe_stem}.{extension}",
    )


def _get_convertable_documents():

    documents = session.get("pdf_documents", [])

    upload_folder = Path(
        current_app.config["UPLOAD_FOLDER"]
    ).resolve()

    valid_documents = []

    for document in documents:
        if not isinstance(document, dict):
            continue

        document_id = document.get("id")
        filename = document.get("filename")
        stored_name = document.get("stored_name")

        if (
            document_id is None
            or not filename
            or not stored_name
        ):
            continue

        file_path = (
            upload_folder / stored_name
        ).resolve()

        # Do not allow a session value to access files outside
        # the application's upload directory.
        if upload_folder not in file_path.parents:
            continue

        if not file_path.is_file():
            continue

        if file_path.suffix.lower() != ".pdf":
            continue

        valid_documents.append(
            {
                "id": document_id,
                "filename": filename,
                "stored_name": stored_name,
                "path": file_path,
            }
        )

    return valid_documents