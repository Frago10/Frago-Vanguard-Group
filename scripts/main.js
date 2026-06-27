/* ============================================================
   FRAGO VANGUARD GROUP — INTERACTION LAYER
   Strategy: render-blocking work runs immediately on DOM ready;
   heavy modules (Three.js, Lenis) load lazily after first paint
   so the page is visible & interactive in <300ms.
   ============================================================ */

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isCoarse = window.matchMedia("(pointer: coarse)").matches;

/* ───────────────  Preloader — hide on DOMContentLoaded OR 700ms max  ─────────────── */
const hidePreloader = () => {
  const pre = document.getElementById("preloader");
  if (!pre || pre.dataset.hidden) return;
  pre.dataset.hidden = "1";
  pre.classList.add("is-hidden");
  setTimeout(() => pre.remove(), 700);
};
if (document.readyState !== "loading") {
  requestAnimationFrame(hidePreloader);
} else {
  document.addEventListener("DOMContentLoaded", () => {
    requestAnimationFrame(hidePreloader);
  });
}
// Hard cap: never block longer than 800ms regardless of fonts/scripts
setTimeout(hidePreloader, 800);

/* ───────────────  TEXT SCRAMBLE — @webloved-style reveal  ───────────────
   Letters cycle through random characters before settling left-to-right
   into the final string. Subtle, premium, signature agency move.
   - Only triggers once per element (via IntersectionObserver).
   - Walks text nodes so element children (spans, em, etc.) are preserved.
   - Skips spaces and punctuation that should not flicker. */
const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789·/+•◆⟡";
const SCRAMBLE_SKIP = /[\s.,;:()\-—–·/+]/;  // never flicker these glyphs

const initScramble = () => {
  if (reducedMotion) return;
  const targets = document.querySelectorAll("[data-scramble]");
  if (targets.length === 0) return;

  const randomChar = () =>
    SCRAMBLE_CHARS[(Math.random() * SCRAMBLE_CHARS.length) | 0];

  const scramble = (root, stagger) => {
    // Collect text nodes + precompute per-char skip mask & lock time.
    // Doing this once (vs per frame) eliminates the regex test from the hot path.
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const items = [];
    let charIdx = 0;
    let n;
    while ((n = walker.nextNode())) {
      if (!n.nodeValue.trim()) continue;
      const text = n.nodeValue;
      const len = text.length;
      const skip = new Uint8Array(len);
      const lock = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        skip[i] = SCRAMBLE_SKIP.test(text[i]) ? 1 : 0;
        lock[i] = 180 + charIdx * stagger; // settleDelay (180) + cumulative stagger
        charIdx++;
      }
      items.push({ node: n, text, len, skip, lock, buf: new Array(len) });
    }
    if (items.length === 0) return;
    const totalDuration = 180 + charIdx * stagger + 80;
    const start = performance.now();

    const tick = (now) => {
      const elapsed = now - start;
      for (const it of items) {
        for (let i = 0; i < it.len; i++) {
          it.buf[i] =
            it.skip[i] || elapsed >= it.lock[i] ? it.text[i] : randomChar();
        }
        it.node.nodeValue = it.buf.join("");
      }
      if (elapsed < totalDuration) requestAnimationFrame(tick);
      else for (const it of items) it.node.nodeValue = it.text;
    };
    requestAnimationFrame(tick);
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const stagger = parseFloat(entry.target.dataset.scrambleStagger) || 38;
        scramble(entry.target, stagger);
        // Add .is-in so adjacent CSS animations (accent rules, etc.) trigger
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      }
    },
    { threshold: 0.5, rootMargin: "0px 0px -40px 0px" }
  );
  targets.forEach((el) => io.observe(el));
};

/* ───────────────  Scroll reveal observer (runs immediately, lightweight)  ─────────────── */
const initReveals = () => {
  const revealItems = document.querySelectorAll(
    "[data-reveal], [data-pillar], [data-bento], [data-step], [data-stat], [data-card]"
  );
  if (!("IntersectionObserver" in window)) {
    revealItems.forEach((el) => el.classList.add("is-in"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const siblings = Array.from(el.parentElement?.children || []);
          const idx = siblings.indexOf(el);
          const delay = Math.min(idx * 70, 420);
          el.style.transitionDelay = `${delay}ms`;
          el.classList.add("is-in");
          io.unobserve(el);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
  );
  revealItems.forEach((el) => io.observe(el));
};

/* Inject reveal init styles */
const styleTag = document.createElement("style");
styleTag.textContent = `
  [data-pillar], [data-bento], [data-step], [data-stat], [data-card] {
    opacity: 0;
    transform: translateY(28px);
    transition: opacity 900ms var(--ease-out-expo), transform 900ms var(--ease-out-expo);
    will-change: opacity, transform;
  }
  [data-pillar].is-in, [data-bento].is-in, [data-step].is-in,
  [data-stat].is-in, [data-card].is-in {
    opacity: 1;
    transform: translateY(0);
  }
`;
document.head.appendChild(styleTag);

/* ───────────────  Odometer (Stripe-style digit-roll counters)  ─────────────── */
const initCounters = () => {
  const sources = document.querySelectorAll("[data-count]");
  if (sources.length === 0) return;

  /* For each source, build an inline odometer scaffold. Every digit
     becomes a slot with a vertical 0-9 rail; thousands separators
     are inserted as fixed text. Initial state: all slots at "0". */
  const buildOdometer = (host) => {
    const target = parseInt(host.dataset.count, 10);
    if (!Number.isFinite(target)) return null;

    const formatted = Math.abs(target).toLocaleString("en-US");
    // Reset host element to an odometer container
    host.classList.add("odometer");
    host.textContent = "";

    const digits = [];
    for (const ch of formatted) {
      if (ch >= "0" && ch <= "9") {
        const slot = document.createElement("span");
        slot.className = "odometer__slot";
        slot.setAttribute("data-digit", "0");
        const rail = document.createElement("span");
        rail.className = "odometer__rail";
        // 0-9 stacked vertically
        for (let i = 0; i <= 9; i++) {
          const d = document.createElement("span");
          d.textContent = String(i);
          rail.appendChild(d);
        }
        slot.appendChild(rail);
        host.appendChild(slot);
        digits.push({ slot, finalDigit: 0 });
        // Track index in the digits array (we'll map to actual target digit later)
      } else {
        // Separator (comma) — fixed text, no rail
        const sep = document.createElement("span");
        sep.className = "odometer__sep";
        sep.textContent = ch;
        host.appendChild(sep);
      }
    }

    // Map the formatted target string back onto our digit slots
    const targetStr = formatted;
    let digitIdx = 0;
    for (const ch of targetStr) {
      if (ch >= "0" && ch <= "9") {
        digits[digitIdx].finalDigit = Number(ch);
        digitIdx++;
      }
    }
    return { host, digits };
  };

  const odometers = [];
  sources.forEach((el) => {
    const o = buildOdometer(el);
    if (o) odometers.push(o);
  });

  /* Reveal: when an odometer enters the viewport, set each slot's
     data-digit to its final value. CSS handles the smooth roll-up
     with right-to-left stagger (units land first, then tens, etc.). */
  if (!("IntersectionObserver" in window)) {
    odometers.forEach(({ digits }) =>
      digits.forEach((d) => d.slot.setAttribute("data-digit", String(d.finalDigit)))
    );
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const odo = odometers.find((o) => o.host === entry.target);
        if (!odo) return;
        odo.digits.forEach((d) => {
          d.slot.setAttribute("data-digit", String(d.finalDigit));
        });
        io.unobserve(entry.target);
      });
    },
    { threshold: 0.35, rootMargin: "0px 0px -60px 0px" }
  );
  odometers.forEach((o) => io.observe(o.host));
};

/* ───────────────  Nav scroll state + active link + rail sync  ─────────────── */
const initNav = () => {
  const nav = document.getElementById("nav");
  const rail = document.getElementById("rail");
  const sections = Array.from(document.querySelectorAll("section[id]"));
  const linksByHash = new Map();
  document.querySelectorAll(".nav__links a[data-link]").forEach((a) => {
    linksByHash.set(a.getAttribute("href"), a);
  });

  // Rail-specific link map (supports #top → hero section)
  const railLinks = Array.from(document.querySelectorAll(".rail__link[data-rail-link]"));
  const railMap = new Map();
  railLinks.forEach((a) => {
    const sec = a.dataset.section;
    // "top" maps to the hero section
    railMap.set(sec === "top" ? "hero" : sec, a);
  });

  // Reveal rail after first frame
  if (rail) requestAnimationFrame(() => rail.classList.add("is-ready"));

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      const docH = document.documentElement.scrollHeight - window.innerHeight;
      const progress = docH > 0 ? Math.max(0, Math.min(1, y / docH)) : 0;

      if (nav) nav.classList.toggle("is-scrolled", y > 32);
      if (rail) rail.style.setProperty("--rail-progress", `${progress * 100}%`);

      // Determine the active section: the one whose midline is closest
      // to the viewport's 40% mark (matches navbar feel)
      let active = null;
      for (const s of sections) {
        const r = s.getBoundingClientRect();
        if (
          r.top <= window.innerHeight * 0.4 &&
          r.bottom >= window.innerHeight * 0.4
        ) {
          active = s.id;
          break;
        }
      }

      // Sync top nav
      linksByHash.forEach((a, hash) => {
        a.classList.toggle("is-active", hash === `#${active}`);
      });
      // Sync rail
      railMap.forEach((a, sectionId) => {
        a.classList.toggle("is-active", sectionId === active);
      });

      ticking = false;
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
};

/* ───────────────  Magnetic hover spotlight (bento + pillar)  ─────────────── */
const initSpotlight = () => {
  if (isCoarse) return; // skip on touch
  const targets = document.querySelectorAll(".bento__card, .pillar");
  targets.forEach((el) => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const mx = ((e.clientX - r.left) / r.width) * 100;
      const my = ((e.clientY - r.top) / r.height) * 100;
      el.style.setProperty("--mx", `${mx}%`);
      el.style.setProperty("--my", `${my}%`);
    });
  });
};

