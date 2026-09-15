from pathlib import Path

import fitz


def get_pdf_page_count(file_path: Path) -> int:
    """
    Return the number of pages in a PDF.
    """
    document = fitz.open(file_path)

    try:
        return document.page_count
    finally:
        document.close()