(function () {
  /*
   * Knots/edges/menus/roots live in one document; canvas shows the active menu slice.
   * ui.layout stores positions only -- no semantic knot types in core paths.
   * Helpers use knot/menu names (setKnotLayout, getKnotIdsForMenu); legacy import keys may still say nodes/nodeIds.
   * files.menuText + files.structureText are regenerated from hierarchy + menus (single source).
   * Selection, drag, connect, hover are runtime-only and not exported.
   */
  const STORAGE_KEY = "ruvia.v2.state";
  const LEGACY_STORAGE_KEY = "ruvia.v1.state";
  const THEME_KEY = "ruvia.theme";
  const ZOOM_KEY = "ruvia.zoom";
  // 世界單位在 2026-08-30 重訂了一次: 所有座標/尺寸 ×2, 這個倍率同步減半,
  // **畫面上的淨值完全不變**. 動機是 iOS -- Safari 在 focus 一個 font-size < 16px 的
  // 輸入框時會自動放大整頁, 而 iOS 看的是 computed font-size, transform 縮放救不了.
  // 唯一的解法就是讓宣告值真的 ≥16px, 代價是世界單位要跟著放大一倍.
  const GLOBAL_SCALE = 1.5;

  // ⚠️ 這幾個常數必須宣告在 `app` 之前 -- app 建立時就呼叫 loadZoom(),
  //    放到後面會踩 const 的 temporal dead zone, 整個腳本在載入就掛掉.
  //
  // 有效倍率 = app.zoom × GLOBAL_SCALE(3). 預設 0.5 → 有效 1.5, 全站版面都照這個調的.
  // 下限原本是 0.5 -- **跟預設值一模一樣**, 所以「縮小」按了完全沒反應.
  // 放到 0.12(有效 0.36)才真的有得縮. 小數保留 3 位,
  // 否則乘法步進到低倍率會被 toFixed(2) 量化到卡住.
  const ZOOM_DEFAULT = 0.5;
  const ZOOM_MIN = 0.12;
  const ZOOM_MAX = 1.6;
  const ZOOM_STEP = 1.25;
  const SPEC = "ruvia-doc/0.2";
  const SPEC_LEGACY_HALF_SCALE = "ruvia-doc/0.1"; // 世界單位是現在的一半
  const KNOT_SIZE = {
    width: 192,
    height: 56,
    minWidth: 144,
    minHeight: 36
  };
  const STASH_KNOT_SIZE = {
    width: 192,
    height: 56
  };
  const RUVIA_COLORS = [
    { name: "primrose", hex: "#efe5a8" },
    { name: "hellebore", hex: "#3f6b4f" },
    { name: "artemisia", hex: "#90966f" },
    { name: "mallow", hex: "#d5648c" },
    { name: "zinnia", hex: "#b43c20" },
    { name: "plumbago", hex: "#4ea3d9" },
    { name: "azalea", hex: "#ff8375" },
    { name: "violet", hex: "#5130ba" },
    { name: "aconite", hex: "#4a2fb3" },
    { name: "chocolatecosmos", hex: "#4b383d" },
    { name: "lambsear", hex: "#b6c9aa" },
    { name: "gardenia", hex: "#fff8f4" },
    { name: "peony", hex: "#d00045" },
    { name: "orchid", hex: "#d20a8c" },
    { name: "camellia", hex: "#e8bdc8" },
    { name: "daffodil", hex: "#eedb00" },
    { name: "poppy", hex: "#e52b17" },
    { name: "forgetmenot", hex: "#1aa8c0" },
    { name: "lilac", hex: "#9462ba" },
    { name: "bellsofireland", hex: "#7fbf5b" },
    { name: "begonia", hex: "#ffad8f" },
    { name: "fuchsia", hex: "#ef5ee8" },
    { name: "calendula", hex: "#ed9900" },
    { name: "ruvia", hex: "#f4f4f4" },
    { name: "iris", hex: "#5a4fcf" }
  ];

  const app = {
    state: loadState(),
    selectedKnotId: null,
    suppressMenuClick: false,
    undoStack: [],
    coalesceKey: null,
    redoStack: [],
    lastSaved: null,
    dragKnot: null,
    dragKnotLayer: null,
    offsetX: 0,
    offsetY: 0,
    connectFrom: null,
    tempPoint: null,
    hoverEdgeId: null,
    hoverKnotId: null,
    activeContentKnotId: null,
    activeColorName: null,
    activeDefaultColorName: null,
    colorCursorEl: null,
    isColorDragging: false,
    zoom: loadZoom(),
    panX: 0,
    panY: 0,
    isPanning: false,
    panStartX: 0,
    panStartY: 0,
    panOriginX: 0,
    panOriginY: 0,
    resizeObserver: null,
    dom: {}
  };

  init();

  function init() {
    app.dom.workspace = document.getElementById("workspace");
    app.dom.canvasPane = document.querySelector(".canvas-pane");
    app.dom.knotLayer = document.getElementById("knotLayer");
    app.dom.trayKnotLayer = document.getElementById("trayKnotLayer");
    app.dom.edgeLayer = document.getElementById("edgeLayer");
    app.dom.edgeToolLayer = ensureEdgeToolLayer();
    app.dom.tray = document.getElementById("tray");
    app.dom.templateTray = document.getElementById("templateTray");
    app.dom.newKnotBtn = document.getElementById("newKnotBtn");
    app.dom.exportBtn = document.getElementById("exportBtn");
    app.dom.importBtn = document.getElementById("importBtn");
    app.dom.importInput = document.getElementById("importInput");
    app.dom.resetBtn = document.getElementById("resetBtn");
    app.dom.trayImportBtn = document.getElementById("trayImportBtn");
    app.dom.trayExportBtn = document.getElementById("trayExportBtn");
    app.dom.trayCollapseBtn = document.getElementById("trayCollapseBtn");
    app.dom.trayDrawerToggle = document.getElementById("trayDrawerToggle");
    app.dom.menuDrawerToggle = document.getElementById("menuDrawerToggle");
    app.dom.colorDotBtn = document.getElementById("colorDotBtn");
    app.dom.colorPalette = document.getElementById("colorPalette");
    app.dom.zoomOutBtn = document.getElementById("zoomOutBtn");
    app.dom.zoomInBtn = document.getElementById("zoomInBtn");

    applySavedTheme();
    bindThemeHotkeys();
    bindToolbar();
    bindTrayActions();
    bindTrayCollapse();
    bindMobileTray();
    bindMobileMenu();
    bindZoomControls();
    bindKnotEvents();
    bindConnectEvents();
    bindEdgeEvents();
    bindCanvasPan();
    renderTemplates();
    renderColorPalette();
    bindColorPalette();
    normalizeAllLayoutSizes(app.state);

    if (!app.state.knots.length) {
      createKnot({
        contentExpanded: true,
        layout: { x: 120, y: 80 },
        location: "canvas"
      });
    }

    bindUndoHotkeys();

    const undoBtn = document.getElementById("undoBtn");
    if (undoBtn) {
      undoBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        app.coalesceKey = null; // 按了鈕就結束目前這段輸入
        undo();
      });
    }

    const agentSpecBtn = document.getElementById("agentSpecBtn");
    if (agentSpecBtn) {
      agentSpecBtn.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const built = buildAgentSpec();
        if (!built.ok) {
          // 規範自帶的範例過不了自己的驗證器 -- 那是程式改了規範沒跟上.
          // 寧可什麼都不複製, 也不要把錯的規範交給 agent.
          agentSpecBtn.textContent = "!";
          console.error("[agent-spec] 範例驗證失敗: ", built.error);
          setTimeout(() => { agentSpecBtn.textContent = "\u{1F916}"; }, 1200);
          return;
        }

        let copied = false;
        try {
          await navigator.clipboard.writeText(built.text);
          copied = true;
        } catch (_e) {
          // 非 https/舊瀏覽器沒有 clipboard API, 退回 execCommand
          const ta = document.createElement("textarea");
          ta.value = built.text;
          ta.setAttribute("readonly", "");
          ta.style.position = "fixed";
          ta.style.top = "-1000px";
          document.body.append(ta);
          ta.select();
          try { copied = document.execCommand("copy"); } catch (_e2) { copied = false; }
          ta.remove();
        }

        // 點擊式按鈕的完成回饋走「字符瞬切」--燈泡按鈕模組指定的做法
        // (setTimeout 換字元, 不是 CSS 動畫). 觸控端沒有 hover, 顏色靠不住.
        agentSpecBtn.textContent = copied ? "\u2705" : "!";
        setTimeout(() => { agentSpecBtn.textContent = "\u{1F916}"; }, 600);
      });
    }

    const redoBtn = document.getElementById("redoBtn");
    if (redoBtn) {
      redoBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        app.coalesceKey = null;
        redo();
      });
    }

    // 撤銷的基準點: 初始載入完成後的樣子.
    // 不設的話第一個動作會因為 lastSaved == null 而不進堆疊, 變成撤不回來.
    app.lastSaved = JSON.stringify(app.state);
    syncHistoryUi();

    applyZoom();
    render();
  }

  function ensureEdgeToolLayer() {
    let layer = document.getElementById("edgeToolLayer");
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "edgeToolLayer";
      layer.className = "edge-tool-layer";
      app.dom.canvasPane.appendChild(layer);
    }
    return layer;
  }

  function applySavedTheme() {
    const mode = localStorage.getItem(THEME_KEY);
    if (mode === "white") {
      document.body.classList.add("white-mode");
    } else {
      document.body.classList.remove("white-mode");
    }
  }

  function bindThemeHotkeys() {
    window.addEventListener("keydown", (event) => {
      if (event.target && /input|textarea/i.test(event.target.tagName)) return;
      if (event.key.toLowerCase() !== "w") return;

      document.body.classList.toggle("white-mode");
      localStorage.setItem(
        THEME_KEY,
        document.body.classList.contains("white-mode") ? "white" : "dark"
      );
    });
  }

  function bindToolbar() {
    app.dom.newKnotBtn.addEventListener("click", () => {
      createKnot({ contentExpanded: true });
      touchDocumentUpdated();
      saveState();
      render();
    });

    app.dom.exportBtn.addEventListener("click", () => {
      const payload = exportDocument(app.state);
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json"
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `ruvia-root-${Date.now()}.root`;
      link.click();
      URL.revokeObjectURL(link.href);
    });

    app.dom.importBtn.addEventListener("click", () => {
      app.dom.importInput.value = "";
      app.dom.importInput.click();
    });

    app.dom.importInput.addEventListener("change", async (event) => {
      const files = Array.from(event.target.files || []);
      if (!files.length) return;

      try {
        const importedSources = [];
        for (const file of files) {
          const raw = JSON.parse(await file.text());
          const doc = loadFromImport(raw);
          importedSources.push({
            fileName: file.name,
            doc
          });
        }
        app.state = mergeImportedDocuments(app.state, importedSources);
        app.selectedKnotId = null;
        saveState();
        render();
      } catch (_error) {
        alert("Import root failed: invalid JSON");
      }
    });

    app.dom.resetBtn.addEventListener("click", () => {
      if (
        !confirm(
          "將刪除本機全部 Ruvia 資料(工作區, 縮放, 主題), 並只載入示例樹. 確定?"
        )
      ) {
        return;
      }
      clearRuviaLocalStorage();
      app.state = buildShowcaseInitialState();
      app.selectedKnotId = null;
      app.zoom = loadZoom();
      applySavedTheme();
      applyZoom();
      saveState();
      saveZoom();
      render();
    });
  }

  function bindTrayActions() {
    if (app.dom.trayImportBtn) {
      app.dom.trayImportBtn.addEventListener("click", () => {
        app.dom.importBtn.click();
      });
    }
    if (app.dom.trayExportBtn) {
      app.dom.trayExportBtn.addEventListener("click", () => {
        app.dom.exportBtn.click();
      });
    }
  }

  function bindMobileMenu() {
    if (!app.dom.menuDrawerToggle) return;
    app.dom.menuDrawerToggle.addEventListener("click", () => {
      document.body.classList.toggle("menu-drawer-open");
    });
  }

  function bindMobileTray() {
    if (!app.dom.trayDrawerToggle) return;
    app.dom.trayDrawerToggle.addEventListener("click", () => {
      document.body.classList.toggle("tray-drawer-open");
      if (document.body.classList.contains("tray-drawer-open")) {
        enforceMobileTrayLayout();
        render();
      }
    });
  }

  function getColorByName(name) {
    if (!name) return null;
    return RUVIA_COLORS.find((color) => color.name === name) || null;
  }

  function isMobileView() {
    return window.matchMedia("(max-width: 720px)").matches;
  }

  function updateColorDot(knot) {
    if (!app.dom.colorDotBtn) return;
    // 手機那顆是 🎨, 不是變色小點 -- 不染色, 也不要留下沒有作用的 inline style.
    // 桌面才是「小點顯示目前顏色」的設計. (Rec 2026-08-30: 兩邊嚴格分離)
    if (isMobileView()) {
      app.dom.colorDotBtn.style.removeProperty("color");
      return;
    }
    const color = getColorByName(knot?.meta?.color);
    app.dom.colorDotBtn.style.color = color ? color.hex : "var(--text-dim)";
  }

  function syncMenuVisibilityUi() {
    const hasMenus = app.state.menus.length > 0;
    document.body.classList.toggle("has-menus", hasMenus);
    if (!hasMenus) {
      document.body.classList.remove("menu-drawer-open");
    }
  }

  function renderColorPalette() {
    if (!app.dom.colorPalette) return;
    const frag = document.createDocumentFragment();
    for (const color of RUVIA_COLORS) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "palette-dot";
      dot.dataset.colorName = color.name;
      dot.title = color.name;
      dot.textContent = "●";
      dot.style.color = color.hex;
      dot.draggable = true;
      frag.append(dot);
    }
    app.dom.colorPalette.replaceChildren(frag);
  }

  function bindColorPalette() {
    if (!app.dom.colorPalette || !app.dom.colorDotBtn) return;

    app.dom.colorDotBtn.addEventListener("click", (event) => {
      if (!isMobileView()) return;
      event.preventDefault();
      event.stopPropagation();
      document.body.classList.toggle("color-palette-open");
    });

    document.addEventListener("click", (event) => {
      if (!isMobileView()) return;
      if (!document.body.classList.contains("color-palette-open")) return;
      if (event.target.closest(".color-controls")) return;
      document.body.classList.remove("color-palette-open");
    });

    app.dom.colorPalette.addEventListener("click", (event) => {
      const dot = event.target.closest(".palette-dot");
      if (!dot) return;
      const colorName = dot.dataset.colorName;
      if (!colorName) return;

      // 方案 C(2026-08-30 拍板): 選色 = **上膛**, 不是立刻套用.
      // 桌面本來就是這個流程(選色 → 游標帶色 → 點 knot → 染色 → 自動卸膛),
      // 手機只是把「帶色的游標」換成「帶色的按鈕」. 兩邊同一個心智模型.
      if (isMobileView()) {
        event.preventDefault();
        event.stopPropagation();
        document.body.classList.remove("color-palette-open"); // 選完就收, 畫布還給使用者
      }

      app.activeColorName = colorName;
      showColorCursor(colorName);
      document.body.classList.add("is-color-painting");
    });

    const getDraggedColorName = (event) => {
      return (
        event.dataTransfer?.getData("text/ruvia-color") ||
        event.dataTransfer?.getData("text/plain") ||
        ""
      );
    };

    app.dom.colorPalette.addEventListener("dragstart", (event) => {
      if (isMobileView()) return; // 桌面專屬流程
      const dot = event.target.closest(".palette-dot");
      if (!dot || !event.dataTransfer) return;
      event.dataTransfer.setData("text/plain", dot.dataset.colorName || "");
      event.dataTransfer.setData("text/ruvia-color", dot.dataset.colorName || "");
      event.dataTransfer.effectAllowed = "copy";
      app.isColorDragging = true;
      document.body.classList.add("is-color-dragging");
    });

    app.dom.colorPalette.addEventListener("dragend", () => {
      app.isColorDragging = false;
      document.body.classList.remove("is-color-dragging");
    });

    const handleColorDrop = (event) => {
      const colorName = getDraggedColorName(event);
      if (!colorName) return;
      event.preventDefault();
      event.stopPropagation();
      const color = getColorByName(colorName);
      if (!color) return;

      let knotEl = event.target.closest(".knot");
      if (!knotEl && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
        const hitEl = document.elementFromPoint(event.clientX, event.clientY);
        knotEl = hitEl?.closest?.(".knot") || null;
      }
      if (!knotEl) return;

      const knot = findKnot(knotEl.dataset.knotId);
      if (!knot) return;

      applyColorToKnot(knot, colorName);
      app.isColorDragging = false;
      document.body.classList.remove("is-color-dragging");
    };

    const knotLayers = [app.dom.knotLayer, app.dom.trayKnotLayer].filter(Boolean);
    for (const layer of knotLayers) {
      layer.addEventListener("dragover", (event) => {
        const types = Array.from(event.dataTransfer?.types || []);
        if (
          types.includes("text/ruvia-color") ||
          types.includes("text/plain") ||
          app.isColorDragging
        ) {
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
        }
      });

      layer.addEventListener("drop", handleColorDrop);
    }

    app.dom.canvasPane.addEventListener("dragover", (event) => {
      const types = Array.from(event.dataTransfer?.types || []);
      if (
        types.includes("text/ruvia-color") ||
        types.includes("text/plain") ||
        app.isColorDragging
      ) {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      }
    });
    app.dom.canvasPane.addEventListener("drop", handleColorDrop);

    window.addEventListener("mousemove", (event) => {
      if (!app.activeColorName || !app.colorCursorEl) return;
      app.colorCursorEl.style.left = `${event.clientX + 8}px`;
      app.colorCursorEl.style.top = `${event.clientY + 8}px`;
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && app.activeColorName) {
        clearColorPaintMode();
      }
    });

    app.dom.canvasPane.addEventListener("click", (event) => {
      if (!app.activeColorName) return;
      if (event.target.closest(".knot")) return;
      clearColorPaintMode();
    });
  }

  function ensureColorCursor() {
    if (app.colorCursorEl) return app.colorCursorEl;
    const el = document.createElement("div");
    el.className = "color-cursor";
    document.body.appendChild(el);
    app.colorCursorEl = el;
    return el;
  }

  // 「上膛」的指示面有兩個: 桌面是跟著游標跑的色點, 手機沒有游標,
  // 所以改成把 🎨 換成該顏色的實心點. **同一個 app.activeColorName 狀態**, 只是畫在不同地方.
  function setColorArmedIndicator(colorName) {
    const btn = app.dom.colorDotBtn;
    if (!btn) return;
    const color = getColorByName(colorName);
    if (!color) {
      btn.classList.remove("is-armed");
      btn.style.removeProperty("--armed-color");
      return;
    }
    btn.style.setProperty("--armed-color", color.hex);
    btn.classList.add("is-armed");
  }

  function showColorCursor(colorName) {
    const color = getColorByName(colorName);
    if (!color) return;
    if (isMobileView()) {
      setColorArmedIndicator(colorName);
      return;
    }
    const el = ensureColorCursor();
    el.style.background = color.hex;
    el.style.display = "block";
  }

  function clearColorPaintMode() {
    app.activeColorName = null;
    document.body.classList.remove("is-color-painting");
    if (app.colorCursorEl) app.colorCursorEl.style.display = "none";
    setColorArmedIndicator(null);
  }

  function applyColorToKnot(knot, colorName) {
    const color = getColorByName(colorName);
    if (!color || !knot) return;
    knot.meta = knot.meta || {};
    knot.meta.color = colorName;
    console.log("[color]", knot.id, colorName, knot.meta.color);
    updateColorDot(knot);
    touchDocumentUpdated();
    saveState();
    render();
  }

  function bindTrayCollapse() {
    if (!app.dom.trayCollapseBtn) return;

    app.dom.trayCollapseBtn.addEventListener("click", () => {
      document.body.classList.toggle("tray-collapsed");
      app.dom.trayCollapseBtn.textContent =
        document.body.classList.contains("tray-collapsed") ? "❮" : "❯";
    });
  }

  function bindZoomControls() {
    if (app.dom.zoomOutBtn) {
      app.dom.zoomOutBtn.addEventListener("click", () => {
        // 乘法步進, 不是加減 -- 固定 0.1 的話, 靠近下限時一下就砍掉一半,
        // 靠近上限時又幾乎看不出變化. 乘法在整個範圍內每一下的感受一樣.
        setZoom(app.zoom / ZOOM_STEP);
      });
    }

    if (app.dom.zoomInBtn) {
      app.dom.zoomInBtn.addEventListener("click", () => {
        setZoom(app.zoom * ZOOM_STEP);
      });
    }

    window.addEventListener("keydown", (event) => {
      if (event.target && /input|textarea/i.test(event.target.tagName)) return;

      if (event.key === "[") {
        setZoom(app.zoom / ZOOM_STEP);
      }

      if (event.key === "]") {
        setZoom(app.zoom * ZOOM_STEP);
      }
    });
  }

  function setZoom(value) {
    app.zoom = clampZoom(value);
    saveZoom();
    applyZoom();
  }

  function applyZoom() {
    const z = getEffectiveZoom();
    const transform = `translate(${app.panX || 0}px, ${app.panY || 0}px) scale(${z})`;
    app.dom.knotLayer.style.transformOrigin = "0 0";
    app.dom.knotLayer.style.transform = transform;
    app.dom.edgeLayer.style.transformOrigin = "0 0";
    app.dom.edgeToolLayer.style.transformOrigin = "0 0";
    app.dom.edgeLayer.style.transform = "";
    app.dom.edgeToolLayer.style.transform = "";
    if (app.dom.trayKnotLayer) {
      app.dom.trayKnotLayer.style.transform = "";
    }
    renderEdges();
  }

  function bindCanvasPan() {
    const pane = app.dom.canvasPane;

    const finishPan = (pointerId) => {
      app.isPanning = false;
      document.body.classList.remove("is-panning");
      if (pointerId != null && pane.hasPointerCapture?.(pointerId)) {
        pane.releasePointerCapture(pointerId);
      }
    };

    pane.addEventListener("pointerdown", (event) => {
      if (app.isColorDragging) return;
      if (!event.isPrimary) return;
      if (event.button !== undefined && event.button !== 0) return;
      if (event.target.closest(".knot")) return;
      if (event.target.closest(".port")) return;
      if (event.target.closest(".side-add")) return;
      if (event.target.closest(".zoom-controls")) return;
      if (event.target.closest(".color-controls")) return;
      if (event.target.closest(".edge-cut")) return;
      if (
        event.target.closest("textarea") ||
        event.target.closest("input") ||
        event.target.closest('[contenteditable="true"]')
      ) {
        return;
      }

      event.preventDefault();
      app.isPanning = true;
      app.panStartX = event.clientX;
      app.panStartY = event.clientY;
      app.panOriginX = app.panX;
      app.panOriginY = app.panY;
      document.body.classList.add("is-panning");
      pane.setPointerCapture?.(event.pointerId);
    });

    pane.addEventListener("pointermove", (event) => {
      if (!app.isPanning) return;
      app.panX = app.panOriginX + (event.clientX - app.panStartX);
      app.panY = app.panOriginY + (event.clientY - app.panStartY);
      applyZoom();
      event.preventDefault();
    });

    pane.addEventListener("pointerup", (event) => {
      if (!app.isPanning) return;
      finishPan(event.pointerId);
    });

    pane.addEventListener("pointercancel", (event) => {
      if (!app.isPanning) return;
      finishPan(event.pointerId);
    });
  }

  function saveZoom() {
    localStorage.setItem(ZOOM_KEY, String(app.zoom));
  }

  function loadZoom() {
    const stored = localStorage.getItem(ZOOM_KEY);
    // ⚠️ 原本寫 Number(localStorage.getItem(...)): 沒存過時是 Number(null) = **0**,
    //    而 Number.isFinite(0) 為 true, 所以那句 `return 1.35` 從來沒被執行過,
    //    真正拿到的是 clampZoom(0) = 舊下限 0.5. 預設值剛好壓在下限上 --
    //    這才是「縮小按了沒反應」的真正原因.
    if (stored === null || stored === "") return ZOOM_DEFAULT;
    const raw = Number(stored);
    if (!Number.isFinite(raw) || raw <= 0) return ZOOM_DEFAULT;
    return clampZoom(raw);
  }

  function getEffectiveZoom() {
    return app.zoom * GLOBAL_SCALE;
  }

  function getCanvasRect() {
    return app.dom.canvasPane.getBoundingClientRect();
  }

  function getCanvasScale() {
    return getEffectiveZoom();
  }

  function screenToWorld(clientX, clientY) {
    const rect = getCanvasRect();
    const scale = getCanvasScale();
    return {
      x: (clientX - rect.left - (app.panX || 0)) / scale,
      y: (clientY - rect.top - (app.panY || 0)) / scale
    };
  }

  function worldToScreen(x, y) {
    const rect = getCanvasRect();
    const scale = getCanvasScale();
    return {
      x: rect.left + (app.panX || 0) + x * scale,
      y: rect.top + (app.panY || 0) + y * scale
    };
  }

  function screenToCanvasLocal(clientX, clientY) {
    const rect = getCanvasRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  function worldToCanvasLocal(x, y) {
    const scale = getCanvasScale();
    return {
      x: (app.panX || 0) + x * scale,
      y: (app.panY || 0) + y * scale
    };
  }

  function getCanvasLocalPointFromClient(clientX, clientY) {
    const rect = getCanvasRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }
    return String(value).replace(/"/g, '\\"');
  }

  function getPortCenterVisual(knotId, side) {
    const selector = `.knot[data-knot-id="${cssEscape(knotId)}"] .port.${side}`;
    const port = app.dom.knotLayer.querySelector(selector);
    if (!port) return null;

    const portRect = port.getBoundingClientRect();
    const canvasRect = getCanvasRect();
    return {
      x: portRect.left + portRect.width / 2 - canvasRect.left,
      y: portRect.top + portRect.height / 2 - canvasRect.top
    };
  }

  // -- 手機 tray: 不排網格 -----------------------------
  // [+] 每顆落在 tray 內隨機, 且與現有 knot 不重疊的位置; 界內保證.
  const TRAY_GAP = 6;
  const TRAY_SPOT_TRIES = 300;

  function isMobileTray() {
    return window.matchMedia("(max-width: 720px)").matches;
  }

  // 實際渲染尺寸優先(CSS 有 width:192px !important, 算不出來), 量不到才退回常數
  function getTrayKnotBox(knotId) {
    const el = app.dom.trayKnotLayer
      ? app.dom.trayKnotLayer.querySelector('.knot[data-knot-id="' + knotId + '"]')
      : null;
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) return { w: r.width, h: r.height };
    }
    const layout = knotId ? getKnotLayout(app.state, knotId) : null;
    return {
      w: (layout && layout.width) || STASH_KNOT_SIZE.width,
      h: (layout && layout.height) || STASH_KNOT_SIZE.height
    };
  }

  // 還沒建出來的新 knot: 量現有任一顆當樣本
  function getTrayNewKnotBox() {
    const el = app.dom.trayKnotLayer
      ? app.dom.trayKnotLayer.querySelector(".knot")
      : null;
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) return { w: r.width, h: r.height };
    }
    return { w: 192, h: 40 };
  }

  function boxesOverlap(x, y, w, h, t) {
    return (
      x < t.x + t.w + TRAY_GAP &&
      x + w + TRAY_GAP > t.x &&
      y < t.y + t.h + TRAY_GAP &&
      y + h + TRAY_GAP > t.y
    );
  }

  // placed 已放好的格子; 回傳界內, 盡量不重疊的一個點.
  // tray 真的塞滿時放不出零重疊 -- 那就回傳重疊最少的, 但**永遠在界內**.
  function pickTraySpot(placed, w, h, maxX, maxY) {
    let best = null;
    for (let i = 0; i < TRAY_SPOT_TRIES; i++) {
      const x = Math.random() * maxX;
      const y = Math.random() * maxY;
      let n = 0;
      for (const t of placed) if (boxesOverlap(x, y, w, h, t)) n++;
      if (n === 0) return { x, y };
      if (!best || n < best.n) best = { x, y, n };
    }
    return best ? { x: best.x, y: best.y } : { x: 0, y: 0 };
  }

  function getTraySpotForNew() {
    const layer = app.dom.trayKnotLayer;
    const box = getTrayNewKnotBox();
    if (!layer) return { x: 0, y: 0 };
    const rect = layer.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: 0, y: 0 };

    const placed = app.state.knots.filter(isTrayKnot).map((k) => {
      const l = getKnotLayout(app.state, k.id);
      const b = getTrayKnotBox(k.id);
      return { x: l.x, y: l.y, w: b.w, h: b.h };
    });
    return pickTraySpot(
      placed,
      box.w,
      box.h,
      Math.max(0, rect.width - box.w),
      Math.max(0, rect.height - box.h)
    );
  }

  function clampZoom(value) {
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(Number(value).toFixed(3))));
  }

  function renderTemplates() {
    const labels = ["+"];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < labels.length; i++) {
      const btn = document.createElement("button");
      btn.className = "template-btn";
      btn.type = "button";
      btn.textContent = labels[i];
      btn.title = "New knot in tray";
      btn.addEventListener("click", () => {
        // 跟 root deck 的「+」同一條邏輯: **+ 指的就是下一顆會出現的地方. **
        // 差別在位置: root deck 的 + 在最後(新的往下接),
        // tray 的 + 在第一個(Rec 指定), 所以新 knot 落在最上面那一格,
        // 既有的整批往下推一格 -- 這樣 + 才真的指著下一顆的位置.
        // 手機不適用: Rec 已指定手機 tray 不排網格, 走隨機不重疊.
        const TRAY_STEP = 72;
        if (!isMobileTray()) {
          for (const k of app.state.knots) {
            if (!isTrayKnot(k)) continue;
            const l = getKnotLayout(app.state, k.id);
            setKnotLayout(app.state, k.id, { ...l, y: l.y + TRAY_STEP });
          }
        }
        const spot = isMobileTray() ? getTraySpotForNew() : { x: 16, y: 0 };
        createKnot({
          contentExpanded: true,
          x: spot.x,
          y: spot.y,
          width: STASH_KNOT_SIZE.width,
          location: "tray"
        });
        touchDocumentUpdated();
        saveState();
        render();
      });
      frag.append(btn);
    }
    app.dom.templateTray.replaceChildren(frag);
  }

  function bindKnotEvents() {

    const knotLayers = [app.dom.knotLayer, app.dom.trayKnotLayer].filter(Boolean);

    for (const layer of knotLayers) {
      layer.addEventListener("mousemove", (event) => {
        const prevHoverKnotId = app.hoverKnotId;
        const knotEl = event.target.closest(".knot");
        const knot = knotEl ? findKnot(knotEl.dataset.knotId) : null;
        app.hoverKnotId = knot ? knot.id : null;
        updateColorDot(knot);
        if (prevHoverKnotId !== app.hoverKnotId && !isMobileView()) {
          render();
        }
      });

      layer.addEventListener("mouseleave", () => {
        const hadHoverKnot = Boolean(app.hoverKnotId);
        app.hoverKnotId = null;
        updateColorDot(null);
        if (hadHoverKnot && !isMobileView()) {
          render();
        }
      });

      if (layer === app.dom.knotLayer) {
        layer.addEventListener("mousemove", (event) => {
          const knotEl = event.target.closest(".knot");
          const current = layer.querySelector(".knot.hover-left, .knot.hover-right");
          if (!knotEl) {
            if (current) current.classList.remove("hover-left", "hover-right");
            return;
          }

          if (current && current !== knotEl) {
            current.classList.remove("hover-left", "hover-right");
          }

          const rect = knotEl.getBoundingClientRect();
          const isLeft = event.clientX < rect.left + rect.width / 2;
          knotEl.classList.toggle("hover-left", isLeft);
          knotEl.classList.toggle("hover-right", !isLeft);
        });

        layer.addEventListener("mouseleave", () => {
          const current = layer.querySelector(".knot.hover-left, .knot.hover-right");
          if (current) current.classList.remove("hover-left", "hover-right");
        });
      }

      // pointerdown 而非 mousedown: 滑鼠一樣會派送 pointer 事件,
      // 但觸控裝置**只有** pointer 事件 -- 這是手機上 tray 內拖得動的唯一條件.
      layer.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        if (event.target.closest(".port")) return;
        if (event.target.closest(".knot-edit-btn")) {
          event.preventDefault();
          event.stopPropagation();
          const knotEl = event.target.closest(".knot");
          const titleEl = knotEl?.querySelector(".knot-title");
          if (titleEl) {
            titleEl.contentEditable = "true";
            titleEl.focus();
          }
          return;
        }

        if (event.target.closest(".delete-btn")) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        const sideBtn = event.target.closest(".side-add");
        if (sideBtn && sideBtn.contains(event.target) && !app.connectFrom) {
          event.preventDefault();
          event.stopPropagation();
          const knotEl = sideBtn.closest(".knot");
          if (!knotEl) return;
          const knot = findKnot(knotEl.dataset.knotId);
          if (!knot) return;
          createExtendedKnot(knot, sideBtn.dataset.side);
          touchDocumentUpdated();
          saveState();
          render();
          return;
        }

        if (app.connectFrom) return;

        const header = event.target.closest(".knot-header");
        if (!header) return;

        const knotEl = header.closest(".knot");
        if (!knotEl) return;

        const knot = findKnot(knotEl.dataset.knotId);
        if (!knot) return;

        app.selectedKnotId = knot.id;
        app.dragKnot = knot;
        app.dragKnotLayer = layer;
        bringKnotToFront(knot.id);

        const sourceZone = getKnotLocation(knot);
        if (sourceZone === "tray") {
          const kr = knotEl.getBoundingClientRect();
          app.offsetX = event.clientX - kr.left;
          app.offsetY = event.clientY - kr.top;
        } else {
          const world = screenToWorld(event.clientX, event.clientY);
          const layout = getKnotLayout(app.state, knot.id);
          app.offsetX = world.x - layout.x;
          app.offsetY = world.y - layout.y;
        }

        const onMove = (moveEvent) => {
          const layout = getKnotLayout(app.state, knot.id);
          const inTray = isPointerInTray(moveEvent.clientX, moveEvent.clientY);
          const nextZone = inTray ? "tray" : "canvas";

          if (nextZone === "tray") {
            const zoneRect = app.dom.trayKnotLayer.getBoundingClientRect();
            const maxX = Math.max(0, zoneRect.width - (layout.width || KNOT_SIZE.width));
            const maxY = Math.max(0, zoneRect.height - (layout.height || KNOT_SIZE.height));
            layout.x = clamp(moveEvent.clientX - zoneRect.left - app.offsetX, 0, maxX);
            layout.y = clamp(moveEvent.clientY - zoneRect.top - app.offsetY, 0, maxY);
          } else {
            const world = screenToWorld(moveEvent.clientX, moveEvent.clientY);
            const canvas = getCanvasRect();
            const scale = getCanvasScale();
            const maxX = Math.max(0, canvas.width / scale - (layout.width || KNOT_SIZE.width));
            const maxY = Math.max(0, canvas.height / scale - (layout.height || KNOT_SIZE.height));
            layout.x = clamp(world.x - app.offsetX, 0, maxX);
            layout.y = clamp(world.y - app.offsetY, 0, maxY);
          }
          knot.meta = knot.meta || {};
          knot.meta.location = nextZone;

          setKnotLayout(app.state, knot.id, layout);
          render();
          app.dom.tray.classList.toggle("is-active", inTray);
        };

        const onUp = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          window.removeEventListener("pointercancel", onUp);

          app.dragKnot = null;
          app.dragKnotLayer = null;
          app.dom.tray.classList.remove("is-active");

          touchDocumentUpdated();
          saveState();
          render();
        };

        // 不用 setPointerCapture: render() 每次都 replaceChildren,
        // 被捕獲的元素會在拖曳中途被換掉, capture 跟著失效. 掛 window 才穩.
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
      });

      layer.addEventListener("click", (event) => {
        if (app.activeColorName) {
          const targetKnotEl = event.target.closest(".knot");
          if (targetKnotEl) {
            // id 要在染色前抓: applyColorToKnot() 會 render(),
            // 之後 event.target 已經是被換掉的舊節點, closest() 不能再信.
            const paintId = targetKnotEl.dataset.knotId;
            const paintKnot = findKnot(paintId);
            if (paintKnot) {
              applyColorToKnot(paintKnot, app.activeColorName);
            }
            clearColorPaintMode();

            if (!isMobileView()) {
              // 桌面: 這一下只用來染色, 吃掉.
              event.preventDefault();
              event.stopPropagation();
              return;
            }

            // 手機: 染完順手把它選起來, 使用者可以直接接著輸入.
            // (只選中, 不 focus -- 自動彈鍵盤比沒選中更煩. )
            app.selectedKnotId = paintId;
            render();
            return;
          }
        }

        const knotEl = event.target.closest(".knot");

        if (!knotEl) {
          app.selectedKnotId = null;
          render();
          return;
        }

        const knot = findKnot(knotEl.dataset.knotId);
        if (!knot) return;

        app.selectedKnotId = knot.id;

        if (event.target.closest(".delete-btn")) {
          event.preventDefault();
          event.stopPropagation();
          deleteKnot(knot.id);
          touchDocumentUpdated();
          saveState();
          render();
          return;
        }

        if (event.target.closest(".knot-edit-btn")) {
          event.preventDefault();
          event.stopPropagation();
          const titleEl = knotEl.querySelector(".knot-title");
          if (titleEl) {
            titleEl.contentEditable = "true";
            titleEl.focus();
          }
          return;
        }

        if (
          event.target.classList.contains("knot-title") ||
          event.target.classList.contains("knot-content-input")
        ) {
          return;
        }

        render();
      });

      layer.addEventListener("input", (event) => {
        const knotEl = event.target.closest(".knot");
        if (!knotEl) return;

        const knot = findKnot(knotEl.dataset.knotId);
        if (!knot) return;

        if (event.target.classList.contains("knot-content-input")) {
          ensureKnotContent(knot).text = event.target.value;
          event.target.style.height = "auto";
          event.target.style.height = `${event.target.scrollHeight}px`;
          touchDocumentUpdated();
          // 連續輸入併成一步; 打到標點就切段(Rec 2026-08-30)
          saveState({ coalesce: `text:${knot.id}` });
          if (breaksTextRun(event, event.target.value)) {
            app.coalesceKey = null;
          }
        }
      });

      // 離開輸入框 = 這一段輸入結束, 下次再打就是新的一步
      layer.addEventListener(
        "focusout",
        () => {
          app.coalesceKey = null;
        },
        true
      );

      layer.addEventListener(
        "focusin",
        (event) => {
          if (event.target.classList.contains("knot-content-input")) {
            const knotEl = event.target.closest(".knot");
            const knot = knotEl ? findKnot(knotEl.dataset.knotId) : null;
            if (knot && app.activeContentKnotId !== knot.id) {
              app.activeContentKnotId = knot.id;
            }
            return;
          }
          if (!event.target.classList.contains("knot-title")) return;
          if (event.target.contentEditable !== "true") return;
          const knotEl = event.target.closest(".knot");
          if (!knotEl) return;
          const knot = findKnot(knotEl.dataset.knotId);
          if (!knot) return;

          knotEl.classList.add("is-renaming");
          event.target.dataset.editingStartTitle = getKnotEditingTitle(knot);
          event.target.textContent = getKnotEditingTitle(knot);
        },
        true
      );

      layer.addEventListener("keydown", (event) => {
        if (!event.target.classList.contains("knot-title")) return;
        if (event.target.contentEditable !== "true") return;
        if (event.key === "Enter") {
          event.preventDefault();
          event.target.blur();
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          const original = event.target.dataset.editingStartTitle || "";
          event.target.textContent = original;
          event.target.blur();
        }
      });

      layer.addEventListener(
        "focusout",
        (event) => {
          if (event.target.classList.contains("knot-content-input")) {
            const knotEl = event.target.closest(".knot");
            const knot = knotEl ? findKnot(knotEl.dataset.knotId) : null;
            if (knot && app.activeContentKnotId === knot.id) {
              app.activeContentKnotId = null;
              if (!isMobileView()) {
                render();
              }
            }
            return;
          }
          if (!event.target.classList.contains("knot-title")) return;
          if (event.target.contentEditable !== "true") return;
          const knotEl = event.target.closest(".knot");
          if (!knotEl) return;
          const knot = findKnot(knotEl.dataset.knotId);
          if (!knot) return;

          knotEl.classList.remove("is-renaming");
          knot.title = (event.target.textContent || "").trim();
          delete event.target.dataset.editingStartTitle;
          event.target.contentEditable = "false";
          touchDocumentUpdated();
          saveState();
          render();
        },
        true
      );

      layer.addEventListener("dblclick", (event) => {
        const knotEl = event.target.closest(".knot");
        if (!knotEl) return;

        const knot = findKnot(knotEl.dataset.knotId);
        if (!knot) return;

        if (event.target.classList.contains("knot-header") || event.target.classList.contains("knot-title")) {
          const meta = ensureKnotUiMeta(knot);
          meta.contentExpanded = !meta.contentExpanded;
          touchDocumentUpdated();
          saveState();
          render();
        }
      });
    }
  }

  function bindConnectEvents() {
    const knotLayers = [app.dom.knotLayer, app.dom.trayKnotLayer].filter(Boolean);
    for (const layer of knotLayers) {
      layer.addEventListener("mousedown", (event) => {
      const port = event.target.closest(".port");
      if (!port || event.button !== 0) return;

      event.stopPropagation();
      event.preventDefault();

      const knotEl = port.closest(".knot");
      if (!knotEl) return;

      const knotId = knotEl.dataset.knotId;
      const side = port.dataset.side;
      const point = getPortCenterVisual(knotId, side);
      if (!point) return;

      app.connectFrom = { knotId, side };
      app.tempPoint = point;
      renderEdges();

      const onMove = (moveEvent) => {
        app.tempPoint = getCanvasLocalPointFromClient(moveEvent.clientX, moveEvent.clientY);
        renderEdges();
      };

      const onUp = (upEvent) => {
        const targetAtPoint = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
        const targetPort = targetAtPoint?.closest?.(".port");

        if (targetPort) {
          const toEl = targetPort.closest(".knot");
          tryCreateEdge({
            fromKnotId: app.connectFrom.knotId,
            fromSide: app.connectFrom.side,
            toKnotId: toEl?.dataset.knotId,
            toSide: targetPort.dataset.side
          });
        } else {
          createKnotFromPortDrop(upEvent);
        }

        app.connectFrom = null;
        app.tempPoint = null;

        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);

        touchDocumentUpdated();
        saveState();
        render();
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      });
    }
  }

  function bindEdgeEvents() {
    function syncHoveredEdgeClass() {
      const paths = app.dom.edgeLayer.querySelectorAll(".edge");
      for (const path of paths) {
        path.classList.toggle("is-hovered", path.dataset.edgeId === app.hoverEdgeId);
      }
    }

    function setHoveredEdge(edgeId) {
      if (app.hoverEdgeId === edgeId) return;
      app.hoverEdgeId = edgeId;
      syncHoveredEdgeClass();
      renderEdgeTools();
    }

    app.dom.edgeLayer.addEventListener("mouseover", (event) => {
      const target = event.target.closest(".edge-hit, .edge");
      if (!target || !target.dataset.edgeId || target.classList.contains("temp")) return;
      setHoveredEdge(target.dataset.edgeId);
    });

    app.dom.edgeLayer.addEventListener("mouseout", (event) => {
      const target = event.target.closest(".edge-hit, .edge");
      if (!target || !target.dataset.edgeId || target.classList.contains("temp")) return;

      const related = event.relatedTarget;
      if (
        related &&
        related.closest &&
        related.closest(".edge-cut") &&
        related.closest(".edge-cut").dataset.edgeId === target.dataset.edgeId
      ) {
        return;
      }

      if (
        related &&
        related.closest &&
        related.closest(".edge-hit, .edge") &&
        related.closest(".edge-hit, .edge").dataset.edgeId === target.dataset.edgeId
      ) {
        return;
      }

      setHoveredEdge(null);
    });

    app.dom.edgeToolLayer.addEventListener("mouseover", (event) => {
      const btn = event.target.closest(".edge-cut");
      if (!btn || !btn.dataset.edgeId) return;
      setHoveredEdge(btn.dataset.edgeId);
    });

    app.dom.edgeToolLayer.addEventListener("mouseout", (event) => {
      const btn = event.target.closest(".edge-cut");
      if (!btn || !btn.dataset.edgeId) return;
      const related = event.relatedTarget;
      if (
        related &&
        related.closest &&
        ((related.closest(".edge-cut") && related.closest(".edge-cut").dataset.edgeId === btn.dataset.edgeId) ||
          (related.closest(".edge") && related.closest(".edge").dataset.edgeId === btn.dataset.edgeId))
      ) {
        return;
      }
      setHoveredEdge(null);
    });

    const handleEdgeCut = (event) => {
      const btn = event.target.closest(".edge-cut");
      if (!btn || !btn.dataset.edgeId) return;
      if (event.type !== "click" && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const edgeId = btn.dataset.edgeId;
      app.state.edges = app.state.edges.filter((edge) => edge.id !== edgeId);
      removeEdgeFromAllMenuProjections(app.state, edgeId);
      setHoveredEdge(null);
      touchDocumentUpdated();
      saveState();
      render();
    };

    app.dom.edgeToolLayer.addEventListener("mousedown", handleEdgeCut);
    app.dom.edgeToolLayer.addEventListener("pointerdown", handleEdgeCut);
    app.dom.edgeToolLayer.addEventListener("click", handleEdgeCut);
  }

  function createKnot(options = {}) {
    const id = `k${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const knot = {
      id,
      title: resolveNewKnotTitle(app.state, options),
      content: { text: options.text ?? "" },
      meta: options.meta && typeof options.meta === "object" ? structuredClone(options.meta) : {}
    };

    const layout = {
      x: options.x ?? 280 + app.state.knots.length * 24,
      y: options.y ?? 180 + app.state.knots.length * 20,
      width: Number.isFinite(options.width) ? options.width : KNOT_SIZE.width,
      height: Number.isFinite(options.height) ? options.height : null,
      zIndex: nextZIndex()
    };

    if (options.parentId != null) {
      knot.meta.parentId = String(options.parentId);
    }
    knot.meta.location = options.location ?? options.zone ?? "canvas";
    if (options.colorName) {
      knot.meta.color = options.colorName;
    } else if (app.activeDefaultColorName) {
      knot.meta.color = app.activeDefaultColorName;
    }
    const uiMeta = ensureKnotUiMeta(knot);
    if (options.contentExpanded !== undefined) {
      uiMeta.contentExpanded = Boolean(options.contentExpanded);
    }
    if (options.childrenCollapsed !== undefined) {
      uiMeta.childrenCollapsed = Boolean(options.childrenCollapsed);
    }

    app.state.knots.push(knot);
    setKnotLayout(app.state, id, layout);

    const includeInActiveMenu = options.includeInActiveMenu !== false;
    const menu = getActiveMenu(app.state);
    if (includeInActiveMenu && menu) {
      addKnotToMenuProjection(app.state, menu.id, id);
    }

    syncHierarchyFiles(app.state);
    return knot;
  }

  function createExtendedKnot(sourceKnot, side) {
    const gapX = 184;
    const srcLayout = getKnotLayout(app.state, sourceKnot.id);
    const branchIndex = app.state.edges.filter((e) =>
      side === "right" ? e.from === sourceKnot.id : e.to === sourceKnot.id
    ).length;
    const staggerY = branchIndex * 64;

    const activeMenu = getActiveMenu(app.state);
    const sourceInActiveMenu = activeMenu ? activeMenu.knotIds.includes(sourceKnot.id) : false;
    const newKnot = createKnot({
      parentKnot: sourceKnot,
      contentExpanded: true,
      x: side === "right" ? srcLayout.x + gapX : Math.max(0, srcLayout.x - gapX),
      y: srcLayout.y + staggerY,
      width: KNOT_SIZE.width,
      location: getKnotLocation(sourceKnot),
      includeInActiveMenu: sourceInActiveMenu
    });

    if (side === "right") {
      const edge = ensureEdge(app.state, sourceKnot.id, newKnot.id, "link");
      if (sourceInActiveMenu && activeMenu && edge) {
        addEdgeToMenuProjection(app.state, activeMenu.id, edge.id);
      }
    } else {
      const edge = ensureEdge(app.state, newKnot.id, sourceKnot.id, "link");
      if (sourceInActiveMenu && activeMenu && edge) {
        addEdgeToMenuProjection(app.state, activeMenu.id, edge.id);
      }
    }

    bringKnotToFront(newKnot.id);
    app.selectedKnotId = newKnot.id;
    return newKnot;
  }

  function deleteKnot(knotId) {
    app.state.knots = app.state.knots.filter((k) => k.id !== knotId);
    delete app.state.ui.layout.knots[knotId];

    for (const knot of app.state.knots) {
      const pid = knot.meta && knot.meta.parentId;
      if (pid === knotId) delete knot.meta.parentId;
    }

    const removedEdgeIds = app.state.edges
      .filter((edge) => edge.from === knotId || edge.to === knotId)
      .map((edge) => edge.id);
    app.state.edges = app.state.edges.filter((edge) => edge.from !== knotId && edge.to !== knotId);
    removeKnotFromAllMenuProjections(app.state, knotId);
    for (const edgeId of removedEdgeIds) {
      removeEdgeFromAllMenuProjections(app.state, edgeId);
    }

    if (app.selectedKnotId === knotId) {
      app.selectedKnotId = null;
    }

    syncHierarchyFiles(app.state);
  }

  function tryCreateEdge({ fromKnotId, fromSide, toKnotId, toSide }) {
    if (!toKnotId || fromKnotId === toKnotId) return;
    const from = findKnot(fromKnotId);
    const to = findKnot(toKnotId);
    if (!from || !to) return;
    if (isTrayKnot(from) || isTrayKnot(to)) return;

    // 從 right 拉出: source -> target
    if (fromSide === "right") {
      ensureEdge(app.state, fromKnotId, toKnotId, "link");
      return;
    }

    // 從 left 拉出: target -> source
    if (fromSide === "left") {
      ensureEdge(app.state, toKnotId, fromKnotId, "link");
      return;
    }
  }

  function createKnotFromPortDrop(event) {
    if (!app.connectFrom) return;

    const sourceKnot = findKnot(app.connectFrom.knotId);
    if (!sourceKnot) return;

    const world = screenToWorld(event.clientX, event.clientY);

    const activeMenu = getActiveMenu(app.state);
    const sourceInActiveMenu = activeMenu ? activeMenu.knotIds.includes(sourceKnot.id) : false;
    const newKnot = createKnot({
      parentKnot: app.connectFrom.side === "right" ? sourceKnot : null,
      contentExpanded: true,
      y: Math.max(0, world.y),
      x: Math.max(0, world.x),
      width: KNOT_SIZE.width,
      height: KNOT_SIZE.height,
      location: "canvas",
      includeInActiveMenu: sourceInActiveMenu
    });

    if (app.connectFrom.side === "right") {
      const edge = ensureEdge(app.state, sourceKnot.id, newKnot.id, "link");
      if (sourceInActiveMenu && activeMenu && edge) {
        addEdgeToMenuProjection(app.state, activeMenu.id, edge.id);
      }
    } else {
      const edge = ensureEdge(app.state, newKnot.id, sourceKnot.id, "link");
      if (sourceInActiveMenu && activeMenu && edge) {
        addEdgeToMenuProjection(app.state, activeMenu.id, edge.id);
      }
    }

    bringKnotToFront(newKnot.id);
    app.selectedKnotId = newKnot.id;
  }

  function render() {
    syncMenuVisibilityUi();
    renderKnots();
    renderEdges();
    renderMenuPanel();
    requestAnimationFrame(autoFitTextareas);
  }

  function enforceMobileTrayLayout() {
    if (!window.matchMedia("(max-width: 720px)").matches) return;
    if (!app.dom.trayKnotLayer) return;

    const trayRect = app.dom.trayKnotLayer.getBoundingClientRect();
    if (!trayRect.width || !trayRect.height) return;

    const trayKnotIds = app.state.knots
      .filter((knot) => isTrayKnot(knot))
      .map((knot) => knot.id);

    if (!trayKnotIds.length) return;

    // 逐顆檢查: 出界, 或跟已放好的重疊 → 重抽一個位置.
    // 沒問題的那些**原地不動**(否則使用者自己拖好的位置每次開抽屜都會被洗掉).
    const placed = [];
    for (const knotId of trayKnotIds) {
      const layout = getKnotLayout(app.state, knotId);
      const box = getTrayKnotBox(knotId);
      const maxX = Math.max(0, trayRect.width - box.w);
      const maxY = Math.max(0, trayRect.height - box.h);

      const outside =
        layout.x < 0 || layout.x > maxX || layout.y < 0 || layout.y > maxY;
      const collides = placed.some((t) =>
        boxesOverlap(layout.x, layout.y, box.w, box.h, t)
      );

      if (!outside && !collides) {
        placed.push({ x: layout.x, y: layout.y, w: box.w, h: box.h });
        continue;
      }

      const spot = pickTraySpot(placed, box.w, box.h, maxX, maxY);
      setKnotLayout(app.state, knotId, { ...layout, x: spot.x, y: spot.y });
      placed.push({ x: spot.x, y: spot.y, w: box.w, h: box.h });
    }
  }

  function renderKnots() {
    const visibleIds = new Set(getVisibleKnotIds());
    const canvasFrag = document.createDocumentFragment();
    const trayFrag = document.createDocumentFragment();

    for (const knot of app.state.knots) {
      if (!visibleIds.has(knot.id)) continue;

      const layout = getKnotLayout(app.state, knot.id);
      const uiMeta = knot.meta && knot.meta.ui ? knot.meta.ui : {};
      const contentExpanded = uiMeta.contentExpanded !== false;

      const knotEl = document.createElement("article");
      knotEl.className = "knot";
      knotEl.dataset.knotId = knot.id;
      const color = getColorByName(knot.meta?.color);
      if (color) {
        knotEl.dataset.color = color.name;
        knotEl.style.setProperty("--knot-accent", color.hex);
        if (color.name === "ruvia") {
          knotEl.style.setProperty("--knot-bg-accent", "var(--knot-bg)");
          knotEl.style.backgroundColor = "var(--knot-bg)";
        } else {
          knotEl.style.setProperty("--knot-bg-accent", `${color.hex}55`);
          knotEl.style.backgroundColor = `${color.hex}55`;
        }
      } else {
        delete knotEl.dataset.color;
        knotEl.style.removeProperty("--knot-accent");
        knotEl.style.removeProperty("--knot-bg-accent");
        knotEl.style.removeProperty("background-color");
      }
      knotEl.style.left = `${layout.x}px`;
      knotEl.style.top = `${layout.y}px`;
      knotEl.style.width = `${layout.width || KNOT_SIZE.width}px`;
      knotEl.style.zIndex = String(layout.zIndex || 1);

      if (uiMeta.childrenCollapsed) knotEl.classList.add("is-child-collapsed");
      if (knot.id === app.selectedKnotId) knotEl.classList.add("is-selected");

      const header = document.createElement("div");
      header.className = "knot-header";

      const title = document.createElement("div");
      title.className = "knot-title";
      title.contentEditable = "false";
      title.spellcheck = false;
      title.textContent = getKnotDisplayTitle(knot);
      title.dataset.rawTitle = getKnotEditingTitle(knot);

      const actions = document.createElement("div");
      actions.className = "knot-actions";

      const editBtn = makeBtn("knot-edit-btn", "✐", "Rename knot");
      const deleteBtn = makeBtn("delete-btn", "\u00d7", "Delete knot");
      actions.append(editBtn, deleteBtn);

      header.append(title, actions);

      const contentWrap = document.createElement("div");
      contentWrap.className = "knot-content";

      const textInput = document.createElement("textarea");
      textInput.className = "knot-content-input";
      const contentText = ensureKnotContent(knot).text;
      const isEmptyContent = contentText.trim() === "";
      const shouldRevealEmptyContent = isEmptyContent && (
        (!isMobileView() && (app.hoverKnotId === knot.id || app.activeContentKnotId === knot.id)) ||
        (isMobileView() && app.selectedKnotId === knot.id)
      );
      textInput.value = contentText;
      textInput.placeholder = "content";
      textInput.style.height = "auto";

      const leftPort = document.createElement("div");
      leftPort.className = "port left";
      leftPort.dataset.side = "left";

      const rightPort = document.createElement("div");
      rightPort.className = "port right";
      rightPort.dataset.side = "right";

      const addLeft = document.createElement("button");
      addLeft.type = "button";
      addLeft.className = "side-add left";
      addLeft.dataset.side = "left";
      addLeft.title = "extend left";
      addLeft.textContent = "+";

      const addRight = document.createElement("button");
      addRight.type = "button";
      addRight.className = "side-add right";
      addRight.dataset.side = "right";
      addRight.title = "extend right";
      addRight.textContent = "+";

      const shouldShowContentRow = isEmptyContent
        ? shouldRevealEmptyContent
        : contentExpanded;
      if (shouldShowContentRow) {
        knotEl.classList.add("content-expanded");
      }
      if (isEmptyContent) {
        knotEl.classList.add("is-empty-content");
      }

      if (isTrayKnot(knot)) {
        contentWrap.append(textInput);
        knotEl.append(header, contentWrap);
        trayFrag.append(knotEl);
      } else {
        contentWrap.append(textInput);
        knotEl.append(header, contentWrap, leftPort, rightPort, addLeft, addRight);
        canvasFrag.append(knotEl);
      }
    }

    app.dom.knotLayer.replaceChildren(canvasFrag);
    if (app.dom.trayKnotLayer) {
      app.dom.trayKnotLayer.replaceChildren(trayFrag);
    }
    bindKnotResizeObservers();
  }

  function bindKnotResizeObservers() {
    if (typeof ResizeObserver === "undefined") return;

    if (!app.resizeObserver) {
      app.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const textarea = entry.target;
          const knotEl = textarea.closest(".knot");
          if (!knotEl) continue;

          const knot = findKnot(knotEl.dataset.knotId);
          if (!knot) continue;
        }
        renderEdges();
      });
    }

    app.resizeObserver.disconnect();
    const textareas = [
      ...app.dom.knotLayer.querySelectorAll(".knot-content-input"),
      ...(app.dom.trayKnotLayer ? app.dom.trayKnotLayer.querySelectorAll(".knot-content-input") : [])
    ];
    for (const textarea of textareas) {
      app.resizeObserver.observe(textarea);
    }
  }

  function autoFitTextareas() {
    const inputs = document.querySelectorAll(".knot-content-input");
    for (const input of inputs) {
      input.style.height = "auto";
      input.style.height = `${input.scrollHeight}px`;
    }
  }

  function renderEdges() {
    const svg = app.dom.edgeLayer;
    const wr = getCanvasRect();

    svg.setAttribute("width", String(wr.width));
    svg.setAttribute("height", String(wr.height));
    svg.setAttribute("viewBox", `0 0 ${wr.width} ${wr.height}`);

    const visibleIds = new Set(getVisibleKnotIds());
    const paths = [];

    const activeEdgeIds = new Set(getEdgesForActiveMenu(app.state).map((e) => e.id));

    for (const edge of app.state.edges) {
      if (!activeEdgeIds.has(edge.id)) continue;
      if (!visibleIds.has(edge.from) || !visibleIds.has(edge.to)) continue;
      if (isTrayKnot(getKnotById(app.state, edge.from))) continue;
      if (isTrayKnot(getKnotById(app.state, edge.to))) continue;

      const from = getPortCenterVisual(edge.from, "right");
      const to = getPortCenterVisual(edge.to, "left");
      if (!from || !to) continue;

      const d = edgePath(from, to);

      const hitPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      hitPath.classList.add("edge-hit");
      hitPath.dataset.edgeId = edge.id;
      hitPath.setAttribute("d", d);
      paths.push(hitPath);

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.classList.add("edge");
      if (edge.id === app.hoverEdgeId) path.classList.add("is-hovered");
      path.dataset.edgeId = edge.id;
      path.setAttribute("d", d);
      path.setAttribute("stroke", edgeStroke(edge.relation));
      path.setAttribute("title", edge.relation || "link");
      paths.push(path);
    }

    if (app.connectFrom && app.tempPoint) {
      const origin = getPortCenterVisual(app.connectFrom.knotId, app.connectFrom.side);
      if (origin) {
        const tempPoint = app.tempPoint;
        const temp = document.createElementNS("http://www.w3.org/2000/svg", "path");
        temp.classList.add("edge", "temp");
        temp.style.stroke = "#ff0000";
        temp.setAttribute("d", edgePath(origin, tempPoint));
        paths.push(temp);
      }
    }

    svg.replaceChildren(...paths);
    renderEdgeTools();
  }

  function renderEdgeTools() {
    const layer = app.dom.edgeToolLayer;
    if (!layer) return;

    if (!app.hoverEdgeId) {
      layer.replaceChildren();
      return;
    }

    const edge = app.state.edges.find((item) => item.id === app.hoverEdgeId);
    if (!edge) {
      layer.replaceChildren();
      return;
    }

    const from = getPortCenterVisual(edge.from, "right");
    const to = getPortCenterVisual(edge.to, "left");
    if (!from || !to) {
      layer.replaceChildren();
      return;
    }
    const mid = {
      x: (from.x + to.x) / 2,
      y: (from.y + to.y) / 2
    };
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "edge-cut is-visible";
    btn.dataset.edgeId = edge.id;
    btn.textContent = "✂";
    btn.title = "cut edge";
    btn.style.left = `${mid.x}px`;
    btn.style.top = `${mid.y}px`;
    layer.replaceChildren(btn);
  }

  function getPortCenterWorld(knotId, side) {
    const layout = getKnotLayout(app.state, knotId);
    const knot = getKnotById(app.state, knotId);
    if (!layout || !knot || isTrayKnot(knot)) return null;
    const width = layout.width || KNOT_SIZE.width;
    const knotEl = app.dom.knotLayer.querySelector(`.knot[data-knot-id="${knotId}"]`);
    const contentEl = knotEl?.querySelector(".knot-content");
    const dynamicHeight = contentEl
      ? knotEl.offsetHeight / getCanvasScale()
      : (layout.height || KNOT_SIZE.height);
    const h = dynamicHeight || layout.height || KNOT_SIZE.height;
    return {
      x: side === "right" ? layout.x + width : layout.x,
      y: layout.y + h / 2
    };
  }

  function edgePath(from, to) {
    const dx = Math.abs(to.x - from.x);
    const c = Math.max(16, dx * 0.35);
    return `M ${from.x} ${from.y} C ${from.x + c} ${from.y}, ${to.x - c} ${to.y}, ${to.x} ${to.y}`;
  }

  function edgeMidpoint(from, to) {
    const dx = Math.abs(to.x - from.x);
    const c = Math.max(16, dx * 0.35);
    const p0 = from;
    const p1 = { x: from.x + c, y: from.y };
    const p2 = { x: to.x - c, y: to.y };
    const p3 = to;
    const t = 0.5;
    const mt = 1 - t;
    const x =
      mt * mt * mt * p0.x +
      3 * mt * mt * t * p1.x +
      3 * mt * t * t * p2.x +
      t * t * t * p3.x;
    const y =
      mt * mt * mt * p0.y +
      3 * mt * mt * t * p1.y +
      3 * mt * t * t * p2.y +
      t * t * t * p3.y;
    return { x, y };
  }

  function findKnot(knotId) {
    return app.state.knots.find((k) => k.id === knotId) || null;
  }

  function getVisibleKnotIds() {
    const memberIds = new Set(getVisibleKnotIdsForMenu(app.state, app.state.ui.activeMenuId));
    const hidden = new Set();
    const childrenMap = new Map();

    for (const knot of app.state.knots) {
      if (!memberIds.has(knot.id)) continue;
      const pid = knot.meta && knot.meta.parentId != null ? knot.meta.parentId : null;
      if (!childrenMap.has(pid)) childrenMap.set(pid, []);
      childrenMap.get(pid).push(knot.id);
    }

    for (const knot of app.state.knots) {
      if (!memberIds.has(knot.id)) continue;
      const ui = knot.meta && knot.meta.ui;
      if (!ui || !ui.childrenCollapsed) continue;
      markDescendantsHidden(knot.id, childrenMap, hidden);
    }

    return app.state.knots
      .filter((k) => memberIds.has(k.id) && !hidden.has(k.id))
      .map((k) => k.id);
  }

  function markDescendantsHidden(rootId, childrenMap, hidden) {
    const stack = [...(childrenMap.get(rootId) || [])];

    while (stack.length) {
      const id = stack.pop();
      hidden.add(id);
      stack.push(...(childrenMap.get(id) || []));
    }
  }

  const UNDO_LIMIT = 50;

  // 撤銷用**整份快照**, 不是 command/inverse.
  // 理由: inverse 要為每個動作手寫一份, 漏一個就是一個安靜的 bug;
  // 而 Ruvia 的文件很小(預設約 6KB JSON), 50 份放記憶體裡完全付得起.
  // 而且掛在 saveState() 上 -- 20 個呼叫點一個都不會漏,
  // **包含刪整棵樹**(Rec 指定要能撤銷的那一個), 不需要為它另外寫還原邏輯.
  // 一段連續輸入合併成**一步**撤銷.
  // key 相同 → 不推新的, 堆疊頂端那份已經是「這段輸入開始之前」的樣子.
  // 打到標點就把 key 清掉, 下一個字元開新的一段 -- 所以撤銷會回到上一個標點.
  function saveState(opts) {
    syncHierarchyFiles(app.state);
    const next = JSON.stringify(app.state);
    const key = opts && opts.coalesce ? String(opts.coalesce) : null;

    if (app.lastSaved != null && app.lastSaved !== next) {
      const merge = key != null && key === app.coalesceKey;
      if (!merge) {
        app.undoStack.push(app.lastSaved);
        if (app.undoStack.length > UNDO_LIMIT) app.undoStack.shift();
        app.redoStack.length = 0; // 有新動作就沒有「重做」可言了
      }
    }
    app.coalesceKey = key;
    app.lastSaved = next;

    localStorage.setItem(STORAGE_KEY, next);
    syncHistoryUi();
  }

  // ↺ 只在「撤銷過, 而且還沒被新動作作廢」的時候存在.
  // 用有無取代 disabled 樣式: 沒得重做時它根本不佔位, 也就不會有人按了沒反應.
  function syncHistoryUi() {
    document.body.classList.toggle("can-redo", app.redoStack.length > 0);
  }

  // 標點與換行才切段. **空白不算** -- 空白也切的話等於一個詞一步, 跟一個字一步一樣煩.
  // CJK 那一段刻意寫成 \u 逃脫: 這一行是功能碼不是文案,
  // 直接放全形字元會被標點 pre-commit 當成踩線擋下來.
  const TEXT_BREAK_RE = new RegExp(
    "[.,;:!?()\\[\\]{}\"'`/\\\\|~\\n" +
      "\u3002\uff0c\u3001\uff1b\uff1a\uff01\uff1f\u2026\u2014" +
      "\u300c\u300d\u300e\u300f\uff08\uff09\u300a\u300b\u3010\u3011]"
  );

  function breaksTextRun(inputEvent, value) {
    const typed = inputEvent && typeof inputEvent.data === "string" ? inputEvent.data : null;
    if (typed) return TEXT_BREAK_RE.test(typed);
    // data 為 null(刪除, 輸入法整段送出等): 看目前結尾那個字元
    if (typeof value === "string" && value.length) {
      return TEXT_BREAK_RE.test(value[value.length - 1]);
    }
    return false;
  }

  // 直接寫 localStorage, 繞過 saveState -- 還原本身不該再產生一步撤銷
  function restoreSnapshot(json) {
    app.state = JSON.parse(json);
    app.lastSaved = json;
    localStorage.setItem(STORAGE_KEY, json);

    // 還原後指標可能指到已經不存在的東西
    if (app.selectedKnotId && !app.state.knots.some((k) => k.id === app.selectedKnotId)) {
      app.selectedKnotId = null;
    }
    if (!app.state.menus.some((m) => m.id === app.state.ui.activeMenuId)) {
      app.state.ui.activeMenuId = app.state.menus.length ? app.state.menus[0].id : null;
    }
    clearColorPaintMode();
    syncHistoryUi();

    applyZoom();
    render();
  }

  function undo() {
    if (!app.undoStack.length) return false;
    const prev = app.undoStack.pop();
    app.redoStack.push(app.lastSaved);
    if (app.redoStack.length > UNDO_LIMIT) app.redoStack.shift();
    restoreSnapshot(prev);
    return true;
  }

  function redo() {
    if (!app.redoStack.length) return false;
    const next = app.redoStack.pop();
    app.undoStack.push(app.lastSaved);
    if (app.undoStack.length > UNDO_LIMIT) app.undoStack.shift();
    restoreSnapshot(next);
    return true;
  }

  function bindUndoHotkeys() {
    window.addEventListener("keydown", (event) => {
      if (!(event.metaKey || event.ctrlKey)) return;

      // 焦點在文字欄位時, 交給瀏覽器的原生文字復原 -- 不要搶使用者打字的 undo
      const el = event.target;
      if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable)) {
        return;
      }

      const key = (event.key || "").toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }
      // 重做: Cmd/Ctrl+Shift+Z(Mac 與多數創作工具)+ Ctrl+Y(Windows 舊慣例)
      if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        redo();
      }
    });
  }

  /** 清除本機與 Ruvia 相關的 localStorage(工作區, 舊版存檔, 主題, 縮放) */
  function clearRuviaLocalStorage() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    localStorage.removeItem(THEME_KEY);
    localStorage.removeItem(ZOOM_KEY);
  }

  function loadState() {
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!raw) return buildShowcaseInitialState();
      return loadFromImport(JSON.parse(raw));
    } catch (_error) {
      return buildShowcaseInitialState();
    }
  }

  // 2026-08-30: 世界單位 ×2(見 GLOBAL_SCALE 的註解).
  // 舊檔的座標是現在的一半, 載入時補回來, 否則整棵樹會擠成一團.
  // 判斷靠 spec 字串, 遷移完就標成新 spec -- **冪等**, 不會被乘兩次.
  // 沒有 spec 的檔一律當舊檔(那個年代的檔案就是沒有).
  // width 不必管: setKnotLayout()/normalizeAllLayoutSizes() 每次都會強制蓋成 KNOT_SIZE.width.
  function migrateWorldUnits(raw) {
    if (!raw || typeof raw !== "object" || raw.spec === SPEC) return raw;

    const out = structuredClone(raw);
    const layouts = out && out.ui && out.ui.layout ? out.ui.layout.knots : null;
    if (layouts && typeof layouts === "object") {
      for (const id of Object.keys(layouts)) {
        const l = layouts[id];
        if (!l || typeof l !== "object") continue;
        if (Number.isFinite(l.x)) l.x *= 2;
        if (Number.isFinite(l.y)) l.y *= 2;
        if (Number.isFinite(l.height)) l.height *= 2;
      }
    }
    out.spec = SPEC;
    return out;
  }

  function loadFromImport(rawInput) {
    const raw = migrateWorldUnits(rawInput);
    if (!raw || typeof raw !== "object") return migrateLegacyState(raw);
    const looksNew =
      raw.spec === SPEC ||
      (Array.isArray(raw.menus) && Array.isArray(raw.knots));
    if (looksNew) {
      const doc = normalizeDocument(raw.spec === SPEC ? raw : { ...raw, spec: SPEC });
      applyImportedFiles(doc);
      syncHierarchyFiles(doc);
      const err = validateDocument(doc);
      if (err) console.warn("validateDocument:", err);
      return doc;
    }
    return migrateLegacyState(raw);
  }

  function slugifyImportFileName(fileName) {
    const base = String(fileName || "root").replace(/\.[^.]+$/, "");
    const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return slug || "root";
  }

  function displayNameFromImportFileName(fileName) {
    return String(fileName || "root").replace(/\.[^.]+$/, "").trim() || "root";
  }

  function prefixImportedDocumentIds(doc, fileName, index) {
    const out = structuredClone(doc);
    const prefix = `imported_${slugifyImportFileName(fileName)}_${index}`;
    const displayName = displayNameFromImportFileName(fileName);
    const knotIdMap = new Map();
    const edgeIdMap = new Map();
    const menuIdMap = new Map();
    const rootIdMap = new Map();

    for (const knot of out.knots) {
      knotIdMap.set(knot.id, `${prefix}_${knot.id}`);
    }
    for (const edge of out.edges) {
      edgeIdMap.set(edge.id, `${prefix}_${edge.id}`);
    }
    for (const menu of out.menus) {
      menuIdMap.set(menu.id, `${prefix}_${menu.id}`);
    }
    for (const root of out.roots) {
      rootIdMap.set(root.id, `${prefix}_${root.id}`);
    }

    out.knots = out.knots.map((knot) => {
      const next = { ...knot, id: knotIdMap.get(knot.id) || knot.id };
      if (next.meta?.parentId) {
        next.meta = { ...next.meta, parentId: knotIdMap.get(next.meta.parentId) || next.meta.parentId };
      }
      return next;
    });

    out.edges = out.edges.map((edge) => ({
      ...edge,
      id: edgeIdMap.get(edge.id) || edge.id,
      from: knotIdMap.get(edge.from) || edge.from,
      to: knotIdMap.get(edge.to) || edge.to
    }));

    out.menus = out.menus.map((menu, menuIndex) => ({
      ...menu,
      id: menuIdMap.get(menu.id) || menu.id,
      name: out.menus.length === 1 ? displayName : `${displayName}/${menu.name || `tree-${menuIndex + 1}`}`,
      knotIds: menu.knotIds.map((id) => knotIdMap.get(id) || id),
      edgeIds: menu.edgeIds.map((id) => edgeIdMap.get(id) || id),
      entryKnotId: menu.entryKnotId ? knotIdMap.get(menu.entryKnotId) || menu.entryKnotId : null,
      meta: {
        ...(menu.meta || {}),
        sourceFileName: fileName,
        rootDisplayName: displayName
      }
    }));

    out.roots = out.roots.map((root) => ({
      ...root,
      id: rootIdMap.get(root.id) || root.id,
      menuIds: root.menuIds.map((id) => menuIdMap.get(id) || id)
    }));

    const nextLayouts = {};
    for (const [knotId, layout] of Object.entries(out.ui.layout.knots || {})) {
      const nextId = knotIdMap.get(knotId) || knotId;
      nextLayouts[nextId] = { ...layout };
    }
    out.ui.layout.knots = nextLayouts;
    out.ui.activeMenuId = menuIdMap.get(out.ui.activeMenuId) || out.ui.activeMenuId;

    if (out.hierarchy?.folders) {
      out.hierarchy.folders = out.hierarchy.folders.map((folder) => ({
        ...folder,
        menuIds: (folder.menuIds || []).map((id) => menuIdMap.get(id) || id)
      }));
    }

    return out;
  }

  function prefixImportedDocumentForSingleLoad(doc, fileName) {
    const out = structuredClone(doc);
    const displayName = displayNameFromImportFileName(fileName);

    if (out.menus.length === 1) {
      out.menus[0].name = displayName;
      out.menus[0].meta = {
        ...(out.menus[0].meta || {}),
        sourceFileName: fileName,
        rootDisplayName: displayName
      };
    } else {
      out.menus = out.menus.map((menu, index) => ({
        ...menu,
        name: `${displayName}/${menu.name || `tree-${index + 1}`}`,
        meta: {
          ...(menu.meta || {}),
          sourceFileName: fileName,
          rootDisplayName: displayName
        }
      }));
    }

    out.document.title = displayName;
    syncHierarchyFromMenus(out);
    syncHierarchyFiles(out);
    return out;
  }

  function createEmptyMergedState() {
    const state = createDefaultState();
    state.menus = [];
    state.knots = [];
    state.edges = [];
    state.roots = [];
    state.ui.activeMenuId = null;
    state.ui.layout.knots = {};
    state.hierarchy.folders = [{ id: uid("f"), name: "root", menuIds: [] }];
    return state;
  }

  function mergeImportedDocuments(currentState, importedSources) {
    const out = structuredClone(currentState);
    const batchKey = Date.now().toString(36);
    let firstImportedMenuId = null;

    importedSources.forEach((source, index) => {
      const prefixed = prefixImportedDocumentIds(source.doc, source.fileName, `${batchKey}_${index}`);
      if (!firstImportedMenuId && prefixed.menus[0]) {
        firstImportedMenuId = prefixed.menus[0].id;
      }

      out.knots.push(...prefixed.knots);
      out.edges.push(...prefixed.edges);
      out.menus.push(...prefixed.menus);
      out.roots.push(...prefixed.roots);
      Object.assign(out.ui.layout.knots, prefixed.ui.layout.knots || {});

      const folder = out.hierarchy.folders[0] || { id: uid("f"), name: "root", menuIds: [] };
      out.hierarchy.folders[0] = folder;
      for (const menu of prefixed.menus) {
        if (!folder.menuIds.includes(menu.id)) {
          folder.menuIds.push(menu.id);
        }
      }
    });

    if (firstImportedMenuId) {
      out.ui.activeMenuId = firstImportedMenuId;
    }

    syncHierarchyFromMenus(out);
    validateActiveMenu(out);
    touchDocumentUpdated(out);
    syncHierarchyFiles(out);
    return out;
  }

  function exportDocument(state) {
    const out = structuredClone(state);
    syncHierarchyFiles(out);
    touchDocumentUpdated(out);
    return out;
  }

  function makeBtn(className, text, title) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = className;
    btn.textContent = text;
    btn.title = title;
    return btn;
  }

  function createFallbackMenuRow(opts = {}) {
    const row = document.createElement("div");
    row.className = `menu-item${opts.active ? " active" : ""}`;

    const prefix = document.createElement("span");
    prefix.className = "menu-item-prefix";
    prefix.textContent = "➢";

    const name = document.createElement("span");
    name.className = "menu-item-name";
    name.textContent = opts.label || "";
    name.contentEditable = "false";
    name.spellcheck = false;

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "menu-item-edit";
    editBtn.textContent = "✐";
    editBtn.title = "Rename file";

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "menu-item-delete";
    delBtn.textContent = "\u00d7";
    delBtn.title = "Delete root";
    delBtn.setAttribute("aria-label", "Delete root");

    const finishRename = (save) => {
      const nextName = (name.textContent || "").trim();
      name.contentEditable = "false";
      row.classList.remove("is-renaming");
      name.removeEventListener("blur", onBlur);
      name.removeEventListener("keydown", onKeyDown);
      if (save && nextName && typeof opts.onRename === "function") {
        opts.onRename(nextName);
      } else {
        name.textContent = opts.label || "";
      }
    };

    const onBlur = () => finishRename(true);
    const onKeyDown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        name.blur();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        finishRename(false);
      }
    };

    editBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      row.classList.add("is-renaming");
      name.contentEditable = "true";
      name.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(name);
      selection?.removeAllRanges();
      selection?.addRange(range);
      name.addEventListener("blur", onBlur, { once: true });
      name.addEventListener("keydown", onKeyDown);
    });

    delBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof opts.onDelete === "function") opts.onDelete();
    });

    row.append(prefix, name, editBtn, delBtn);
    if (typeof opts.onClick === "function") {
      row.addEventListener("click", opts.onClick);
    }
    return row;
  }

  // 刪掉一棵樹. **沒有確認彈窗**(Rec 指定), 所以清理必須乾淨且不誤傷:
  // - 該樹的畫布 knot/edge 一起刪 -- 留著會變成看不見卻仍會 export 的垃圾
  // - tray 的 knot **不刪**, 改掛到接手的那棵樹 -- tray 是暫存區, 不該跟著某棵樹陪葬
  // - deck 不能空: 資料模型從 createDefaultState 起就假設至少有一棵
  function deleteMenu(menuId) {
    const idx = app.state.menus.findIndex((m) => m.id === menuId);
    if (idx < 0) return;

    const doomed = app.state.menus[idx];
    const trayIds = doomed.knotIds.filter((id) => {
      const k = getKnotById(app.state, id);
      return k && isTrayKnot(k);
    });

    app.state.menus.splice(idx, 1);

    if (app.state.hierarchy && Array.isArray(app.state.hierarchy.folders)) {
      for (const f of app.state.hierarchy.folders) {
        if (Array.isArray(f.menuIds)) {
          f.menuIds = f.menuIds.filter((id) => id !== menuId);
        }
      }
    }

    if (!app.state.menus.length) {
      const fresh = { id: uid("m"), name: "", knotIds: [], edgeIds: [], meta: {} };
      app.state.menus.push(fresh);
      const folder =
        app.state.hierarchy &&
        Array.isArray(app.state.hierarchy.folders) &&
        app.state.hierarchy.folders[0];
      if (folder && Array.isArray(folder.menuIds)) folder.menuIds.push(fresh.id);
    }

    if (!app.state.menus.some((m) => m.id === app.state.ui.activeMenuId)) {
      app.state.ui.activeMenuId = app.state.menus[0].id;
    }

    // tray 的 knot 交給接手的那棵樹, 才不會變成孤兒
    const heir = getMenuById(app.state, app.state.ui.activeMenuId);
    if (heir) {
      for (const id of trayIds) addKnotToMenuProjection(app.state, heir.id, id);
    }

    // 清掉沒有任何一棵樹再引用的 knot / edge / layout
    const liveKnots = new Set();
    const liveEdges = new Set();
    for (const m of app.state.menus) {
      for (const id of m.knotIds) liveKnots.add(id);
      for (const id of m.edgeIds) liveEdges.add(id);
    }
    app.state.knots = app.state.knots.filter((k) => liveKnots.has(k.id));
    app.state.edges = app.state.edges.filter((e) => liveEdges.has(e.id));
    for (const id of Object.keys(app.state.ui.layout.knots)) {
      if (!liveKnots.has(id)) delete app.state.ui.layout.knots[id];
    }

    if (app.selectedKnotId && !liveKnots.has(app.selectedKnotId)) {
      app.selectedKnotId = null;
    }

    syncHierarchyFiles(app.state);
  }

  function renderMenuPanel() {
    const list = document.getElementById("menu-panel-list");
    if (!list) return;

    const frag = document.createDocumentFragment();

    for (const menu of app.state.menus) {
      const rowOpts = {
        active: menu.id === app.state.ui.activeMenuId,
        label: menu.name || "Untitled tree",
        onRename: (nextName) => {
          menu.name = nextName;
          saveState();
          render();
        },
        onDelete: () => {
          deleteMenu(menu.id);
          touchDocumentUpdated();
          saveState();
          render();
        },
        onClick: () => {
          // 剛剛是拖動換位, 不是點選
          if (app.suppressMenuClick) {
            app.suppressMenuClick = false;
            return;
          }
          app.state.ui.activeMenuId = menu.id;
          if (window.matchMedia("(max-width: 720px)").matches) {
            document.body.classList.remove("menu-drawer-open");
          }
          saveState();
          render();
        }
      };

      const row = createFallbackMenuRow(rowOpts);
      row.dataset.menuId = menu.id;
      attachMenuRowReorder(row, menu.id);

      frag.append(row);
    }

    frag.append(createAddRootRow());

    list.replaceChildren(frag);
  }

  // root 列上下拖動換位. 用 pointer 事件(觸控才拖得動, 跟 knot 拖曳同一個理由).
  // 換位當下就 render(), 所以「列在手指底下重排」本身就是回饋 -- 不另外做拖曳樣式或動畫.
  // ⚠️ 不用 setPointerCapture: render() 會把這一列換掉, capture 跟著失效; 掛 window 才穩.
  function attachMenuRowReorder(row, menuId) {
    row.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      if (event.target.closest(".menu-item-edit, .menu-item-delete")) return;
      if (row.classList.contains("is-renaming")) return;

      // 每次按下先清旗標, 避免上一輪沒吃到 click 的殘留把下一次正常點選吞掉
      app.suppressMenuClick = false;

      const startY = event.clientY;
      let moved = false;

      const onMove = (moveEvent) => {
        if (!moved && Math.abs(moveEvent.clientY - startY) < 4) return;
        moved = true;

        const list = document.getElementById("menu-panel-list");
        if (!list) return;
        const rows = [...list.querySelectorAll(".menu-item[data-menu-id]")];
        if (!rows.length) return;

        let target = rows.length - 1;
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i].getBoundingClientRect();
          if (moveEvent.clientY < r.top + r.height / 2) {
            target = i;
            break;
          }
        }

        const from = app.state.menus.findIndex((m) => m.id === menuId);
        if (from < 0 || from === target) return;

        const [m] = app.state.menus.splice(from, 1);
        app.state.menus.splice(target, 0, m);
        // 拖曳中途只重畫, 不存檔 -- 存了的話一次拖曳會變成好幾步撤銷
        render();
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        if (moved) {
          app.suppressMenuClick = true;
          touchDocumentUpdated();
          saveState();
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    });
  }

  // root deck 的「+」: 無內框, 單純一個居中 +.
  // 寬度用 width:100% 從清單容器繼承 -- **不量任何長度**(Rec 2026-08-30 的要求).
  // 沒有做成「預先放一列 opacity:0 再顯示」, 因為那一列會是 state 裡的幽靈 menu,
  // 會跟著 export 進 .root. 用 100% 一樣不用量, 而且不弄髒資料.
  function createAddRootRow() {
    const row = document.createElement("div");
    row.className = "menu-add-row";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "menu-add-btn";
    btn.textContent = "+";
    btn.title = "New root";
    btn.setAttribute("aria-label", "New root");

    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      // 名字留空 → 列表顯示既有的 fallback「Untitled tree」, 可按 ✐ 改名.
      // 沒有自訂命名規則: 命名是 Rec 拍板的事.
      const menu = { id: uid("m"), name: "", knotIds: [], edgeIds: [], meta: {} };
      app.state.menus.push(menu);

      const folder =
        app.state.hierarchy &&
        Array.isArray(app.state.hierarchy.folders) &&
        app.state.hierarchy.folders[0];
      if (folder && Array.isArray(folder.menuIds)) folder.menuIds.push(menu.id);

      app.state.ui.activeMenuId = menu.id;
      app.selectedKnotId = null;

      // 跟既有的列點擊同一個收合行為
      if (isMobileView()) document.body.classList.remove("menu-drawer-open");

      touchDocumentUpdated();
      saveState();
      render();
    });

    row.append(btn);
    return row;
  }

  function edgeStroke() {
    if (document.body.classList.contains("white-mode")) {
      return "rgba(150,150,150,0.22)";
    }
    return "rgba(255, 0, 0, 0.28)";
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function nextZIndex() {
    const layouts = app.state.ui.layout.knots;
    let max = 0;
    for (const id of Object.keys(layouts)) {
      const z = layouts[id].zIndex || 0;
      if (z > max) max = z;
    }
    return max + 1;
  }

  function bringKnotToFront(knotId) {
    const layout = getKnotLayout(app.state, knotId);
    layout.zIndex = nextZIndex();
    setKnotLayout(app.state, knotId, layout);
  }

  function isPointerInTray(clientX, clientY) {
    const trayRect = app.dom.tray.getBoundingClientRect();

    return (
      clientX >= trayRect.left &&
      clientX <= trayRect.right &&
      clientY >= trayRect.top &&
      clientY <= trayRect.bottom
    );
  }

  function getZoneRect(zone) {
    if (zone === "tray") {
      return app.dom.tray.getBoundingClientRect();
    }
    return app.dom.canvasPane.getBoundingClientRect();
  }

  function uid(prefix) {
    return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  }

  function escapeRegExp(str) {
    return String(str).replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
  }

  /** 顯示名: 根層 knot-a ... knot-z, 用盡後 knot-aa ...(內部 id 仍為不透明字串, 見 docs/knot-title-vs-id.md) */
  function nextRootKnotLabel(state) {
    const titles = new Set(state.knots.map((k) => String(k.title || "").trim()));
    for (let i = 0; i < 26; i++) {
      const lab = `knot-${String.fromCharCode(97 + i)}`;
      if (!titles.has(lab)) return lab;
    }
    for (let a = 0; a < 26; a++) {
      for (let b = 0; b < 26; b++) {
        const lab = `knot-${String.fromCharCode(97 + a)}${String.fromCharCode(97 + b)}`;
        if (!titles.has(lab)) return lab;
      }
    }
    return `knot-x${Date.now().toString(36)}`;
  }

  /** 顯示名: 在父標題後加 `-a`, `-b`...(父為 knot-a 則子為 knot-a-a) */
  function nextChildKnotLabel(state, parentTitle) {
    const base = String(parentTitle || "").trim();
    if (!base) return nextRootKnotLabel(state);
    const prefix = `${base}-`;
    const re = new RegExp(`^${escapeRegExp(prefix)}([a-z])$`);
    const used = new Set();
    for (const k of state.knots) {
      const m = re.exec(String(k.title || "").trim());
      if (m) used.add(m[1]);
    }
    for (let i = 0; i < 26; i++) {
      const ch = String.fromCharCode(97 + i);
      if (!used.has(ch)) return prefix + ch;
    }
    return prefix + "z" + Math.floor(Math.random() * 9);
  }

  /** 匯入時依序給 knot-a, knot-b, ... */
  function knotLabelForImportIndex(index) {
    const i = Number(index) || 0;
    if (i < 26) return `knot-${String.fromCharCode(97 + i)}`;
    const j = i - 26;
    const hi = Math.floor(j / 26) % 26;
    const lo = j % 26;
    return `knot-${String.fromCharCode(97 + hi)}${String.fromCharCode(97 + lo)}`;
  }

  function resolveNewKnotTitle(state, options) {
    if (options.title != null && options.title !== "") return options.title;
    if (options.parentKnot && String(options.parentKnot.title || "").trim()) {
      return nextChildKnotLabel(state, options.parentKnot.title);
    }
    return nextRootKnotLabel(state);
  }

  function formatKnotTitle(raw) {
    const value = String(raw || "").trim();
    if (!value) return "";

    if (value.includes("--")) {
      const parts = value.split("--").filter(Boolean);
      if (parts.length <= 3) return value;
      return `${parts[0]}--...--${parts[parts.length - 1]}`;
    }

    if (value.length <= 12) return value;
    return `${value.slice(0, 3)}...${value.slice(-3)}`;
  }

  function getKnotDisplayTitle(knot) {
    return formatKnotTitle(knot.title);
  }

  function getKnotEditingTitle(knot) {
    return String(knot.title || "");
  }

  function normalizeLegacyNodeTitle(title, fallbackIndex = 0) {
    const raw = String(title || "").trim();
    if (!raw) return knotLabelForImportIndex(fallbackIndex);
    if (/^node\s+\d+$/i.test(raw)) return knotLabelForImportIndex(fallbackIndex);
    if (/^knot\s+\d+$/i.test(raw)) return knotLabelForImportIndex(fallbackIndex);
    return raw;
  }

  function isoNow() {
    return new Date().toISOString();
  }

  function createEmptyDocument() {
    return {
      id: uid("doc"),
      title: "Untitled",
      createdAt: isoNow(),
      updatedAt: isoNow(),
      meta: {}
    };
  }

  function createDefaultMenu() {
    return {
      id: uid("m"),
      name: "Main",
      knotIds: [],
      edgeIds: [],
      meta: {}
    };
  }

  function createDefaultState() {
    const menu = createDefaultMenu();
    const folderId = uid("f");
    return {
      spec: SPEC,
      document: createEmptyDocument(),
      hierarchy: {
        folders: [{ id: folderId, name: "root", menuIds: [menu.id] }]
      },
      menus: [menu],
      roots: [],
      knots: [],
      edges: [],
      ui: {
        activeMenuId: menu.id,
        layout: { knots: {} }
      },
      files: {
        menuText: "",
        structureText: ""
      }
    };
  }

  /** 無 localStorage 或 Reset 時: 首屏示例樹(knot-a 為樞紐, 三叉 + 再長) */
  function buildShowcaseInitialState() {
    const state = createDefaultState();
    const menu = getActiveMenu(state);
    if (!menu) return state;

    const uiOpen = { contentExpanded: true };

    // 預設注入 = 機器學習入門最常畫的那張圖: 「第一個模型該挑哪個」.
    // 選它的理由: 那是真的**樹**(一路問下去分叉), 不是清單也不是流程圖 --
    // 打開就看得出這個工具是拿來幹嘛的. 全英文(Rec 2026-08-30).
    // 標題沿用 knot-a / knot-a-a / knot-a-a-a 的階層命名(docs/knot-title-vs-id.md).
    //
    // ⚠️ 內容只有一份. **桌機與手機分岔的只有座標**,
    //    knot, edge, title, 文字全部相同 -- 所以手機匯出的 .root 在桌機打開仍是同一棵樹.
    const CONTENT = [
      { id: "demo_a",     title: "knot-a",     text: "pick a first model\n\nwhat does the data look like?" },
      { id: "demo_a_a",   title: "knot-a-a",   text: "labeled data\n-> supervised" },
      { id: "demo_a_a_a", title: "knot-a-a-a", text: "predict a class\nlogistic reg / random forest" },
      { id: "demo_a_a_b", title: "knot-a-a-b", text: "predict a number\nlinear reg / gradient boosting" },
      { id: "demo_a_b",   title: "knot-a-b",   text: "no labels\n-> unsupervised" },
      { id: "demo_a_b_a", title: "knot-a-b-a", text: "group similar rows\nk-means / DBSCAN" },
      { id: "demo_a_b_b", title: "knot-a-b-b", text: "too many columns\nPCA / t-SNE" },
      { id: "demo_a_c",   title: "knot-a-c",   text: "split first\ntrain / val / test" }
    ];

    // 桌機: 左→右三欄, 橫著長 -- 跟 Ruvia 的 port 方向(左/右)一致.
    const LAYOUT_WIDE = {
      demo_a:     { x: 80,  y: 380, width: 328, height: 172 },
      demo_a_a:   { x: 496, y: 108,  width: 304, height: 108 },
      demo_a_b:   { x: 496, y: 468, width: 304, height: 108 },
      demo_a_c:   { x: 496, y: 660, width: 304, height: 108 },
      demo_a_a_a: { x: 904, y: 20,  width: 380, height: 124 },
      demo_a_a_b: { x: 904, y: 180,  width: 380, height: 124 },
      demo_a_b_a: { x: 904, y: 380, width: 380, height: 124 },
      demo_a_b_b: { x: 904, y: 540, width: 380, height: 124 }
    };

    // 手機: **縮排大綱**(像檔案樹), 往下長.
    // 為什麼不是把桌機那張縮小: knot 一律正規化成 96 世界單位寬, 有效 zoom 固定 1.5,
    // 390px 螢幕只有 260 世界單位可用 -- 兩欄(192+間距)塞得下, 三欄(288)塞不下.
    // 所以橫向排不開, 只能改成每層縮排 56, 共用縱軸. 手機縱向空間有 519 單位, 綽綽有餘.
    // ⚠️ 順序有講究: `demo_a_c`(split first)排在根的**正下方第一個**.
    //    Ruvia 的 port 在左右兩側, 邊是水平貝茲 -- 子節點在正下方時, 線必須繞一大圈.
    //    根的最後一個子節點離根越遠, 那條繞線越長越髒. 把最短的那支提前,
    //    根的最長邊從 362 縮到 270 個世界單位. 而且「先切資料」本來就該讀在最前面.
    const LAYOUT_TALL = {
      demo_a:     { x: 16,   y: 20,  width: 192, height: 102 },
      demo_a_c:   { x: 128,  y: 152,  width: 192, height: 62 },
      demo_a_a:   { x: 128,  y: 244, width: 192, height: 62 },
      demo_a_a_a: { x: 240, y: 336, width: 192, height: 82 },
      demo_a_a_b: { x: 240, y: 448, width: 192, height: 82 },
      demo_a_b:   { x: 128,  y: 560, width: 192, height: 62 },
      demo_a_b_a: { x: 240, y: 652, width: 192, height: 62 },
      demo_a_b_b: { x: 240, y: 744, width: 192, height: 62 }
    };

    const layoutTable = isMobileView() ? LAYOUT_TALL : LAYOUT_WIDE;

    let z = 1;
    for (const item of CONTENT) {
      state.knots.push({
        id: item.id,
        title: item.title,
        content: { text: item.text },
        meta: { ui: { ...uiOpen } }
      });
      addKnotToMenuProjection(state, menu.id, item.id);
      setKnotLayout(state, item.id, { ...layoutTable[item.id], zIndex: z++ });
    }

    // 真的分叉: root -> 三支, 其中兩支各自再分兩支.
    const links = [
      ["demo_a", "demo_a_a"],
      ["demo_a", "demo_a_b"],
      ["demo_a", "demo_a_c"],
      ["demo_a_a", "demo_a_a_a"],
      ["demo_a_a", "demo_a_a_b"],
      ["demo_a_b", "demo_a_b_a"],
      ["demo_a_b", "demo_a_b_b"]
    ];
    for (const [from, to] of links) {
      ensureEdge(state, from, to, "link");
    }


    touchDocumentUpdated(state);
    syncHierarchyFiles(state);
    return state;
  }

  function createKnotModel(partial = {}) {
    return {
      id: partial.id ?? uid("k"),
      title: partial.title ?? "Untitled",
      content: { text: ensureKnotContent(partial).text },
      meta: partial.meta && typeof partial.meta === "object" ? structuredClone(partial.meta) : {}
    };
  }

  function createEdgeModel(from, to, relation) {
    return {
      id: uid("e"),
      from,
      to,
      relation: relation || "link",
      meta: {}
    };
  }

  function createRoot(partial = {}) {
    return {
      id: partial.id ?? uid("r"),
      name: partial.name ?? "Root",
      menuIds: Array.isArray(partial.menuIds) ? partial.menuIds.slice() : [],
      meta: partial.meta && typeof partial.meta === "object" ? structuredClone(partial.meta) : {}
    };
  }

  function ensureKnotContent(knot) {
    if (!knot.content || typeof knot.content !== "object") {
      knot.content = { text: "" };
    }
    if (typeof knot.content.text !== "string") knot.content.text = "";
    return knot.content;
  }

  function ensureKnotUiMeta(knot) {
    knot.meta = knot.meta || {};
    knot.meta.ui = knot.meta.ui || {};
    return knot.meta.ui;
  }

  function normalizeDocument(input) {
    if (!input || typeof input !== "object") return createDefaultState();

    const out = {
      spec: input.spec === SPEC ? SPEC : SPEC,
      document: { ...createEmptyDocument(), ...(input.document || {}) },
      hierarchy: input.hierarchy && input.hierarchy.folders
        ? {
            folders: (input.hierarchy.folders || []).map((f) => ({
              id: String(f.id || uid("f")),
              name: String(f.name || "folder"),
              menuIds: Array.isArray(f.menuIds) ? f.menuIds.map(String) : []
            }))
          }
        : { folders: [] },
      menus: Array.isArray(input.menus)
        ? input.menus.map((m) => ({
            id: String(m.id || uid("m")),
            name: String(m.name || "Menu"),
            knotIds: Array.isArray(m.knotIds) ? m.knotIds.map(String) : [],
            edgeIds: Array.isArray(m.edgeIds) ? m.edgeIds.map(String) : [],
            entryKnotId: m.entryKnotId != null ? String(m.entryKnotId) : null,
            meta: m.meta && typeof m.meta === "object" ? structuredClone(m.meta) : {}
          }))
        : [],
      roots: Array.isArray(input.roots)
        ? input.roots.map((r) => ({
            id: String(r.id || uid("r")),
            name: String(r.name || "Root"),
            menuIds: Array.isArray(r.menuIds)
              ? r.menuIds.map(String)
              : Array.isArray(r.listIds)
                ? r.listIds.map(String)
                : [],
            meta: r.meta && typeof r.meta === "object" ? structuredClone(r.meta) : {}
          }))
        : Array.isArray(input.packs)
          ? input.packs.map((p) => ({
            id: String(p.id || uid("r")),
            name: String(p.name || "Root"),
            menuIds: Array.isArray(p.menuIds)
              ? p.menuIds.map(String)
              : Array.isArray(p.listIds)
                ? p.listIds.map(String)
                : [],
            meta: p.meta && typeof p.meta === "object" ? structuredClone(p.meta) : {}
          }))
          : [],
      knots: Array.isArray(input.knots)
        ? input.knots.map((k) => normalizeKnotIn(k))
        : [],
      edges: Array.isArray(input.edges)
        ? input.edges.map((e) => ({
            id: String(e.id || uid("e")),
            from: String(e.from || ""),
            to: String(e.to || ""),
            relation: e.relation != null ? String(e.relation) : undefined,
            meta: e.meta && typeof e.meta === "object" ? structuredClone(e.meta) : {}
          }))
        : [],
      ui: {
        activeMenuId: input.ui && input.ui.activeMenuId != null ? input.ui.activeMenuId : null,
        activeListId:
          input.ui && input.ui.activeListId != null ? input.ui.activeListId : null,
        layout: {
          knots:
            input.ui &&
            input.ui.layout &&
            input.ui.layout.knots &&
            typeof input.ui.layout.knots === "object"
              ? structuredClone(input.ui.layout.knots)
              : input.ui &&
                  input.ui.layout &&
                  input.ui.layout.nodes &&
                  typeof input.ui.layout.nodes === "object"
                ? structuredClone(input.ui.layout.nodes)
                : {}
        }
      },
      files: {
        menuText: typeof input.files?.menuText === "string" ? input.files.menuText : "",
        structureText: typeof input.files?.structureText === "string" ? input.files.structureText : ""
      }
    };

    if (!out.menus.length && Array.isArray(input.lists)) {
      out.menus = input.lists.map((m) => ({
        id: String(m.id || uid("m")),
        name: String(m.name || "Menu"),
        knotIds: Array.isArray(m.nodeIds)
          ? m.nodeIds.map(String)
          : Array.isArray(m.knotIds)
            ? m.knotIds.map(String)
            : [],
        edgeIds: Array.isArray(m.edgeIds) ? m.edgeIds.map(String) : [],
        entryKnotId:
          m.entryNodeId != null
            ? String(m.entryNodeId)
            : m.entryKnotId != null
              ? String(m.entryKnotId)
              : null,
        meta: m.meta && typeof m.meta === "object" ? structuredClone(m.meta) : {}
      }));
    }

    if (!out.knots.length && Array.isArray(input.nodes)) {
      out.knots = input.nodes.map((n, i) => {
        const meta =
          n.meta && typeof n.meta === "object" ? structuredClone(n.meta) : {};
        if (n.type != null || n.parentId != null) {
          meta.legacy = { ...(meta.legacy || {}), type: n.type, parentId: n.parentId };
        }
        if (n.parentId) meta.parentId = String(n.parentId);
        meta.ui = {
          ...(meta.ui || {}),
          contentExpanded: n.notesExpanded !== false,
          childrenCollapsed: Boolean(n.childrenCollapsed)
        };
        return normalizeKnotIn({
          id: n.id,
          title: normalizeLegacyNodeTitle(n.title, i),
          meta,
          content: { text: String(n.notes ?? n.text ?? "") }
        });
      });
      input.nodes.forEach((n, i) => {
        const id = String(n.id ?? `k${i}`);
        const knot = out.knots.find((k) => k.id === id);
        if (knot) {
          knot.meta = knot.meta || {};
          knot.meta.location = n.zone === "stash" || n.zone === "tray" ? "tray" : "canvas";
        }
        out.ui.layout.knots[id] = {
          x: Number.isFinite(n.x) ? n.x : 120,
          y: Number.isFinite(n.y) ? n.y : 80,
          width: Number.isFinite(n.noteWidth) ? n.noteWidth : KNOT_SIZE.width,
          height: Number.isFinite(n.noteHeight) ? n.noteHeight : KNOT_SIZE.height,
          zIndex: Number.isFinite(n.zIndex) ? n.zIndex : i + 1
        };
      });
    }

    if (input.ui && input.ui.activeListId != null && out.ui.activeMenuId == null) {
      out.ui.activeMenuId = input.ui.activeListId;
    }

    if (!out.menus.length) {
      const m = createDefaultMenu();
      out.menus = [m];
      out.ui.activeMenuId = m.id;
    }

    if (!out.hierarchy.folders.length) {
      out.hierarchy.folders = [
        { id: uid("f"), name: "root", menuIds: out.menus.map((m) => m.id) }
      ];
    }

    out.knots.forEach((k, i) => {
      k.title = normalizeLegacyNodeTitle(k.title, i);
    });

    for (const knot of out.knots) {
      const layout = out.ui.layout.knots[knot.id];
      if (!layout) continue;
      knot.meta = knot.meta || {};
      if (!knot.meta.location && layout.zone) {
        knot.meta.location = layout.zone === "tray" ? "tray" : "canvas";
      }
      if (!knot.meta.location) {
        knot.meta.location = "canvas";
      }
      if (layout.zone !== undefined) {
        delete layout.zone;
      }
    }

    normalizeAllLayoutSizes(out);
    syncHierarchyFromMenus(out);
    validateActiveMenu(out);
    return out;
  }

  function normalizeKnotIn(k) {
    const knot = createKnotModel({
      id: k.id,
      title: k.title,
      meta: k.meta
    });
    ensureKnotContent(knot);
    if (k.content && typeof k.content.text === "string") {
      knot.content.text = k.content.text;
    }
    knot.meta = knot.meta || {};
    knot.meta.location = knot.meta.location === "tray" || knot.meta.location === "stash" ? "tray" : "canvas";
    return knot;
  }

  function validateActiveMenu(state) {
    const ids = new Set(state.menus.map((m) => m.id));
    if (!state.ui.activeMenuId || !ids.has(state.ui.activeMenuId)) {
      state.ui.activeMenuId = state.menus[0].id;
    }
  }

  // -- agent 規範(🤖 按鈕的內容)-----------------------------
  //
  // ⚠️ **這段刻意貼在 validateDocument() 正上方. **
  //    規範與驗證器必須一起改 -- 舊的 `ruvia-ai-tree-schema.md` 就是因為離程式太遠
  //    而腐爛掉的: 它教 agent 寫 `zone` 和 `width: 132`, 但 setKnotLayout() 會把
  //    zone 刪掉, 把 width 強制蓋成 96. agent 以為設好了, 其實被靜默丟棄.
  //
  // 語氣: 幫助型 -- 除了給契約, 還要**主動教使用者下一步怎麼用**(Rec 2026-08-30).
  function buildAgentSpecExample() {
    const doc = {
      spec: SPEC,
      document: {
        id: "doc_1",
        title: "Example",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        meta: {}
      },
      hierarchy: { folders: [{ id: "f1", name: "root", menuIds: ["m1"] }] },
      menus: [{ id: "m1", name: "My topic", knotIds: ["k1", "k2"], edgeIds: ["e1"], meta: {} }],
      roots: [],
      knots: [
        {
          id: "k1",
          title: "knot-a",
          content: { text: "the question\nor the top idea" },
          meta: { location: "canvas", ui: { contentExpanded: true } }
        },
        {
          id: "k2",
          title: "knot-a-a",
          content: { text: "a branch off it" },
          meta: { location: "canvas", ui: { contentExpanded: true }, color: "plumbago" }
        }
      ],
      edges: [{ id: "e1", from: "k1", to: "k2", relation: "link", meta: {} }],
      ui: {
        activeMenuId: "m1",
        layout: {
          knots: {
            k1: { x: 40, y: 120, width: KNOT_SIZE.width, height: null, zIndex: 1 },
            k2: { x: 248, y: 120, width: KNOT_SIZE.width, height: null, zIndex: 2 }
          }
        }
      },
      files: { menuText: "", structureText: "" }
    };
    return doc;
  }

  function buildAgentSpec() {
    const example = buildAgentSpecExample();

    // 交出去之前先自我驗證: 規範附的範例一定要是真的過得了 import 的.
    // 以後有人改了資料模型卻忘了改這段, 按下 🤖 當場就會爆.
    const err = validateDocument(example);
    if (err) return { ok: false, error: err };

    const colors = RUVIA_COLORS.map((c) => c.name).join(", ");

    const text = [
      "# Ruvia -- how to write a .root file",
      "",
      "Ruvia (ruvia.dev) is a small tree/mind-map tool. A `.root` file is one whole",
      "Ruvia document, stored as JSON. If you produce a valid one, it imports as a",
      "brand-new tree, exactly as written.",
      "",
      "Please read this whole page before writing anything.",
      "",
      "## What you are producing",
      "",
      "One JSON object with these top-level keys, all required:",
      "",
      "  spec, document, hierarchy, menus, roots, knots, edges, ui, files",
      "",
      "- `spec` must be exactly \"" + SPEC + "\".",
      "- One document = one tree = one entry in `menus`.",
      "- `menus[0].knotIds` / `.edgeIds` must list every knot / edge in that tree.",
      "- `ui.activeMenuId` must point at that menu's id.",
      "",
      "## The rules that are actually enforced",
      "",
      "The importer rejects the file outright if any of these fail:",
      "",
      "1. `spec` does not match the string above.",
      "2. Any duplicate id within knots, edges, menus or roots.",
      "3. An edge whose `from` or `to` is not an existing knot id.",
      "4. A `menu.knotIds` / `menu.edgeIds` entry that does not exist.",
      "5. A `roots[].menuIds` entry that is not an existing menu id.",
      "6. `ui.activeMenuId` that is not an existing menu id.",
      "",
      "## Things that will be silently overwritten -- do not spend effort on them",
      "",
      "- `layout.width` -- always forced to " + KNOT_SIZE.width + ". Write it, but you cannot change it.",
      "- `layout.zone` -- deleted on load. Use `knot.meta.location` instead.",
      "- `layout.height` -- use `null` and let it size itself to the text.",
      "",
      "## Fields worth using",
      "",
      "- `knot.title` -- short label. Convention is `knot-a`, then children of it are",
      "  `knot-a-a`, `knot-a-b`, and their children `knot-a-a-a`. Keep under ~12 chars.",
      "- `knot.content.text` -- 1-3 short lines. `\\n` for line breaks.",
      "- `knot.meta.location` -- \"canvas\" (on the board) or \"tray\" (the side holding area).",
      "- `knot.meta.ui.contentExpanded` -- `true` so the text is visible on load.",
      "- `knot.meta.color` -- optional, and must be one of these names:",
      "  " + colors + ".",
      "- `edge.relation` -- always \"link\".",
      "",
      "## Layout",
      "",
      "`ui.layout.knots[<knotId>]` must exist for every knot.",
      "Coordinates are world units; a knot is " + KNOT_SIZE.width + " wide.",
      "",
      "- Wide screens: lay the tree left to right. Columns about 208 apart",
      "  (x = 40, 248, 456...), siblings about 60-80 apart vertically.",
      "- Narrow screens: lay it as an indented outline going down. Indent each level",
      "  by about 56 (x = 8, 64, 120...), rows about 46 apart.",
      "- `zIndex` counts up from 1.",
      "",
      "## A complete, valid example",
      "",
      "```json",
      JSON.stringify(example, null, 2),
      "```",
      "",
      "## After you write it -- please tell the user this",
      "",
      "Do not just hand over the JSON. Finish your reply with these steps, in your",
      "own words, so they know what to do with it:",
      "",
      "1. Save your JSON to a file whose name ends in `.root` (for example",
      "   `my-topic.root`). It is plain JSON; the extension is what matters.",
      "2. Open ruvia.dev.",
      "3. In the panel on the right, click `import` and choose that file.",
      "4. It arrives as a new tree. The list at the bottom left is the collection of",
      "   trees -- click a name to switch, `+` to add an empty one, `✐` to rename,",
      "   `×` to delete. `×` is undoable with Cmd/Ctrl+Z, or the `↺` button.",
      "",
      "If you had to leave anything out, say so plainly rather than inventing fields --",
      "an unknown field is dropped on import, and the user will not be told."
    ].join("\n");

    return { ok: true, text };
  }

  function validateDocument(doc) {
    if (doc.spec !== SPEC) return "spec mismatch";
    if (!doc.document || !Array.isArray(doc.menus)) return "missing core fields";

    const knotIds = new Set(doc.knots.map((k) => k.id));
    const edgeIds = new Set(doc.edges.map((e) => e.id));
    const menuIds = new Set(doc.menus.map((m) => m.id));
    const rootIds = new Set(doc.roots.map((r) => r.id));

    if (new Set(doc.knots.map((k) => k.id)).size !== doc.knots.length) return "duplicate knot id";
    if (new Set(doc.edges.map((e) => e.id)).size !== doc.edges.length) return "duplicate edge id";
    if (new Set(doc.roots.map((r) => r.id)).size !== doc.roots.length) return "duplicate root id";
    if (new Set(doc.menus.map((m) => m.id)).size !== doc.menus.length) return "duplicate menu id";

    for (const e of doc.edges) {
      if (!knotIds.has(e.from) || !knotIds.has(e.to)) return "edge endpoint missing";
    }

    for (const m of doc.menus) {
      for (const id of m.knotIds) {
        if (!knotIds.has(id)) return "menu knot ref";
      }
      for (const id of m.edgeIds) {
        if (!edgeIds.has(id)) return "menu edge ref";
      }
    }

    for (const r of doc.roots) {
      for (const id of r.menuIds) {
        if (!menuIds.has(id)) return "root menu ref";
      }
    }

    if (doc.ui.activeMenuId != null && !menuIds.has(doc.ui.activeMenuId)) {
      return "active menu invalid";
    }

    return null;
  }

  function migrateLegacyState(input) {
    const state = createDefaultState();
    const mainMenu = state.menus[0];
    const legacy = input && typeof input === "object" ? input : {};

    if (!Array.isArray(legacy.nodes)) {
      syncHierarchyFiles(state);
      return state;
    }

    const metaLegacy = { source: "legacy-flat", at: isoNow() };

    for (let i = 0; i < legacy.nodes.length; i++) {
      const n = legacy.nodes[i];
      const id = String(n.id || `k${Date.now()}_${i}`);
      const knot = createKnotModel({
        id,
        title: normalizeLegacyNodeTitle(n.title, i),
        meta: {}
      });
      knot.content.text = String(n.notes ?? n.text ?? "");

      if (n.type != null || n.notesExpanded != null || n.parentId != null) {
        knot.meta.legacy = {
          type: n.type,
          notesExpanded: n.notesExpanded,
          parentId: n.parentId,
          zIndex: n.zIndex
        };
      }
      if (n.parentId) knot.meta.parentId = String(n.parentId);

      const uiMeta = ensureKnotUiMeta(knot);
      uiMeta.contentExpanded = n.notesExpanded !== undefined ? Boolean(n.notesExpanded) : true;
      uiMeta.childrenCollapsed = Boolean(n.childrenCollapsed);

      state.knots.push(knot);
      mainMenu.knotIds.push(id);

      state.ui.layout.knots[id] = {
        x: Number.isFinite(n.x) ? n.x : 120 + i * 12,
        y: Number.isFinite(n.y) ? n.y : 80 + i * 10,
        width: Number.isFinite(n.noteWidth) ? n.noteWidth : KNOT_SIZE.width,
        height: Number.isFinite(n.noteHeight) ? n.noteHeight : KNOT_SIZE.height,
        zIndex: Number.isFinite(n.zIndex) ? n.zIndex : i + 1
      };
      knot.meta.location = n.zone === "stash" || n.zone === "tray" ? "tray" : "canvas";
    }

    const kIds = new Set(state.knots.map((k) => k.id));

    if (Array.isArray(legacy.edges)) {
      for (let i = 0; i < legacy.edges.length; i++) {
        const e = legacy.edges[i];
        const from = String(e.from || "");
        const to = String(e.to || "");
        if (!kIds.has(from) || !kIds.has(to) || from === to) continue;
        const edge = {
          id: String(e.id || `e${Date.now()}_${i}`),
          from,
          to,
          relation: e.relation != null ? String(e.relation) : "link",
          meta: e.meta && typeof e.meta === "object" ? structuredClone(e.meta) : {}
        };
        state.edges.push(edge);
        mainMenu.edgeIds.push(edge.id);
      }
    }

    state.document.meta = { ...state.document.meta, legacy: metaLegacy };
    state.ui.activeMenuId = mainMenu.id;
    normalizeAllLayoutSizes(state);
    syncHierarchyFromMenus(state);
    syncHierarchyFiles(state);
    return state;
  }

  function getActiveMenu(state) {
    return getMenuById(state, state.ui.activeMenuId);
  }

  function getMenuById(state, menuId) {
    return state.menus.find((m) => m.id === menuId) || null;
  }

  function getKnotById(state, knotId) {
    return state.knots.find((k) => k.id === knotId) || null;
  }

  function getEdgeById(state, edgeId) {
    return state.edges.find((e) => e.id === edgeId) || null;
  }

  function getKnotIdsForMenu(state, menuId) {
    const m = getMenuById(state, menuId);
    return m ? m.knotIds.slice() : [];
  }

  function getEdgesForMenu(state, menuId) {
    const m = getMenuById(state, menuId);
    if (!m) return [];
    return m.edgeIds.map((id) => getEdgeById(state, id)).filter(Boolean);
  }

  function getKnotsForActiveMenu(state) {
    return getKnotIdsForMenu(state, state.ui.activeMenuId)
      .map((id) => getKnotById(state, id))
      .filter(Boolean);
  }

  function getEdgesForActiveMenu(state) {
    const edgeIds = getVisibleEdgeIdsForMenu(state, state.ui.activeMenuId);
    return edgeIds.map((id) => getEdgeById(state, id)).filter(Boolean);
  }

  function getKnotLayout(state, knotId) {
    state.ui.layout.knots[knotId] = state.ui.layout.knots[knotId] || {
      x: 120,
      y: 80,
      width: KNOT_SIZE.width,
      height: null,
      zIndex: 1
    };
    return state.ui.layout.knots[knotId];
  }

  function countTrayKnots() {
    return app.state.knots.filter((k) => {
      return isTrayKnot(k);
    }).length;
  }

  function getKnotLocation(knot) {
    return knot?.meta?.location === "tray" || knot?.meta?.location === "stash" ? "tray" : "canvas";
  }

  function isTrayKnot(knot) {
    return getKnotLocation(knot) === "tray";
  }

  function normalizeAllLayoutSizes(state) {
    const layouts = state?.ui?.layout?.knots;
    if (!layouts || typeof layouts !== "object") return;
    for (const id of Object.keys(layouts)) {
      const layout = layouts[id];
      if (!layout || typeof layout !== "object") continue;
      layout.width = KNOT_SIZE.width;
      if (!Number.isFinite(layout.height)) layout.height = null;
      if (layout.zone !== undefined) delete layout.zone;
    }
  }

  function setKnotLayout(state, knotId, patch) {
    const cur = { ...getKnotLayout(state, knotId), ...patch };
    cur.width = KNOT_SIZE.width;
    if (!Number.isFinite(cur.height)) cur.height = null;
    if (cur.zone !== undefined) delete cur.zone;
    state.ui.layout.knots[knotId] = cur;
    return cur;
  }

  function addKnotToMenuProjection(state, menuId, knotId) {
    const m = getMenuById(state, menuId);
    if (!m) return;
    if (!m.knotIds.includes(knotId)) m.knotIds.push(knotId);
  }

  function addEdgeToMenuProjection(state, menuId, edgeId) {
    const m = getMenuById(state, menuId);
    if (!m) return;
    if (!m.edgeIds.includes(edgeId)) m.edgeIds.push(edgeId);
  }

  function removeKnotFromAllMenuProjections(state, knotId) {
    for (const menu of state.menus) {
      menu.knotIds = menu.knotIds.filter((id) => id !== knotId);
    }
  }

  function removeEdgeFromAllMenuProjections(state, edgeId) {
    for (const menu of state.menus) {
      menu.edgeIds = menu.edgeIds.filter((id) => id !== edgeId);
    }
  }

  function getVisibleKnotIdsForMenu(state, menuId) {
    const menu = getMenuById(state, menuId);
    if (!menu) {
      return state.knots
        .filter((knot) => !isTrayKnot(knot))
        .map((knot) => knot.id);
    }
    return menu.knotIds.slice();
  }

  function getVisibleEdgeIdsForMenu(state, menuId) {
    const menu = getMenuById(state, menuId);
    if (!menu) {
      return state.edges
        .filter((edge) => {
          const fromKnot = getKnotById(state, edge.from);
          const toKnot = getKnotById(state, edge.to);
          return !isTrayKnot(fromKnot) && !isTrayKnot(toKnot);
        })
        .map((edge) => edge.id);
    }
    return menu.edgeIds.slice();
  }

  function ensureEdge(state, fromId, toId, relation) {
    const existing = state.edges.find((e) => e.from === fromId && e.to === toId);
    if (existing) {
      if (relation) existing.relation = relation;
      return existing;
    }
    const edge = createEdgeModel(fromId, toId, relation);
    state.edges.push(edge);
    const menu = getActiveMenu(state);
    if (menu) addEdgeToMenuProjection(state, menu.id, edge.id);
    return edge;
  }

  function syncHierarchyFromMenus(state) {
    const folder = state.hierarchy.folders[0];
    if (!folder) return;
    const seen = new Set();
    for (const m of state.menus) {
      if (!folder.menuIds.includes(m.id)) folder.menuIds.push(m.id);
      seen.add(m.id);
    }
    folder.menuIds = folder.menuIds.filter((id) => seen.has(id));
  }

  function syncHierarchyFiles(state) {
    state.files = state.files || { menuText: "", structureText: "" };
    state.files.structureText = buildMapTextFromHierarchy(state);
    state.files.menuText = buildMenuTextFromHierarchy(state);
  }

  function buildMapTextFromHierarchy(state) {
    const lines = ["# map/structure.txt (generated from hierarchy)"];
    for (const folder of state.hierarchy.folders) {
      lines.push(`folder:${folder.name} id:${folder.id}`);
      for (const mid of folder.menuIds) {
        const menu = getMenuById(state, mid);
        if (!menu) continue;
        lines.push(`  menu:${menu.name} id:${menu.id}`);
        for (const kid of menu.knotIds) {
          const k = getKnotById(state, kid);
          lines.push(`    knot:${kid}${k ? ` title:${escapeTitle(k.title)}` : ""}`);
        }
      }
    }
    return lines.join("\n");
  }

  function buildMenuTextFromHierarchy(state) {
    const lines = ["# menu/menu.txt (generated from hierarchy)"];
    for (const folder of state.hierarchy.folders) {
      lines.push(`[${folder.name}]`);
      for (const mid of folder.menuIds) {
        const menu = getMenuById(state, mid);
        if (!menu) continue;
        lines.push(`  ${menu.name}`);
        for (const kid of menu.knotIds) {
          lines.push(`    ${kid}`);
        }
      }
    }
    return lines.join("\n");
  }

  function escapeTitle(t) {
    return String(t).replace(/\s+/g, " ").slice(0, 40);
  }

  function touchDocumentUpdated(state = app.state) {
    state.document.updatedAt = isoNow();
  }

  function parseStructureTextAndApply(state, text) {
    if (!text || typeof text !== "string") return;
    const lines = text.split(/\n/).filter((l) => !l.trim().startsWith("#"));
    let currentMenu = null;

    for (const raw of lines) {
      if (!raw.trim()) continue;
      const line = raw.trim();

      if (line.startsWith("folder:")) {
        currentMenu = null;
        continue;
      }
      const menuMatch = line.match(/^menu:(.+?)\s+id:(\S+)/);
      const knotMatch = line.match(/^knot:(\S+)/);
      if (menuMatch) {
        const menuName = menuMatch[1].trim();
        const menuId = menuMatch[2];
        let m = getMenuById(state, menuId);
        if (!m) {
          m = { id: menuId, name: menuName, knotIds: [], edgeIds: [], meta: {} };
          state.menus.push(m);
        } else {
          m.name = menuName;
        }
        currentMenu = m;
      } else if (knotMatch && currentMenu) {
        const kid = knotMatch[1];
        if (getKnotById(state, kid) && !currentMenu.knotIds.includes(kid)) {
          currentMenu.knotIds.push(kid);
        }
      }
    }
    syncHierarchyFromMenus(state);
  }

  function applyImportedFiles(state) {
    if (state.files && state.files.structureText) {
      parseStructureTextAndApply(state, state.files.structureText);
    }
  }
})();
