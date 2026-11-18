# RECAPD MASCOT: LOCKED CHARACTER DNA (v3.0: PRODUCTION SPEC)

> **[SYSTEM INSTRUCTION FOR AI / ILLUSTRATOR]:**
> Treat the finalized reference image ([`cap-reference.jpg`](cap-reference.jpg)) as the immutable visual source of truth. You are ONLY permitted to modify the **Pose, Limb Placement, and Optional Props** specified in Section 5. Every geometric ratio, color hex value, facial marking, ear notch, bow-tie crease, and tail stripe count defined in Sections 1-4 is **100% LOCKED** and must never be altered, stylized, shaded, or re-proportioned.

---

## 1. RENDERING & VECTOR STROKE DNA (IMMUTABLE)
* **Medium:** 100% flat 2D digital vector illustration.
* **Shading Policy:** Strictly zero gradients, zero drop-shadows on the character itself, zero ambient occlusion, zero airbrushing, and zero fur texture noise. Every region is a solid, uniform hex fill.
* **Outline Architecture:** Uniform, bold, rounded vector strokes (`~4.5px` relative to a `1024x1024` canvas) with rounded caps and rounded joins in **`#1C0F12`**.
* **Canvas & Grounding:** Solid **`#F4EBE3`** background. Directly beneath the feet sits a single flat, unblurred horizontal oval ground shadow in **`#D5CBC3`** (width roughly `1.4x` the stance width, height roughly `0.15x` of its width). No floating lines, sparkles, or background elements unless explicitly specified in Section 5.

---

## 2. EXACT HEX COLOR MATRIX (IMMUTABLE)

| Component | Color Name | Hex Code | Exact Application Zones |
| :--- | :--- | :--- | :--- |
| **Primary Fur** | Coral Orange | `#F34E3D` | Head fur, oval belly patch, and stripes #2, #4, #6 of the tail. |
| **Dark Fur** | Deep Dark Plum | `#2E191E` | Torso, arms, legs, inner ear triangles, vertical tear-stripes, and stripes #1, #3, #5 of the tail. |
| **Light Fur & BG** | Pale Clay | `#F4EBE3` | Muzzle, cheek domes, eyebrow dots, outer ear fur trim, and canvas background. |
| **Signature Accessory** | Galactic Purple | `#55263D` | Bow tie fabric fill. |
| **Line Art & Features** | Plum-Black | `#1C0F12` | All outer/inner outlines, open left eye base, winking right eye, nose, open mouth interior, toe lines. |
| **Eye Iris Crescent** | Warm Umber-Slate | `#4A2C2A` | Subtle lower crescent inside the open left eye. |
| **Eye & Nose Shine** | Pure White | `#FFFFFF` | Two circular eye catchlights and single nose highlight oval. |
| **Tongue** | Soft Coral-Pink | `#E67A7A` | Rounded tongue fill inside the open mouth. |
| **Ground Shadow** | Muted Taupe | `#D5CBC3` | Flat oval shadow beneath the feet. |

---

