from pathlib import Path

from flask import Flask


def create_app():

    app = Flask(__name__)


    # -------------------------------------------------
    # Project directories
    # -------------------------------------------------

    project_root = Path(
        app.root_path
    ).parent


    upload_folder = (
        project_root / "uploads"
    )


    output_folder = (
        project_root / "output"
    )


    # -------------------------------------------------
    # Flask configuration
    # -------------------------------------------------

    app.config["UPLOAD_FOLDER"] = upload_folder

    app.config["OUTPUT_FOLDER"] = output_folder


    # -------------------------------------------------
    # Register routes
    # -------------------------------------------------

    from app.routes.main import main

    app.register_blueprint(main)


    return app
