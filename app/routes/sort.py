from io import BytesIO
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


sort = Blueprint(
    "sort",
    __name__,
)


def _get_sortable_documents():
    """
    Return uploaded PDFs belonging to the current session.

    Expected session fields:
        - id
        - filename
        - stored_name
    """
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

        # Prevent access to files outside the upload directory.
        if upload_folder not in file_path.parents:
            continue

        if not file_path.is_file():
            continue

        if file_path.suffix.lower() != ".pdf":
            continue

        valid_documents.append({
            "id": document_id,
            "filename": filename,
            "stored_name": stored_name,
            "path": file_path,
        })

    return valid_documents


@sort.route("/sort", methods=["GET"])
def sort_page():
    """
    Display the page sorter and PDFs uploaded in the current session.
    """
    documents = _get_sortable_documents()

    public_documents = [
        {
            "id": document["id"],
            "filename": document["filename"],
            "file_url": (
                f"/uploaded/{document['stored_name']}"
            ),
        }
        for document in documents
    ]

    # Use Flask's endpoint to generate the URL rather than assuming
    # that the uploaded-file route is located at /uploaded/<filename>.
    from flask import url_for

    for public_document, document in zip(
        public_documents,
        documents,
    ):
        public_document["file_url"] = url_for(
            "main.uploaded_file",
            filename=document["stored_name"],
        )

    current_document_id = session.get("current_pdf_id")

    if not any(
        str(document["id"]) == str(current_document_id)
        for document in documents
    ):
        current_document_id = (
            documents[0]["id"] if documents else None
        )

    return render_template(
        "sort.html",
        documents=public_documents,
        current_document_id=current_document_id,
    )


@sort.route("/sort/process", methods=["POST"])
def sort_pdf():
    """
    Reorder, rotate, and remove PDF pages.

    JSON input:
        {
            "document_id": "uploaded-document-id",
            "pages": [
                {"page_number": 3, "rotation": 0},
                {"page_number": 1, "rotation": 90},
                {"page_number": 2, "rotation": 0}
            ]
        }

    Page numbers refer to the original PDF. The order of the list
    determines the order of the output. Omitted pages are removed.
    Rotation values are clockwise increments relative to the
    original page orientation.
    """
    payload = request.get_json(silent=True) or {}

    document_id = payload.get("document_id")
    requested_pages = payload.get("pages")

    if document_id is None:
        return jsonify({
            "message": "A PDF document ID is required."
        }), 400

    if not isinstance(requested_pages, list):
        return jsonify({
            "message": "The request must include an ordered page list."
        }), 400

    if not requested_pages:
        return jsonify({
            "message": "At least one page must remain in the PDF."
        }), 400

    if len(requested_pages) > 10000:
        return jsonify({
            "message": "The requested page list is too large."
        }), 400

    documents = _get_sortable_documents()

    selected_document = next(
        (
            document
            for document in documents
            if str(document["id"]) == str(document_id)
        ),
        None,
    )

    if selected_document is None:
        return jsonify({
            "message": (
                "The selected PDF was not found in this session. "
                "Refresh the page and try again."
            )
        }), 404

    try:
        from pypdf import PdfReader, PdfWriter
    except ImportError:
        current_app.logger.exception(
            "The pypdf dependency is not installed."
        )

        return jsonify({
            "message": (
                "The PDF processing dependency is missing. "
                "Run: python -m pip install pypdf"
            )
        }), 500

    output = BytesIO()
    writer = PdfWriter()

    try:
        with selected_document["path"].open("rb") as source:
            reader = PdfReader(
                source,
                strict=False,
            )

            if reader.is_encrypted:
                return jsonify({
                    "message": (
                        "This PDF is password-protected. "
                        "Unlock it before sorting its pages."
                    )
                }), 400

            original_page_count = len(reader.pages)
            seen_page_numbers = set()

            validated_pages = []

            for entry in requested_pages:
                if not isinstance(entry, dict):
                    return jsonify({
                        "message": "An invalid page entry was supplied."
                    }), 400

                page_number = entry.get("page_number")
                rotation = entry.get("rotation", 0)

                # bool is a subclass of int in Python, so reject it.
                if (
                    isinstance(page_number, bool)
                    or not isinstance(page_number, int)
                ):
                    return jsonify({
                        "message": "Page numbers must be integers."
                    }), 400

                if (
                    isinstance(rotation, bool)
                    or not isinstance(rotation, int)
                ):
                    return jsonify({
                        "message": "Page rotation must be an integer."
                    }), 400

                if not 1 <= page_number <= original_page_count:
                    return jsonify({
                        "message": (
                            f"Page {page_number} is outside the PDF's "
                            f"valid range of 1 to {original_page_count}."
                        )
                    }), 400

                if rotation not in (0, 90, 180, 270):
                    return jsonify({
                        "message": (
                            "Page rotations must be 0, 90, 180, or 270 degrees."
                        )
                    }), 400

                if page_number in seen_page_numbers:
                    return jsonify({
                        "message": (
                            f"Page {page_number} was included more than once."
                        )
                    }), 400

                seen_page_numbers.add(page_number)

                validated_pages.append({
                    "page_number": page_number,
                    "rotation": rotation,
                })

            # Add pages in the exact order provided by the browser.
            for entry in validated_pages:
                page = reader.pages[
                    entry["page_number"] - 1
                ]

                rotation = entry["rotation"]

                if rotation:
                    page.rotate(rotation)

                writer.add_page(page)

            # Preserve document metadata when available.
            metadata = reader.metadata

            if metadata:
                metadata_to_copy = {
                    str(key): str(value)
                    for key, value in metadata.items()
                    if key and value is not None
                }

                if metadata_to_copy:
                    writer.add_metadata(metadata_to_copy)

            writer.write(output)

        if output.getbuffer().nbytes == 0:
            return jsonify({
                "message": "The sorted PDF output is empty."
            }), 500

        output.seek(0)

        base_name = Path(
            selected_document["filename"]
        ).stem

        safe_name = "".join(
            character
            for character in base_name
            if character.isalnum()
            or character in ("-", "_", " ")
        ).strip()

        download_name = (
            f"{safe_name or 'document'}-sorted.pdf"
        )

        return send_file(
            output,
            mimetype="application/pdf",
            as_attachment=True,
            download_name=download_name,
            max_age=0,
        )

    except Exception:
        current_app.logger.exception(
            "Failed to reorganize the PDF."
        )

        return jsonify({
            "message": (
                "Could not create the sorted PDF. "
                "The source file may be damaged or unsupported. "
                "Check the Flask application log for details."
            )
        }), 400