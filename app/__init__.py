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
