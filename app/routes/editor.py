from pathlib import Path

from flask import (
    Blueprint,
    current_app,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

editor = Blueprint("editor", __name__)


def _valid_session_documents():
    """Return session PDFs whose stored files still exist in the upload folder."""
    documents = session.get("pdf_documents", [])
    upload_folder = Path(current_app.config["UPLOAD_FOLDER"]).resolve()
    valid_documents = []

    for document in documents:
        if not isinstance(document, dict):
            continue

        stored_name = document.get("stored_name")
        if not stored_name:
            continue

        file_path = (upload_folder / stored_name).resolve()

        # Prevent paths outside the upload directory from being accessed.
        if upload_folder not in file_path.parents or not file_path.is_file():
            continue

        valid_documents.append(document)

    return valid_documents


@editor.route("/edit", methods=["GET"])
def edit():
    """Display the editor for PDFs uploaded in the current session."""
    documents = _valid_session_documents()
    session["pdf_documents"] = documents

    if not documents:
        session.pop("current_pdf_id", None)
        session.pop("current_pdf", None)
        return redirect(url_for("main.index"))

    current_document_id = session.get("current_pdf_id")

    current_document = next(
        (
            document
            for document in documents
            if str(document.get("id")) == str(current_document_id)
        ),
        None,
    )

    if current_document is None:
        current_document = documents[-1]

    session["current_pdf_id"] = current_document["id"]
    session["current_pdf"] = current_document["stored_name"]

    editor_documents = [
        {
            "id": document["id"],
            "filename": document.get(
                "filename",
                document["stored_name"],
            ),
            "file_url": url_for(
                "main.uploaded_file",
                filename=document["stored_name"],
            ),
        }
        for document in documents
    ]

    return render_template(
        "editor.html",
        filename=current_document.get(
            "filename",
            current_document["stored_name"],
        ),
        file_url=url_for(
            "main.uploaded_file",
            filename=current_document["stored_name"],
        ),
        documents=editor_documents,
        current_document_id=current_document["id"],
    )


@editor.route("/edit/current-document", methods=["POST"])
def set_current_document():
    """Update the selected PDF in the current Flask session."""
    payload = request.get_json(silent=True) or {}
    requested_id = payload.get("document_id")

    if requested_id is None:
        return jsonify(
            {"message": "A document ID is required."}
        ), 400

    documents = _valid_session_documents()

    selected_document = next(
        (
            document
            for document in documents
            if str(document.get("id")) == str(requested_id)
        ),
        None,
    )

    if selected_document is None:
        return jsonify(
            {
                "message": (
                    "The selected PDF was not found in this session."
                )
            }
        ), 404

    session["pdf_documents"] = documents
    session["current_pdf_id"] = selected_document["id"]
    session["current_pdf"] = selected_document["stored_name"]

    return jsonify(
        {
            "ok": True,
            "document_id": selected_document["id"],
            "filename": selected_document.get(
                "filename",
                selected_document["stored_name"],
            ),
        }
    )