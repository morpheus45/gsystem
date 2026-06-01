"""
INDICATOR CALM - Canvas renderer (refined pass).

The void is not empty; it is the calibrated ground against which signal
becomes legible. This pass activates that ground with a paper grid, mirrors
the bottom trace with a vertical pulse on the right, refines the pointer
to a tapered tip, and adds Greek-letter calibration marks the way an
instrument's bezel might carry tolerance symbols.
"""

from PIL import Image, ImageDraw, ImageFont
import math
import os

# ---------------------------------------------------------------- constants
W, H = 2400, 3000
MARGIN = 200

# Palette (calibrated, never decorative)
PAPER   = (245, 239, 226)     # warm cream
INK     = (26, 36, 56)        # anthracite ink
INK_S   = (26, 36, 56, 90)    # ink, soft
INK_HL  = (26, 36, 56, 38)    # ink, hairline
INK_DOT = (26, 36, 56, 24)    # ink, paper grid
AMBER   = (216, 154, 58)      # sodium signal
AMBER_S = (216, 154, 58, 70)  # amber, soft

FONTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")

def load(name, size):
    return ImageFont.truetype(os.path.join(FONTS_DIR, name), size)

# Typography roles
F_WORDMARK = load("Tektur-Medium.ttf", 64)
F_SUBHEAD  = load("InstrumentSans-Regular.ttf", 22)
F_LABEL    = load("GeistMono-Regular.ttf", 22)
F_MICRO    = load("GeistMono-Regular.ttf", 16)
F_NUMERAL  = load("Tektur-Regular.ttf", 52)
F_DIGIT    = load("GeistMono-Bold.ttf", 36)
F_SPEC     = load("JetBrainsMono-Regular.ttf", 18)
F_TINY     = load("GeistMono-Regular.ttf", 14)
F_ROMAN    = load("CrimsonPro-Italic.ttf", 26)


