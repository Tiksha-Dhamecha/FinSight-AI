# Design System Document: The Executive Insight Framework

## 1. Overview & Creative North Star: "The Financial Atelier"
This design system moves away from the "cluttered dashboard" trope of traditional fintech. Our Creative North Star is **The Financial Atelier**—a space that feels bespoke, curated, and quiet. We treat SME business data not as a series of spreadsheets, but as an editorial narrative.

By utilizing high-contrast typography scales and intentional asymmetry, we break the "template" look. We favor breathing room over density, and tonal layering over structural lines. The goal is to make a business owner feel like they are reading a premium financial journal specifically written for them, rather than navigating a database.

---

## 2. Colors & Surface Philosophy
The palette is rooted in an authoritative Deep Navy, balanced by a "Health" spectrum that communicates status without being jarring.

### Color Tokens
* **Primary (Brand Power):** `primary` (#041627) and `primary_container` (#1a2b3c). Use these for high-level branding and primary actions.
* **Secondary (Growth/Success):** `secondary` (#006d3d). Reserved for positive trends and "Healthy" status indicators.
* **Tertiary (The Alert System):** `tertiary_fixed` (#fbbc00) for warnings and `error` (#ba1a1a) for critical anomalies.
* **Neutral (The Canvas):** `background` (#f7f9fc) and the `surface` suite.

### The "No-Line" Rule
**Strict Mandate:** Designers are prohibited from using 1px solid borders to section content. Boundaries must be defined through background color shifts. A `surface_container_low` section sitting on a `surface` background is the standard for separation.

### The "Glass & Gradient" Rule
To inject "soul" into the UI, use subtle linear gradients (e.g., `primary` to `primary_container`) for main CTAs. For floating panels or modal overlays, apply **Glassmorphism**: use `surface_container_lowest` at 80% opacity with a `20px` backdrop-blur. This ensures the UI feels like a single, integrated environment rather than a series of pasted boxes.

---

## 3. Typography: Editorial Authority
We pair **Newsreader** for high-impact displays with **Inter** for data density. This contrast signals the difference between "The Big Picture" and "The Granular Detail."

* **Display (Newsreader):** Use `display-lg` (3.5rem) for hero metrics like Total Net Worth. It should feel aggressive and confident.
* **Headline (Newsreader):** Use `headline-sm` (1.5rem) for card titles. It provides an editorial "masthead" feel to every module.
* **Body & Labels (Inter):** Use `body-md` (0.875rem) for general insights and `label-sm` (0.6875rem) for micro-data. Inter’s high x-height ensures legibility even when data density is high.

---

## 4. Elevation & Depth: Tonal Layering
We do not use shadows to create hierarchy; we use **Tonal Stacking**.

* **The Layering Principle:** Treat the UI as physical sheets of paper.
* Level 0: `background` (#f7f9fc)
* Level 1: `surface_container_low` (Section backgrounds)
* Level 2: `surface_container_lowest` (Individual Cards)
* **Ambient Shadows:** If a card must "float" (e.g., a hover state), use a shadow with a 32px blur, 4% opacity, tinted with the `primary` color (#041627). Never use pure black shadows.
* **The "Ghost Border" Fallback:** If accessibility requires a container edge, use `outline_variant` at 15% opacity. It should be felt, not seen.

---

## 5. Components & Primitives

### Buttons
* **Primary:** A soft gradient from `primary` to `primary_container`. Roundedness: `md` (0.75rem).
* **Secondary:** No background, `outline` token at 20% opacity.
* **Tertiary/Ghost:** Text only, using `primary` color, with a `surface_variant` hover state.

### Sophisticated Dashboard Cards
Forbid the use of dividers. Use the Spacing Scale `8` (1.75rem) to separate the headline from the content. The card itself should use `surface_container_lowest` with a corner radius of `lg` (1rem).

### Status Badges (The Growth Indicator)
Badges should not be "pills" with high-contrast backgrounds. Use a subtle `secondary_container` background with `on_secondary_container` text. The shape should be a "soft square" (radius: `sm`) to distinguish from interactive buttons.

### Elegant Charts
* **Line Charts:** Use a 3px stroke width for the primary data line.
* **Area Charts:** Use a gradient fill from `secondary` (at 20% opacity) to transparent.
* **Grid Lines:** Must use `outline_variant` at 10% opacity. If the data is clear, remove Y-axis lines entirely to favor the "Editorial" look.

---

## 6. Do’s and Don’ts

### Do:
* **Embrace Negative Space:** Use spacing token `12` or `16` between major modules.
* **Use Intentional Asymmetry:** Align high-level insights to the left and secondary meta-data to the far right to create a sophisticated visual path.
* **Color as Meaning:** Only use `secondary` (Teal) for actual growth. Never use it for aesthetic decoration.

### Don’t:
* **Don't Use Dividers:** Never use a horizontal rule `<hr>` to separate list items. Use a 0.5rem background shift or vertical padding.
* **Don't Use Pure White:** Avoid `#FFFFFF` for large backgrounds; use `background` (#f7f9fc) to reduce eye strain and feel more "premium paper."
* **Don't Over-Round:** Stick to the `8px-12px` range for cards. Going higher (e.g., 24px) makes the platform look like a consumer toy rather than a professional SME tool.