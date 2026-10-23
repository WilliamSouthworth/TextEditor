
from pathlib import Path

from flask import (
    Blueprint,
    current_app,
    redirect,
    render_template,
    session,
    url_for,
)


editor = Blueprint(
    "editor",
    __name__
)


@editor.route("/edit")
def edit():
    """
    Display the PDF editor.

    Supports multiple PDFs stored in the current
    Flask session.

    The editor receives:
        - All uploaded PDFs
        - The currently selected PDF
        - The selected PDF's URL
    """

    # -------------------------------------
    # Get session documents
    # -------------------------------------

    documents = session.get(
        "pdf_documents",
        []
    )

    # -------------------------------------
    # Get the currently selected document
    # -------------------------------------

    current_document_id = session.get(
        "current_pdf_id"
    )

    # -------------------------------------
    # No documents uploaded
    # -------------------------------------

    if not documents:

        session.pop(
            "current_pdf_id",
            None
        )

        session.pop(
            "current_pdf",
            None
        )

        return redirect(
            url_for("main.index")
        )

    # -------------------------------------
    # Get upload directory
    # -------------------------------------

    upload_folder = Path(
        current_app.config["UPLOAD_FOLDER"]
    )

    # -------------------------------------
    # Remove documents whose files no longer exist
    # -------------------------------------

    valid_documents = []

    for document in documents:

        stored_name = document.get(
            "stored_name"
        )

        if not stored_name:
            continue

        file_path = (
            upload_folder / stored_name
        )

        if file_path.exists():

            valid_documents.append(
                document
            )

    # -------------------------------------
    # No valid PDFs remain
    # -------------------------------------

    if not valid_documents:

        session["pdf_documents"] = []

        session.pop(
            "current_pdf_id",
            None
        )

        session.pop(
            "current_pdf",
            None
        )

        return redirect(
            url_for("main.index")
        )

    # -------------------------------------
    # Update session documents
    # -------------------------------------

    documents = valid_documents

    session["pdf_documents"] = documents

    # -------------------------------------
    # Find currently selected document
    # -------------------------------------

    current_document = next(
        (
            document
            for document in documents
            if document.get("id")
            == current_document_id
        ),
        None
    )

    # -------------------------------------
    # Select a document if necessary
    # -------------------------------------

    if current_document is None:

        current_document = documents[-1]

        current_document_id = (
            current_document["id"]
        )

    # -------------------------------------
    # Update session selection
    # -------------------------------------

    session["current_pdf_id"] = (
        current_document["id"]
    )

    session["current_pdf"] = (
        current_document["stored_name"]
    )

    # -------------------------------------
    # Prepare documents for the editor
    # -------------------------------------

    editor_documents = []

    for document in documents:

        editor_documents.append({
            "id": document["id"],
            "filename": document["filename"],
            "file_url": url_for(
                "main.uploaded_file",
                filename=document["stored_name"]
            ),
        })

    # -------------------------------------
    # Get selected document URL
    # -------------------------------------

    file_url = url_for(
        "main.uploaded_file",
        filename=current_document["stored_name"]
    )

    # -------------------------------------
    # Display editor
    # -------------------------------------

    return render_template(
        "editor.html",
        filename=current_document["filename"],
        file_url=file_url,
        documents=editor_documents,
        current_document_id=current_document["id"],
    )
