"""Convert the user-selected square icon into Expo app icon assets without cropping content."""

from pathlib import Path
from PIL import Image


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path("/home/ubuntu/upload/迴響ICON.jpg")
DESTINATIONS = {
    "icon.png": 1024,
    "splash-icon.png": 1024,
    "favicon.png": 256,
    "android-icon-foreground.png": 1024,
    "android-icon-background.png": 1024,
    "android-icon-monochrome.png": 1024,
}


def main() -> None:
    if not SOURCE.is_file():
        raise FileNotFoundError(f"找不到使用者提供的圖示：{SOURCE}")

    source = Image.open(SOURCE).convert("RGB")
    if source.width != source.height:
        raise ValueError("App ICON 必須是正方形，為避免裁切原圖，此次不會自動轉換。")

    asset_dir = PROJECT_ROOT / "assets" / "images"
    for filename, size in DESTINATIONS.items():
        output = source.resize((size, size), Image.Resampling.LANCZOS)
        # 原圖為黑白紋理，使用 128 色調色盤可保留可辨識細節並顯著縮小 PNG，
        # 不會裁切、重繪或改變既有圖像內容。
        optimized = output.quantize(colors=128, method=Image.Quantize.MEDIANCUT)
        optimized.save(asset_dir / filename, format="PNG", optimize=True, compress_level=9)
        print(f"已更新 {filename}: {size}x{size}")


if __name__ == "__main__":
    main()