/* ───────────────  Hero V mark tilt (3D, lightweight CSS transform)  ─────────────── */
const initHeroTilt = () => {
  if (reducedMotion || isCoarse) return;
  const heroMark = document.querySelector("[data-tilt]");
  if (!heroMark) return;
  const target = { x: 0, y: 0 };
  const current = { x: 0, y: 0 };
  const lerp = (a, b, n) => a + (b - a) * n;

  const animate = () => {
    current.x = lerp(current.x, target.x, 0.08);
    current.y = lerp(current.y, target.y, 0.08);
    heroMark.style.setProperty("--tilt-x", `${current.x}deg`);
    heroMark.style.setProperty("--tilt-y", `${current.y}deg`);
    requestAnimationFrame(animate);
  };
  animate();

  let lastMove = performance.now();
  window.addEventListener(
    "pointermove",
    (e) => {
      lastMove = performance.now();
      const dx = (e.clientX - window.innerWidth / 2) / (window.innerWidth / 2);
      const dy = (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2);
      target.y = dx * 12;
      target.x = -dy * 8;
    },
    { passive: true }
  );

  setInterval(() => {
    if (performance.now() - lastMove > 1800) {
      const t = performance.now() / 1500;
      target.y = Math.sin(t) * 4;
      target.x = Math.cos(t) * 3;
    }
  }, 100);
};

/* ───────────────  EXPLORE MODAL — business units  ───────────────
   Opens a glass modal showing the 3 Frago business units. On hover
   of each card, the modal backdrop is "ambientized" in that brand's
   characteristic color (Nexus green, Momentum magenta, FFG gold)
   via the --explore-ambient-c CSS variable. */
const initExploreModal = () => {
  const modal = document.querySelector("[data-explore]");
  const trigger = document.querySelector("[data-explore-trigger]");
  if (!modal || !trigger) return;

  const cards = Array.from(modal.querySelectorAll(".explore__card"));
  const grid = modal.querySelector(".explore__grid");
  const closeEls = modal.querySelectorAll("[data-explore-close]");
  let lastFocus = null;

  const setAmbient = (color) => {
    if (color) {
      modal.style.setProperty("--explore-ambient-c", color);
      modal.setAttribute("data-ambient-on", "");
    } else {
      modal.removeAttribute("data-ambient-on");
      // Don't unset the variable — let the fade-out finish naturally
    }
  };

  const open = () => {
    lastFocus = document.activeElement;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("explore-open");
    // Focus the close button after the open transition starts
    requestAnimationFrame(() => {
      modal.querySelector(".explore__close")?.focus();
    });
  };
  const close = () => {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("explore-open");
    setAmbient(null);
    if (lastFocus && typeof lastFocus.focus === "function") {
      lastFocus.focus();
    }
  };

  trigger.addEventListener("click", open);
  closeEls.forEach((el) => el.addEventListener("click", close));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("is-open")) close();
  });

  // Ambient color theming per card
  cards.forEach((card) => {
    const color = card.style.getPropertyValue("--brand-c-glow").trim();
    card.addEventListener("pointerenter", () => setAmbient(color));
    card.addEventListener("focus", () => setAmbient(color));
  });
  // Reset ambient when leaving the grid entirely (avoids flicker between cards)
  grid?.addEventListener("pointerleave", () => setAmbient(null));
};

/* Old simple locale toggle removed — superseded by full initI18n below.
   The new floating EN/ES pill (data-locale) is owned by initI18n. */

/* ───────────────  Native smooth-scroll for in-page anchors  ─────────────── */
const initAnchors = () => {
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      if (!id || id === "#") return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      // Will be upgraded to Lenis if/when it loads
      if (window.__lenis) {
        window.__lenis.scrollTo(target, { offset: -16, duration: 1.3 });
      } else {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
};

/* ───────────────  CHAR-LEVEL TEXT SPLIT (Apple-style reveal)  ─────────────── */
/* Extracted so locale switching can re-split the hero title after the DOM
   has been replaced with a different language's markup. */
const splitTextRoot = (root) => {
  const lines = root.querySelectorAll(".hero__line");
  let globalIdx = 0;
  lines.forEach((line) => {
    const html = line.innerHTML;
    const tmp = document.createElement("span");
    tmp.innerHTML = html;
    const out = document.createDocumentFragment();

    const wrapChar = (ch, parent) => {
      if (ch === " ") {
        const space = document.createElement("span");
        space.className = "char char--space";
        parent.appendChild(space);
        return;
      }
      const mask = document.createElement("span");
      mask.className = "char-mask";
      const c = document.createElement("span");
      c.className = "char";
      c.textContent = ch;
      c.style.transitionDelay = `${globalIdx * 28}ms`;
      mask.appendChild(c);
      parent.appendChild(mask);
      globalIdx++;
    };

    Array.from(tmp.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        [...node.textContent].forEach((ch) => wrapChar(ch, out));
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const wrapper = node.cloneNode(false);
        [...node.textContent].forEach((ch) => wrapChar(ch, wrapper));
        out.appendChild(wrapper);
      }
    });
    line.innerHTML = "";
    line.appendChild(out);
  });
};

const initSplitText = () => {
  document.querySelectorAll("[data-split-text]").forEach((root) => {
    splitTextRoot(root);
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            root.querySelectorAll(".char").forEach((c) => c.classList.add("is-in"));
            obs.disconnect();
          }
        });
      },
      { threshold: 0.2 }
    );
    obs.observe(root);
  });
};

/* ───────────────  CURSOR TRAIL — fading particles behind pointer  ───────────────
   Lightweight 2D canvas. On pointermove (throttled to ~60fps) emits one
   particle at the cursor position. Each frame, particles decay in
   opacity and drift slightly. Additive blend on screen-mode canvas. */
const initCursorTrail = () => {
  if (reducedMotion || isCoarse) return;
  const canvas = document.createElement("canvas");
  canvas.className = "cursor-trail";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  let dpr = 1, w = 0, h = 0;
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener("resize", resize);

  const MAX = 70;
  const particles = [];
  let lastEmit = 0;
  const EMIT_THROTTLE = 14; // ms

  window.addEventListener(
    "pointermove",
    (e) => {
      const now = performance.now();
      if (now - lastEmit < EMIT_THROTTLE) return;
      lastEmit = now;
      particles.push({
        x: e.clientX,
        y: e.clientY,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4 - 0.1, // slight upward bias
        life: 1,
        decay: 0.022 + Math.random() * 0.018,
        r: 1.4 + Math.random() * 1.6,
        brand: Math.random() < 0.3,
      });
      if (particles.length > MAX) particles.shift();
    },
    { passive: true }
  );

  // Pause when window not focused / tab hidden
  let visible = true;
  document.addEventListener("visibilitychange", () => {
    visible = !document.hidden;
  });

  const tick = () => {
    if (visible) {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= p.decay;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        p.x += p.vx;
        p.y += p.vy;
        const a = p.life * 0.55;
        ctx.fillStyle = p.brand
          ? `rgba(120, 160, 255, ${a})`
          : `rgba(240, 244, 255, ${a * 0.45})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    requestAnimationFrame(tick);
  };
  tick();
};

/* ───────────────  CUSTOM MAGNETIC CURSOR  ─────────────── */
const initCursor = () => {
  if (isCoarse || reducedMotion) return;
  const cursor = document.getElementById("cursor");
  if (!cursor) return;
  document.documentElement.classList.add("has-custom-cursor");

  const pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const target = { x: pos.x, y: pos.y };
  let ready = false;

  window.addEventListener(
    "pointermove",
    (e) => {
      target.x = e.clientX;
      target.y = e.clientY;
      if (!ready) {
        ready = true;
        cursor.classList.add("is-ready");
      }
    },
    { passive: true }
  );
  window.addEventListener("pointerleave", () => cursor.classList.remove("is-ready"));
  window.addEventListener("pointerenter", () => cursor.classList.add("is-ready"));

  const render = () => {
    pos.x += (target.x - pos.x) * 0.22;
    pos.y += (target.y - pos.y) * 0.22;
    cursor.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%)`;
    requestAnimationFrame(render);
  };
  render();

  const setState = (cls, label) => {
    cursor.classList.remove("is-link", "is-button", "is-text");
    if (cls) cursor.classList.add(cls);
    const lbl = cursor.querySelector("[data-cursor-label]");
    if (lbl && label) lbl.textContent = label;
  };

  // Delegate hover detection
  document.addEventListener("pointerover", (e) => {
    const btn = e.target.closest(".btn--primary, [data-magnetic].btn--primary");
    const ghost = e.target.closest(".btn--ghost, button, a.btn");
    const card = e.target.closest(".card, .bento__card, .pillar");
    const link = e.target.closest("a:not(.btn), .nav__links a");
    const text = e.target.closest("p, h1, h2, h3, input, textarea, label");

    if (btn) setState("is-button", btn.dataset.cursorLabel || "Engage");
    else if (ghost) setState("is-link");
    else if (card) setState("is-link");
    else if (link) setState("is-link");
    else if (text && !card && !btn) setState("is-text");
    else setState(null);
  });
};

/* ───────────────  MAGNETIC BUTTONS  ─────────────── */
const initMagnetic = () => {
  if (isCoarse || reducedMotion) return;
  document.querySelectorAll("[data-magnetic]").forEach((el) => {
    const strength = parseFloat(el.dataset.magneticStrength) || 0.32;
    const inner = el.firstElementChild;
    let raf;
    const reset = () => {
      el.style.transform = "";
      if (inner) inner.style.transform = "";
    };
    el.addEventListener("pointerenter", () => {
      if (raf) cancelAnimationFrame(raf);
    });
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - (r.left + r.width / 2);
      const y = e.clientY - (r.top + r.height / 2);
      el.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
      if (inner) inner.style.transform = `translate(${x * strength * 0.4}px, ${y * strength * 0.4}px)`;
    });
    el.addEventListener("pointerleave", () => {
      reset();
    });
  });
};

/* ───────────────  HERO AMBIENT FLOW FIELD  ───────────────
   A dedicated 2D canvas behind the hero V. Particles drift through
   a noise-driven vector field, leaving brand-colored trails. The
   cursor pushes the field locally — a soft repulsion creates an
   organic "wake" around the pointer. Paused when scrolled offscreen. */