def text_size(draw, txt, font):
    bbox = draw.textbbox((0, 0), txt, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


# ---------------------------------------------------------------- canvas
img = Image.new("RGB", (W, H), PAPER)
overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
draw = ImageDraw.Draw(overlay)

inner = MARGIN
frame_pad = MARGIN - 60


# ============================================================== PAPER GRID
# Subtle dot grid: laboratory engineering paper, barely there.
GRID_STEP = 80
DOT_R = 2
for x in range(inner, W - inner + 1, GRID_STEP):
    for y in range(inner + 200, H - inner - 220, GRID_STEP):
        draw.ellipse([(x - DOT_R, y - DOT_R), (x + DOT_R, y + DOT_R)],
                     fill=INK_DOT)


# ============================================================== FRAME
draw.rectangle(
    [frame_pad, frame_pad, W - frame_pad, H - frame_pad],
    outline=INK_S, width=1
)
# Header rule
draw.line([(inner, inner + 130), (W - inner, inner + 130)], fill=INK_S, width=1)
# Footer rule
draw.line([(inner, H - inner - 130), (W - inner, H - inner - 130)],
          fill=INK_S, width=1)


# ============================================================== HEADER
# Top-left reference code
draw.text((inner, inner), "G-S · FR / 054", fill=INK, font=F_LABEL)
draw.text((inner, inner + 36), "DOSSIER  TECHNIQUE", fill=INK, font=F_MICRO)

# Center wordmark
wm = "INDICATOR  ·  CALM"
ww, _ = text_size(draw, wm, F_WORDMARK)
draw.text(((W - ww) / 2, inner - 8), wm, fill=INK, font=F_WORDMARK)
# Subtle subtitle beneath wordmark
sub = "MESURE  AU  REPOS"
sw, _ = text_size(draw, sub, F_SUBHEAD)
draw.text(((W - sw) / 2, inner + 78), sub, fill=INK_S, font=F_SUBHEAD)
# Underline mark beneath subtitle — asymmetric etched signature
sig_w = 120
sig_x = (W - sig_w) / 2
draw.line([(sig_x, inner + 116), (sig_x + sig_w, inner + 116)],
          fill=INK, width=2)
# Tiny amber pip on the underline (right side)
draw.ellipse([(sig_x + sig_w - 4, inner + 114),
              (sig_x + sig_w + 4, inner + 122)], fill=AMBER)

# Top-right
draw.text((W - inner, inner), "REV.  02.026", fill=INK, font=F_LABEL, anchor="rt")
draw.text((W - inner, inner + 36), "EDITION  PRINCEPS",
          fill=INK, font=F_MICRO, anchor="rt")


# ============================================================== MAIN DIAL
CENTER = (W // 2, int(H * 0.44))
R_OUTER = 540
R_TICKS = 510
R_TICK_MAJ = 470
R_TICK_MIN = 490
R_INNER = 410
R_BEZEL = 560

# Bezel (very thin outer)
draw.ellipse(
    [CENTER[0] - R_BEZEL, CENTER[1] - R_BEZEL,
     CENTER[0] + R_BEZEL, CENTER[1] + R_BEZEL],
    outline=INK_S, width=2
)
draw.ellipse(
    [CENTER[0] - R_OUTER, CENTER[1] - R_OUTER,
     CENTER[0] + R_OUTER, CENTER[1] + R_OUTER],
    outline=INK, width=3
)
draw.ellipse(
    [CENTER[0] - R_INNER, CENTER[1] - R_INNER,
     CENTER[0] + R_INNER, CENTER[1] + R_INNER],
    outline=INK_S, width=1
)

# Ticks — interrupt near the cardinals (skip 6° band each side of major
# cardinal so the numerals can breathe).
CARDINAL_DEGS = {0, 90, 180, 270}
for deg in range(0, 360, 6):
    # Skip ticks within 6 degrees of cardinals (so numerals are uninterrupted)
    if any(abs(((deg - c + 540) % 360) - 180) > 174 for c in CARDINAL_DEGS):
        # the predicate above is true when deg is within 6° of a cardinal
        # but we ALSO want to keep the cardinal tick itself (deg==c). The
        # simpler form:
        pass
    # Simpler skip: hide ticks within +/-3 degrees of a cardinal but keep cardinal itself
    if any((deg != c) and (((deg - c) % 360) <= 6 or ((c - deg) % 360) <= 6)
           for c in CARDINAL_DEGS):
        continue
    rad = math.radians(deg - 90)
    is_major = (deg % 30) == 0
    r1 = R_TICKS
    r2 = R_TICK_MAJ if is_major else R_TICK_MIN
    x1 = CENTER[0] + r1 * math.cos(rad)
    y1 = CENTER[1] + r1 * math.sin(rad)
    x2 = CENTER[0] + r2 * math.cos(rad)
    y2 = CENTER[1] + r2 * math.sin(rad)
    width = 3 if is_major else 1
    draw.line([(x1, y1), (x2, y2)], fill=INK, width=width)

# Cardinal numerals
cardinals = [(0, "00"), (90, "25"), (180, "50"), (270, "75")]
for deg, txt in cardinals:
    rad = math.radians(deg - 90)
    r = R_TICK_MAJ - 50
    x = CENTER[0] + r * math.cos(rad)
    y = CENTER[1] + r * math.sin(rad)
    tw, th = text_size(draw, txt, F_NUMERAL)
    draw.text((x - tw / 2, y - th / 2 - 10), txt, fill=INK, font=F_NUMERAL)

# Roman numeral calibration marks just outside the bezel — the discrete
# index of an antique instrument, evoking sextant and theodolite tradition.
roman = [(45, "I"), (135, "II"), (225, "III"), (315, "IV")]
for deg, txt in roman:
    rad = math.radians(deg - 90)
    r = R_OUTER + 32
    x = CENTER[0] + r * math.cos(rad)
    y = CENTER[1] + r * math.sin(rad)
    draw.text((x, y), txt, fill=INK_S, font=F_ROMAN, anchor="mm")

# Cardinal compass letters outside (N E S O)
for deg, txt in [(0, "N"), (90, "E"), (180, "S"), (270, "O")]:
    rad = math.radians(deg - 90)
    r = R_OUTER + 76
    x = CENTER[0] + r * math.cos(rad)
    y = CENTER[1] + r * math.sin(rad)
    draw.text((x, y), txt, fill=INK, font=F_LABEL, anchor="mm")

# Pointer (tapered)
POINTER_ANGLE = 52
prad = math.radians(POINTER_ANGLE - 90)
plen = R_INNER - 30
ptx = CENTER[0] + plen * math.cos(prad)
pty = CENTER[1] + plen * math.sin(prad)

# Tapered shape: a polygon with wide base at pivot, narrow tip at ptx/pty
def polygon_pointer(angle_rad, length, base_half_w=8, tip_half_w=2):
    # Perpendicular to pointer direction
    perp_x = -math.sin(angle_rad)
    perp_y = math.cos(angle_rad)
    base_x = CENTER[0]
    base_y = CENTER[1]
    tip_x = CENTER[0] + length * math.cos(angle_rad)
    tip_y = CENTER[1] + length * math.sin(angle_rad)
    pts = [
        (base_x + perp_x * base_half_w, base_y + perp_y * base_half_w),
        (tip_x + perp_x * tip_half_w, tip_y + perp_y * tip_half_w),
        (tip_x - perp_x * tip_half_w, tip_y - perp_y * tip_half_w),
        (base_x - perp_x * base_half_w, base_y - perp_y * base_half_w),
    ]
    return pts

draw.polygon(polygon_pointer(prad, plen, base_half_w=7, tip_half_w=1),
             fill=INK)
# Counterweight (back of pointer): short tapered tail
back_rad = prad + math.pi
draw.polygon(polygon_pointer(back_rad, 90, base_half_w=10, tip_half_w=4),
             fill=INK)

# Central pivot (jewel-bearing feel)
PIVOT = 20
draw.ellipse(
    [CENTER[0] - PIVOT, CENTER[1] - PIVOT,
     CENTER[0] + PIVOT, CENTER[1] + PIVOT],
    fill=INK
)
draw.ellipse(
    [CENTER[0] - 8, CENTER[1] - 8, CENTER[0] + 8, CENTER[1] + 8],
    fill=PAPER
)
draw.ellipse(
    [CENTER[0] - 3, CENTER[1] - 3, CENTER[0] + 3, CENTER[1] + 3],
    fill=INK
)

# Readout window
RB_W, RB_H = 240, 90
RB = (CENTER[0] - RB_W // 2, CENTER[1] + 180,
      CENTER[0] + RB_W // 2, CENTER[1] + 180 + RB_H)
draw.rectangle(RB, outline=INK, width=2)
# Inner hairline
draw.rectangle([(RB[0] + 6, RB[1] + 6), (RB[2] - 6, RB[3] - 6)],
               outline=INK_HL, width=1)
# Readout text
readout = "00.052"
rw, rh = text_size(draw, readout, F_DIGIT)
draw.text((CENTER[0] - rw / 2, RB[1] + (RB_H - rh) / 2 - 6),
          readout, fill=INK, font=F_DIGIT)
# Two tiny tick marks framing readout
draw.line([(RB[0] - 14, (RB[1] + RB[3]) / 2),
           (RB[0] - 4, (RB[1] + RB[3]) / 2)], fill=INK, width=2)
draw.line([(RB[2] + 4, (RB[1] + RB[3]) / 2),
           (RB[2] + 14, (RB[1] + RB[3]) / 2)], fill=INK, width=2)
# Caption beneath
draw.text((CENTER[0], RB[3] + 18), "VALEUR  STABILISEE",
          fill=INK, font=F_MICRO, anchor="mt")


# ============================================================== CONSTELLATION OF 8 INDICATORS
ind_y = int(H * 0.79)
ind_spacing = 280
ind_w = 180
ind_h = 130
codes = ["Z·01", "Z·02", "Z·03", "Z·04",
         "Z·05", "Z·06", "Z·07", "Z·08"]
active_index = 4

start_x = (W - (ind_spacing * 7) - ind_w) // 2 + ind_w // 2

# Connecting wires from main dial (junction line) to modules.
# Junction is positioned below the dial's south cardinal label to avoid
# overlap with the "S" letter and the bezel.
junction_y = int(H * 0.66)
# Faint horizontal junction line
draw.line([(start_x, junction_y),
           (start_x + 7 * ind_spacing, junction_y)],
          fill=INK_HL, width=1)
# Tiny tick at the dial's south anchor
draw.line([(CENTER[0], CENTER[1] + R_BEZEL + 4),
           (CENTER[0], junction_y)], fill=INK_S, width=1)

for i, code in enumerate(codes):
    cx = start_x + i * ind_spacing
    cy = ind_y
    # Module frame
    draw.rectangle(
        [cx - ind_w // 2, cy - ind_h // 2,
         cx + ind_w // 2, cy + ind_h // 2],
        outline=INK, width=2
    )
    draw.rectangle(
        [cx - ind_w // 2 + 8, cy - ind_h // 2 + 8,
         cx + ind_w // 2 - 8, cy + ind_h // 2 - 8],
        outline=INK_HL, width=1
    )
    # Central pip
    pip_r = 12
    pip_top = cy - 12
    if i == active_index:
        # Amber halo
        draw.ellipse(
            [cx - pip_r - 10, pip_top - pip_r - 10,
             cx + pip_r + 10, pip_top + pip_r + 10],
            outline=AMBER_S, width=2
        )
        draw.ellipse(
            [cx - pip_r, pip_top - pip_r,
             cx + pip_r, pip_top + pip_r],
            fill=AMBER, outline=INK, width=2
        )
    else:
        draw.ellipse(
            [cx - pip_r, pip_top - pip_r,
             cx + pip_r, pip_top + pip_r],
            outline=INK, width=2
        )
    # Code label
    draw.text((cx, cy + 24), code, fill=INK, font=F_LABEL, anchor="mt")
    # Tiny rule beneath the label
    draw.line([(cx - 22, cy + 52), (cx + 22, cy + 52)], fill=INK_S, width=1)
    # Vertical wire up to junction
    top_module = cy - ind_h // 2 - 4
    draw.line([(cx, top_module), (cx, junction_y)], fill=INK_HL, width=1)
    # Small junction dot
    draw.ellipse([(cx - 3, junction_y - 3), (cx + 3, junction_y + 3)],
                 fill=INK_S)


# ============================================================== VERTICAL TRACE (right margin)
# Mirrors the bottom horizontal trace — a sinusoidal pulse climbing the
# right edge of the working area.
vtrace_x = W - inner - 60
vtrace_top = inner + 220
vtrace_bot = H - inner - 220
amp = 18
period = 100
prev = None
sample_step = 4
y = vtrace_top
while y <= vtrace_bot:
    # Square wave: flat with one calm pulse near the top quarter
    offset = 0
    pulse_y_start = vtrace_top + 280
    pulse_y_end = pulse_y_start + 160
    if pulse_y_start <= y <= pulse_y_end:
        offset = amp
    pt = (vtrace_x + offset, y)
    if prev is not None:
        draw.line([prev, pt], fill=INK_S, width=2)
    prev = pt
    y += sample_step
# Single amber pip on this trace (mid-pulse)
pulse_mid_y = (vtrace_top + 280 + vtrace_top + 440) // 2
draw.ellipse([(vtrace_x + amp - 4, pulse_mid_y - 4),
              (vtrace_x + amp + 4, pulse_mid_y + 4)], fill=AMBER)
# Tiny rule beside the pulse (instrument tick, not a glyph)
draw.line([(vtrace_x + amp + 14, pulse_mid_y - 6),
           (vtrace_x + amp + 14, pulse_mid_y + 6)], fill=INK_S, width=1)
draw.line([(vtrace_x + amp + 20, pulse_mid_y),
           (vtrace_x + amp + 32, pulse_mid_y)], fill=INK_S, width=1)


# ============================================================== FOOTER
foot_y = H - MARGIN - 80

# Bottom trace — flat with one calm pulse, mirrored against vertical trace
trace_y = foot_y - 70
trace_left = inner
trace_right = W - inner
pulse_start = W // 2 - 140
pulse_end = W // 2 + 140
pulse_height = 18
draw.line([(trace_left, trace_y), (pulse_start, trace_y)], fill=INK, width=2)
draw.line([(pulse_start, trace_y),
           (pulse_start, trace_y - pulse_height)], fill=INK, width=2)
draw.line([(pulse_start, trace_y - pulse_height),
           (pulse_end, trace_y - pulse_height)], fill=INK, width=2)
draw.line([(pulse_end, trace_y - pulse_height),
           (pulse_end, trace_y)], fill=INK, width=2)
draw.line([(pulse_end, trace_y), (trace_right, trace_y)], fill=INK, width=2)
mid_x = (pulse_start + pulse_end) // 2
draw.ellipse([(mid_x - 4, trace_y - pulse_height - 4),
              (mid_x + 4, trace_y - pulse_height + 4)], fill=AMBER)
# Tick marks at 1/4 and 3/4 of trace
for frac in (0.25, 0.75):
    tx = trace_left + (trace_right - trace_left) * frac
    draw.line([(tx, trace_y + 6), (tx, trace_y + 14)], fill=INK_S, width=1)

# Spec line
spec_left = "CHASSIS  ·  2026 / Q2"
spec_mid = "CAL.  0.001  ±  0.0005"
spec_right = "SER.  000054"
draw.text((inner, foot_y), spec_left, fill=INK, font=F_SPEC)
mw, _ = text_size(draw, spec_mid, F_SPEC)
draw.text(((W - mw) / 2, foot_y), spec_mid, fill=INK, font=F_SPEC)
draw.text((W - inner, foot_y), spec_right, fill=INK, font=F_SPEC, anchor="rt")

# Bottom-most attribution
attr = "ATELIER  MORPHEUS  ·  FORTITUDINE  ET  PRAECISIONE"
draw.text((W // 2, H - MARGIN - 4), attr, fill=INK_S, font=F_TINY, anchor="ms")


# ============================================================== COMPOSITE & SAVE
final = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
out_png = os.path.join(os.path.dirname(__file__), "INDICATOR_CALM.png")
final.save(out_png, "PNG", dpi=(300, 300))
print(f"Saved: {out_png}")
print(f"Size: {final.size}")
