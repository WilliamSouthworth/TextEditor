
from pathlib import Path
from uuid import uuid4

from flask import (
    Blueprint,
    current_app,
    jsonify,
    render_template,
    request,
    send_from_directory,
    session,
    url_for,
)

from werkzeug.utils import secure_filename


main = Blueprint("main", __name__)


# =========================================
# DOCUMENT HELPERS
# =========================================

def get_documents():
    """
    Return the PDFs associated with the current session.
    """

    return session.get("pdf_documents", [])


def public_documents(documents):
    """
    Prepare document information for the browser.

    Internal server filenames are used to generate
    URLs without exposing unnecessary server details.
    """

    return [
        {
            "id": document["id"],
            "filename": document["filename"],
            "file_url": url_for(
                "main.uploaded_file",
                filename=document["stored_name"],
            ),
        }
        for document in documents
    ]


# =========================================
# HOME PAGE
# =========================================

@main.route("/")
def index():
    """
    Display the main home page.
    """

    return render_template("home.html")


# =========================================
# UPLOAD PDF FILES
# =========================================

@main.route("/upload", methods=["POST"])
def upload_pdf():
    """
    Receive and save one or more uploaded PDFs.

    Supports both:
        - The new multiple-file field: "files"
        - The original single-file field: "file"
    """

    # -------------------------------------
    # Get the uploaded files
    # -------------------------------------

    uploaded_files = request.files.getlist("files")

    # Support the original single-file upload.
    if not uploaded_files:
        uploaded_files = request.files.getlist("file")

    # Ignore empty file-picker entries.
    uploaded_files = [
        uploaded_file
        for uploaded_file in uploaded_files
        if uploaded_file and uploaded_file.filename
    ]

    # Make sure at least one file was selected.
    if not uploaded_files:
        return jsonify({
            "error": "Please select at least one PDF."
        }), 400

    # -------------------------------------
    # Validate the selected files
    # -------------------------------------

    for uploaded_file in uploaded_files:

        if Path(uploaded_file.filename).suffix.lower() != ".pdf":
            return jsonify({
                "error": (
                    "Only PDF files are allowed: "
                    f"{uploaded_file.filename}"
                )
            }), 400

    # -------------------------------------
    # Secure the filenames
    # -------------------------------------

    prepared_files = []

    for uploaded_file in uploaded_files:

        original_filename = secure_filename(
            uploaded_file.filename
        )

        # Reject filenames that become empty after sanitization.
        if not original_filename:
            return jsonify({
                "error": "One of the selected filenames is invalid."
            }), 400

        prepared_files.append((
            uploaded_file,
            original_filename,
        ))

    # -------------------------------------
    # Get the upload directory
    # -------------------------------------

    upload_folder = Path(
        current_app.config["UPLOAD_FOLDER"]
    )

    upload_folder.mkdir(
        parents=True,
        exist_ok=True,
    )

    # -------------------------------------
    # Preserve existing session documents
    # -------------------------------------

    documents = list(get_documents())
    added_documents = []

    # -------------------------------------
    # Save each uploaded PDF
    # -------------------------------------

    for uploaded_file, original_filename in prepared_files:

        # Generate a unique name so uploading two files
        # with the same original name will not overwrite either.
        stored_name = (
            f"{uuid4().hex}_{original_filename}"
        )

        file_path = upload_folder / stored_name

        uploaded_file.save(file_path)

        # Keep the original safe filename for display.
        document = {
            "id": uuid4().hex,
            "filename": original_filename,
            "stored_name": stored_name,
        }

        documents.append(document)
        added_documents.append(document)

    # -------------------------------------
    # Remember the uploaded documents
    # -------------------------------------

    session["pdf_documents"] = documents

    # Select the most recently uploaded PDF.
    selected_document = added_documents[-1]

    session["current_pdf_id"] = selected_document["id"]

    # Retain compatibility with existing tool routes
    # that use session["current_pdf"].
    session["current_pdf"] = selected_document["stored_name"]

    # -------------------------------------
    # Return the upload results
    # -------------------------------------

    return jsonify({
        "message": "PDFs uploaded successfully.",
        "files": public_documents(documents),
        "current_id": selected_document["id"],
    })


# =========================================
# RESTORE SESSION DOCUMENTS
# =========================================

