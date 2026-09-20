// Give every rendered Mermaid diagram pan + zoom: mouse-wheel, drag, and
// two-finger pinch on touch. A small toolbar (zoom in / out / reset) sits above
// the diagram instead of over it, so it never covers the content.
//
// The astro-mermaid integration renders each diagram by replacing the
// <pre class="mermaid"> body with an <svg> and setting data-processed="true";
// we wait for that, then take over the SVG's transform ourselves.

const ZOOM_STEP = 1.25;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 10;
const WHEEL_SENSITIVITY = 0.0015;
// Room to pinch and pan on a phone: roughly two and a half fingertips side by
// side. A fingertip touch target is ~44-48px, so 2.5 of them is ~120px; use a
// little more so a pinch never starts hard against an edge.
const MIN_VIEWPORT_HEIGHT = 120;
const MAX_VIEWPORT_HEIGHT = 420;

interface View {
  scale: number;
  x: number;
  y: number;
}

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

// Mermaid centres a diagram's title (e.g. a gantt's titleText) over the whole
// canvas, and does so in its own CSS. We anchor the initial view to the
// top-left, which would leave a centred title off-screen on a phone, so pin it
// to the left edge with an inline style that beats mermaid's stylesheet.
// Idempotent, and re-run on every scan because a theme change re-renders the
// SVG, restoring mermaid's centred title.
function alignTitle(svg: SVGSVGElement): void {
  svg.querySelectorAll("text.titleText, text.ganttTitle, text.chartTitle").forEach((title) => {
    title.setAttribute("x", "0");
    title.removeAttribute("transform");
    (title as SVGTextElement).style.setProperty("text-anchor", "start", "important");
  });
}