const initHeroFlow = () => {
  if (reducedMotion) return;
  const hero = document.getElementById("hero");
  if (!hero) return;

  const canvas = document.createElement("canvas");
  canvas.className = "hero__flow";
  canvas.setAttribute("aria-hidden", "true");
  hero.insertBefore(canvas, hero.firstChild);
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  let w = 0, h = 0, dpr = 1;
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Canvas spans full viewport width (escapes the .hero container)
    w = Math.max(1, Math.floor(window.innerWidth));
    h = Math.max(1, Math.floor(hero.getBoundingClientRect().height));
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(hero);
  window.addEventListener("resize", resize);

  /* Cheap pseudo-noise (no perlin lib needed) — sum of sinusoids
     yields a flow field that looks organic enough for our use. */
  const noiseAngle = (x, y, t) => {
    const a = Math.sin(x * 0.0042 + t * 0.21)
            + Math.cos(y * 0.0055 - t * 0.18)
            + Math.sin((x + y) * 0.003 + t * 0.34);
    return a * 1.1;
  };

  const COUNT = window.innerWidth < 768 ? 80 : 160;
  const TAIL_FADE = 0.07;       // background overlay alpha per frame (lower = longer trails)
  const FIELD_STRENGTH = 0.22;  // how strongly the field steers
  const DAMPING = 0.93;
  const MOUSE_RADIUS = 160;
  const MOUSE_FORCE = 0.7;

  const particles = new Array(COUNT);
  const spawn = (p) => {
    p.x = Math.random() * w;
    p.y = Math.random() * h;
    p.vx = (Math.random() - 0.5) * 0.4;
    p.vy = (Math.random() - 0.5) * 0.4;
    p.life = 220 + Math.random() * 320;
    p.maxLife = p.life;
    // 22% chance brand blue, 78% silver/white — keeps it sober
    p.brand = Math.random() < 0.22;
    p.weight = 0.5 + Math.random() * 0.9;
  };
  for (let i = 0; i < COUNT; i++) {
    particles[i] = {};
    spawn(particles[i]);
  }

  let mouseX = -9999, mouseY = -9999;
  const onMove = (e) => {
    // Canvas is full viewport width, positioned with left:50% + translateX
    // → mouseX is just clientX. mouseY needs offset for the canvas top.
    const r = canvas.getBoundingClientRect();
    mouseX = e.clientX - r.left;
    mouseY = e.clientY - r.top;
  };
  const onLeave = () => { mouseX = mouseY = -9999; };
  // Listen on the canvas's bounding region — but pointer-events:none on
  // .hero__flow means events pass through. So we listen on the hero instead.
  hero.addEventListener("pointermove", onMove, { passive: true });
  hero.addEventListener("pointerleave", onLeave);

  // Visibility: pause render when hero leaves viewport entirely
  let active = true;
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => { active = e.isIntersecting; }),
    { threshold: 0.01 }
  );
  io.observe(hero);

  /* Smooth scroll-linked fade: opacity goes from 0.92 → 0 as the user
     scrolls through the hero. By 70% through the hero it's fully gone,
     leaving only the global neural-network constellation behind. */
  let fadeTicking = false;
  const updateFade = () => {
    if (fadeTicking) return;
    fadeTicking = true;
    requestAnimationFrame(() => {
      const r = hero.getBoundingClientRect();
      const heroH = hero.offsetHeight;
      const scrolled = Math.max(0, -r.top);
      const progress = heroH > 0 ? Math.min(1, scrolled / (heroH * 0.7)) : 0;
      const o = (1 - progress) * 0.92;
      canvas.style.setProperty("--flow-opacity", o.toFixed(3));
      fadeTicking = false;
    });
  };
  window.addEventListener("scroll", updateFade, { passive: true });
  updateFade();

  let t = 0;
  const tick = () => {
    if (active) {
      t += 0.016;

      // Tail fade — paint a soft dark overlay so trails dissolve
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = `rgba(10, 10, 11, ${TAIL_FADE})`;
      ctx.fillRect(0, 0, w, h);

      // Particle layer
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < COUNT; i++) {
        const p = particles[i];

        // Field force
        const a = noiseAngle(p.x, p.y, t) * Math.PI;
        p.vx += Math.cos(a) * FIELD_STRENGTH * p.weight;
        p.vy += Math.sin(a) * FIELD_STRENGTH * p.weight * 0.7; // less vertical drift

        // Mouse repulsion (creates a "wake" around the cursor)
        const dx = mouseX - p.x;
        const dy = mouseY - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < MOUSE_RADIUS * MOUSE_RADIUS && d2 > 1) {
          const d = Math.sqrt(d2);
          const f = ((MOUSE_RADIUS - d) / MOUSE_RADIUS) * MOUSE_FORCE;
          p.vx -= (dx / d) * f;
          p.vy -= (dy / d) * f;
        }

        p.vx *= DAMPING;
        p.vy *= DAMPING;

        const px = p.x;
        const py = p.y;
        p.x += p.vx;
        p.y += p.vy;
        p.life--;

        if (p.life <= 0 || p.x < -10 || p.x > w + 10 || p.y < -10 || p.y > h + 10) {
          spawn(p);
          continue;
        }

        const lifeAlpha = Math.min(1, p.life / p.maxLife) * 0.55;
        const stroke = p.brand
          ? `rgba(120, 160, 255, ${lifeAlpha})`
          : `rgba(240, 244, 255, ${lifeAlpha * 0.55})`;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = p.weight * 0.9;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    }
    requestAnimationFrame(tick);
  };
  tick();
};

/* ───────────────  OVERSIZED LOCKUP PARALLAX  ─────────────── */
const initLockupParallax = () => {
  if (reducedMotion) return;
  const lockup = document.querySelector(".lockup");
  if (!lockup) return;

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const r = lockup.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 when the section center sits at the viewport center
      // -1 when the section is fully above viewport center
      // +1 when the section is fully below viewport center
      const sectionCenter = r.top + r.height / 2;
      const offset = (sectionCenter - vh / 2) / vh;
      const clamped = Math.max(-1.2, Math.min(1.2, offset));
      lockup.style.setProperty("--lockup-scroll", clamped.toFixed(3));
      ticking = false;
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
};

/* Module-level: shared smoothed scroll velocity (signed px/ms).
   Read by initVelocityMarquee. Updated by initScrollSkew on every frame. */
let __scrollVelocity = 0;

/* ───────────────  VELOCITY-BASED SCROLL SKEW (Apple-style)  ─────────────── */
const initScrollSkew = () => {
  if (reducedMotion) return;

  const root = document.documentElement;
  let lastY = window.scrollY;
  let lastTime = performance.now();
  let velocity = 0;        // raw px/ms (signed)
  let smoothed = 0;        // smoothed value
  let lastApplied = 0;     // last value written to CSS

  const MAX_SKEW = 1.2;           // degrees, hard cap
  const VELOCITY_TO_DEG = 0.55;   // px/ms → deg scaling factor
  const SMOOTH = 0.14;             // smoothing toward velocity
  const DECAY = 0.86;              // velocity decay per frame (~60fps)
  const EPSILON = 0.005;           // skip writes below this threshold

  const tick = () => {
    const y = window.scrollY;
    const t = performance.now();
    const dt = t - lastTime;

    if (dt > 0) {
      // Instantaneous velocity, clamped to ±3 px/ms to ignore mouse-wheel
      // bursts and trackpad fling spikes that look unnatural.
      const v = Math.max(-3, Math.min(3, (y - lastY) / dt));
      velocity = v;
    }
    lastY = y;
    lastTime = t;

    smoothed += (velocity - smoothed) * SMOOTH;
    velocity *= DECAY; // decay back toward zero when scrolling stops

    // Expose the smoothed velocity for other modules (marquee boost)
    __scrollVelocity = smoothed;

    // Skew DIRECTION: scrolling down tilts content so the right side
    // lifts (negative skewY in standard CSS) — feels like leaning into motion.
    let skew = -smoothed * VELOCITY_TO_DEG;
    if (skew > MAX_SKEW) skew = MAX_SKEW;
    if (skew < -MAX_SKEW) skew = -MAX_SKEW;

    // Only write when the change is perceptible — saves style invalidations
    if (Math.abs(skew - lastApplied) > EPSILON) {
      root.style.setProperty("--scroll-skew", `${skew.toFixed(3)}deg`);
      lastApplied = skew;
    }

    requestAnimationFrame(tick);
  };
  tick();
};

/* ───────────────  VELOCITY-DRIVEN MARQUEE  ───────────────
   Replaces the CSS marquee animation with JS-driven transform.
   Base drift speed at idle, multiplied by scroll velocity for a
   "boost" sensation when the user scrolls fast. Decays naturally
   back to idle. Always continuous — never restarts. */
const initVelocityMarquee = () => {
  if (reducedMotion) return;
  const track = document.querySelector(".marquee__track");
  if (!track) return;

  // Mark JS-driven so the CSS animation defers
  track.setAttribute("data-js-driven", "");
  track.style.animation = "none";

  let offset = 0;
  let halfWidth = 0;
  const measure = () => {
    // The track repeats its content visually — by translating up to
    // -halfWidth and wrapping back to 0, the loop is seamless.
    halfWidth = track.scrollWidth / 2;
  };
  measure();
  window.addEventListener("resize", measure);
  // The track contains web-fonts; measure once they load
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(measure);
  }

  const IDLE_SPEED = 0.55;       // px/frame at idle (≈ 33 px/s, calm drift)
  const VELOCITY_SCALE = 18;     // multiply scroll velocity into px/frame boost
  const MAX_BOOST = 9;           // hard cap on boost px/frame

  const tick = () => {
    // Boost magnitude is absolute (we always drift left regardless of scroll dir)
    const v = Math.abs(__scrollVelocity);
    const boost = Math.min(MAX_BOOST, v * VELOCITY_SCALE);
    const speed = IDLE_SPEED + boost;

    offset -= speed;
    // Seamless wrap when we've traversed half the track
    if (halfWidth > 0 && offset < -halfWidth) offset += halfWidth;

    track.style.transform = `translate3d(${offset.toFixed(2)}px, 0, 0)`;
    requestAnimationFrame(tick);
  };
  tick();
};

