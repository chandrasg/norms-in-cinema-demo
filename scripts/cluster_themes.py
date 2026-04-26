"""
Cluster normalized cause strings into themes for Station 2's tug-of-war.

Pipeline:
  1. Load causes_per_dialogue.csv. Compute frequency of each unique normalized
     cause within each emotion (shame, pride). We cluster the unique causes,
     not per-dialogue rows.
  2. Embed each unique cause via OpenAI text-embedding-3-small.
     Cache embeddings to disk so re-runs are free.
  3. Agglomerative clustering with cosine distance (separate models for shame
     and pride). Target ~24 shame + ~15 pride themes (per the paper).
  4. Auto-label each cluster: send the top 12 most frequent causes in the
     cluster to an LLM and ask for a 2-4 word theme label.
  5. Output:
       - data/processed/themes.csv         theme_id, emotion, label, cluster_size, top_causes
       - data/processed/cause_to_theme.csv cause_normalized, emotion, theme_id, theme_label
"""

import csv
import hashlib
import json
import os
import re
import time
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import requests
from sklearn.cluster import AgglomerativeClustering
from sklearn.preprocessing import normalize
from tqdm import tqdm

ROOT = Path(__file__).resolve().parent.parent
PROC = ROOT / "data" / "processed"
EMB_CACHE = Path(os.environ.get("EMB_CACHE_DIR", "/tmp/mapgen_emb_cache"))
EMB_CACHE.mkdir(parents=True, exist_ok=True)

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

EMBED_MODEL = "text-embedding-3-small"
LABEL_MODEL = ENV.get("LLM_MODEL", "gpt-5.5")

N_SHAME_THEMES = 24
N_PRIDE_THEMES = 15


def cache_key(text: str) -> Path:
    h = hashlib.sha1(f"{EMBED_MODEL}::{text}".encode()).hexdigest()
    return EMB_CACHE / f"{h}.json"


def embed_batch(texts: list[str]) -> list[list[float]]:
    r = requests.post(
        "https://api.openai.com/v1/embeddings",
        headers={"Authorization": f"Bearer {OPENAI_KEY}", "Content-Type": "application/json"},
        json={"model": EMBED_MODEL, "input": texts},
        timeout=60,
    )
    r.raise_for_status()
    return [d["embedding"] for d in r.json()["data"]]


def get_embeddings(texts: list[str]) -> np.ndarray:
    out = [None] * len(texts)
    uncached_indices = []
    uncached_texts = []
    for i, t in enumerate(texts):
        cp = cache_key(t)
        if cp.exists():
            try:
                out[i] = json.loads(cp.read_text())
                continue
            except Exception:
                pass
        uncached_indices.append(i)
        uncached_texts.append(t)

    BATCH = 256
    for start in tqdm(range(0, len(uncached_texts), BATCH),
                       desc=f"embedding ({len(uncached_texts)} new)"):
        batch = uncached_texts[start: start + BATCH]
        for attempt in range(4):
            try:
                vecs = embed_batch(batch)
                break
            except Exception as e:
                wait = 2 ** attempt
                print(f"  embed err (attempt {attempt+1}): {e} — retrying in {wait}s")
                time.sleep(wait)
        else:
            raise RuntimeError("embed_batch failed after retries")
        for j, v in enumerate(vecs):
            idx = uncached_indices[start + j]
            out[idx] = v
            try:
                cache_key(uncached_texts[start + j]).write_text(json.dumps(v))
            except Exception:
                pass

    return np.array(out, dtype=np.float32)


LABEL_CACHE = Path(os.environ.get("LABEL_CACHE_DIR", "/tmp/mapgen_label_cache"))
LABEL_CACHE.mkdir(parents=True, exist_ok=True)


def label_cache_key(prompt: str) -> Path:
    h = hashlib.sha1(f"{LABEL_MODEL}::{prompt}".encode()).hexdigest()
    return LABEL_CACHE / f"{h}.txt"


