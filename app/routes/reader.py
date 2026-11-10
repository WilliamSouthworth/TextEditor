from pathlib import Path

from flask import (
    Blueprint,
    current_app,
    redirect,
    render_template,
    session,
    url_for,
)


reader = Blueprint(
    "reader",
    __name__
)


def _valid_session_documents():
    """
    Return PDFs from the current session whose
    files still exist in the upload directory.
    """

    documents = session.get(
        "pdf_documents",
        []
    )

    upload_folder = Path(
        current_app.config["UPLOAD_FOLDER"]
    ).resolve()

    valid_documents = []

    for document in documents:

        if not isinstance(document, dict):
            continue

        stored_name = document.get(
            "stored_name"
        )

        if not stored_name:
            continue

        file_path = (
            upload_folder / stored_name
        ).resolve()

        # Prevent paths outside the upload folder.
        if (
            upload_folder not in file_path.parents
            or not file_path.is_file()
        ):
            continue

        if file_path.suffix.lower() != ".pdf":
            continue

        valid_documents.append(
            document
        )

    return valid_documents


@reader.route("/reader")
def reader_page():
    """
    Display the PDF text-to-speech reader.
    """

    documents = _valid_session_documents()

    session["pdf_documents"] = documents

    # If nothing has been uploaded yet,
    # return the user to the home page.
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

    current_document_id = session.get(
        "current_pdf_id"
    )

    current_document = next(
        (
            document
            for document in documents
            if str(document.get("id"))
            == str(current_document_id)
        ),
        None,
    )

    # Default to the newest uploaded PDF.
    if current_document is None:
        current_document = documents[-1]

    session["current_pdf_id"] = (
        current_document["id"]
    )

    session["current_pdf"] = (
        current_document["stored_name"]
    )

    reader_documents = [
        {
            "id": document["id"],

            "filename": document.get(
                "filename",
                document["stored_name"],
            ),

            "file_url": url_for(
                "main.uploaded_file",
                filename=document[
                    "stored_name"
                ],
            ),
        }
        for document in documents
    ]

    return render_template(
        "reader.html",
        documents=reader_documents,
        current_document_id=(
            current_document["id"]
        ),
    )