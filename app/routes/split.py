import io
from pathlib import Path

from flask import (
    Blueprint, 
    current_app,
    render_template,
    jsonify,
    request,
    send_file,
    session,
    url_for,
)

from werkzeug.utils import secure_filename

split = Blueprint(
    "split",
    __name__
)

MAX_SELECTED_PAGES = 500

class SplitError(Exception):
    """Raised when pages cannot be extracted and the user should know why."""

def extract_pages(pdf_path: Path, page_numbers: list[int]) -> bytes:

    import fitz

    with fitz.open(pdf_path) as source:
        if source.needs_pass:
            raise SplitError("This PDF is password protected.")

        total = source.page_count

        for number in page_numbers:
            if number < 1 or number > total:
                raise SplitError(
                    f"Page {number} does not exist. "
                    f"This PDF has {total} pages."
                )

        with fitz.open() as output:
            for number in page_numbers:
                output.insert_pdf(
                    source,
                    from_page = number - 1,
                    to_page = number - 1,
                )

            return output.tobytes(garbage=3, deflate=True)


def _parse_page_numbers(raw) -> list[int]:
    if not isinstance(raw, list) or not raw:
        raise SplitError("Select at least one page.")

    if len(raw) > MAX_SELECTED_PAGES:
        raise SplitError(
            f"You can extract at most {MAX_SELECTED_PAGES} pages at a time."
        )

    numbers = []
    seen = set()

    for item in raw:
        if isinstance(item, bool) or not isinstance(item, int):
            raise SplitError("Page numbers must be whole numbers. ")

        if item not in seen:
            seen.add(item)
            numbers.append(item)

    return numbers

def _get_splittable_documents():

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

        if not file_path.is_relative_to(upload_folder):
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

def _find_document(document_id):
    return next (
        (
            d for d in _get_splittable_documents()
            if str(d["id"]) == str(document_id)
        ),
        None,
    )

@split.route("/split")
def split_page():
    """
    Display the PDF splitting page.
    """

    documents = _get_splittable_documents()

    public_documents = [
        {
            "id": d["id"],
            "filename": d["filename"],
            "file_url": url_for(
                "split.document_file",
                document_id=d["id"],
            ),
        }
        for d in documents
    ]

    current_document_id = request.args.get("document", "")

    return render_template(
        "split.html",
        documents=public_documents,
        current_document_id=current_document_id,
    )

@split.route("/split/file/<document_id>")
def document_file(document_id):
    document = _find_document(document_id)

    if document is None:
        return jsonify(error="Document not found."), 404

    return send_file(
        document["path"],
        mimetype="application/pdf",
        conditional=True,
    )

@split.route("/split/extract", methods=["POST"])
def extract_selected_pages():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify(error="Invalid request."), 400

    document = _find_document(data.get("document_id"))

    if document is None:
        return jsonify(error="Document not found."), 404

    try:
        page_numbers = _parse_page_numbers(data.get("pages"))
        pdf_bytes = extract_pages(document["path"], page_numbers)
    except SplitError as exc:
        return jsonify(error=str(exc)), 400
    except Exception:
        current_app.logger.exception("PDF split failed")
        return jsonify(error="The pages could not be extracted."), 500

    safe_stem = secure_filename(Path(document["filename"]).stem) or "document"

    return send_file(
        io.BytesIO(pdf_bytes),
        mimetype="application/pdf",
        as_attachment=True,
        download_name=f"{safe_stem}-split.pdf",
    )

