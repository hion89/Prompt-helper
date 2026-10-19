"""Render Malgyeol's editable SVG icon through the shared Node/Chrome renderer."""
from pathlib import Path
import subprocess

script = Path(__file__).resolve().with_name('render-brand-assets.mjs')
subprocess.run(['node', str(script), '--icons-only'], check=True)