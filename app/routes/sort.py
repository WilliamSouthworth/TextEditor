from flask import Blueprint, render_template


sort = Blueprint(
    "sort",
    __name__
)


@sort.route("/sort")
def sort_page():
    """
    Display the PDF sorting page.
    """

    return render_template(
        "sort.html"
    )
