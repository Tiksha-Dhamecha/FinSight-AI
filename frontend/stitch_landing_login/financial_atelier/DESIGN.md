```markdown
# Design System Strategy: The Financial Atelier

## 1. Overview & Creative North Star
**The Creative North Star: "The Editorial Ledger"**

This design system moves away from the sterile, "dashboard-in-a-box" aesthetic of traditional fintech. Instead, it adopts the persona of a high-end financial atelier—a space where data is not just processed, but curated with artisanal precision. 

By marrying the authoritative elegance of **Instrumental Serif** with a disciplined, light-mode palette, we achieve a "Digital First, Editorial Always" experience. We break the standard UI grid by leaning into intentional white space, asymmetric type alignments, and a rejection of structural lines in favor of tonal depth. The goal is to make the user feel like they are reading a bespoke financial broadsheet rather than navigating a software application.

---

## 2. Colors & Surface Philosophy
The palette is rooted in professional Navy (`primary_container`), intellectual Teal (`secondary`), and a signature Amber (`tertiary_fixed`) that acts as a highlighter for critical insights.

### The "No-Line" Rule
To maintain the "Atelier" feel, **1px solid borders are strictly prohibited** for sectioning. Structural boundaries must be defined through background color shifts. 
- Use `surface_container_low` for the main background.
- Use `surface_container_lowest` (Pure White) for primary content cards.
- This transition creates a "natural" edge that feels premium and soft, rather than technical and rigid.

### Surface Hierarchy & Nesting
Treat the UI as a series of stacked, fine-paper layers. 
- **Base Level:** `surface` (#f8f9fa).
- **Secondary Level:** `surface_container_low` for sidebar or utility areas.
- **Content Level:** `surface_container_lowest` for the main canvas or active cards.
- **Emphasis Level:** `surface_bright` to draw the eye to specific toolsets.

### The "Glass & Gradient" Rule
For floating modals or global navigation, utilize Glassmorphism. Use `surface` at 80% opacity with a `24px` backdrop blur. For main CTAs, do not use flat colors; instead, apply a subtle linear gradient from `primary` (#000000) to `primary_container` (#001b3d) at a 135-degree angle to provide "soul" and depth.

---

## 3. Typography
The typography is the cornerstone of this system. It balances the legacy of finance with the fluidity of modern technology.

| Role | Token | Font Family | Size | Character |
| :--- | :--- | :--- | :--- | :--- |
| **Display** | `display-lg` | Instrumental Serif | 3.5rem | High-contrast, editorial authority. |
| **Headline**| `headline-md`| Instrumental Serif | 1.75rem | Sophisticated section titling. |
| **Title**   | `title-lg`    | Manrope | 1.375rem | Semi-bold, modern sans-serif clarity. |
| **Body**    | `body-md`     | Manrope | 0.875rem | Highly legible, neutral, and clean. |
| **Label**   | `label-sm`    | Manrope | 0.6875rem | Uppercase with 0.05em tracking for data. |

**The Hierarchy Strategy:** Use `Instrumental Serif` for all "narrative" elements (headers, quotes, large data highlights) and `Manrope` for all "functional" elements (data tables, labels, button text). This creates a clear distinction between the *story* of the data and the *utility* of the interface.

---

## 4. Elevation & Depth
We eschew traditional drop shadows for **Tonal Layering**.

- **The Layering Principle:** Depth is achieved by "stacking." A `surface_container_lowest` card placed on a `surface_container_low` background creates a soft, natural lift without the "dirty" look of grey shadows.
- **Ambient Shadows:** Only use shadows for high-priority floating elements (e.g., a dropdown menu). Use a 32px blur with 4% opacity, tinted with `primary_container` (#001b3d) to mimic natural ambient light.
- **The "Ghost Border" Fallback:** If a border is required for accessibility, use `outline_variant` at **15% opacity**. Never use a 100% opaque border.
- **Glassmorphism:** Apply a `12px` backdrop blur to any element using the `surface_tint` to ensure the background color bleeds through, softening the edges of the UI.

---

## 5. Components

### Buttons
- **Primary:** Gradient fill (`primary` to `primary_container`), white text, `lg` (0.5rem) rounded corners.
- **Secondary:** `surface_container_high` background with `on_secondary_container` (Teal) text. No border.
- **Tertiary:** Pure text with `primary` color and an underlined hover state.

### Cards & Lists
**Strict Rule:** No dividers. 
- Use the **Spacing Scale `8` (2rem)** to separate list items or use alternating background shifts (`surface` to `surface_container_low`). 
- Card radius is globally set to **`lg` (0.5rem / 8px)** to harmonize with the "Atelier" aesthetic.

### Input Fields
- Background: `surface_container_lowest`.
- Border: "Ghost Border" (`outline_variant` at 15%).
- Focus State: Border increases to 100% opacity `secondary` (Teal) with a `2px` inner glow.

### The "Insight Chip" (Custom Component)
- A specialized chip for fintech data. Use `tertiary_fixed` (Amber) background with `on_tertiary_fixed` text. This provides a high-contrast "callout" for trends or alerts within a sea of navy and teal.

---

## 6. Do's and Don'ts

### Do
- **Do** use asymmetric layouts. Align a headline to the left and the body text to a slightly offset inner grid to feel like a bespoke magazine.
- **Do** lean into white space. If you think there’s enough space, add one more step from the spacing scale.
- **Do** use `Instrumental Serif` for large numerical data to give it weight and importance.

### Don't
- **Don't** use 1px solid lines to separate content. It breaks the "Atelier" immersion.
- **Don't** use pure black (#000000) for body text; use `on_surface` (#191c1d) to reduce eye strain on the light background.
- **Don't** use the `full` (pill) roundedness for buttons; stick to the `lg` (8px) radius to maintain a professional, architectural feel. 
- **Don't** use heavy shadows. If the surface transition isn't clear enough, adjust the background color, not the shadow.```