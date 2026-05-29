#!/usr/bin/env python3
"""
Word Frequency Counter
======================
Counts word frequencies in a text file, with filtering and sorted output.
"""

import argparse
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_MINIMUM_FREQUENCY = 2
DEFAULT_OUTPUT_FILE_PATH  = None
DEFAULT_TOP_N_WORDS       = 50
PUNCTUATION_STRIP_PATTERN = r"[^\w\s'-]"   # keep apostrophes, hyphens


# ---------------------------------------------------------------------------
# Text normalisation
# ---------------------------------------------------------------------------

def normalize_text_for_counting(raw_text: str) -> list[str]:
    """
    Lower-case, strip punctuation, split into tokens.
    Returns a list of normalized word strings.
    """
    lowercased_text       = raw_text.lower()
    punctuation_stripped  = re.sub(PUNCTUATION_STRIP_PATTERN, " ", lowercased_text)
    normalized_word_list  = punctuation_stripped.split()
    return [word for word in normalized_word_list if len(word) > 1]


# ---------------------------------------------------------------------------
# Frequency counting
# ---------------------------------------------------------------------------

def count_word_frequencies(normalized_word_list: list[str]) -> dict[str, int]:
    """Build a frequency dict from a list of normalized words."""
    word_frequency_dict: dict[str, int] = defaultdict(int)
    for word in normalized_word_list:
        word_frequency_dict[word] += 1
    return dict(word_frequency_dict)


def filter_by_minimum_frequency(
    word_frequency_dict: dict[str, int],
    minimum_word_frequency: int = DEFAULT_MINIMUM_FREQUENCY,
) -> dict[str, int]:
    """Remove words that appear fewer than minimum_word_frequency times."""
    return {
        word: count
        for word, count in word_frequency_dict.items()
        if count >= minimum_word_frequency
    }


def sort_by_frequency_descending(
    word_frequency_dict: dict[str, int],
) -> list[tuple[str, int]]:
    """Return (word, count) pairs sorted highest-frequency-first."""
    return sorted(
        word_frequency_dict.items(),
        key=lambda pair: pair[1],
        reverse=True,
    )


# ---------------------------------------------------------------------------
# Output formatting
# ---------------------------------------------------------------------------

def format_frequency_report(
    sorted_word_frequency_pairs: list[tuple[str, int]],
    top_n_words: int = DEFAULT_TOP_N_WORDS,
) -> str:
    """Render the top-N words as a plain-text report with aligned columns."""
    report_lines: list[str] = []
    report_lines.append(f"{'Rank':<6} {'Word':<30} {'Count':>6}")
    report_lines.append("-" * 44)
    for rank, (word, count) in enumerate(
        sorted_word_frequency_pairs[:top_n_words], start=1
    ):
        report_lines.append(f"{rank:<6} {word:<30} {count:>6}")
    return "\n".join(report_lines)


def write_report_to_output_file(
    report_text: str,
    output_file_path: Optional[Path],
) -> None:
    """Write report_text to output_file_path, or stdout if path is None."""
    if output_file_path is None:
        print(report_text)
        return
    try:
        output_file_path.write_text(report_text, encoding="utf-8")
        print(f"Report written to {output_file_path}", file=sys.stderr)
    except OSError as error:
        print(f"Error writing to {output_file_path}: {error}", file=sys.stderr)
        sys.exit(1)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def parse_command_line_arguments() -> argparse.Namespace:
    """Parse command-line arguments for the word frequency counter."""
    parser = argparse.ArgumentParser(
        description="Count word frequencies in a text file."
    )
    parser.add_argument(
        "input_file_path",
        type=Path,
        help="Path to the input text file.",
    )
    parser.add_argument(
        "--minimum-frequency",
        type=int,
        default=DEFAULT_MINIMUM_FREQUENCY,
        dest="minimum_word_frequency",
        help=f"Exclude words appearing fewer than N times (default {DEFAULT_MINIMUM_FREQUENCY}).",
    )
    parser.add_argument(
        "--top",
        type=int,
        default=DEFAULT_TOP_N_WORDS,
        dest="top_n_words",
        help=f"Show only the top N words (default {DEFAULT_TOP_N_WORDS}).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_FILE_PATH,
        dest="output_file_path",
        help="Write report to this file instead of stdout.",
    )
    return parser.parse_args()


def main() -> None:
    """Orchestrate the full word-frequency pipeline."""
    arguments = parse_command_line_arguments()
    try:
        raw_text = arguments.input_file_path.read_text(encoding="utf-8")
    except OSError as error:
        print(f"Cannot read {arguments.input_file_path}: {error}", file=sys.stderr)
        sys.exit(1)

    normalized_word_list    = normalize_text_for_counting(raw_text)
    word_frequency_dict     = count_word_frequencies(normalized_word_list)
    filtered_frequency_dict = filter_by_minimum_frequency(
        word_frequency_dict,
        arguments.minimum_word_frequency,
    )
    sorted_frequency_pairs  = sort_by_frequency_descending(filtered_frequency_dict)
    report_text             = format_frequency_report(
        sorted_frequency_pairs,
        arguments.top_n_words,
    )
    write_report_to_output_file(report_text, arguments.output_file_path)


if __name__ == "__main__":
    main()