@main.route("/documents", methods=["GET"])
def list_documents():
    """
    Return the PDFs associated with the current session.

    Used when the home page loads or is refreshed.
    """

    documents = get_documents()

    current_id = session.get("current_pdf_id")

    # Verify that the saved selection still exists.
    if not any(
        document["id"] == current_id
        for document in documents
    ):
        current_id = (
            documents[-1]["id"]
            if documents
            else None
        )

    # Restore the selected document in the session.
    if current_id:

        selected_document = next(
            document
            for document in documents
            if document["id"] == current_id
        )

        session["current_pdf_id"] = current_id
        session["current_pdf"] = (
            selected_document["stored_name"]
        )

    else:

        # No PDFs remain in this session.
        session.pop("current_pdf_id", None)
        session.pop("current_pdf", None)

    return jsonify({
        "files": public_documents(documents),
        "current_id": current_id,
    })


# =========================================
# CHANGE THE CURRENT PDF
# =========================================

@main.route("/documents/current", methods=["POST"])
def set_current_document():
    """
    Remember which uploaded PDF the user selected.
    """

    data = request.get_json(silent=True) or {}

    document_id = data.get("document_id")

    documents = get_documents()

    # Find the requested document in this session.
    selected_document = next(
        (
            document
            for document in documents
            if document["id"] == document_id
        ),
        None,
    )

    # Reject IDs that do not belong to this session.
    if selected_document is None:
        return jsonify({
            "error": "Document not found."
        }), 404

    # Update the selected PDF.
    session["current_pdf_id"] = selected_document["id"]

    session["current_pdf"] = (
        selected_document["stored_name"]
    )

    return jsonify({
        "message": "Current document updated.",
        "current_id": selected_document["id"],
    })


# =========================================
# DELETE A PDF
# =========================================


# =========================================
# DELETE A PDF
# =========================================

@main.route("/documents/<document_id>", methods=["DELETE"])
def delete_document(document_id):

    # Get the PDFs associated with this session.
    documents = list(get_documents())

    # Find the requested PDF.
    selected_document = next(
        (
            document
            for document in documents
            if document["id"] == document_id
        ),
        None,
    )

    # Reject PDFs that do not belong to this session.
    if selected_document is None:
        return jsonify({
            "error": "Document not found."
        }), 404

    # Get the upload directory.
    upload_folder = Path(
        current_app.config["UPLOAD_FOLDER"]
    ).resolve()

    # Get the stored PDF's path.
    file_path = (
        upload_folder / selected_document["stored_name"]
    ).resolve()

    # Prevent deleting files outside the upload directory.
    if file_path.parent != upload_folder:
        return jsonify({
            "error": "Invalid document path."
        }), 400

    # -------------------------------------
    # PERMANENTLY DELETE THE PDF FROM DISK
    # -------------------------------------

    try:

        # Delete the actual PDF file.
        # missing_ok=False ensures a missing file
        # is reported instead of silently ignored.
        file_path.unlink(missing_ok=False)

    except OSError as error:

        current_app.logger.exception(
            "Could not delete uploaded PDF: %s",
            file_path
        )

        return jsonify({
            "error": f"Could not delete PDF: {error}"
        }), 500

    # -------------------------------------
    # REMOVE THE PDF FROM THE SESSION
    # -------------------------------------

    documents = [
        document
        for document in documents
        if document["id"] != document_id
    ]

    session["pdf_documents"] = documents

    # -------------------------------------
    # UPDATE THE CURRENT PDF
    # -------------------------------------

    current_id = session.get("current_pdf_id")

    if current_id == document_id:

        if documents:

            # Select the last remaining PDF.
            selected_document = documents[-1]

            session["current_pdf_id"] = (
                selected_document["id"]
            )

            session["current_pdf"] = (
                selected_document["stored_name"]
            )

            current_id = selected_document["id"]

        else:

            # No PDFs remain.
            session.pop("current_pdf_id", None)
            session.pop("current_pdf", None)

            current_id = None

    # -------------------------------------
    # RETURN THE UPDATED DOCUMENT LIST
    # -------------------------------------

    return jsonify({
        "message": "PDF permanently deleted.",
        "files": public_documents(documents),
        "current_id": current_id,
    })


# =========================================
# SERVE UPLOADED PDF FILES
# =========================================

@main.route("/uploads/<path:filename>")
def uploaded_file(filename):
    """
    Send an uploaded PDF to the browser.

    The browser uses this route to display the PDF
    in the workspace preview.
    """

    upload_folder = Path(
        current_app.config["UPLOAD_FOLDER"]
    )

    return send_from_directory(
        upload_folder,
        filename,
    )