function enhance(pre: Element): void {
  const svg = pre.querySelector("svg") as SVGSVGElement | null;
  // scan() runs again on every mutation, so guard on the <pre> itself: once it
  // has been moved into a viewport, a parent check no longer sees the wrapper.
  if (!svg || pre.closest(".mermaid-panzoom")) return;

  // The diagram's natural (layout) size, before any transform.
  const vb = svg.getAttribute("viewBox")?.split(/[\s,]+/).map(Number);
  const naturalW = Math.round(
    (vb && vb[2]) || parseFloat(svg.getAttribute("width") ?? "") || svg.clientWidth || 1200,
  );
  const naturalH = Math.round(
    (vb && vb[3]) || parseFloat(svg.getAttribute("height") ?? "") || svg.clientHeight || 400,
  );

  alignTitle(svg);

  // Build: wrapper > toolbar + viewport > pre.mermaid > svg
  const wrap = document.createElement("div");
  wrap.className = "mermaid-panzoom";
  const toolbar = document.createElement("div");
  toolbar.className = "mermaid-panzoom__toolbar";
  const viewport = document.createElement("div");
  viewport.className = "mermaid-panzoom__viewport";

  pre.parentElement?.insertBefore(wrap, pre);
  toolbar.innerHTML = `
    <button type="button" data-pz="out" aria-label="Zoom out" title="Zoom out">−</button>
    <button type="button" data-pz="in" aria-label="Zoom in" title="Zoom in">+</button>
    <button type="button" data-pz="reset" aria-label="Reset view" title="Reset view">Reset</button>
  `;
  wrap.appendChild(toolbar);
  wrap.appendChild(viewport);
  viewport.appendChild(pre);

  // The viewport is the clip window; the SVG keeps its natural size and is
  // moved/scaled with a transform we control. Keep a minimum height so a short,
  // wide diagram still leaves room to pinch and pan.
  viewport.style.height = `${clamp(naturalH, MIN_VIEWPORT_HEIGHT, MAX_VIEWPORT_HEIGHT)}px`;
  (pre as HTMLElement).style.width = `${naturalW}px`;
  (pre as HTMLElement).style.height = `${naturalH}px`;
  (pre as HTMLElement).style.margin = "0";
  (pre as HTMLElement).style.padding = "0";
  svg.style.display = "block";
  svg.style.maxWidth = "none";
  svg.style.transformOrigin = "0 0";
  svg.style.willChange = "transform";

  // view.x/y are the top-left of the scaled diagram relative to the viewport's
  // top-left. (0, 0) anchors the diagram's top-left corner.
  //
  // Pan bounds keep the diagram inside the viewport:
  //   - if it overflows, x/y range over [-overflow, 0] so neither the top-left
  //     nor the bottom-right edge can be dragged past the viewport edge;
  //   - if it fits on an axis, that axis is centred, so a short diagram sits in
  //     the middle of the taller pinch area instead of against the top.
  const view: View = { scale: 1, x: 0, y: 0 };
  const clampAxis = (v: number, scaledSize: number, viewportSize: number) => {
    const overflow = scaledSize - viewportSize;
    return overflow <= 0 ? (viewportSize - scaledSize) / 2 : clamp(v, -overflow, 0);
  };
  const clampX = (x: number) => clampAxis(x, naturalW * view.scale, viewport.clientWidth);
  const clampY = (y: number) => clampAxis(y, naturalH * view.scale, viewport.clientHeight);

  const apply = () => {
    view.x = clampX(view.x);
    view.y = clampY(view.y);
    svg.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  };

  // Reset to the natural (1:1) size. The top-left corner is the anchor for a
  // diagram wider than the viewport; an axis that fits is centred by apply().
  const reset = () => {
    view.scale = 1;
    view.x = 0;
    view.y = 0;
    apply();
  };

  // Zoom about a point given in viewport coordinates.
  const zoomAt = (factor: number, px: number, py: number) => {
    const next = clamp(view.scale * factor, MIN_ZOOM, MAX_ZOOM);
    if (next === view.scale) return;
    const k = next / view.scale;
    // Keep the pinch/wheel focal point anchored: the diagram point under
    // (px, py) stays under (px, py) after scaling.
    view.x = px - (px - view.x) * k;
    view.y = py - (py - view.y) * k;
    view.scale = next;
    apply();
  };

  toolbar.addEventListener("click", (event) => {
    const action = (event.target as HTMLElement).closest<HTMLElement>("[data-pz]")?.dataset.pz;
    if (!action) return;
    if (action === "in") zoomAt(ZOOM_STEP, viewport.clientWidth / 2, viewport.clientHeight / 2);
    if (action === "out") zoomAt(1 / ZOOM_STEP, viewport.clientWidth / 2, viewport.clientHeight / 2);
    if (action === "reset") reset();
  });

  // --- Wheel (desktop) ------------------------------------------------------
  viewport.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * WHEEL_SENSITIVITY);
      zoomAt(factor, event.clientX - rect.left, event.clientY - rect.top);
    },
    { passive: false },
  );

  // --- Pointer: drag to pan, two pointers to pinch --------------------------
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchStart: { distance: number; scale: number; cx: number; cy: number } | null = null;

  const localPoint = (event: PointerEvent) => {
    const rect = viewport.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  viewport.addEventListener(
    "pointerdown",
    (event) => {
      // Ignore the toolbar; only gestures on the diagram pan/zoom.
      if ((event.target as HTMLElement).closest(".mermaid-panzoom__toolbar")) return;
      try {
        viewport.setPointerCapture(event.pointerId);
      } catch {
        // Capture can fail for a synthetic/already-released pointer; the
        // gesture still works via the listeners, so don't abort.
      }
      const p = localPoint(event);
      pointers.set(event.pointerId, p);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchStart = {
          distance: Math.hypot(a.x - b.x, a.y - b.y),
          scale: view.scale,
          cx: (a.x + b.x) / 2,
          cy: (a.y + b.y) / 2,
        };
      }
      viewport.classList.add("is-dragging");
    },
    { passive: true },
  );

  viewport.addEventListener(
    "pointermove",
    (event) => {
      if (!pointers.has(event.pointerId)) return;
      const p = localPoint(event);
      const prev = pointers.get(event.pointerId)!;
      pointers.set(event.pointerId, p);

      if (pointers.size >= 2 && pinchStart) {
        const [a, b] = [...pointers.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchStart.distance > 0) {
          const target = clamp(
            (pinchStart.scale * distance) / pinchStart.distance,
            MIN_ZOOM,
            MAX_ZOOM,
          );
          zoomAt(target / view.scale, pinchStart.cx, pinchStart.cy);
        }
        event.preventDefault();
        return;
      }

      // Single pointer: pan by the drag delta.
      view.x += p.x - prev.x;
      view.y += p.y - prev.y;
      apply();
      event.preventDefault();
    },
    { passive: false },
  );

  const endPointer = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinchStart = null;
    if (pointers.size === 0) viewport.classList.remove("is-dragging");
  };
  viewport.addEventListener("pointerup", endPointer);
  viewport.addEventListener("pointercancel", endPointer);

  window.addEventListener("resize", apply);

  reset();
}

function scan(): void {
  document.querySelectorAll("pre.mermaid[data-processed='true']").forEach((pre) => {
    // enhance() skips a pre already inside a wrapper, but a re-render (theme
    // change) replaces the SVG in place, so re-align the title every pass.
    const svg = pre.querySelector("svg");
    if (svg) alignTitle(svg as SVGSVGElement);
    enhance(pre);
  });
}

const start = () => {
  scan();
  // Rendering is async and re-runs on theme change, so watch for diagrams that
  // become processed after load.
  new MutationObserver(() => scan()).observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ["data-processed"],
  });
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
