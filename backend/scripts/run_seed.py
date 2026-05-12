#!/usr/bin/env python3
"""CLI para ejecutar el seed desde cualquier lugar."""
import sys
from pathlib import Path

# Agregar backend al path
sys.path.insert(0, str(Path(__file__).parent.parent))

import asyncio
from scripts.seed import seed

if __name__ == "__main__":
    asyncio.run(seed())
