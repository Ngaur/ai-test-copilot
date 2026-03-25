"""
Parses uploaded test data files (CSV, Excel, JSON) into a list of dicts.
"""
from __future__ import annotations

import json
from pathlib import Path


def parse_test_data(file_path: str) -> list[dict]:
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix == ".json":
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            return [data]
        raise ValueError("JSON test data must be an array of objects or a single object")

    if suffix == ".csv":
        import csv
        with open(path, encoding="utf-8") as f:
            reader = csv.DictReader(f)
            return [dict(row) for row in reader]

    if suffix in (".xlsx", ".xls"):
        import openpyxl
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            return []
        headers = [str(h) for h in rows[0]]
        return [dict(zip(headers, row)) for row in rows[1:]]

    raise ValueError(f"Unsupported test data format: {suffix}. Use CSV, Excel, or JSON.")
