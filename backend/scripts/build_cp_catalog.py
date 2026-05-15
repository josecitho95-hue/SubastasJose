"""
Genera cp_catalog.json a partir del archivo oficial de SEPOMEX.

Descarga el catálogo en:
  https://www.correosdemexico.gob.mx/SSLServicios/ConsultaCP/Descarga.aspx
  (formato: "Archivo delimitado por tabulaciones")

O desde datos abiertos:
  https://datos.gob.mx/busca/dataset/catalogo-nacional-de-codigos-postales

Uso:
  python build_cp_catalog.py --input CPdescarga.txt --output ../../frontend/public/cp_catalog.json

El TXT de SEPOMEX es pipe-separado (|) con encoding latin-1 y una fila de encabezado.
Columnas relevantes:
  0: d_codigo   -> Código Postal (5 dígitos)
  1: d_asenta   -> Nombre del asentamiento (colonia)
  2: d_tipo_asenta -> Tipo (Colonia, Fraccionamiento, etc.)
  3: D_mnpio    -> Municipio / Alcaldía
  4: d_estado   -> Estado
"""

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path


def build_catalog(input_path: Path) -> dict:
    catalog = defaultdict(lambda: {"estado": "", "municipio": "", "colonias": []})

    # SEPOMEX usa encoding latin-1 y separador |
    with open(input_path, encoding="latin-1") as f:
        lines = f.readlines()

    # Primera línea es encabezado, última línea suele ser una nota vacía
    data_lines = lines[1:]

    skipped = 0
    processed = 0

    for raw in data_lines:
        line = raw.strip()
        if not line:
            continue

        parts = line.split("|")
        if len(parts) < 5:
            skipped += 1
            continue

        cp = parts[0].strip().zfill(5)
        colonia = parts[1].strip()
        municipio = parts[3].strip()
        estado = parts[4].strip()

        if not cp.isdigit() or len(cp) != 5:
            skipped += 1
            continue

        entry = catalog[cp]
        entry["estado"] = estado
        entry["municipio"] = municipio

        if colonia and colonia not in entry["colonias"]:
            entry["colonias"].append(colonia)

        processed += 1

    # Ordenar colonias alfabéticamente dentro de cada CP
    for cp_data in catalog.values():
        cp_data["colonias"].sort()

    print(f"Procesados: {processed} registros | Omitidos: {skipped} | CPs únicos: {len(catalog)}")
    return dict(sorted(catalog.items()))


def main():
    parser = argparse.ArgumentParser(description="Convierte catálogo SEPOMEX a JSON para SubastasGeek")
    parser.add_argument("--input", required=True, help="Ruta al archivo TXT de SEPOMEX (pipe-separated)")
    parser.add_argument(
        "--output",
        default="../../frontend/public/cp_catalog.json",
        help="Ruta de salida para cp_catalog.json",
    )
    parser.add_argument("--pretty", action="store_true", help="Formatear JSON con indentación (más legible pero mayor tamaño)")
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"ERROR: No se encontró el archivo: {input_path}", file=sys.stderr)
        sys.exit(1)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"Leyendo: {input_path}")
    catalog = build_catalog(input_path)

    indent = 2 if args.pretty else None
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=indent)

    size_kb = output_path.stat().st_size / 1024
    print(f"Escrito: {output_path} ({size_kb:.0f} KB)")


if __name__ == "__main__":
    main()
