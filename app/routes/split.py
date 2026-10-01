from flask import Blueprint, render_template


split = Blueprint(
    "split",
    __name__
)


@split.route("/split")
def split_page():
    """
    Display the PDF splitting page.
    """

    return render_template(
        "split.html"
    )