/* ───────────────  CINEMA — horizontal pinned scrollytelling  ───────────────
   Section is tall (height: N×100vh). The inner .cinema__sticky pins at
   top:0 with 100vh height. The .cinema__track inside is wider than viewport
   (N×100vw); we translate it left as the user scrolls vertically, creating
   a camera-pan between panels. Each panel's title and body get a small
   per-panel parallax for depth. */
const initCinema = () => {
  const section = document.getElementById("cinema");
  if (!section) return;
  const track = section.querySelector("[data-cinema-track]");
  const fill = section.querySelector("[data-cinema-fill]");
  const cur = section.querySelector("[data-cinema-cur]");
  const panels = Array.from(section.querySelectorAll(".cinema__panel"));
  if (!track || panels.length === 0) return;

  // Reduced motion: nothing to drive — the CSS @media handles layout
  if (reducedMotion) return;

  const panelCount = panels.length;
  const maxShiftVw = (panelCount - 1) * 100;

  let ticking = false;
  let lastIdx = -1;

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const r = section.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      const scrolled = Math.max(0, Math.min(total, -r.top));
      const progress = total > 0 ? scrolled / total : 0;

      // Translate the track left in vw units
      track.style.transform = `translate3d(-${(progress * maxShiftVw).toFixed(3)}vw, 0, 0)`;

      // Progress fill
      if (fill) fill.style.transform = `scaleX(${progress.toFixed(3)})`;

      // Current panel number — only update DOM when it changes
      const idx = Math.min(panelCount - 1, Math.floor(progress * panelCount));
      if (idx !== lastIdx) {
        lastIdx = idx;
        if (cur) cur.textContent = String(idx + 1).padStart(2, "0");
        // Per-panel parallax: each panel's content shifts slightly based
        // on its sub-progress (0..1 within its own panel slice).
        const sub = progress * panelCount - idx;
        const shift = (sub - 0.5) * 40; // ±20px
        panels[idx].style.setProperty("--panel-shift", `${shift.toFixed(1)}px`);
      } else {
        const sub = progress * panelCount - idx;
        const shift = (sub - 0.5) * 40;
        panels[idx].style.setProperty("--panel-shift", `${shift.toFixed(1)}px`);
      }

      ticking = false;
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
};

/* ───────────────  PINNED MANIFESTO (4 stages × 100vh)  ─────────────── */
const initPinnedManifesto = () => {
  const section = document.getElementById("manifesto");
  if (!section) return;
  const sticky = section.querySelector(".pinned__sticky");
  const mark = section.querySelector(".pinned__mark");
  const stages = Array.from(section.querySelectorAll(".pinned__stage"));
  const tags = Array.from(section.querySelectorAll(".pinned__mark-tags li"));
  const fill = section.querySelector(".pinned__progress-fill");
  const currentNum = section.querySelector("[data-pinned-current]");

  if (!sticky || !mark || stages.length === 0) return;

  // If user prefers reduced motion: skip the pinning entirely.
  // Collapse the tall section to natural content height so stages stack visibly.
  if (reducedMotion) {
    section.style.height = "auto";
    sticky.style.position = "static";
    sticky.style.height = "auto";
    stages.forEach((s) => {
      s.style.position = "relative";
      s.style.opacity = "1";
      s.style.transform = "none";
    });
    return;
  }

  const stageCount = stages.length;
  let ticking = false;

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const r = section.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      const scrolled = Math.max(0, Math.min(total, -r.top));
      const progress = total > 0 ? scrolled / total : 0;

      // 3D rotation: 360° across the full section, plus subtle X tilt
      // for parallax depth. Scale dips at midpoints for "alive" feel.
      const rotY = progress * 360;
      const rotX = Math.sin(progress * Math.PI * 2) * 8;
      const scaleBump = 1 + Math.sin(progress * Math.PI) * 0.04;
      mark.style.setProperty("--mark-rotate-y", `${rotY}deg`);
      mark.style.setProperty("--mark-rotate-x", `${rotX}deg`);
      mark.style.setProperty("--mark-scale", scaleBump.toFixed(3));

      // Progress fill (CSS scaleX 0→1)
      if (fill) fill.parentElement.style.setProperty("--pinned-progress", progress.toFixed(3));

      // Active stage: divide progress into equal slices. Slight bias toward
      // the next stage at boundaries so the swap happens cleanly mid-scroll.
      const idx = Math.min(
        stageCount - 1,
        Math.max(0, Math.floor(progress * stageCount))
      );
      stages.forEach((s, i) => s.classList.toggle("is-active", i === idx));
      tags.forEach((t, i) => t.classList.toggle("is-active", i === idx));
      if (currentNum) currentNum.textContent = String(idx + 1).padStart(2, "0");

      ticking = false;
    });
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
};

/* ───────────────  SCROLL-DRIVEN HERO V  ─────────────── */
const initHeroScrollMotion = () => {
  if (reducedMotion) return;
  const hero = document.getElementById("hero");
  const mark = document.querySelector(".hero__mark");
  const title = document.querySelector(".hero__title");
  const sub = document.querySelector(".hero__sub");
  if (!hero || !mark) return;

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const h = hero.offsetHeight;
      const y = Math.max(0, Math.min(window.scrollY, h));
      const p = y / h; // 0..1
      // V mark: drift up, scale down, fade slightly
      mark.style.setProperty("--scroll-y", `${p * -60}px`);
      mark.style.setProperty("--scroll-scale", `${1 - p * 0.08}`);
      mark.style.setProperty("--scroll-opacity", `${1 - p * 0.5}`);
      // Title: lift and reduce opacity
      if (title) {
        title.style.transform = `translateY(${p * -30}px)`;
        title.style.opacity = `${1 - p * 0.6}`;
      }
      if (sub) {
        sub.style.transform = `translateY(${p * -20}px)`;
        sub.style.opacity = `${1 - p * 0.7}`;
      }
      ticking = false;
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
};

/* ============================================================
   IMMEDIATE INITIALIZATION (runs as soon as the script parses)
   ============================================================ */
const bootCritical = () => {
  initSplitText();
  initScramble();
  initReveals();
  initCounters();
  initNav();
  initSpotlight();
  initHeroTilt();
  initHeroScrollMotion();
  initHeroFlow();
  initPinnedManifesto();
  initCinema();
  initLockupParallax();
  initScrollSkew();
  initVelocityMarquee();
  initExploreModal();
  initI18n();
  initAnchors();
  initCursor();
  initCursorTrail();
  initMagnetic();
};
/* Invoked at the bottom of the file (see end) — bootCritical references
   initI18n/TRANSLATIONS, which are declared further down, and `const`
   bindings stay in the temporal dead zone until their declaration line
   runs. Calling it from here would throw before those are initialized. */

/* ============================================================
   DEFERRED: Lenis + Three.js load AFTER first paint so the
   page is fully interactive immediately. They enhance, never gate.
   ============================================================ */
const idle =
  window.requestIdleCallback ||
  ((cb) => setTimeout(cb, 400));

idle(
  async () => {
    if (reducedMotion) return;

    // ─── Lenis smooth scroll (progressive enhancement)
    try {
      const { default: Lenis } = await import("https://esm.sh/lenis@1.0.42");
      const lenis = new Lenis({
        duration: 1.15,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        smoothTouch: false,
      });
      window.__lenis = lenis;
      const raf = (time) => {
        lenis.raf(time);
        requestAnimationFrame(raf);
      };
      requestAnimationFrame(raf);
    } catch (e) {
      console.warn("Lenis failed, falling back to native scroll", e);
    }
  },
  { timeout: 1200 }
);

idle(
  async () => {
    if (reducedMotion) return;
    const canvas = document.getElementById("particles");
    if (!canvas) return;
    // Skip on weak devices: low DPR + small viewport
    if (window.innerWidth < 480 && window.devicePixelRatio < 2) return;

    try {
      const THREE = await import("https://esm.sh/three@0.160.0");
      runParticles(THREE, canvas);
    } catch (e) {
      console.warn("Three.js failed to load, skipping particles", e);
    }
  },
  { timeout: 2000 }
);

