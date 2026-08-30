"""生成 SecTools 扩展占位图标"""
from PIL import Image, ImageDraw, ImageFont
import os

SIZES = [16, 48, 128]
ICONS_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
os.makedirs(ICONS_DIR, exist_ok=True)

def draw_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # 圆角矩形背景
    margin = size // 8
    r = size // 6
    # 渐变绿背景
    for y in range(margin, size - margin):
        t = (y - margin) / (size - 2 * margin)
        r_val = int(22 + (1 - t) * 33)
        g_val = int(163 + (1 - t) * 200)
        b_val = int(74 + (1 - t) * 120)
        draw.line([(margin, y), (size - margin, y)], fill=(r_val, g_val, b_val, 255))
    
    # 白色文字 "S"
    try:
        font_size = int(size * 0.55)
        # 尝试加载系统字体
        font_paths = [
            "/System/Library/Fonts/Helvetica.ttc",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        ]
        font = None
        for fp in font_paths:
            if os.path.exists(fp):
                font = ImageFont.truetype(fp, font_size)
                break
        if font is None:
            font = ImageFont.load_default()
            
        bbox = draw.textbbox((0, 0), "S", font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        x = (size - tw) / 2
        y = (size - th) / 2 - th * 0.05
        # 添加阴影
        draw.text((x + 1, y + 1), "S", fill=(0, 80, 40, 128), font=font)
        draw.text((x, y), "S", fill=(255, 255, 255, 255), font=font)
    except Exception:
        pass

    return img

for size in SIZES:
    img = draw_icon(size)
    path = os.path.join(ICONS_DIR, f'icon{size}.png')
    img.save(path, 'PNG')
    print(f'Created {path} ({size}x{size})')

print('All icons generated.')
