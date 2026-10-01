from flask import Blueprint, render_template


editor = Blueprint(
    "editor",
    __name__
)


@editor.route("/edit")
def edit():
    """
    Display the PDF editor page.
    """

    return render_template(
        "editor.html"
    )
