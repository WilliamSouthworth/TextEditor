from contextlib import ExitStack
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


merge = Blueprint(
    "merge",
    __name__,
)


def _get_mergeable_documents():
    """
    Return session PDFs whose files still exist inside UPLOAD_FOLDER.

    Each session entry is expected to contain:
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


@merge.route("/merge", methods=["GET"])
def merge_page():
    """
    Display the PDF merger with PDFs uploaded in the current session.
    """
    documents = _get_mergeable_documents()

    public_documents = [
        {
            "id": document["id"],
            "filename": document["filename"],
        }
        for document in documents
    ]

    return render_template(
        "merge.html",
        documents=public_documents,
    )


@merge.route("/merge/process", methods=["POST"])
def merge_pdfs():
    """
    Merge the selected session PDFs in the order supplied by the browser.

    Returns the merged PDF as a download without overwriting the originals.
    """
    payload = request.get_json(silent=True) or {}
    requested_ids = payload.get("document_ids")

    if not isinstance(requested_ids, list):
        return jsonify(
            {
                "message": (
                    "The request must include a list of PDF document IDs."
                )
            }
        ), 400

    if len(requested_ids) < 2:
        return jsonify(
            {
                "message": "Select at least two PDFs to merge."
            }
        ), 400

    if len(requested_ids) > 100:
        return jsonify(
            {
                "message": (
                    "You can merge up to 100 PDFs in one operation."
                )
            }
        ), 400

    available_documents = _get_mergeable_documents()

    documents_by_id = {
        str(document["id"]): document
        for document in available_documents
    }

    # Resolve every ID against the current session, preserving
    # the order selected in the browser.
    selected_documents = []

    for requested_id in requested_ids:
        document = documents_by_id.get(str(requested_id))

        if document is None:
            return jsonify(
                {
                    "message": (
                        "One or more selected PDFs are missing, "
                        "unavailable, or do not belong to this session. "
                        "Refresh the page and try again."
                    )
                }
            ), 400

        selected_documents.append(document)

    try:
        from pypdf import PdfReader, PdfWriter
    except ImportError:
        current_app.logger.exception(
            "The pypdf dependency is not installed."
        )

        return jsonify(
            {
                "message": (
                    "The PDF merge dependency is missing. "
                    "Install it by running: pip install pypdf"
                )
            }
        ), 500

    writer = PdfWriter()
    output = BytesIO()

    try:
        # Keep all input streams open until writing finishes.
        with ExitStack() as stack:
            for document in selected_documents:
                stream = stack.enter_context(
                    document["path"].open("rb")
                )

                reader = PdfReader(
                    stream,
                    strict=False,
                )

                if reader.is_encrypted:
                    return jsonify(
                        {
                            "message": (
                                f'"{document["filename"]}" is password-protected. '
                                "Unlock it before merging."
                            )
                        }
                    ), 400

                if len(reader.pages) == 0:
                    return jsonify(
                        {
                            "message": (
                                f'"{document["filename"]}" contains no pages.'
                            )
                        }
                    ), 400

                writer.append(reader)

            writer.write(output)

        if output.getbuffer().nbytes == 0:
            return jsonify(
                {
                    "message": "The merge operation produced an empty PDF."
                }
            ), 500

        output.seek(0)

        return send_file(
            output,
            mimetype="application/pdf",
            as_attachment=True,
            download_name="merged.pdf",
            max_age=0,
        )

    except Exception as error:
        current_app.logger.exception(
            "Failed to merge the selected PDFs."
        )

        return jsonify(
            {
                "message": (
                    "Could not merge the selected PDFs. "
                    "One of the files may be damaged or unsupported. "
                    f"Details: {error}"
                )
            }
        ), 400