from pathlib import Path

from flask import (
    Blueprint,
    current_app,
    jsonify,
    request,
)
from werkzeug.utils import secure_filename

main = Blueprint("main", __name__)


@main.route("/")
def index() -> str:
    """
    Display the main text editor page.
    """
    from flask import render_template

    return render_template("index.html")


@main.route("/upload", methods=["POST"])
def upload_pdf():
    """
    Receive and save an uploaded PDF file.
    """
    if "file" not in request.files:
        return jsonify({"error": "No file was uploaded."}), 400

    uploaded_file = request.files["file"]

    if uploaded_file.filename == "":
        return jsonify({"error": "No file was selected."}), 400

    if not uploaded_file.filename.lower().endswith(".pdf"):
        return jsonify({"error": "Only PDF files are allowed."}), 400

    filename = secure_filename(uploaded_file.filename)

    upload_folder = Path(current_app.config["UPLOAD_FOLDER"])
    upload_folder.mkdir(parents=True, exist_ok=True)

    file_path = upload_folder / filename
    uploaded_file.save(file_path)

    return jsonify({
        "message": "PDF uploaded successfully.",
        "filename": filename,
    })