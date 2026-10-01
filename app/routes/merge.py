from flask import Blueprint, render_template


merge = Blueprint(
    "merge",
    __name__
)


@merge.route("/merge")
def merge_page():
    """
    Display the PDF merge page.
    """

    return render_template(
        "merge.html"
    )