def call_llm_label(prompt: str) -> str:
    cp = label_cache_key(prompt)
    if cp.exists():
        try:
            return cp.read_text().strip()
        except Exception:
            pass
    last_err = None
    for model in (LABEL_MODEL, "gpt-4o", "gpt-4o-mini"):
        for attempt in range(3):
            try:
                r = requests.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {OPENAI_KEY}",
                             "Content-Type": "application/json"},
                    json={
                        "model": model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.2,
                        "max_tokens": 30,
                    },
                    timeout=30,
                )
                if r.status_code in (404, 400):
                    last_err = f"{model}: HTTP {r.status_code}"
                    break  # try next model
                r.raise_for_status()
                content = r.json()["choices"][0]["message"]["content"].strip()
                label = re.sub(r'^["\']|["\']$', "", content).strip()
                try:
                    cp.write_text(label)
                except Exception:
                    pass
                return label
            except Exception as e:
                last_err = str(e)
                time.sleep(2 ** attempt)
    print(f"label err: {last_err}")
    return "Unlabeled"


def label_clusters(clusters: dict[int, list[tuple[str, int]]], emotion: str) -> dict[int, str]:
    """Label all clusters in one LLM call, forcing distinct labels."""
    cp = label_cache_key(f"BATCH::{emotion}::" + json.dumps(
        {str(cid): [c for c, _ in m[:10]] for cid, m in sorted(clusters.items())},
        sort_keys=True,
    ))
    if cp.exists():
        try:
            cached = json.loads(cp.read_text())
            return {int(k): v for k, v in cached.items()}
        except Exception:
            pass

    cluster_summaries = []
    for cid, members in sorted(clusters.items()):
        top = [c for c, _ in members[:10]]
        cluster_summaries.append(f"Cluster {cid}:\n  - " + "\n  - ".join(top))

    prompt = (
        f"You will see {len(clusters)} auto-generated clusters of short phrases describing "
        f"why movie characters feel {emotion.upper()}. Produce one short theme label "
        f"(2-4 words) per cluster. Labels must be MUTUALLY DISTINCT — no two labels "
        f"may overlap or be near-synonyms. Each label captures what makes its cluster "
        f"different from all the others.\n\n"
        f"Examples of distinct, well-differentiated labels: 'Family honor', "
        f"'Son's achievements', 'Sexual harassment', 'Patriotism', 'Cowardice', "
        f"'Gender role transgression', 'Lack of accountability', 'Body modesty', "
        f"'Inappropriate sexual behavior', 'Romantic infidelity'.\n\n"
        f"Output JSON in exactly this format, one entry per cluster id:\n"
        f'{{"0": "Label here", "1": "Label here", ...}}\n\n'
        + "\n\n".join(cluster_summaries)
        + "\n\nReturn ONLY the JSON object, nothing else."
    )

    last_err = None
    for model in (LABEL_MODEL, "gpt-4o", "gpt-4o-mini"):
        for attempt in range(3):
            try:
                r = requests.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {OPENAI_KEY}",
                             "Content-Type": "application/json"},
                    json={
                        "model": model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.2,
                        "max_tokens": 1500,
                        "response_format": {"type": "json_object"},
                    },
                    timeout=60,
                )
                if r.status_code in (404, 400):
                    last_err = f"{model}: HTTP {r.status_code} {r.text[:200]}"
                    break
                r.raise_for_status()
                content = r.json()["choices"][0]["message"]["content"].strip()
                parsed = json.loads(content)
                labels = {int(k): str(v).strip().strip('"\'') for k, v in parsed.items()}
                # Sanity-check we got every cluster
                missing = set(clusters.keys()) - set(labels.keys())
                if missing:
                    last_err = f"missing labels for clusters: {missing}"
                    continue
                cp.write_text(json.dumps({str(k): v for k, v in labels.items()}))
                return labels
            except Exception as e:
                last_err = str(e)
                time.sleep(2 ** attempt)
    print(f"label batch err: {last_err} — falling back to per-cluster labeling")
    return label_clusters_individually(clusters, emotion)


