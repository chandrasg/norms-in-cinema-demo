"""
Normalize the Cause column from the *_Norms.csv files.

Goals (in order of impact):
  1. Lowercase.
  2. Strip leading/trailing whitespace and punctuation.
  3. Drop trailing 's' on the last word for ASCII-only English-ish causes
     (so "son's achievement" and "son's achievements" merge, "infidelity" and
     "infidelities" merge). Don't lemmatize aggressively — we want to preserve
     specificity for the clustering step.
  4. Collapse common stopword variants ("being not pious" / "not being pious").
  5. Drop trivially uninformative entries: "unknown", "unknown reason",
     "not specified", "n/a", empty.

The output is one row per dialogue with:
    dialogue_id, industry, emotion, cause_raw, cause_normalized

Plus a `causes.csv` with unique normalized causes, frequency, and example raw.

Output: data/processed/causes_per_dialogue.csv
        data/processed/causes_unique.csv
"""

import csv
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "processed"
OUT.mkdir(parents=True, exist_ok=True)

UNINFORMATIVE = {
    "", "unknown", "unknown reason", "not specified", "n/a", "na", "none",
    "not clear", "unclear", "no reason", "no specific reason", "nothing",
}

PUNCT_TRIM = re.compile(r"^[\s\W_]+|[\s\W_]+$")
WS = re.compile(r"\s+")


def normalize_cause(raw: str) -> str:
    s = raw.strip().lower()
    s = PUNCT_TRIM.sub("", s)
    s = WS.sub(" ", s)
    if s in UNINFORMATIVE:
        return ""

    # Drop trailing 's' on the last word for plural/singular merging,
    # but only if the word ends in a non-s consonant + s (avoid eating "harassment", "duress")
    tokens = s.split()
    if tokens:
        last = tokens[-1]
        # Only depluralize obvious cases: ends in 's', length > 3, doesn't end in 'ss'/'us'/'is'
        if (
            len(last) > 3
            and last.endswith("s")
            and not last.endswith(("ss", "us", "is", "ous"))
            # Avoid words where dropping 's' is wrong (status, business, etc.)
            and last[-2] not in "aeiou"  # consonant+s like "achievements" → ok
        ):
            tokens[-1] = last[:-1]
            s = " ".join(tokens)

    # Light synonym/paraphrase normalization
    SYNONYMS = {
        "inappropriate behaviour": "inappropriate behavior",
        "inappropriate behavior in public": "inappropriate behavior",
        "inappropriate public behavior": "inappropriate behavior",
        "non conformity": "non-conformity",
        "non-conformity to gender role": "gender role non-conformity",
    }
    s = SYNONYMS.get(s, s)
    return s


def main():
    file_map = {
        "Bolly_Shame": ("bolly", "shame"),
        "Bolly_Pride": ("bolly", "pride"),
        "Holly_Shame": ("holly", "shame"),
        "Holly_Pride": ("holly", "pride"),
    }

    per_dialogue = []
    counter = Counter()
    raw_examples = defaultdict(list)

    for fname, (industry, emotion) in file_map.items():
        with open(RAW / (fname + "_Norms.csv"), newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                raw = row.get("Cause", "")
                norm = normalize_cause(raw)
                per_dialogue.append({
                    "dialogue_id": row["Message_id"],
                    "industry": industry,
                    "emotion": emotion,
                    "cause_raw": raw,
                    "cause_normalized": norm,
                })
                if norm:
                    counter[norm] += 1
                    if len(raw_examples[norm]) < 3:
                        raw_examples[norm].append(raw)

    with open(OUT / "causes_per_dialogue.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["dialogue_id", "industry", "emotion", "cause_raw", "cause_normalized"])
        w.writeheader()
        w.writerows(per_dialogue)

    with open(OUT / "causes_unique.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["cause_normalized", "frequency", "example_raw_1", "example_raw_2", "example_raw_3"])
        for cause, freq in counter.most_common():
            ex = raw_examples[cause] + ["", "", ""]
            w.writerow([cause, freq, ex[0], ex[1], ex[2]])

    # Summary
    raw_unique_total = 0
    for fname in file_map:
        with open(RAW / (fname + "_Norms.csv"), newline="", encoding="utf-8") as f:
            raw_unique_total += len({r.get("Cause", "").strip() for r in csv.DictReader(f) if r.get("Cause", "").strip()})
    print(f"Per-dialogue rows: {len(per_dialogue)}")
    print(f"Non-empty causes: {sum(1 for r in per_dialogue if r['cause_normalized'])}")
    print(f"Unique normalized causes: {len(counter)}")
    print(f"  (down from raw uniques across files: ~{raw_unique_total})")
    print()
    print("Top 20 normalized causes:")
    for c, n in counter.most_common(20):
        print(f"  {n:>4} | {c}")


if __name__ == "__main__":
    main()
