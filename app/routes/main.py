from pathlib import Path
import os
import uuid

from flask import (
    Blueprint,
    current_app,
    jsonify,
    redirect,
    render_template,
    request,
    send_from_directory,
    session,
    url_for,
)
from werkzeug.utils import secure_filename


main = Blueprint("main", __name__)


# ---------------------------------------------------------------------------
# Stored PDFs that appear on the Home page
# ---------------------------------------------------------------------------

HOME_PDF_NAMES = {
    "BuildingStandDirectoryTraining.pdf",
    "GrammarlyTraining.pdf",
    "ITHelpDeskTrainingReport.pdf",
    "ITInfrastructureTraining.pdf",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_upload_folder():
    return Path(current_app.config["UPLOAD_FOLDER"])


def allowed_file(filename):
    return (
        filename
        and "." in filename
        and filename.rsplit(".", 1)[1].lower() == "pdf"
    )


def display_name_for(filename):
    """
    Convert a stored filename into the name displayed to the user.
    """
    return Path(filename).stem


def _cleanup_expired_uploads():
    """
    Remove uploaded PDFs that are older than the configured TTL.

    IMPORTANT:
    Files listed in HOME_PDF_NAMES are permanent/stored PDFs and must
    never be removed by the normal upload cleanup process.
    """
    upload_folder = get_upload_folder()
    upload_folder.mkdir(parents=True, exist_ok=True)

    ttl = current_app.config.get(
        "UPLOAD_TTL_SECONDS",
        2 * 60 * 60,
    )

    try:
        ttl = int(ttl)
    except (TypeError, ValueError):
        ttl = 2 * 60 * 60

    now = __import__("time").time()

    current_session_pdfs = {
        pdf.get("filename")
        for pdf in session.get("pdfs", [])
        if isinstance(pdf, dict)
    }

    for path in upload_folder.iterdir():

        if not path.is_file():
            continue

        # Never delete permanently stored Home-page PDFs.
        if path.name in HOME_PDF_NAMES:
            continue

        # Never delete files belonging to the active workspace.
        if path.name in current_session_pdfs:
            continue

        try:

            age = now - path.stat().st_mtime

            if age > ttl:
                path.unlink()

        except OSError:
            pass


def get_available_stored_pdfs():
    """
    Return the permanent PDFs that actually exist in uploads/.
    """
    upload_folder = get_upload_folder()
    upload_folder.mkdir(parents=True, exist_ok=True)

    stored = []

    for filename in sorted(HOME_PDF_NAMES):

        path = upload_folder / filename

        if path.is_file():

            stored.append(
                {
                    "filename": filename,

                    "display_name":
                        display_name_for(filename),

                    "file_url":
                        url_for(
                            "main.serve_upload",
                            filename=filename,
                        ),
                }
            )

    return stored


def make_workspace_pdf(filename):
    """
    Build the session representation used by the workspace.
    """
    return {
        "filename": filename,

        "display_name":
            display_name_for(filename),

        "file_url":
            url_for(
                "main.serve_upload",
                filename=filename,
            ),
    }


# ---------------------------------------------------------------------------
# Home
# ---------------------------------------------------------------------------

@main.route("/")
def index():
    """
    Home page.

    Visiting the Home page starts a fresh workspace.
    """
    _cleanup_expired_uploads()

    session.pop("pdfs", None)

    available_pdfs = get_available_stored_pdfs()

    return render_template(
        "home.html",
        pdfs=[],
        available_pdfs=available_pdfs,
    )


# ---------------------------------------------------------------------------
# Workspace
# ---------------------------------------------------------------------------

@main.route("/workspace")
def workspace():
    """
    Display the current PDF workspace without clearing the session.
    """
    _cleanup_expired_uploads()

    pdfs = session.get("pdfs", [])

    return render_template(
        "home.html",
        pdfs=pdfs,
        available_pdfs=get_available_stored_pdfs(),
    )


# ---------------------------------------------------------------------------
# Open ALL stored PDFs
# ---------------------------------------------------------------------------

@main.route("/open-stored-pdfs")
def open_stored_pdfs():
    """
    Open ALL stored PDFs in the workspace.
    """
    available_pdfs = get_available_stored_pdfs()

    session["pdfs"] = [
        make_workspace_pdf(
            pdf["filename"]
        )
        for pdf in available_pdfs
    ]

    session.modified = True

    return redirect(
        url_for("main.workspace")
    )


# ---------------------------------------------------------------------------
# Open SELECTED stored PDFs
# ---------------------------------------------------------------------------

@main.route(
    "/open-selected-stored-pdfs",
    methods=["POST"],
)
def open_selected_stored_pdfs():
    """
    Open only the selected stored PDFs in the workspace.

    IMPORTANT:
    This returns the complete PDF objects, including file_url,
    so the frontend PDF viewer can immediately load them.
    """

    data = request.get_json(
        silent=True
    ) or {}

    filenames = data.get(
        "filenames",
        []
    )

    if not isinstance(filenames, list):

        return jsonify(
            {
                "success": False,

                "error":
                    "Invalid file selection.",
            }
        ), 400


    # ---------------------------------------------------------
    # Validate selected filenames
    # ---------------------------------------------------------

    selected = []

    for filename in filenames:

        if filename not in HOME_PDF_NAMES:
            continue

        path = (
            get_upload_folder()
            / filename
        )

        if not path.is_file():
            continue

        selected.append(
            make_workspace_pdf(
                filename
            )
        )


    # ---------------------------------------------------------
    # Nothing valid was selected
    # ---------------------------------------------------------

    if not selected:

        return jsonify(
            {
                "success": False,

                "error":
                    "No valid PDFs were selected.",
            }
        ), 400


    # ---------------------------------------------------------
    # Save complete PDF objects to session
    # ---------------------------------------------------------

    session["pdfs"] = selected

    session.modified = True


    # ---------------------------------------------------------
    # IMPORTANT:
    #
    # Return the complete PDF objects to JavaScript.
    #
    # This is what was missing before.
    # ---------------------------------------------------------

    return jsonify(
        {
            "success": True,

            "pdfs": selected,

            "index": 0,

            "redirect_url":
                url_for(
                    "main.workspace"
                ),
        }
    )


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

@main.route(
    "/upload",
    methods=["POST"],
)
def upload():

    _cleanup_expired_uploads()

    if "file" not in request.files:

        return jsonify(
            {
                "success": False,

                "error":
                    "No file was uploaded.",
            }
        ), 400


    file = request.files["file"]


    if not file or not file.filename:

        return jsonify(
            {
                "success": False,

                "error":
                    "No file was selected.",
            }
        ), 400


    if not allowed_file(
        file.filename
    ):

        return jsonify(
            {
                "success": False,

                "error":
                    "Only PDF files are allowed.",
            }
        ), 400


    original_filename = secure_filename(
        file.filename
    )


    if not original_filename:

        return jsonify(
            {
                "success": False,

                "error":
                    "Invalid filename.",
            }
        ), 400


    current_pdfs = session.get(
        "pdfs",
        []
    )


    existing_session_names = {
        pdf.get("display_name")
        for pdf in current_pdfs
        if isinstance(pdf, dict)
    }


    original_display_name = (
        Path(
            original_filename
        ).stem
    )


    if (
        original_display_name
        in existing_session_names
    ):

        return jsonify(
            {
                "success": False,

                "error":
                    f"{original_filename} is already in the workspace.",
            }
        ), 400


    upload_folder = get_upload_folder()

    upload_folder.mkdir(
        parents=True,
        exist_ok=True,
    )


    final_filename = original_filename

    final_path = (
        upload_folder
        / final_filename
    )


    # Never overwrite an existing file.
    if final_path.exists():

        stem = Path(
            original_filename
        ).stem

        suffix = Path(
            original_filename
        ).suffix

        final_filename = (
            f"{stem}_"
            f"{uuid.uuid4().hex[:8]}"
            f"{suffix}"
        )

        final_path = (
            upload_folder
            / final_filename
        )


    try:

        file.save(
            final_path
        )

    except OSError as exc:

        return jsonify(
            {
                "success": False,

                "error":
                    f"Unable to save the file: {exc}",
            }
        ), 500


    pdf_entry = {
        "filename":
            final_filename,

        "display_name":
            Path(
                final_filename
            ).stem,

        "file_url":
            url_for(
                "main.serve_upload",
                filename=final_filename,
            ),
    }


    current_pdfs.append(
        pdf_entry
    )

    session["pdfs"] = current_pdfs

    session.modified = True


    return jsonify(
        {
            "success": True,

            "filename":
                final_filename,

            "display_name":
                pdf_entry[
                    "display_name"
                ],

            "file_url":
                pdf_entry[
                    "file_url"
                ],

            "pdf":
                pdf_entry,
        }
    )


# ---------------------------------------------------------------------------
# Update workspace
# ---------------------------------------------------------------------------

@main.route(
    "/workspace/update",
    methods=["POST"],
)
def update_workspace():

    data = request.get_json(
        silent=True
    ) or {}

    requested_pdfs = data.get(
        "pdfs",
        []
    )


    if not isinstance(
        requested_pdfs,
        list,
    ):

        return jsonify(
            {
                "success": False,

                "error":
                    "Invalid workspace data.",
            }
        ), 400


    current_pdfs = session.get(
        "pdfs",
        []
    )


    current_by_filename = {
        pdf.get("filename"): pdf
        for pdf in current_pdfs
        if (
            isinstance(pdf, dict)
            and pdf.get("filename")
        )
    }


    updated_pdfs = []


    for item in requested_pdfs:

        if not isinstance(
            item,
            dict,
        ):
            continue


        filename = item.get(
            "filename"
        )


        if filename not in current_by_filename:
            continue


        existing = (
            current_by_filename[
                filename
            ]
        )


        updated_pdfs.append(
            {
                "filename":
                    filename,

                "display_name":
                    item.get(
                        "display_name",
                        existing.get(
                            "display_name",
                            filename,
                        ),
                    ),

                "file_url":
                    existing.get(
                        "file_url",

                        url_for(
                            "main.serve_upload",
                            filename=filename,
                        ),
                    ),
            }
        )


    session["pdfs"] = updated_pdfs

    session.modified = True


    return jsonify(
        {
            "success": True,

            "pdfs":
                updated_pdfs,
        }
    )


# ---------------------------------------------------------------------------
# Serve PDFs
# ---------------------------------------------------------------------------

@main.route(
    "/uploads/<path:filename>"
)
def serve_upload(filename):
    """
    Serve PDFs that belong to the current workspace.

    This allows permanent stored PDFs to be viewed after they have
    been opened into the workspace.
    """

    current_pdfs = session.get(
        "pdfs",
        []
    )


    allowed_filenames = {
        pdf.get("filename")
        for pdf in current_pdfs
        if isinstance(pdf, dict)
    }


    if filename not in allowed_filenames:

        return (
            "File not found.",
            404,
        )


    upload_folder = get_upload_folder()

    path = (
        upload_folder
        / filename
    )


    if not path.is_file():

        return (
            "File not found.",
            404,
        )


    return send_from_directory(
        upload_folder,
        filename,
        mimetype="application/pdf",
    )


# ---------------------------------------------------------------------------
# Delete a PDF from the active workspace
# ---------------------------------------------------------------------------

@main.route(
    "/delete-upload",
    methods=["POST"],
)
def delete_upload():

    data = request.get_json(
        silent=True
    ) or {}

    filename = data.get(
        "filename"
    )


    if not filename:

        return jsonify(
            {
                "success": False,

                "error":
                    "No filename supplied.",
            }
        ), 400


    current_pdfs = session.get(
        "pdfs",
        []
    )


    matching_pdf = next(
        (
            pdf
            for pdf in current_pdfs
            if (
                isinstance(pdf, dict)
                and pdf.get("filename")
                == filename
            )
        ),
        None,
    )


    if not matching_pdf:

        return jsonify(
            {
                "success": False,

                "error":
                    "PDF is not in the current workspace.",
            }
        ), 404


    session["pdfs"] = [
        pdf
        for pdf in current_pdfs
        if pdf.get("filename")
        != filename
    ]

    session.modified = True


    # Do not physically delete permanent stored PDFs.
    if filename not in HOME_PDF_NAMES:

        path = (
            get_upload_folder()
            / filename
        )

        try:

            if path.is_file():
                path.unlink()

        except OSError:
            pass


    return jsonify(
        {
            "success": True,
        }
    )


# ---------------------------------------------------------------------------
# Delete ONE stored PDF
# ---------------------------------------------------------------------------

@main.route(
    "/delete-stored-upload",
    methods=["POST"],
)
def delete_stored_upload():

    data = request.get_json(
        silent=True
    ) or {}

    filename = data.get(
        "filename"
    )


    if filename not in HOME_PDF_NAMES:

        return jsonify(
            {
                "success": False,

                "error":
                    "That file cannot be deleted from stored PDFs.",
            }
        ), 400


    path = (
        get_upload_folder()
        / filename
    )


    if not path.is_file():

        return jsonify(
            {
                "success": False,

                "error":
                    "File does not exist.",
            }
        ), 404


    try:

        path.unlink()

    except OSError as exc:

        return jsonify(
            {
                "success": False,

                "error":
                    f"Unable to delete file: {exc}",
            }
        ), 500


    # If the deleted stored PDF happens to be in
    # the active workspace, remove it there too.

    current_pdfs = session.get(
        "pdfs",
        []
    )


    session["pdfs"] = [
        pdf
        for pdf in current_pdfs
        if pdf.get("filename")
        != filename
    ]

    session.modified = True


    return jsonify(
        {
            "success": True,

            "filename":
                filename,
        }
    )


# ---------------------------------------------------------------------------
# Delete MULTIPLE stored PDFs
# ---------------------------------------------------------------------------

@main.route(
    "/delete-selected-stored-uploads",
    methods=["POST"],
)
def delete_selected_stored_uploads():

    data = request.get_json(
        silent=True
    ) or {}


    filenames = data.get(
        "filenames",
        []
    )


    if not isinstance(
        filenames,
        list,
    ):

        return jsonify(
            {
                "success": False,

                "error":
                    "Invalid file selection.",
            }
        ), 400


    # Security:
    # only delete explicitly allowed stored files.

    filenames = [
        filename
        for filename in filenames
        if filename in HOME_PDF_NAMES
    ]


    if not filenames:

        return jsonify(
            {
                "success": False,

                "error":
                    "No valid PDFs were selected.",
            }
        ), 400


    upload_folder = get_upload_folder()

    deleted = []

    failed = []


    for filename in filenames:

        path = (
            upload_folder
            / filename
        )


        if not path.is_file():

            failed.append(
                filename
            )

            continue


        try:

            path.unlink()

            deleted.append(
                filename
            )

        except OSError:

            failed.append(
                filename
            )


    # Remove deleted PDFs from active workspace.

    deleted_set = set(
        deleted
    )


    current_pdfs = session.get(
        "pdfs",
        []
    )


    session["pdfs"] = [
        pdf
        for pdf in current_pdfs
        if pdf.get("filename")
        not in deleted_set
    ]


    session.modified = True


    return jsonify(
        {
            "success": True,

            "deleted":
                deleted,

            "failed":
                failed,
        }
    )