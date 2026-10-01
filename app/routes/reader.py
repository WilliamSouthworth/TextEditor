from flask import Blueprint, render_template


reader = Blueprint(
    "reader",
    __name__
)


@reader.route("/reader")
def reader_page():
    """
    Display the PDF reader page.
    """

    return render_template(
        "reader.html"
    )