/* ───────────────  Three.js particle backdrop  ─────────────── */
function runParticles(THREE, canvas) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    1,
    1000
  );
  camera.position.z = 220;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const count = window.innerWidth < 768 ? 900 : 2000;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const colA = new THREE.Color("#ffffff");
  const colB = new THREE.Color("#2563eb");
  const colC = new THREE.Color("#9ab8ff");

  for (let i = 0; i < count; i++) {
    const radius = 80 + Math.random() * 420;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta) * 0.55;
    positions[i * 3 + 2] = radius * Math.cos(phi);
    sizes[i] = Math.random() * 1.6 + 0.4;
    const t = Math.random();
    const col = t < 0.05 ? colB : t < 0.18 ? colC : colA;
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    vertexShader: `
      attribute float size;
      varying vec3 vColor;
      varying float vAlpha;
      uniform float uTime;
      uniform float uPixelRatio;
      void main() {
        vColor = color;
        vec3 p = position;
        float a = uTime * 0.04;
        float c = cos(a), s = sin(a);
        p.xz = mat2(c, -s, s, c) * p.xz;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = size * 18.0 * uPixelRatio / -mvPosition.z * 6.0;
        gl_Position = projectionMatrix * mvPosition;
        vAlpha = clamp(1.0 - (-mvPosition.z) / 700.0, 0.0, 1.0);
        vAlpha *= 0.5 + 0.5 * sin(uTime * 1.4 + size * 12.0);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        float core = smoothstep(0.5, 0.0, d);
        float halo = smoothstep(0.5, 0.15, d) * 0.6;
        float alpha = (core + halo) * vAlpha;
        if (alpha < 0.02) discard;
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  /* ───── Nebula plane (screen-space, atmospheric flow noise) ───── */
  const nebulaGeom = new THREE.PlaneGeometry(2, 2);
  const nebulaMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uResolution: {
        value: new THREE.Vector2(window.innerWidth, window.innerHeight),
      },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      void main() {
        // Render in clip-space — fullscreen quad at the far plane
        gl_Position = vec4(position.xy, 0.9999, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec2 uResolution;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p *= 2.02;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / uResolution.xy;
        // Aspect-correct sample coords
        vec2 p = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0) * 2.4;
        // Animated domain warp for organic motion
        vec2 q = vec2(
          fbm(p + vec2(uTime * 0.020, uTime * 0.012)),
          fbm(p + vec2(uTime * -0.018, uTime * 0.022) + 5.2)
        );
        float n = fbm(p + 1.6 * q + uTime * 0.012);

        // Brand palette: deep midnight → vanguard blue → cyan highlight
        vec3 deep = vec3(0.025, 0.035, 0.075);
        vec3 brand = vec3(0.145, 0.388, 0.922);     // #2563EB
        vec3 highlight = vec3(0.45, 0.65, 1.0);     // soft cyan accent

        vec3 col = mix(deep, brand, smoothstep(0.30, 0.78, n));
        col = mix(col, highlight, smoothstep(0.72, 0.95, n) * 0.45);

        // Radial center-dim vignette so the brightest cloud
        // never sits directly behind the hero text
        float d = length(uv - vec2(0.5, 0.45));
        float centerSafe = smoothstep(0.08, 0.55, d);

        // Top falloff (hero region stays calmer)
        float topFade = smoothstep(0.0, 0.5, uv.y);

        float alpha = pow(n, 1.6) * 0.55;
        alpha *= mix(0.18, 1.0, centerSafe);
        alpha *= mix(0.55, 1.0, topFade);

        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
  const nebula = new THREE.Mesh(nebulaGeom, nebulaMat);
  nebula.frustumCulled = false;
  nebula.renderOrder = -10;
  scene.add(nebula);

  /* ───── Constellation: drifting nodes connected by dynamic lines ───── */
  const C_COUNT = window.innerWidth < 768 ? 50 : 90;
  const C_THRESHOLD = 78;                     // max distance to draw a line
  const C_THRESHOLD_SQ = C_THRESHOLD * C_THRESHOLD;
  const C_MAX_LINES = Math.min(220, (C_COUNT * (C_COUNT - 1)) / 2);

  // Soft circular sprite for nodes (avoids PointsMaterial square default)
  const makeNodeSprite = () => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0.0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.55)");
    g.addColorStop(1.0, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  };

  // Base positions + per-node phase offsets for drift
  const cBase = new Float32Array(C_COUNT * 3);
  const cPos = new Float32Array(C_COUNT * 3);
  const cPhase = new Float32Array(C_COUNT * 3);
  for (let i = 0; i < C_COUNT; i++) {
    const radius = 70 + Math.random() * 180;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    cBase[i * 3]     = radius * Math.sin(phi) * Math.cos(theta);
    cBase[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta) * 0.55;
    cBase[i * 3 + 2] = radius * Math.cos(phi);
    cPhase[i * 3]     = Math.random() * Math.PI * 2;
    cPhase[i * 3 + 1] = Math.random() * Math.PI * 2;
    cPhase[i * 3 + 2] = Math.random() * Math.PI * 2;
  }

  // Nodes (small bright soft-edged markers at each constellation point)
  const nodeGeo = new THREE.BufferGeometry();
  nodeGeo.setAttribute("position", new THREE.BufferAttribute(cPos, 3));
  const nodeMat = new THREE.PointsMaterial({
    color: 0xffffff,
    map: makeNodeSprite(),
    size: 4.5,
    transparent: true,
    opacity: 0.75,
    alphaTest: 0.02,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const nodes = new THREE.Points(nodeGeo, nodeMat);
  scene.add(nodes);

  // Dynamic line segments — positions + per-vertex colors so closer = brighter
  const linePositions = new Float32Array(C_MAX_LINES * 6);
  const lineColors = new Float32Array(C_MAX_LINES * 6);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
  lineGeo.setAttribute("color", new THREE.BufferAttribute(lineColors, 3));
  const lineMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const constellation = new THREE.LineSegments(lineGeo, lineMat);
  scene.add(constellation);
  // Initial drawRange: 0 lines until first frame
  lineGeo.setDrawRange(0, 0);

  // Helper called every frame
  const updateConstellation = (t) => {
    // Drift each node
    for (let i = 0; i < C_COUNT; i++) {
      const i3 = i * 3;
      cPos[i3]     = cBase[i3]     + Math.sin(t * 0.10 + cPhase[i3])     * 18;
      cPos[i3 + 1] = cBase[i3 + 1] + Math.cos(t * 0.08 + cPhase[i3 + 1]) * 12;
      cPos[i3 + 2] = cBase[i3 + 2] + Math.sin(t * 0.07 + cPhase[i3 + 2]) * 16;
    }
    nodeGeo.attributes.position.needsUpdate = true;

    // Recompute connections (O(n²/2), n≈100 → ~5k ops, ~0.2ms)
    let active = 0;
    for (let i = 0; i < C_COUNT && active < C_MAX_LINES; i++) {
      const ax = cPos[i * 3], ay = cPos[i * 3 + 1], az = cPos[i * 3 + 2];
      for (let j = i + 1; j < C_COUNT && active < C_MAX_LINES; j++) {
        const bx = cPos[j * 3], by = cPos[j * 3 + 1], bz = cPos[j * 3 + 2];
        const dx = bx - ax, dy = by - ay, dz = bz - az;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < C_THRESHOLD_SQ) {
          const idx6 = active * 6;
          linePositions[idx6]     = ax;
          linePositions[idx6 + 1] = ay;
          linePositions[idx6 + 2] = az;
          linePositions[idx6 + 3] = bx;
          linePositions[idx6 + 4] = by;
          linePositions[idx6 + 5] = bz;

          // Brightness falloff: closer = stronger brand color + white lift
          const f = 1 - Math.sqrt(distSq) / C_THRESHOLD;
          const r = 0.145 + 0.4 * f;
          const g = 0.388 + 0.35 * f;
          const b = 0.922;
          lineColors[idx6]     = r;
          lineColors[idx6 + 1] = g;
          lineColors[idx6 + 2] = b;
          lineColors[idx6 + 3] = r;
          lineColors[idx6 + 4] = g;
          lineColors[idx6 + 5] = b;
          active++;
        }
      }
    }
    lineGeo.attributes.position.needsUpdate = true;
    lineGeo.attributes.color.needsUpdate = true;
    lineGeo.setDrawRange(0, active * 2); // 2 vertices per line
  };

  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener(
    "pointermove",
    (e) => {
      mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    },
    { passive: true }
  );

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    nebulaMat.uniforms.uResolution.value.set(
      window.innerWidth,
      window.innerHeight
    );
  };
  window.addEventListener("resize", onResize);

  // Pause when tab hidden to save resources
  let visible = true;
  document.addEventListener("visibilitychange", () => {
    visible = !document.hidden;
  });

  const clock = new THREE.Clock();
  const tick = () => {
    if (visible) {
      const t = clock.getElapsedTime();
      material.uniforms.uTime.value = t;
      nebulaMat.uniforms.uTime.value = t;
      mouse.x += (mouse.tx - mouse.x) * 0.05;
      mouse.y += (mouse.ty - mouse.y) * 0.05;

      // Sync rotation across particles, constellation nodes and lines
      const rotY = mouse.x * 0.18 + t * 0.02;
      const rotX = mouse.y * 0.08;
      points.rotation.y = rotY;
      points.rotation.x = rotX;
      nodes.rotation.y = rotY;
      nodes.rotation.x = rotX;
      constellation.rotation.y = rotY;
      constellation.rotation.x = rotX;

      // Update constellation lines (≈0.2ms for 110 nodes)
      updateConstellation(t);

      renderer.render(scene, camera);
    }
    requestAnimationFrame(tick);
  };
  tick();

  // Fade-in canvas once first frame is rendered
  canvas.style.opacity = "0";
  canvas.style.transition = "opacity 800ms ease-out";
  requestAnimationFrame(() => {
    canvas.style.opacity = "";
  });
}

/* ───────────────  I18N — locale switching EN ⇄ ES  ───────────────
   Every visible string — including the brand vocabulary (Impacto,
   Escalabilidad, Evolución constante, Innovación, Confianza,
   Propósito, Crecimiento) — is translated in EN mode. Each must be
   wired through a [data-i18n]/[data-i18n-html]/[data-i18n-aria]
   element; anything hardcoded into the HTML never gets swapped when
   the locale toggle runs. */
const TRANSLATIONS = {
  en: {
    "meta.title": "Frago Vanguard Group — Built to grow together.",

    /* Nav */
    "nav.vision": "Vision",
    "nav.ecosystem": "Ecosystem",
    "nav.approach": "Approach",
    "nav.capabilities": "Capabilities",
    "nav.insights": "Insights",
    "nav.explore": "Explore our services",
    "nav.partner": "Partner with us",

    /* Hero */
    "hero.eyebrow": "A GLOBAL INNOVATION ECOSYSTEM",
    "hero.title": '<span class="hero__line">Built</span><span class="hero__line"><em>to grow</em></span><span class="hero__line">together.</span>',
    "hero.sub": "Frago Vanguard Group engineers ventures, platforms and partnerships that compound across markets — turning capital, talent and conviction into long‑horizon outcomes.",
    "hero.cta1": "Explore the ecosystem",
    "hero.cta2": "Talk to us",
    "hero.scroll": "SCROLL",
    "hero.pillar1": "Impact",
    "hero.pillar2": "Scalability",
    "hero.pillar3": "Constant evolution",

    /* Marquee */
    "marquee.w1": "Innovation",
    "marquee.w2": "Trust",
    "marquee.w3": "Purpose",
    "marquee.w4": "Growth",
    "marquee.w5": "Impact",
    "marquee.w6": "Scalability",
    "marquee.w7": "Constant Evolution",

    /* Vision */
    "vision.kicker": "Vision",
    "vision.title": 'A platform built on <span class="grad-text">conviction</span>, not on hype cycles.',
    "vision.lead1": "We exist for the long horizon. Frago Vanguard Group is the ecosystem behind operators, founders and institutions that refuse to choose between ambition and discipline.",
    "vision.lead2": "Every venture we touch is engineered to compound — culturally, financially and structurally — so the work outlasts the cycle that produced it.",
    "vision.sign": "Manifesto · 2025",
    "vision.pillar1.h": "Innovation",
    "vision.pillar2.h": "Trust",
    "vision.pillar3.h": "Purpose",
    "vision.pillar4.h": "Growth",
    "vision.pillar1.body": "We engineer leverage where conventional capital cannot reach — pairing operators with platforms that change the unit economics of an entire category.",
    "vision.pillar2.body": "Trust is a structural decision. Governance, transparency and relentless craft are encoded into how every Vanguard venture is built and reviewed.",
    "vision.pillar3.body": "We deploy conviction into the categories that compound: real economy, frontier technology and human capital. Purpose is the portfolio thesis.",
    "vision.pillar4.body": "Growth is the byproduct of compounding — not the goal. Our operators scale by removing friction, not by adding noise.",
    "vision.pillar1.cta": "Read the thesis",
    "vision.pillar2.cta": "How we govern",
    "vision.pillar3.cta": "See the categories",
    "vision.pillar4.cta": "See the numbers",

    /* Ecosystem */
    "eco.kicker": "Ecosystem",
    "eco.title": 'One thesis. <span class="grad-text">Four platforms.</span><br />Compounding across markets.',
    "eco.sub": "Each platform is operator‑led, capital‑aligned and built to interlock with the others — so capability, distribution and insight flow across the group.",
    "eco.capital.tag": "Capital",
    "eco.capital.desc": "Long‑horizon equity for category‑defining founders. Concentrated positions, structural support, multi‑decade conviction.",
    "eco.capital.metric1": "Active positions",
    "eco.capital.metric2": "Median hold",
    "eco.studios.tag": "Ventures",
    "eco.studios.desc": "An operator studio for products at the edge of AI, fintech and real‑economy infrastructure.",
    "eco.studios.item1": "Operator residencies",
    "eco.studios.item2": "Product‑market discovery",
    "eco.studios.item3": "Capital deployment",
    "eco.council.tag": "Advisory",
    "eco.council.desc": "Senior counsel to founders, family offices and institutions — strategy, governance and capital architecture.",
    "eco.council.chip1": "Strategy",
    "eco.council.chip2": "Governance",
    "eco.council.chip4": "Org design",
    "eco.futures.tag": "Foundation",
    "eco.futures.desc": "The non‑profit arm of the group — investing in the talent, research and infrastructure of the next economic generation.",
    "eco.futures.row1k": "Programs",
    "eco.futures.row1v": "Fellows · Research · Open knowledge",
    "eco.futures.row2k": "Reach",
    "eco.futures.row2v": "14 countries · 4 continents",
    "eco.futures.row3k": "Mandate",
    "eco.futures.row3v": "Compound the next generation",

    /* Approach */
    "appr.kicker": "Approach",
    "appr.title": 'We engineer ventures the way <span class="grad-text">institutions engineer balance sheets</span>.',
    "appr.step1.h": "Thesis",
    "appr.step1.p": "Every engagement begins with a written, falsifiable thesis — shared with founders, partners and the board before a single resource moves.",
    "appr.step2.h": "Architecture",
    "appr.step2.p": "We design the operating system first: governance, capital structure, hiring loops and cadence — the architecture of how the venture will compound.",
    "appr.step3.h": "Execution",
    "appr.step3.p": "Embedded operators ship product, capital and partnerships alongside the founder team. Weekly cadence, monthly board, quarterly review.",
    "appr.step4.h": "Compounding",
    "appr.step4.p": "Once the loops are stable we hand the keys back, retain conviction, and let the venture compound across cycles inside the broader Vanguard ecosystem.",

    /* Capabilities */
    "cap.kicker": "Capabilities",
    "cap.title": 'The numbers behind a <span class="grad-text">long‑horizon</span> ecosystem.',
    "cap.stat1.label": "Capital under thesis",
    "cap.stat1.note": "Across ventures, follow‑ons and strategic mandates.",
    "cap.stat2.label": "Active operators",
    "cap.stat2.note": "Embedded across portfolio companies and council mandates.",
    "cap.stat3.label": "Countries",
    "cap.stat3.note": "From LatAm to MENA, operating in‑market with local teams.",
    "cap.stat4.label": "Operator retention",
    "cap.stat4.note": "5‑year retention across the senior operator network.",

    /* Timeline */
    "tl.kicker": "Track record",
    "tl.title": 'A short <span class="grad-text">institutional history</span>.',
    "tl.m1.h": "Vanguard Capital opens.",
    "tl.m1.p": "First conviction positions placed. The thesis is committed to paper before any capital moves.",
    "tl.m2.h": "Operator network reaches 38.",
    "tl.m2.p": "Senior operators embedded across portfolio companies. Cadence and review architecture deployed.",
    "tl.m3.h": "Vanguard Studios & Council launched.",
    "tl.m3.p": "Operator studio and senior counsel platforms now anchor the broader ecosystem.",
    "tl.m4.h": "Vanguard Futures founded.",
    "tl.m4.p": "Non‑profit arm seeded across 14 countries to compound the next generation of operators.",

    /* Manifesto */
    "man.chrome": "MANIFESTO · IN MOTION",
    "man.stage1.eyebrow": "— INNOVATION",
    "man.stage1.h": "We engineer leverage <em>where capital alone</em> cannot reach.",
    "man.stage1.p": "Frago Vanguard is built for the gap between vision and balance sheet — combining operators, capital and platform thinking to produce outcomes a single asset class never could.",
    "man.stage2.eyebrow": "— TRUST",
    "man.stage2.h": "Governance and craft, <em>not personality</em>, hold the institution together.",
    "man.stage2.p": "Trust is the structural decision that lets the work compound past its founders. We design boards, cadence and review long before we design product.",
    "man.stage3.eyebrow": "— PURPOSE",
    "man.stage3.h": "Capital is deployed where <em>compounding is possible</em> — never where attention is loudest.",
    "man.stage3.p": "Real economy. Frontier technology. Human capital. Our thesis ignores the cycle and follows the categories that grow with or without it.",
    "man.stage4.eyebrow": "— GROWTH",
    "man.stage4.h": "Growth is the <em>proof.</em> Not the goal.",
    "man.stage4.p": "When the architecture is right and the operators are right, the numbers follow. Our job is to make sure the underlying engine is built to last the decade — not the quarter.",
    "man.tag1": "Innovation",
    "man.tag2": "Trust",
    "man.tag3": "Purpose",
    "man.tag4": "Growth",

    /* Feature */
    "feat.tag": "Featured initiative",
    "feat.title": '<span class="grad-text">Vanguard&nbsp;Futures</span> — building the operating system for the next generation of operators.',
    "feat.lead": "A multi‑year program pairing capital, mentorship and research to seed the next thousand operators across LatAm, EMEA and the US. Built in partnership with universities, family offices and institutional allocators.",
    "feat.cta1": "Read the brief",
    "feat.cta2": "Partner with the program",

    /* Cinema */
    "cin.chrome": "— THE VANGUARD ARC —",
    "cin.p1.tag": "Thesis · Memo · Commitment",
    "cin.p1.title": 'We begin with <em>conviction</em>.',
    "cin.p1.body": "Every engagement starts with a written, falsifiable thesis. Capital follows the thesis — never the other way around. Before any resource moves, the conviction is on paper.",
    "cin.p2.tag": "Governance · Structure · Cadence",
    "cin.p2.title": 'We engineer the <em>architecture</em>.',
    "cin.p2.body": "Boards, capital stack, hiring loops, weekly cadence. The operating system is designed long before the venture meets its first customer.",
    "cin.p3.tag": "Patience · Conviction · Compounding",
    "cin.p3.title": 'We compound over <em>decades</em>.',
    "cin.p3.body": "Once the architecture holds, we let time do the work. Patient capital, persistent operators, multi‑cycle conviction. The institution outlasts the team that built it.",

    /* Partners */
    "part.label": "CO-INVESTORS · ALLOCATORS · OPERATORS",

    /* Insights */
    "ins.kicker": "Insights",
    "ins.title": 'Field notes from the <span class="grad-text">Vanguard desk</span>.',
    "ins.c1.meta1": "Capital",
    "ins.c1.meta2": "Apr 2025",
    "ins.c1.h": "Why the next decade rewards patient capital again.",
    "ins.c1.p": "On the shift from liquidity‑driven returns to operator‑driven compounding — and what it means for allocators today.",
    "ins.c1.cta": "Read essay",
    "ins.c2.meta1": "Operators",
    "ins.c2.meta2": "Mar 2025",
    "ins.c2.h": "The operator stack: how senior talent compounds.",
    "ins.c2.p": "A framework for designing the operator network of a multi‑asset ecosystem, from residency to council.",
    "ins.c3.meta1": "Governance",
    "ins.c3.meta2": "Feb 2025",
    "ins.c3.h": "Encoding trust before scale.",
    "ins.c3.p": "Governance design as the unfair advantage of long‑horizon ventures — the bench, the board, the cadence.",

    /* Lockup */
    "lk.chrome": "— FRAGO VANGUARD · EST. SAN JOSÉ, CR · 2025 —",
    "lk.aria": "Impact. Scalability. Constant evolution.",
    "lk.word1": "IMPACT",
    "lk.word2": "scalability",
    "lk.word3": "EVOLUTION",
    "lk.foot1": "03 PROMISES",
    "lk.foot2": "ONE THESIS",
    "lk.foot3": "LONG HORIZON",

    /* CTA */
    "cta.chrome": "PARTNERSHIPS · 2025 / 2026",
    "cta.title": 'Built <em>to grow</em><br />together.',
    "cta.sub": "We work with a small number of founders, allocators and institutions each year. If you're building something that should outlast the cycle that created it, we'd like to hear from you.",
    "cta.field.name": "Name",
    "cta.field.email": "Email",
    "cta.field.msg": "What are you building?",
    "cta.submit": "Send a message",
    "cta.legal": "By submitting you agree to be contacted by Frago Vanguard Group. We respond in <48h.",
    "cta.success": "Thank you. The desk will be in touch within 48 hours.",

    /* Footer */
    "ft.brand.sub": "Built to grow together.",
    "ft.col.group": "Group",
    "ft.col.platforms": "Platforms",
    "ft.col.contact": "Contact",
    "ft.link.vision": "Vision",
    "ft.link.ecosystem": "Ecosystem",
    "ft.link.approach": "Approach",
    "ft.link.capabilities": "Capabilities",
    "ft.link.partnerships": "Partnerships",
    "ft.link.press": "Press",
    "ft.bottom": "© 2025 Frago Vanguard Group · Impact · Scalability · Constant evolution",

    /* Explore Modal */
    "exp.kicker": "— THE FRAGO ECOSYSTEM",
    "exp.title": 'Three platforms.<br /><em>One thesis</em>.',
    "exp.sub": "Independent business units, compounding under a single ecosystem. Hover to explore.",
    "exp.nexus.eyebrow": "01 · INTELLIGENCE",
    "exp.nexus.name": 'Frago <strong>Nexus Intelligence</strong>',
    "exp.nexus.desc": "AI strategy, applied research and intelligence systems for operators who need to think faster than their category.",
    "exp.nexus.cta": "Visit Nexus",
    "exp.momentum.eyebrow": "02 · CREATIVE",
    "exp.momentum.name": 'Frago <strong>Momentum Digital</strong>',
    "exp.momentum.desc": "Creative agency for brands that compound through culture. Films, sites, identity, motion — engineered for distribution.",
    "exp.momentum.cta": "Visit Momentum",
    "exp.ffg.eyebrow": "03 · SPORTS",
    "exp.ffg.name": 'Frago <strong>Football Group</strong>',
    "exp.ffg.desc": "Football as institutional category. Player development, clubs, intellectual property, data — the long‑horizon sports platform.",
    "exp.ffg.cta": "Visit FFG",
    "exp.foot": "Built to grow together.",
  },

  es: {
    "meta.title": "Frago Vanguard Group — Construido para crecer juntos.",

    /* Nav */
    "nav.vision": "Visión",
    "nav.ecosystem": "Ecosistema",
    "nav.approach": "Enfoque",
    "nav.capabilities": "Capacidades",
    "nav.insights": "Perspectivas",
    "nav.explore": "Explora nuestros servicios",
    "nav.partner": "Trabaja con nosotros",

    /* Hero */
    "hero.eyebrow": "UN ECOSISTEMA GLOBAL DE INNOVACIÓN",
    "hero.title": '<span class="hero__line">Construido</span><span class="hero__line"><em>para crecer</em></span><span class="hero__line">juntos.</span>',
    "hero.sub": "Frago Vanguard Group construye empresas, plataformas y alianzas que se componen entre mercados — convirtiendo capital, talento y convicción en resultados de horizonte largo.",
    "hero.cta1": "Explora el ecosistema",
    "hero.cta2": "Hablemos",
    "hero.scroll": "DESLIZA",
    "hero.pillar1": "Impacto",
    "hero.pillar2": "Escalabilidad",
    "hero.pillar3": "Evolución constante",

    /* Marquee */
    "marquee.w1": "Innovación",
    "marquee.w2": "Confianza",
    "marquee.w3": "Propósito",
    "marquee.w4": "Crecimiento",
    "marquee.w5": "Impacto",
    "marquee.w6": "Escalabilidad",
    "marquee.w7": "Evolución constante",

    /* Vision */
    "vision.kicker": "Visión",
    "vision.title": 'Una plataforma construida sobre <span class="grad-text">convicción</span>, no sobre ciclos de hype.',
    "vision.lead1": "Existimos para el horizonte largo. Frago Vanguard Group es el ecosistema detrás de operadores, fundadores e instituciones que se niegan a elegir entre ambición y disciplina.",
    "vision.lead2": "Cada empresa que tocamos se diseña para componerse — cultural, financiera y estructuralmente — para que el trabajo sobreviva al ciclo que lo produjo.",
    "vision.sign": "Manifiesto · 2025",
    "vision.pillar1.h": "Innovación",
    "vision.pillar2.h": "Confianza",
    "vision.pillar3.h": "Propósito",
    "vision.pillar4.h": "Crecimiento",
    "vision.pillar1.body": "Construimos apalancamiento donde el capital convencional no llega — emparejando operadores con plataformas que cambian la economía unitaria de una categoría entera.",
    "vision.pillar2.body": "La confianza es una decisión estructural. Gobernanza, transparencia y oficio implacable están codificados en cómo se construye y revisa cada empresa Vanguard.",
    "vision.pillar3.body": "Desplegamos convicción en las categorías que se componen: economía real, tecnología de frontera y capital humano. El propósito es la tesis del portafolio.",
    "vision.pillar4.body": "El crecimiento es subproducto de la composición — no el objetivo. Nuestros operadores escalan eliminando fricción, no añadiendo ruido.",
    "vision.pillar1.cta": "Leer la tesis",
    "vision.pillar2.cta": "Cómo gobernamos",
    "vision.pillar3.cta": "Ver las categorías",
    "vision.pillar4.cta": "Ver los números",

    /* Ecosystem */
    "eco.kicker": "Ecosistema",
    "eco.title": 'Una tesis. <span class="grad-text">Cuatro plataformas.</span><br />Componiéndose entre mercados.',
    "eco.sub": "Cada plataforma es liderada por operadores, alineada al capital y construida para interconectarse con las demás — para que capacidad, distribución e inteligencia fluyan entre el grupo.",
    "eco.capital.tag": "Capital",
    "eco.capital.desc": "Equity de horizonte largo para fundadores que definen categoría. Posiciones concentradas, soporte estructural, convicción multi-década.",
    "eco.capital.metric1": "Posiciones activas",
    "eco.capital.metric2": "Tenencia mediana",
    "eco.studios.tag": "Ventures",
    "eco.studios.desc": "Un studio de operadores para productos al límite de IA, fintech e infraestructura de economía real.",
    "eco.studios.item1": "Residencias de operador",
    "eco.studios.item2": "Discovery producto-mercado",
    "eco.studios.item3": "Despliegue de capital",
    "eco.council.tag": "Asesoría",
    "eco.council.desc": "Consejo senior para fundadores, family offices e instituciones — estrategia, gobernanza y arquitectura de capital.",
    "eco.council.chip1": "Estrategia",
    "eco.council.chip2": "Gobernanza",
    "eco.council.chip4": "Diseño org.",
    "eco.futures.tag": "Fundación",
    "eco.futures.desc": "La rama no lucrativa del grupo — invirtiendo en el talento, la investigación y la infraestructura de la próxima generación económica.",
    "eco.futures.row1k": "Programas",
    "eco.futures.row1v": "Fellows · Investigación · Conocimiento abierto",
    "eco.futures.row2k": "Alcance",
    "eco.futures.row2v": "14 países · 4 continentes",
    "eco.futures.row3k": "Mandato",
    "eco.futures.row3v": "Componer la próxima generación",

    /* Approach */
    "appr.kicker": "Enfoque",
    "appr.title": 'Diseñamos empresas como las <span class="grad-text">instituciones diseñan balances</span>.',
    "appr.step1.h": "Tesis",
    "appr.step1.p": "Cada compromiso empieza con una tesis escrita y falsable — compartida con fundadores, socios y el board antes de que se mueva un solo recurso.",
    "appr.step2.h": "Arquitectura",
    "appr.step2.p": "Diseñamos primero el sistema operativo: gobernanza, estructura de capital, loops de contratación y cadencia — la arquitectura de cómo se compondrá la empresa.",
    "appr.step3.h": "Ejecución",
    "appr.step3.p": "Operadores embebidos entregan producto, capital y alianzas junto al equipo fundador. Cadencia semanal, board mensual, revisión trimestral.",
    "appr.step4.h": "Composición",
    "appr.step4.p": "Una vez estables los loops, devolvemos las llaves, mantenemos la convicción, y dejamos que la empresa se componga entre ciclos dentro del ecosistema Vanguard.",

    /* Capabilities */
    "cap.kicker": "Capacidades",
    "cap.title": 'Los números detrás de un ecosistema de <span class="grad-text">horizonte largo</span>.',
    "cap.stat1.label": "Capital bajo tesis",
    "cap.stat1.note": "Entre empresas, follow-ons y mandatos estratégicos.",
    "cap.stat2.label": "Operadores activos",
    "cap.stat2.note": "Embebidos en compañías del portafolio y mandatos del consejo.",
    "cap.stat3.label": "Países",
    "cap.stat3.note": "De LatAm a MENA, operando in-market con equipos locales.",
    "cap.stat4.label": "Retención de operadores",
    "cap.stat4.note": "Retención a 5 años en la red senior de operadores.",

    /* Timeline */
    "tl.kicker": "Trayectoria",
    "tl.title": 'Una breve <span class="grad-text">historia institucional</span>.',
    "tl.m1.h": "Vanguard Capital abre.",
    "tl.m1.p": "Primeras posiciones de convicción colocadas. La tesis se compromete en papel antes de que se mueva el capital.",
    "tl.m2.h": "Red de operadores llega a 38.",
    "tl.m2.p": "Operadores senior embebidos en compañías del portafolio. Cadencia y arquitectura de revisión desplegadas.",
    "tl.m3.h": "Vanguard Studios y Council lanzados.",
    "tl.m3.p": "Las plataformas de studio de operadores y consejo senior anclan ahora el ecosistema más amplio.",
    "tl.m4.h": "Vanguard Futures fundada.",
    "tl.m4.p": "Rama no lucrativa sembrada en 14 países para componer la próxima generación de operadores.",

    /* Manifesto */
    "man.chrome": "MANIFIESTO · EN MOVIMIENTO",
    "man.stage1.eyebrow": "— INNOVACIÓN",
    "man.stage1.h": "Diseñamos apalancamiento <em>donde el capital solo</em> no puede llegar.",
    "man.stage1.p": "Frago Vanguard se construye para la brecha entre visión y balance — combinando operadores, capital y pensamiento de plataforma para producir resultados que una sola clase de activo nunca podría.",
    "man.stage2.eyebrow": "— CONFIANZA",
    "man.stage2.h": "Gobernanza y oficio, <em>no personalidad</em>, sostienen la institución.",
    "man.stage2.p": "La confianza es la decisión estructural que permite que el trabajo se componga más allá de sus fundadores. Diseñamos boards, cadencia y revisión mucho antes de diseñar producto.",
    "man.stage3.eyebrow": "— PROPÓSITO",
    "man.stage3.h": "El capital se despliega donde <em>la composición es posible</em> — nunca donde la atención es más ruidosa.",
    "man.stage3.p": "Economía real. Tecnología de frontera. Capital humano. Nuestra tesis ignora el ciclo y sigue las categorías que crecen con o sin él.",
    "man.stage4.eyebrow": "— CRECIMIENTO",
    "man.stage4.h": "El crecimiento es la <em>prueba.</em> No el objetivo.",
    "man.stage4.p": "Cuando la arquitectura es correcta y los operadores son correctos, los números siguen. Nuestro trabajo es asegurar que el motor subyacente esté construido para durar la década — no el trimestre.",
    "man.tag1": "Innovación",
    "man.tag2": "Confianza",
    "man.tag3": "Propósito",
    "man.tag4": "Crecimiento",

    /* Feature */
    "feat.tag": "Iniciativa destacada",
    "feat.title": '<span class="grad-text">Vanguard&nbsp;Futures</span> — construyendo el sistema operativo para la próxima generación de operadores.',
    "feat.lead": "Un programa multi-anual que combina capital, mentoría e investigación para sembrar los próximos mil operadores en LatAm, EMEA y EE.UU. Construido en alianza con universidades, family offices y asignadores institucionales.",
    "feat.cta1": "Leer el resumen",
    "feat.cta2": "Aliarse con el programa",

    /* Cinema */
    "cin.chrome": "— EL ARCO VANGUARD —",
    "cin.p1.tag": "Tesis · Memo · Compromiso",
    "cin.p1.title": 'Empezamos con <em>convicción</em>.',
    "cin.p1.body": "Cada compromiso empieza con una tesis escrita y falsable. El capital sigue a la tesis — nunca al revés. Antes de mover un recurso, la convicción está en papel.",
    "cin.p2.tag": "Gobernanza · Estructura · Cadencia",
    "cin.p2.title": 'Diseñamos la <em>arquitectura</em>.',
    "cin.p2.body": "Boards, stack de capital, loops de contratación, cadencia semanal. El sistema operativo se diseña mucho antes de que la empresa conozca a su primer cliente.",
    "cin.p3.tag": "Paciencia · Convicción · Composición",
    "cin.p3.title": 'Nos componemos a lo largo de <em>décadas</em>.',
    "cin.p3.body": "Una vez que la arquitectura sostiene, dejamos que el tiempo haga el trabajo. Capital paciente, operadores persistentes, convicción multi-ciclo. La institución sobrevive al equipo que la construyó.",

    /* Partners */
    "part.label": "CO-INVERSIONISTAS · ASIGNADORES · OPERADORES",

    /* Insights */
    "ins.kicker": "Perspectivas",
    "ins.title": 'Notas desde el <span class="grad-text">escritorio Vanguard</span>.',
    "ins.c1.meta1": "Capital",
    "ins.c1.meta2": "Abr 2025",
    "ins.c1.h": "Por qué la próxima década recompensa al capital paciente otra vez.",
    "ins.c1.p": "Sobre el cambio de retornos impulsados por liquidez a composición impulsada por operadores — y qué significa para los asignadores hoy.",
    "ins.c1.cta": "Leer ensayo",
    "ins.c2.meta1": "Operadores",
    "ins.c2.meta2": "Mar 2025",
    "ins.c2.h": "El stack de operadores: cómo el talento senior se compone.",
    "ins.c2.p": "Un marco para diseñar la red de operadores de un ecosistema multi-activo, desde la residencia hasta el consejo.",
    "ins.c2.cta": "Leer ensayo",
    "ins.c3.meta1": "Gobernanza",
    "ins.c3.meta2": "Feb 2025",
    "ins.c3.h": "Codificar confianza antes de escalar.",
    "ins.c3.p": "El diseño de gobernanza como la ventaja injusta de las empresas de horizonte largo — el banco, el board, la cadencia.",
    "ins.c3.cta": "Leer ensayo",

    /* Lockup */
    "lk.chrome": "— FRAGO VANGUARD · EST. SAN JOSÉ, CR · 2025 —",
    "lk.aria": "Impacto. Escalabilidad. Evolución constante.",
    "lk.word1": "IMPACTO",
    "lk.word2": "escalabilidad",
    "lk.word3": "EVOLUCIÓN",
    "lk.foot1": "03 PROMESAS",
    "lk.foot2": "UNA TESIS",
    "lk.foot3": "HORIZONTE LARGO",

    /* CTA */
    "cta.chrome": "ALIANZAS · 2025 / 2026",
    "cta.title": 'Construido <em>para crecer</em><br />juntos.',
    "cta.sub": "Trabajamos con un pequeño número de fundadores, asignadores e instituciones cada año. Si estás construyendo algo que debería sobrevivir al ciclo que lo creó, nos gustaría saber de ti.",
    "cta.field.name": "Nombre",
    "cta.field.email": "Correo",
    "cta.field.msg": "¿Qué estás construyendo?",
    "cta.submit": "Enviar mensaje",
    "cta.legal": "Al enviar aceptas ser contactado por Frago Vanguard Group. Respondemos en <48h.",
    "cta.success": "Gracias. El escritorio se pondrá en contacto en 48 horas.",

    /* Footer */
    "ft.brand.sub": "Construido para crecer juntos.",
    "ft.col.group": "Grupo",
    "ft.col.platforms": "Plataformas",
    "ft.col.contact": "Contacto",
    "ft.link.vision": "Visión",
    "ft.link.ecosystem": "Ecosistema",
    "ft.link.approach": "Enfoque",
    "ft.link.capabilities": "Capacidades",
    "ft.link.partnerships": "Alianzas",
    "ft.link.press": "Prensa",
    "ft.bottom": "© 2025 Frago Vanguard Group · Impacto · Escalabilidad · Evolución constante",

    /* Explore Modal */
    "exp.kicker": "— EL ECOSISTEMA FRAGO",
    "exp.title": 'Tres plataformas.<br /><em>Una tesis</em>.',
    "exp.sub": "Unidades de negocio independientes, componiéndose bajo un solo ecosistema. Pasa el cursor para explorar.",
    "exp.nexus.eyebrow": "01 · INTELIGENCIA",
    "exp.nexus.name": 'Frago <strong>Nexus Intelligence</strong>',
    "exp.nexus.desc": "Estrategia de IA, investigación aplicada y sistemas de inteligencia para operadores que necesitan pensar más rápido que su categoría.",
    "exp.nexus.cta": "Visitar Nexus",
    "exp.momentum.eyebrow": "02 · CREATIVO",
    "exp.momentum.name": 'Frago <strong>Momentum Digital</strong>',
    "exp.momentum.desc": "Agencia creativa para marcas que se componen a través de la cultura. Films, sitios, identidad, motion — diseñados para distribución.",
    "exp.momentum.cta": "Visitar Momentum",
    "exp.ffg.eyebrow": "03 · DEPORTES",
    "exp.ffg.name": 'Frago <strong>Football Group</strong>',
    "exp.ffg.desc": "Fútbol como categoría institucional. Desarrollo de jugadores, clubes, propiedad intelectual, datos — la plataforma deportiva de horizonte largo.",
    "exp.ffg.cta": "Visitar FFG",
    "exp.foot": "Construido para crecer juntos.",
  },
};

const initI18n = () => {
  const toggle = document.querySelector("[data-locale]");
  const buttons = document.querySelectorAll("[data-locale-set]");
  if (!toggle || buttons.length === 0) return;

  const KEY = "fvg-locale";
  let current = localStorage.getItem(KEY);
  if (current !== "en" && current !== "es") current = "en";

  const apply = (loc) => {
    const dict = TRANSLATIONS[loc];
    if (!dict) return;
    current = loc;
    document.documentElement.lang = loc;
    try { localStorage.setItem(KEY, loc); } catch (e) { /* sandboxed/private mode */ }

    // Toggle button states
    buttons.forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.localeSet === loc));
    });

    // Plain textContent replacements
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n;
      const text = dict[key];
      if (text !== undefined) el.textContent = text;
    });

    // innerHTML replacements (for elements with inline markup like <em>, <br>)
    document.querySelectorAll("[data-i18n-html]").forEach((el) => {
      const key = el.dataset.i18nHtml;
      const html = dict[key];
      if (html !== undefined) el.innerHTML = html;
    });

    // aria-label replacements (visual text is split into spans, so the
    // accessible name is translated separately on the labelled element)
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
      const key = el.dataset.i18nAria;
      const text = dict[key];
      if (text !== undefined) el.setAttribute("aria-label", text);
    });

    // Re-run char-split on hero title (innerHTML was just replaced)
    const heroTitle = document.querySelector('[data-split-text]');
    if (heroTitle) {
      splitTextRoot(heroTitle);
      // The hero is already on-screen on initial render, so reveal immediately
      heroTitle.querySelectorAll(".char").forEach((c) => c.classList.add("is-in"));
    }

    // Page title + ARIA label updates
    if (dict["meta.title"]) document.title = dict["meta.title"];
  };

  buttons.forEach((b) => {
    b.addEventListener("click", () => apply(b.dataset.localeSet));
  });

  // Initial apply
  apply(current);
};

/* Now that bootCritical and everything it calls (including TRANSLATIONS
   and initI18n) are declared, it's safe to invoke it. */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootCritical);
} else {
  bootCritical();
}

/* ───────────────  Service worker registration  ─────────────── */
if ("serviceWorker" in navigator && location.protocol === "https:") {
  // Only register on real deploys (HTTPS) — skip when serving from file://
  // or http://localhost to avoid polluting dev caches.
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => console.warn("[FVG] SW registration failed:", err));
  });
}

/* ───────────────  Console signature  ─────────────── */
console.log(
  "%c FRAGO VANGUARD GROUP ",
  "background:#0a0a0a;color:#2563eb;font:600 14px/1.6 'General Sans',sans-serif;padding:6px 12px;border-radius:4px;"
);
console.log("%c Built to grow together.", "color:#c7c7cc;font:italic 12px sans-serif;");
