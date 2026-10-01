from pathlib import Path

from flask import (
    Blueprint,
    current_app,
    jsonify,
    render_template,
    request,
    send_from_directory,
    url_for,
)

from werkzeug.utils import secure_filename


main = Blueprint(
    "main",
    __name__
)


@main.route("/")
def index():
    """
    Display the main page.
    """

    return render_template(
        "home.html"
    )


@main.route("/upload", methods=["POST"])
def upload_pdf():
    """
    Receive and save an uploaded PDF.
    """

    # ---------------------------------------------
    # Make sure a file was included
    # ---------------------------------------------

    if "file" not in request.files:

        return jsonify({
            "error": "No file was uploaded."
        }), 400


    uploaded_file = request.files["file"]


    # ---------------------------------------------
    # Make sure a file was selected
    # ---------------------------------------------

    if uploaded_file.filename == "":

        return jsonify({
            "error": "No file was selected."
        }), 400


    # ---------------------------------------------
    # Make sure it is a PDF
    # ---------------------------------------------

    if not uploaded_file.filename.lower().endswith(".pdf"):

        return jsonify({
            "error": "Only PDF files are allowed."
        }), 400


    # ---------------------------------------------
    # Secure the filename
    # ---------------------------------------------

    filename = secure_filename(
        uploaded_file.filename
    )


    # ---------------------------------------------
    # Get upload directory
    # ---------------------------------------------

    upload_folder = Path(
        current_app.config["UPLOAD_FOLDER"]
    )


    upload_folder.mkdir(
        parents=True,
        exist_ok=True
    )


    # ---------------------------------------------
    # Save the file
    # ---------------------------------------------

    file_path = (
        upload_folder / filename
    )


    uploaded_file.save(
        file_path
    )


    # ---------------------------------------------
    # Create browser-accessible URL
    # ---------------------------------------------

    file_url = url_for(
        "main.uploaded_file",
        filename=filename
    )


    # ---------------------------------------------
    # Send response to JavaScript
    # ---------------------------------------------

    return jsonify({

        "message":
            "PDF uploaded successfully.",

        "filename":
            filename,

        "file_url":
            file_url,

    })


@main.route("/uploads/<path:filename>")
def uploaded_file(filename):
    """
    Serve uploaded PDFs to the browser.
    """

    upload_folder = Path(
        current_app.config["UPLOAD_FOLDER"]
    )


    return send_from_directory(
        upload_folder,
        filename
    )
