"""
LLM-based gender backfill for dialogue records where the original Gender
column was blank. Uses a single-shot prompt giving target_person + dialogue
context + cause. Output is one of: male / female / unclear.

Cached per dialogue_id so re-runs are free. Output: data/processed/gender_backfill.csv

The assembler picks this up on the next run by merging into dialogues.csv.
"""

import csv
import hashlib
import json
import os
import re
import time
from pathlib import Path

import requests
from tqdm import tqdm
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = Path(__file__).resolve().parent.parent
PROC = ROOT / "data" / "processed"
CACHE = Path(os.environ.get("GENDER_CACHE_DIR", "/tmp/mapgen_gender_cache"))
CACHE.mkdir(parents=True, exist_ok=True)

ENV = {}
env_path = ROOT / ".env.local"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            ENV[k.strip()] = v.strip()
OPENAI_KEY = ENV.get("OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY")
if not OPENAI_KEY:
    raise SystemExit("Missing OPENAI_API_KEY in .env.local")

LABEL_MODEL = ENV.get("LLM_MODEL", "gpt-5.5")


def cache_key(dialogue_id: str, target_person: str) -> Path:
    h = hashlib.sha1(f"{LABEL_MODEL}::{dialogue_id}::{target_person}".encode()).hexdigest()
    return CACHE / f"{h}.txt"


def classify_gender(target_person: str, dialogue: str, cause: str, emotion: str) -> str:
    cp = cache_key(target_person + "::v1", dialogue[:80])
    if cp.exists():
        try:
            cached = cp.read_text().strip()
            if cached in ("male", "female", "unclear"):
                return cached
        except Exception:
            pass

    # Trim dialogue to keep prompt short
    dlg = dialogue.strip()
    if len(dlg) > 600:
        dlg = dlg[:600] + "…"

    prompt = (
        f"In this movie scene, who is being {emotion}d (i.e., the person feeling "
        f"shame or being praised), and what is their gender?\n\n"
        f"Target person (as labeled in the dataset): {target_person}\n"
        f"Reason for {emotion}: {cause}\n"
        f"Dialogue context (the matched line + surrounding lines):\n"
        f"\"\"\"\n{dlg}\n\"\"\"\n\n"
        f"Output ONLY one word: 'male', 'female', or 'unclear'.\n"
        f"- Use 'male' if the target is clearly male.\n"
        f"- Use 'female' if the target is clearly female.\n"
        f"- Use 'unclear' if you cannot tell or the target is plural/group/unspecified."
    )

    last_err = None
    for model in (LABEL_MODEL, "gpt-4o-mini", "gpt-4o"):
        for attempt in range(3):
            try:
                r = requests.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {OPENAI_KEY}",
                             "Content-Type": "application/json"},
                    json={
                        "model": model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0,
                        "max_tokens": 5,
                    },
                    timeout=20,
                )
                if r.status_code in (404, 400):
                    last_err = f"{model}: HTTP {r.status_code}"
                    break
                r.raise_for_status()
                content = r.json()["choices"][0]["message"]["content"].strip().lower()
                # Extract the first word
                m = re.match(r"\b(male|female|unclear)\b", content)
                if m:
                    label = m.group(1)
                else:
                    label = "unclear"
                cp.write_text(label)
                return label
            except Exception as e:
                last_err = str(e)
                time.sleep(1)
    return "unclear"


def main():
    rows = list(csv.DictReader(open(PROC / "dialogues.csv")))
    targets = [r for r in rows if r["target_gender"] == "unclear"]
    print(f"Total dialogues: {len(rows)}")
    print(f"Need backfill: {len(targets)}")

    # If we already have a partial output, load it for restart-safety
    out_path = PROC / "gender_backfill.csv"
    existing = {}
    if out_path.exists():
        with open(out_path, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                existing[r["dialogue_id"]] = r

    # Process new ones with thread pool — most time is spent waiting on LLM HTTP
    results = list(existing.values())
    seen = set(existing.keys())
    todo = [r for r in targets if r["dialogue_id"] not in seen]

    def work(r):
        label = classify_gender(r["target_person"], r["dialogue"], r["cause_raw"], r["emotion"])
        return {"dialogue_id": r["dialogue_id"], "predicted_gender": label}

    BATCH_FLUSH = 50
    new_count = 0
    with ThreadPoolExecutor(max_workers=8) as ex:
        futures = [ex.submit(work, r) for r in todo]
        for fut in tqdm(as_completed(futures), total=len(futures), desc="backfill"):
            try:
                results.append(fut.result())
                new_count += 1
            except Exception:
                continue
            if new_count % BATCH_FLUSH == 0:
                with open(out_path, "w", newline="", encoding="utf-8") as f:
                    w = csv.DictWriter(f, fieldnames=["dialogue_id", "predicted_gender"])
                    w.writeheader()
                    w.writerows(results)

    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["dialogue_id", "predicted_gender"])
        w.writeheader()
        w.writerows(results)

    # Summary
    from collections import Counter
    c = Counter(r["predicted_gender"] for r in results)
    print(f"\nWrote {len(results)} predictions → {out_path}")
    for label, n in c.most_common():
        print(f"  {label:>8} : {n}")


if __name__ == "__main__":
    main()
