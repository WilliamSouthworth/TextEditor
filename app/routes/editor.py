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
    Display the PDF editor page.
    """

    filename = session.get(
        "current_pdf"
    )


    # No PDF has been uploaded
    if not filename:

        return redirect(
            url_for("main.index")
        )


    # Find the uploaded PDF
    upload_folder = Path(
        current_app.config["UPLOAD_FOLDER"]
    )

    file_path = (
        upload_folder / filename
    )


    # PDF no longer exists
    if not file_path.exists():

        session.pop(
            "current_pdf",
            None
        )

        return redirect(
            url_for("main.index")
        )


    # Create URL for browser access
    file_url = url_for(
        "main.uploaded_file",
        filename=filename
    )


    return render_template(
        "editor.html",
        filename=filename,
        file_url=file_url
    )