## 3. PROPORTIONAL & ANATOMICAL RATIOS (IMMUTABLE)
* **Head-to-Body Ratio:** Chibi proportions where the head width is **`1.45x`** the torso width, and head height (excluding ears) is **`1.15x`** the torso-plus-legs height.
* **Head Tilt:** Default slight, friendly head tilt of **`~5°-7°` counter-clockwise** (tilted gently toward the viewer's left).
* **Head Silhouette (`#F34E3D`):** Wide, rounded heart-shaped dome.
  * **Crown Fur:** Exactly **two small, rounded wave-like fur tufts** at the top-center crown pointing slightly right.
  * **Side Cheek Fur:** Exactly **two short, pointed triangular orange fur tufts** flaring outward on the left and right outer edges of the face, right where the `#F34E3D` upper fur meets the `#F4EBE3` lower cheek domes.
* **Ears (LOCKED GEOMETRY):** Large, wide, rounded triangles positioned high on the upper-left and upper-right sides of the head.
  * **Outer Trim (`#F4EBE3`):** Thick pale-clay border around the ear, featuring **two small, jagged fur-notch indentations** on the lower outer edge where the ear meets the head.
  * **Inner Ear (`#2E191E`):** Solid dark-plum rounded triangle nested cleanly inside the pale-clay trim, with a small `#F34E3D` orange fur overlap notch at the bottom inner corner.
* **Lower Jaw & Cheek Domes (`#F4EBE3`):**
  * The bottom half of the face forms a **100% smooth, continuous, rounded U-curve jawline** outlined in `#1C0F12`.
  * The two `#F4EBE3` cheek patches are **smooth, rounded domes** sitting neatly inside the lower-left and lower-right jawline, **zero spiky or jagged white fur tufts** may extend outside the smooth jawline outline.
* **Facial Markings & Features (LOCKED PLACEMENT):**
  * **Eyebrow Dots:** Two small, tilted pill-shaped ovals in `#F4EBE3` floating symmetrically above the eyes.
  * **Tear Stripes (`#2E191E`):** Two thick, slightly curved vertical bands starting directly beneath the lower eyelid of each eye and running straight down to terminate flush against the `#1C0F12` jawline outline, cleanly separating the central `#F4EBE3` muzzle from the side `#F4EBE3` cheek domes.
  * **Left Eye (Viewer's Left: Open):** Large, slightly vertical oval/circle in `#1C0F12` positioned low near the muzzle. Contains:
    1. One large `#FFFFFF` circular catchlight in the upper-left quadrant.
    2. One tiny `#FFFFFF` pinpoint dot in the lower-right quadrant.
    3. A thin `#4A2C2A` crescent along the bottom inner rim.
  * **Right Eye (Viewer's Right: Wink):** A thick, smooth, downward-curving crescent (`#1C0F12`), plump in the center arch and tapering smoothly to rounded tips at both ends. *(Note: Keep this exact wink unless Section 5 explicitly requests both eyes open, in which case mirror the Left Eye geometry.)*
  * **Nose & Mouth:** Small horizontal oval nose in `#1C0F12` with a small `#FFFFFF` oval shine on top, centered at the top of the `#F4EBE3` muzzle. Directly beneath is a compact, joyful open D-shaped smile (`#1C0F12` mouth interior, `#E67A7A` rounded tongue filling the bottom half).

---

## 4. TORSO, BOW TIE & TAIL DNA (IMMUTABLE)
* **Bow Tie (`#55263D`):** Centered directly beneath the chin, overlapping the neckline. Composed of a rounded vertical-pill center knot flanked by two plump, slightly asymmetrical trapezoidal wings. Each wing has **two short horizontal `#1C0F12` crease lines** radiating outward from the center knot.
* **Torso & Belly Patch:** Compact, pear-shaped `#2E191E` body with no neck. Centered on the front torso (starting right below the bow tie and stopping above the hip line) is a smooth, vertical egg-shaped oval patch in **`#F34E3D`**.
* **Limbs & Paws (`#2E191E`):** Short, stubby, rounded arms and stout legs with zero elbows/knees or separate fingers. Each rounded foot features **two short vertical `#1C0F12` toe-crease lines** at the bottom front edge.
* **Stubby Tail (STRICT 6-STRIPE COUNT):** Emerging from the lower-right hip (viewer's right) and curving upward in a compact, rounded capsule silhouette that **terminates at mid-torso / bow-tie height** (never rising above the shoulder). Contains **strictly 6 alternating curved bands** from tip to base:
  1. **Tip:** `#2E191E` (Deep Dark Plum)
  2. **Band 2:** `#F34E3D` (Coral Orange)
  3. **Band 3:** `#2E191E` (Deep Dark Plum)
  4. **Band 4:** `#F34E3D` (Coral Orange)
  5. **Band 5:** `#2E191E` (Deep Dark Plum)
  6. **Base:** `#F34E3D` (Coral Orange)

---

## 5. MODULAR POSE & SCENE SLOT (EDIT ONLY THIS SECTION)

```text
Pose: [Standing upright facing forward, right arm (viewer's left) bent with paw resting casually on hip, left arm (viewer's right) raised with paw tucked gently near the right cheek/bow tie.]
Props: [None.]
Expression: [Open left eye, winking right eye. Change with every occasion: eyes, mouth and brows must match the mood.]
Outfit: [None by default. Cap is a she. Formal occasions like weddings get a dress, e.g. a flat #55263D party dress with puff sleeves and a knee-length flared skirt. Bow tie stays at the collar.]
Body language: [Change with every occasion together with the expression. Never reuse the reference pose.]
Framing: [Full-body centered shot with generous #F4EBE3 margin around the character and #D5CBC3 ground shadow beneath feet.]
```
![Cap reference](cap-reference.jpg)
