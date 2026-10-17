"""Measure and forecast Prime Labyrinth bottlenecks from prime gaps alone."""

from __future__ import annotations

import argparse
import json
import math
import sqlite3
import statistics
from collections import defaultdict
from pathlib import Path


def primes_up_to(limit: int) -> list[int]:
    sieve = [True] * (limit + 1)
    sieve[:2] = [False, False]
    for value in range(2, int(limit**0.5) + 1):
        if sieve[value]:
            sieve[value * value : limit + 1 : value] = [False] * (
                ((limit - value * value) // value) + 1
            )
    return [value for value, is_prime in enumerate(sieve) if is_prime]


def level_statistics(database: Path) -> list[dict]:
    with sqlite3.connect(database) as connection:
        connection.row_factory = sqlite3.Row
        room_rows = connection.execute(
            """
            SELECT prime, COUNT(*) AS rooms
            FROM rooms GROUP BY prime ORDER BY prime
            """
        ).fetchall()
        door_rows = connection.execute(
            """
            SELECT r.prime, COUNT(DISTINCT d.room_key) AS live_rooms,
                   COUNT(*) AS connections,
                   COUNT(DISTINCT d.target_room_key) AS target_rooms
            FROM rooms r JOIN doors d USING (room_key)
            GROUP BY r.prime
            """
        ).fetchall()
        state = connection.execute(
            "SELECT max_prime FROM traversal_state WHERE singleton = 1"
        ).fetchone()

    room_counts = {row["prime"]: row["rooms"] for row in room_rows}
    door_counts = {row["prime"]: row for row in door_rows}
    ceiling = state["max_prime"] if state and state["max_prime"] else max(room_counts)
    prime_list = primes_up_to(ceiling)
    following = dict(zip(prime_list, prime_list[1:]))
    statistics_rows = []
    for prime, rooms in room_counts.items():
        next_prime = following.get(prime)
        if next_prime is None:
            continue
        doors = door_counts.get(prime)
        live_rooms = doors["live_rooms"] if doors else 0
        connections = doors["connections"] if doors else 0
        target_rooms = room_counts.get(next_prime, 0)
        statistics_rows.append(
            {
                "prime": prime,
                "next_prime": next_prime,
                "gap": next_prime - prime,
                "rooms": rooms,
                "live_rooms": live_rooms,
                "dead_rooms": rooms - live_rooms,
                "connections": connections,
                "target_rooms": target_rooms,
                "survival_rate": live_rooms / rooms,
                "target_retention": target_rooms / rooms,
                "extinct": target_rooms == 0,
            }
        )
    return statistics_rows


def pearson(values_x: list[float], values_y: list[float]) -> float:
    mean_x = statistics.mean(values_x)
    mean_y = statistics.mean(values_y)
    numerator = sum(
        (x - mean_x) * (y - mean_y) for x, y in zip(values_x, values_y)
    )
    denominator = math.sqrt(
        sum((x - mean_x) ** 2 for x in values_x)
        * sum((y - mean_y) ** 2 for y in values_y)
    )
    return numerator / denominator


def threshold_score(rows: list[dict], threshold: int, severe_rate: float) -> dict:
    actual = [row["survival_rate"] < severe_rate for row in rows]
    predicted = [row["gap"] >= threshold for row in rows]
    true_positive = sum(a and p for a, p in zip(actual, predicted))
    false_positive = sum(not a and p for a, p in zip(actual, predicted))
    false_negative = sum(a and not p for a, p in zip(actual, predicted))
    true_negative = len(rows) - true_positive - false_positive - false_negative
    precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else 0
    recall = true_positive / (true_positive + false_negative) if true_positive + false_negative else 0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0
    return {
        "gap_threshold": threshold,
        "true_positive": true_positive,
        "false_positive": false_positive,
        "false_negative": false_negative,
        "true_negative": true_negative,
        "precision": precision,
        "recall": recall,
        "f1": f1,
    }


def analyze(database: Path, forecast_max: int, severe_rate: float = 0.20) -> dict:
    rows = level_statistics(database)
    gaps = sorted({row["gap"] for row in rows})
    thresholds = [threshold_score(rows, gap, severe_rate) for gap in gaps]
    best = max(thresholds, key=lambda score: (score["f1"], score["recall"]))

    grouped = defaultdict(list)
    for row in rows:
        grouped[row["gap"]].append(row["survival_rate"])
    gap_summary = [
        {
            "gap": gap,
            "samples": len(values),
            "mean_survival": statistics.mean(values),
            "median_survival": statistics.median(values),
            "minimum_survival": min(values),
            "severe_bottlenecks": sum(value < severe_rate for value in values),
        }
        for gap, values in sorted(grouped.items())
    ]

    observed_max = max(row["next_prime"] for row in rows)
    forecast_primes = primes_up_to(forecast_max)
    forecast = [
        {"prime": left, "next_prime": right, "gap": right - left}
        for left, right in zip(forecast_primes, forecast_primes[1:])
        if left >= observed_max and right - left >= best["gap_threshold"]
    ]

    return {
        "database": str(database),
        "observed_transitions": len(rows),
        "observed_through_prime": observed_max,
        "severe_definition": f"survival_rate < {severe_rate:.0%}",
        "severe_bottlenecks": sum(
            row["survival_rate"] < severe_rate for row in rows
        ),
        "pearson_gap_vs_survival": pearson(
            [row["gap"] for row in rows],
            [row["survival_rate"] for row in rows],
        ),
        "best_gap_only_threshold": best,
        "gap_summary": gap_summary,
        "severe_transitions": [
            row for row in rows if row["survival_rate"] < severe_rate
        ],
        "forecast_max": forecast_max,
        "forecast_warnings": forecast,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--database", type=Path, default=Path("prime_labyrinth_5000.sqlite3")
    )
    parser.add_argument("--forecast-max", type=int, default=10_000)
    parser.add_argument("--report-output", type=Path)
    args = parser.parse_args()

    report = analyze(args.database, args.forecast_max)
    rendered = json.dumps(report, indent=2)
    if args.report_output:
        args.report_output.parent.mkdir(parents=True, exist_ok=True)
        args.report_output.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)


if __name__ == "__main__":
    main()
