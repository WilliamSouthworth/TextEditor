import os
from datetime import timedelta
from pathlib import Path

from flask import Flask


def create_app():
    app = Flask(__name__)

    # =================================================
    # PROJECT DIRECTORIES
    # =================================================

    project_root = Path(app.root_path).parent

    upload_folder = project_root / "uploads"
    output_folder = project_root / "output"

    upload_folder.mkdir(parents=True, exist_ok=True)
    output_folder.mkdir(parents=True, exist_ok=True)

    # =================================================
    # FLASK CONFIGURATION
    # =================================================

    app.config["SECRET_KEY"] = os.environ.get(
        "SECRET_KEY",
        "dev-secret-change-this-in-production",
    )

    app.config["UPLOAD_FOLDER"] = upload_folder
    app.config["OUTPUT_FOLDER"] = output_folder

    # Uploaded PDFs that are no longer referenced by a user's session
    # are eligible for cleanup after two hours.
    app.config["UPLOAD_TTL_SECONDS"] = 2 * 60 * 60

    app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(hours=2)

    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

    # Set this to True in production when the site is served only over HTTPS.
    app.config["SESSION_COOKIE_SECURE"] = os.environ.get(
        "SESSION_COOKIE_SECURE",
        "0",
    ).lower() in {"1", "true", "yes"}

    # =================================================
    # REGISTER ROUTES
    # =================================================

    from app.routes.main import main
    from app.routes.editor import editor
    from app.routes.merge import merge
    from app.routes.sort import sort
    from app.routes.split import split
    from app.routes.reader import reader
    from app.routes.converter import converter

    app.register_blueprint(main)
    app.register_blueprint(editor)
    app.register_blueprint(merge)
    app.register_blueprint(sort)
    app.register_blueprint(split)
    app.register_blueprint(reader)
    app.register_blueprint(converter)

    return app
