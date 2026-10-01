from flask import Blueprint, render_template


converter = Blueprint(
    "converter",
    __name__
)


@converter.route("/converter")
def converter_page():
    """
    Display the PDF converter page.
    """

    return render_template(
        "converter.html"
    )
