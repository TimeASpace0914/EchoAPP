"""Downscale and optimize the shared Echo Voice PNG icon assets for Expo builds."""

from pathlib import Path

from PIL import Image


ASSET_DIR = Path(__file__).resolve().parents[1] / "assets" / "images"
ASSET_NAMES = (
    "icon.png",
    "splash-icon.png",
    "favicon.png",
    "android-icon-foreground.png",
)
MAX_SIZE = 1024


def optimize_asset(path: Path) -> None:
    with Image.open(path) as original:
        image = original.convert("RGB")
        image.thumbnail((MAX_SIZE, MAX_SIZE), Image.Resampling.LANCZOS)
        image.save(path, format="PNG", optimize=True, compress_level=9)


if __name__ == "__main__":
    for asset_name in ASSET_NAMES:
        optimize_asset(ASSET_DIR / asset_name)
