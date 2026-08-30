import {
  ArrowDown,
  ArrowUp,
  Calendar,
  Check,
  ClipboardPaste,
  Copy,
  Pencil,
  createElement,
} from "lucide";

type LucideIcon = Parameters<typeof createElement>[0];

/**
 * Lucide ships stroke-based icons sized 24x24. Drop the width/height attributes
 * so the stylesheet stays in charge of the rendered size.
 */
function iconMarkup(icon: LucideIcon) {
  const svg = createElement(icon);
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.setAttribute("aria-hidden", "true");
  return svg.outerHTML;
}

export const COPY_ICON_SVG = iconMarkup(Copy);
export const PASTE_ICON_SVG = iconMarkup(ClipboardPaste);
export const CHECK_ICON_SVG = iconMarkup(Check);
export const CALENDAR_ICON_SVG = iconMarkup(Calendar);
export const EDIT_ICON_SVG = iconMarkup(Pencil);
export const MOVE_UP_ICON_SVG = iconMarkup(ArrowUp);
export const MOVE_DOWN_ICON_SVG = iconMarkup(ArrowDown);
