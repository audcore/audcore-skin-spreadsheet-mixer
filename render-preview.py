"""Render a synthetic Sheet skin cover and a matching install thumbnail."""

import argparse
from math import sin
from pathlib import Path

from PIL import Image, ImageColor, ImageDraw, ImageFont


def render_icon(path):
    sizes = (16, 24, 32, 48, 64, 128, 256)
    frames = []
    for size in sizes:
        scale = size / 4
        frame = Image.new("RGBA", (size * 4, size * 4))
        draw = ImageDraw.Draw(frame)
        def bounds(*points):
            return tuple(round(point * scale) for point in points)
        draw.rounded_rectangle(bounds(0.5, 0.5, 15.5, 15.5), radius=round(3 * scale), fill="#217346")
        for x in (4, 7, 12):
            draw.line(bounds(x, 5, x, 11), fill="white", width=round(scale))
        for y in (5, 7, 11):
            draw.line(bounds(4, y, 12, y), fill="white", width=round(scale))
        frames.append(frame.resize((size, size), Image.Resampling.LANCZOS))
    frames[-1].save(path, sizes=[(size, size) for size in sizes], append_images=frames[:-1])


def render():
    image = Image.new("RGB", (1200, 900), "#e8eeea")
    draw = ImageDraw.Draw(image)
    fonts = Path("C:/Windows/Fonts")
    regular = ImageFont.truetype(str(fonts / "msyh.ttc"), 18)
    bold = ImageFont.truetype(str(fonts / "msyhbd.ttc"), 18)
    title = ImageFont.truetype(str(fonts / "msyhbd.ttc"), 28)
    ink, edge, accent = "#222624", "#d0d7d1", "#217346"
    left, top, right = 35, 30, 1164
    widths = (115, 202, 202, 202, 202, 206)
    names = ("通道名", "麦克风", "伴奏", "混响", "监听", "主输出")
    colors = ("#edf0ed", "#f3ad50", "#38b9ec", "#a879e8", "#33d69a", "#9baab9")
    channel_colors = dict(zip(names[1:], colors[1:]))
    inputs = ("输入", "USB 1", "播放器", "空输入", "空输入", "空输入")
    effects = (("均衡", "压缩", "去齿音"), ("均衡",), ("混响",), (), ("限幅",))
    sends = ((("主输出", "0.0"), ("混响", "-13.0")), (("主输出", "-6.0"),), (("主输出", "-8.0"),),
             (("PLAYBACK 3/4", "0.0"),), (("PLAYBACK 1/2", "0.0"),))

    def label(x, y, text, font=regular, fill=ink):
        draw.text((x, y), text, font=font, fill=fill, anchor="lm")

    for offset in range(68):
        shade = round(252 - 9 * offset / 67)
        draw.line((left, top + offset, right, top + offset), fill=(shade, shade, shade))
    draw.rectangle((left, top, right, top + 67), outline=edge)
    draw.rounded_rectangle((left + 16, top + 16, left + 51, top + 51), radius=3, fill=accent)
    for x in range(left + 24, left + 44, 9):
        draw.line((x, top + 24, x, top + 43), fill="#fff")
    for y in range(top + 24, top + 44, 9):
        draw.line((left + 24, y, left + 42, y), fill="#fff")
    label(left + 64, top + 33, "Audcel", title)
    label(left + 180, top + 33, "保存   撤销   ＋")
    draw.rounded_rectangle((502, top + 14, 770, top + 52), radius=5, fill="#fff", outline=edge)
    label(517, top + 33, "搜索通道、效果器")
    label(1009, top + 33, "设置     −    □    ×")
    y = top + 68

    def row(values, height=26, fills=(), strong=False):
        nonlocal y
        x = left
        for i, width in enumerate(widths):
            value = values[i]
            fill = fills[i] if i < len(fills) else "#edf0ed" if i == 0 else "#fff"
            if isinstance(value, tuple):
                fill = channel_colors.get(value[0], fill)
            draw.rectangle((x, y, x + width - 1, y + height - 1), fill=fill, outline=edge)
            if isinstance(value, tuple):
                name, level = value
                label(x + 8, y + height / 2, name)
                level_ink = tuple((text + background) // 2 for text, background in zip(ImageColor.getrgb(ink), ImageColor.getrgb(fill)))
                draw.text((x + width - 8, y + height / 2), level, font=regular, fill=level_ink, anchor="rm")
            elif value:
                label(x + 8, y + height / 2, value, bold if strong else regular)
            x += width
        y += height

    row(("编号", "1", "2", "3", "4", "5"), fills=("#edf0ed",) * 6)
    row(names, height=32, fills=colors, strong=True)
    row(inputs)
    row(("效果链旁通", "FX", "FX", "FX", "FX", "FX"), height=21)
    for index in range(10):
        row(("效果器 ＋" if index == 0 else "", *(rack[index] if index < len(rack) else "" for rack in effects)), height=21)
    for index in range(6):
        row(("发送 ＋" if index == 0 else "", *(routes[index] if index < len(routes) else "" for routes in sends)), height=21)

    wave_y = y
    row(("峰值轨迹", "", "", "", "", ""), height=52, fills=("#edf0ed",) + ("#eef3ee",) * 5)
    x = left + widths[0]
    for index, width in enumerate(widths[1:]):
        for side in range(2):
            baseline = wave_y + 24 + side * 26
            points = [(x + sample, baseline - 16 * abs(sin(sample / (7 + index) + side) * sin(sample / 23)))
                      for sample in range(5, width - 5)]
            draw.line(points, fill=accent, width=2)
        x += width
    row(("音量", "-6.0", "-8.0", "-12.0", "-3.0", "0.0"))
    for caption, value in (("独奏", "S"), ("链接", ""), ("快捷键", ""), ("录音", "REC"), ("相位", "Ø")):
        row((caption,) + (value,) * 5, height=23)
    row(("静音",) * 6, height=32, strong=True)
    draw.rectangle((left, y, right, y + 32), fill="#ebebeb", outline=edge)
    draw.rounded_rectangle((left + 10, y + 4, left + 78, y + 28), radius=4, fill="#fff")
    label(left + 21, y + 16, "表格", bold, accent)
    draw.rounded_rectangle((510, y + 12, 935, y + 20), radius=4, fill="#d2d7d2")
    draw.rounded_rectangle((541, y + 12, 642, y + 20), radius=4, fill="#9aa59e")
    label(965, y + 16, "48.0 kHz · 128f")
    draw.rectangle((left, top, right, y + 32), outline="#171917")
    return image


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cover", type=Path)
    args = parser.parse_args()
    image = render()
    image.resize((160, 120), Image.Resampling.LANCZOS).save(Path(__file__).parent / "web/matrix-preview.png")
    render_icon(Path(__file__).parent / "web/matrix-window.ico")
    if args.cover:
        image.save(args.cover)