def label_clusters_individually(clusters: dict[int, list[tuple[str, int]]], emotion: str) -> dict[int, str]:
    labels = {}
    for cid, members in tqdm(sorted(clusters.items()), desc=f"labeling {emotion}"):
        top_causes = [c for c, _ in members[:12]]
        prompt = (
            f"Below are short phrases describing reasons why characters in movies "
            f"feel {emotion.upper()}. Produce a clean 2-4 word theme label.\n\n"
            f"Phrases:\n- " + "\n- ".join(top_causes) + "\n\n"
            f"Output only the label, nothing else."
        )
        labels[cid] = call_llm_label(prompt)
    return labels


def main():
    rows = list(csv.DictReader(open(PROC / "causes_per_dialogue.csv")))
    rows = [r for r in rows if r["cause_normalized"]]

    by_emotion = defaultdict(Counter)
    for r in rows:
        by_emotion[r["emotion"]][r["cause_normalized"]] += 1

    all_records = []
    theme_records = []
    next_theme_id = 0

    for emotion in ("shame", "pride"):
        freqs = by_emotion[emotion]
        causes = sorted(freqs.keys())
        n_target = N_SHAME_THEMES if emotion == "shame" else N_PRIDE_THEMES
        n_target = min(n_target, max(2, len(causes) // 4))

        print(f"\n=== {emotion.upper()}: {len(causes)} unique causes, target {n_target} themes ===")
        embs = get_embeddings(causes)
        embs = normalize(embs)

        print(f"Clustering...")
        # Ward linkage on normalized vectors — produces balanced clusters where
        # average/complete linkage tends to collapse into one mega-cluster.
        model = AgglomerativeClustering(
            n_clusters=n_target, metric="euclidean", linkage="ward"
        )
        cluster_ids = model.fit_predict(embs)

        cluster_to_members = defaultdict(list)
        for cause, cid in zip(causes, cluster_ids):
            cluster_to_members[int(cid)].append((cause, freqs.get(cause, 1)))
        for cid in cluster_to_members:
            cluster_to_members[cid].sort(key=lambda x: -x[1])

        labels = label_clusters(cluster_to_members, emotion)

        local_to_global = {}
        for cid in set(int(c) for c in cluster_ids):
            local_to_global[cid] = next_theme_id
            next_theme_id += 1

        for cause, cid in zip(causes, cluster_ids):
            cid = int(cid)
            global_id = local_to_global[cid]
            all_records.append({
                "cause_normalized": cause,
                "emotion": emotion,
                "theme_id": global_id,
                "theme_label": labels[cid],
            })

        for cid, members in cluster_to_members.items():
            global_id = local_to_global[cid]
            top = [c for c, _ in members[:5]]
            theme_records.append({
                "theme_id": global_id,
                "emotion": emotion,
                "label": labels[cid],
                "cluster_size": len(members),
                "total_dialogues": sum(f for _, f in members),
                "top_causes": " | ".join(top),
            })

    with open(PROC / "cause_to_theme.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["cause_normalized", "emotion", "theme_id", "theme_label"])
        w.writeheader()
        w.writerows(all_records)

    with open(PROC / "themes.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["theme_id", "emotion", "label", "cluster_size", "total_dialogues", "top_causes"])
        w.writeheader()
        w.writerows(sorted(theme_records, key=lambda r: (r["emotion"], -r["total_dialogues"])))

    print(f"\nWrote {len(all_records)} cause→theme assignments")
    print(f"Wrote {len(theme_records)} themes\n")

    for emo in ("shame", "pride"):
        print(f"=== {emo.upper()} themes (by total dialogues) ===")
        for r in sorted([t for t in theme_records if t["emotion"] == emo], key=lambda r: -r["total_dialogues"]):
            print(f"  [{r['theme_id']:>3}] {r['total_dialogues']:>5} dlg | {r['cluster_size']:>4} causes | {r['label']}")
        print()


if __name__ == "__main__":
    main()
