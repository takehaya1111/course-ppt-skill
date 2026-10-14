#!/usr/bin/env python3
"""Skill-local single-page PDF rasterizer, adapted from the WB handoff.

Only implements the pdftoppm arguments used by the LibreOffice render branch.
It is not poppler. --probe-json verifies native PDFium and PNG encoding in memory;
--version also checks real availability, rather than merely printing this script's
version. Install the optional dependency with setup.mjs --pdf-rendering.
"""
from __future__ import annotations

import argparse
from importlib.metadata import version
import io
import json
from pathlib import Path
import sys

VERSION = "1.1.0"


def load_pdfium():
    try:
        import pypdfium2 as pdfium
        from PIL import Image  # PNG encoding is part of this path, not just PDF loading.
        return pdfium, Image
    except (ImportError, OSError) as exc:
        raise RuntimeError(
            "PDF 光栅化依赖不可用；请运行 node scripts/setup.mjs --pdf-rendering，"
            "或安装 poppler 并设置 PPT_SKILL_PDFTOPPM。"
            f"当前 Python：{sys.executable}；{exc}"
        ) from exc


def png_bytes(page, scale):
    bitmap = page.render(scale=scale)
    try:
        image = bitmap.to_pil()
        try:
            buffer = io.BytesIO()
            image.save(buffer, format="PNG")
            return buffer.getvalue()
        finally:
            image.close()
    finally:
        bitmap.close()


def probe(pdfium):
    # A distribution record or import alone does not prove the native renderer works.
    doc = pdfium.PdfDocument.new()
    try:
        page = doc.new_page(8, 8)
        try:
            pixels = png_bytes(page, 1)
            if not pixels.startswith(b"\x89PNG\r\n\x1a\n"):
                raise RuntimeError("PDFium 未生成 PNG")
        finally:
            page.close()
    finally:
        doc.close()
    return {
        "schema": "course-pdf-raster-probe.v1", "status": "AVAILABLE",
        "scriptVersion": VERSION, "python": sys.executable,
        "packages": {"pypdfium2": version("pypdfium2"), "Pillow": version("Pillow")},
        "pdfiumVersion": str(pdfium.PDFIUM_INFO.version),
        "nativeRenderAndPng": True,
    }


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    probing = argv in (["--probe-json"], ["--version"], ["-v"], ["-V"])
    if probing:
        try:
            pdfium, _ = load_pdfium()
            result = probe(pdfium)
            if argv == ["--probe-json"]:
                print(json.dumps(result, ensure_ascii=False))
            else:
                print(f"pdf-raster.py {VERSION}; pypdfium2 {result['packages']['pypdfium2']}; PDFium {result['pdfiumVersion']}")
            return 0
        except Exception as exc:
            print(f"pdf-raster.py: {exc}", file=sys.stderr)
            return 3

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("-png", action="store_true")
    ap.add_argument("-scale-to-x", type=int, default=1600)
    ap.add_argument("-scale-to-y", type=int, default=-1)
    ap.add_argument("-f", type=int, default=1)
    ap.add_argument("-l", type=int, default=None)
    ap.add_argument("-singlefile", action="store_true")
    ap.add_argument("pdf")
    ap.add_argument("prefix")
    args = ap.parse_args(argv)
    last = args.f if args.l is None else args.l
    if not args.png or not args.singlefile:
        ap.error("仅支持 -png -singlefile 单页输出")
    if args.f < 1 or last != args.f:
        ap.error("页码须为正整数，且 -f 与 -l 必须是同一页；不自动修改页码")
    if not 1 <= args.scale_to_x <= 32768 or args.scale_to_y != -1:
        ap.error("仅支持 1..32768 的 -scale-to-x 和 -scale-to-y -1 等比缩放")

    try:
        pdfium, _ = load_pdfium()
    except RuntimeError as exc:
        print(f"pdf-raster.py: {exc}", file=sys.stderr)
        return 3
    try:
        doc = pdfium.PdfDocument(args.pdf)
        try:
            if args.f > len(doc):
                raise ValueError(f"请求第 {args.f} 页，PDF 只有 {len(doc)} 页")
            page = doc[args.f - 1]
            try:
                width, height = page.get_size()
                if width <= 0 or height <= 0:
                    raise ValueError("PDF 页面尺寸无效")
                scale = args.scale_to_x / width
                if height * scale > 32768:
                    raise ValueError("PNG 输出高度超过 32768")
                pixels = png_bytes(page, scale)
            finally:
                page.close()
        finally:
            doc.close()
        # The caller always owns a fresh output directory; do not overwrite old proof.
        with Path(f"{args.prefix}.png").open("xb") as output:
            output.write(pixels)
        return 0
    except Exception as exc:
        print(f"pdf-raster.py: {exc}", file=sys.stderr)
        return 4


if __name__ == "__main__":
    raise SystemExit(main())
