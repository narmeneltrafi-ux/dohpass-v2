#!/usr/bin/env python3
"""Run Anthropic's metaprompt from the command line.

Replicates the metaprompt notebook: feeds a task through the metaprompt,
extracts the generated prompt template, and optionally test-runs it.

Usage:
    export ANTHROPIC_API_KEY=...
    python run_metaprompt.py --task "Grade a resume against a rubric" \
        --variables RESUME RUBRIC \
        --test-values RESUME="..." RUBRIC="..."
"""

import argparse
import os
import re
import sys
from pathlib import Path

try:
    import anthropic
except ImportError:
    sys.exit("Missing dependency. Run: pip install -U anthropic")

GENERATOR_MODEL = "claude-opus-5"
TEST_MODEL = "claude-haiku-4-5-20251001"
MAX_TOKENS = 8192

METAPROMPT_PATH = Path(__file__).resolve().parent.parent / "references" / "metaprompt.md"


def load_metaprompt() -> str:
    """Read the metaprompt, stripping the markdown preamble above the --- rule."""
    text = METAPROMPT_PATH.read_text(encoding="utf-8")
    marker = "\n---\n"
    if marker in text:
        text = text.split(marker, 1)[1]
    return text.strip()


def extract_between_tags(tag: str, string: str) -> list[str]:
    return re.findall(rf"<{tag}>(.+?)</{tag}>", string, re.DOTALL)


def remove_empty_tags(text: str) -> str:
    """Strip trailing empty tag pairs the metaprompt sometimes emits."""
    previous = None
    while previous != text:
        previous = text
        text = re.sub(r"<(\w+)></\1>\s*$", "", text).strip()
    return text


def extract_template(response_text: str) -> str:
    blocks = extract_between_tags("Instructions", response_text)
    if not blocks:
        raise ValueError(
            "No <Instructions> block in the response. Re-run, or inspect the raw output "
            "with --show-raw."
        )
    return remove_empty_tags(blocks[-1].strip())


def extract_variables(template: str) -> set[str]:
    r"""Match only {$NAME} placeholders.

    A bare r"\{([^}]+)\}" also matches JSON the template tells the model to
    emit -- {"verdict": "PASS"} comes back as a variable name, and the fill
    step then overwrites it with a placeholder, corrupting the template.
    """
    return set(re.findall(r"\{(\$[^{}]+)\}", template))


def first_text(response) -> str:
    block = next((b for b in response.content if b.type == "text"), None)
    if block is None:
        raise ValueError("Response contained no text block.")
    return block.text


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate a prompt template via the metaprompt.")
    parser.add_argument("--task", required=True, help="The task the target model should perform.")
    parser.add_argument("--variables", nargs="*", default=[], help="Input variable names, e.g. RESUME RUBRIC")
    parser.add_argument("--test-values", nargs="*", default=[], help="KEY=VALUE pairs to test the template.")
    parser.add_argument("--out", help="Write the generated template to this file.")
    parser.add_argument("--show-raw", action="store_true", help="Print the full metaprompt response.")
    args = parser.parse_args()

    if not os.environ.get("ANTHROPIC_API_KEY"):
        return int(bool(sys.stderr.write("ANTHROPIC_API_KEY is not set.\n"))) or 1

    client = anthropic.Anthropic()
    prompt = load_metaprompt().replace("{{TASK}}", args.task)

    # 4.6+ models reject assistant prefill, so steer from the user turn instead.
    prompt += (
        "\n\nStart your response directly with the <Inputs> block. "
        "Do not include any preamble, commentary, or text before it."
    )
    if args.variables:
        var_string = ", ".join("{$" + v.strip().lstrip("$").upper() + "}" for v in args.variables)
        prompt += (
            "\nYour <Inputs> block, and the prompt template you write in <Instructions>, "
            f"must use exactly these input variables and no others: {var_string}."
        )

    # temperature=0 is preferred for reproducibility, but not every model accepts
    # it. Fall back to the default rather than dying on the first run.
    try:
        response = client.messages.create(
            model=GENERATOR_MODEL,
            max_tokens=MAX_TOKENS,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
        )
    except anthropic.BadRequestError:
        sys.stderr.write(f"{GENERATOR_MODEL} rejected temperature=0; using the default.\n")
        response = client.messages.create(
            model=GENERATOR_MODEL,
            max_tokens=MAX_TOKENS,
            messages=[{"role": "user", "content": prompt}],
        )
    if response.stop_reason == "max_tokens":
        raise ValueError("Hit max_tokens before the template finished. Raise MAX_TOKENS.")

    raw = first_text(response)
    if args.show_raw:
        print(raw)
        print("\n" + "=" * 60 + "\n")

    template = extract_template(raw)
    variables = extract_variables(template)

    print("Variables: " + ", ".join("{" + v + "}" for v in sorted(variables)))
    print("\n--- TEMPLATE ---\n")
    print(template)

    if args.out:
        Path(args.out).write_text(template, encoding="utf-8")
        print(f"\nWritten to {args.out}")

    if args.test_values:
        values = {}
        for pair in args.test_values:
            if "=" not in pair:
                sys.stderr.write(f"Skipping malformed --test-values entry: {pair}\n")
                continue
            key, value = pair.split("=", 1)
            values[key.strip().lstrip("$").upper()] = value

        filled = template
        missing = []
        for variable in sorted(variables):
            value = values.get(variable.strip().lstrip("$").upper())
            if value is None:
                missing.append(variable)
                value = f"<example value for {variable.lstrip('$')}>"
            filled = filled.replace("{" + variable + "}", value)

        if missing:
            print("\nNo test values for: " + ", ".join(missing) + " (placeholders used).")

        test_response = client.messages.create(
            model=TEST_MODEL,
            max_tokens=MAX_TOKENS,
            messages=[{"role": "user", "content": filled}],
        )
        print("\n--- TEST OUTPUT ---\n")
        print(first_text(test_response))

    return 0


if __name__ == "__main__":
    sys.exit(main())
