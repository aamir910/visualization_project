/* =========================================================
   MAIL Faculty Findings · CHAT-3G Dashboard
   - Parses NVivo codebook embedded in data.js
   - Renders D3 force-network + 4 Chart.js charts
   - Drives reveal animations and reading progress
   ========================================================= */

(function () {
  "use strict";

  // ---------- 1. Data prep --------------------------------------------------

  const RAW = (window.CODEBOOK_DATA || []).filter(
    (d) => d && d.name && String(d.name).trim().length > 0
  );

  // CHAT root → display info (color from styles.css custom props)
  const ROOT_DEFINITIONS = [
    { key: "Subjects",                   label: "Subject",            num: "01",
      color: "var(--c-subject)", short: "The faculty",
      desc: "The individual or group being studied — here, the MAIL teaching faculty." },
    { key: "Object",                     label: "Object",             num: "02",
      color: "var(--c-object)", short: "Goal & motive",
      desc: "The goal or problem space — what the activity is trying to produce." },
    { key: "Tools",                      label: "Tools",              num: "03",
      color: "var(--c-tools)", short: "Mediating artifacts",
      desc: "Technologies, language, methods and frameworks used in the activity." },
    { key: "Rules",                      label: "Rules",              num: "04",
      color: "var(--c-rules)", short: "Norms & policies",
      desc: "Formal and informal norms, expectations, schedules and authority." },
    { key: "Community",                  label: "Community",          num: "05",
      color: "var(--c-community)", short: "Stakeholders",
      desc: "The social environment around the activity: peers, villages, partners." },
    { key: "Division of Labor",          label: "Division of Labor",  num: "06",
      color: "var(--c-labor)", short: "Roles & hierarchy",
      desc: "How responsibilities, authority and tasks are distributed." },
    { key: "Outcome",                    label: "Outcome",            num: "07",
      color: "var(--c-outcome)", short: "Final transformation",
      desc: "Perceived success or unintended consequences." },
    { key: "INTERACTING ACTIVITY SYSTEMS", label: "Interacting Systems", num: "08",
      color: "var(--c-interact)", short: "Where systems meet",
      desc: "Overlapping activity systems, and their tensions or contradictions." },
  ];

  const ROOT_KEYS = ROOT_DEFINITIONS.map((r) => r.key);
  const ROOT_BY_KEY = Object.fromEntries(ROOT_DEFINITIONS.map((r) => [r.key, r]));

  // Resolve CSS custom properties to actual hex (Chart.js needs concrete colors)
  const cssColor = (name) => {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || "#888";
  };
  const ROOT_COLOR = {
    "Subjects": cssColor("--c-subject"),
    "Object": cssColor("--c-object"),
    "Tools": cssColor("--c-tools"),
    "Rules": cssColor("--c-rules"),
    "Community": cssColor("--c-community"),
    "Division of Labor": cssColor("--c-labor"),
    "Outcome": cssColor("--c-outcome"),
    "INTERACTING ACTIVITY SYSTEMS": cssColor("--c-interact"),
  };

  // Normalize each codebook row → { id, root, leaf, refs, sources, isRoot }
  const ITEMS = RAW.map((row) => {
    const parts = String(row.name).split("\\").map((s) => s.trim()).filter(Boolean);
    const root = parts[0];
    const leaf = parts.length > 1 ? parts[parts.length - 1] : parts[0];
    return {
      id: row.name,
      root,
      leaf,
      depth: parts.length,
      isRoot: parts.length === 1,
      refs: Number(row.references) || 0,
      sources: Number(row.sources) || 0,
      description: row.description || "",
    };
  }).filter((d) => ROOT_KEYS.includes(d.root));

  const ROOT_NODES = ITEMS.filter((d) => d.isRoot);
  const LEAF_NODES = ITEMS.filter((d) => !d.isRoot);

  // Aggregations by root
  const aggregatedByRoot = ROOT_KEYS.map((key) => {
    const leaves = LEAF_NODES.filter((d) => d.root === key);
    return {
      key,
      label: ROOT_BY_KEY[key].label,
      color: ROOT_COLOR[key],
      codes: leaves.length,
      refs: leaves.reduce((s, d) => s + d.refs, 0),
      sources: leaves.reduce((s, d) => s + d.sources, 0),
    };
  });

  // ---------- 2. KPIs and CHAT cards ---------------------------------------

  const totalRefs = LEAF_NODES.reduce((s, d) => s + d.refs, 0);
  const topRoot = [...aggregatedByRoot].sort((a, b) => b.refs - a.refs)[0];

  document.getElementById("kpiCodes").textContent = LEAF_NODES.length;
  document.getElementById("kpiRefs").textContent = totalRefs;
  document.getElementById("kpiRoots").textContent = ROOT_KEYS.length;
  document.getElementById("kpiTop").textContent = topRoot ? topRoot.label : "—";

  // CHAT lens cards
  const chatGrid = document.getElementById("chatGrid");
  if (chatGrid) {
    chatGrid.innerHTML = aggregatedByRoot.map((r) => {
      const def = ROOT_BY_KEY[r.key];
      return `
        <article class="chat-card reveal" style="--tone:${ROOT_COLOR[r.key]}">
          <span class="chat-num">${def.num}</span>
          <h3 class="chat-name">${def.label}</h3>
          <p class="chat-desc">${def.desc}</p>
          <div class="chat-meta">
            <span><b>${r.codes}</b> codes</span>
            <span><b>${r.refs}</b> references</span>
          </div>
        </article>
      `;
    }).join("");
  }

  // ---------- 3. Network graph (D3) ----------------------------------------

  const svg = d3.select("#forceGraph");
  const tooltip = d3.select("body").append("div").attr("class", "tooltip");

  // Detail panel refs
  const dpTag = document.getElementById("dpTag");
  const dpTitle = document.getElementById("dpTitle");
  const dpDesc = document.getElementById("dpDesc");
  const dpRefs = document.getElementById("dpRefs");
  const dpSources = document.getElementById("dpSources");
  const dpPath = document.getElementById("dpPath");

  function setDetail(node) {
    if (!node) {
      dpTag.textContent = "CHAT root";
      dpTag.style.color = "var(--accent-1)";
      dpTag.style.background = "color-mix(in srgb, var(--accent-1) 12%, transparent)";
      dpTitle.textContent = "Click any node";
      dpDesc.textContent = "Hover to highlight. Click a node to pin it here. Use search to focus a code.";
      dpRefs.textContent = dpSources.textContent = dpPath.textContent = "—";
      return;
    }
    const color = node.isHub ? cssColor("--c-dark-2") : ROOT_COLOR[node.root] || cssColor("--accent-1");
    dpTag.textContent = node.isHub ? "Activity hub" : (ROOT_BY_KEY[node.root]?.label || node.root);
    dpTag.style.color = color;
    dpTag.style.background = `color-mix(in srgb, ${color} 14%, transparent)`;
    dpTitle.textContent = node.leaf || node.id;
    dpDesc.textContent = node.description ||
      (node.isRoot ? `Top-level CHAT component grouping the ${node.childCount || 0} codes below it.` :
       node.isHub ? "Synthetic node connecting the eight activity-system roots." :
       "Coded reference from the NVivo codebook.");
    dpRefs.textContent = node.refs ?? "—";
    dpSources.textContent = node.sources ?? "—";
    dpPath.textContent = node.id;
  }

  // Build nodes/links
  function buildGraph(showHub) {
    const nodes = [];
    const links = [];
    const HUB_ID = "__HUB__";

    if (showHub) {
      nodes.push({ id: HUB_ID, leaf: "Activity System", root: null, isHub: true, refs: totalRefs, sources: 14 });
    }

    // Root nodes (one per CHAT key)
    for (const key of ROOT_KEYS) {
      const leaves = LEAF_NODES.filter((d) => d.root === key);
      const totalRootRefs = leaves.reduce((s, d) => s + d.refs, 0);
      nodes.push({
        id: key,
        leaf: ROOT_BY_KEY[key].label,
        root: key,
        isRoot: true,
        refs: totalRootRefs,
        sources: leaves.reduce((s, d) => s + d.sources, 0),
        childCount: leaves.length,
        description: ROOT_BY_KEY[key].desc,
      });
      if (showHub) links.push({ source: HUB_ID, target: key, kind: "hub" });
    }

    // Leaf nodes
    for (const leaf of LEAF_NODES) {
      nodes.push({
        id: leaf.id,
        leaf: leaf.leaf,
        root: leaf.root,
        refs: leaf.refs,
        sources: leaf.sources,
        description: leaf.description,
      });
      links.push({ source: leaf.root, target: leaf.id, kind: "tree" });
    }

    return { nodes, links };
  }

  const radiusForRefs = (refs, isRoot, isHub) => {
    if (isHub) return 14;
    if (isRoot) return 12;
    return 4 + Math.sqrt(Math.max(0, refs)) * 3.2;
  };

  let simulation, linkSel, nodeSel, currentData;
  let selectedNode = null;

  function render(showHub) {
    svg.selectAll("*").remove();

    const stage = svg.node().parentElement.getBoundingClientRect();
    const width = stage.width;
    const height = stage.height;

    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("width", width).attr("height", height);

    const root = svg.append("g").attr("class", "viewport");
    const linkLayer = root.append("g").attr("class", "links");
    const nodeLayer = root.append("g").attr("class", "nodes");

    // zoom/pan
    const zoom = d3.zoom().scaleExtent([0.3, 3])
      .on("zoom", (event) => root.attr("transform", event.transform));
    svg.call(zoom).on("dblclick.zoom", null);

    currentData = buildGraph(showHub);

    linkSel = linkLayer.selectAll("line")
      .data(currentData.links)
      .join("line")
      .attr("class", "link")
      .attr("stroke", (d) => {
        if (d.kind === "hub") return cssColor("--c-dark-2");
        return ROOT_COLOR[d.source.root || d.source] || "#c9cdd6";
      })
      .attr("stroke-opacity", (d) => d.kind === "hub" ? 0.35 : 0.45);

    nodeSel = nodeLayer.selectAll("g.node")
      .data(currentData.nodes, (d) => d.id)
      .join("g")
      .attr("class", (d) => "node" + (d.isRoot ? " is-root" : "") + (d.isHub ? " is-hub" : ""))
      .call(drag())
      .on("mouseenter", (event, d) => onNodeHover(d, true))
      .on("mouseleave", (event, d) => onNodeHover(d, false))
      .on("mousemove", (event, d) => positionTooltip(event, d))
      .on("click", (event, d) => {
        event.stopPropagation();
        selectedNode = d;
        focusNode(d);
        setDetail(d);
      });

    nodeSel.append("circle")
      .attr("r", (d) => radiusForRefs(d.refs, d.isRoot, d.isHub))
      .attr("fill", (d) => {
        if (d.isHub) return cssColor("--c-dark-2");
        return ROOT_COLOR[d.root] || "#bbb";
      });

    nodeSel.append("text")
      .attr("dy", (d) => -(radiusForRefs(d.refs, d.isRoot, d.isHub) + 6))
      .attr("text-anchor", "middle")
      .text((d) => d.isRoot || d.isHub ? d.leaf : truncate(d.leaf, 28));

    // background click clears selection
    svg.on("click", () => { selectedNode = null; focusNode(null); setDetail(null); });

    simulation = d3.forceSimulation(currentData.nodes)
      .force("link", d3.forceLink(currentData.links)
        .id((d) => d.id)
        .distance((d) => d.kind === "hub" ? 130 : 70)
        .strength((d) => d.kind === "hub" ? 0.4 : 0.7))
      .force("charge", d3.forceManyBody().strength((d) => d.isHub ? -700 : d.isRoot ? -380 : -90))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius((d) => radiusForRefs(d.refs, d.isRoot, d.isHub) + 4).strength(0.85))
      .force("x", d3.forceX(width / 2).strength(0.04))
      .force("y", d3.forceY(height / 2).strength(0.06))
      .on("tick", ticked);

    function ticked() {
      linkSel
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);
      nodeSel.attr("transform", (d) => `translate(${d.x},${d.y})`);
    }

    applyLabelVisibility();
  }

  function drag() {
    function started(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x; d.fy = d.y;
    }
    function dragged(event, d) { d.fx = event.x; d.fy = event.y; }
    function ended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null; d.fy = null;
    }
    return d3.drag().on("start", started).on("drag", dragged).on("end", ended);
  }

  function truncate(s, n) { return s.length <= n ? s : s.slice(0, n - 1) + "…"; }

  function onNodeHover(d, isOn) {
    if (!nodeSel) return;
    if (isOn) {
      tooltip.html(
        `<strong>${d.leaf}</strong><br/>` +
        `<span>${d.isHub ? "Activity hub" : (ROOT_BY_KEY[d.root]?.label || d.root)}</span>` +
        ` &nbsp;·&nbsp; <span>refs:</span> ${d.refs} ` +
        ` &nbsp;·&nbsp; <span>sources:</span> ${d.sources ?? "—"}`
      ).classed("show", true);
      if (!selectedNode) focusNode(d);
    } else {
      tooltip.classed("show", false);
      if (!selectedNode) focusNode(null);
    }
  }
  function positionTooltip(event) {
    const [x, y] = d3.pointer(event, document.body);
    tooltip.style("left", `${x}px`).style("top", `${y}px`);
  }

  function focusNode(d) {
    if (!nodeSel || !linkSel) return;
    if (!d) {
      nodeSel.classed("is-faded", false).classed("is-active", false).classed("is-hover", false);
      linkSel.classed("is-faded", false).classed("is-active", false);
      return;
    }
    const connected = new Set([d.id]);
    currentData.links.forEach((l) => {
      const s = l.source.id || l.source;
      const t = l.target.id || l.target;
      if (s === d.id) connected.add(t);
      if (t === d.id) connected.add(s);
    });
    nodeSel
      .classed("is-faded", (n) => !connected.has(n.id))
      .classed("is-active", (n) => n.id === d.id)
      .classed("is-hover", (n) => connected.has(n.id) && n.id !== d.id);
    linkSel
      .classed("is-faded", (l) => {
        const s = l.source.id || l.source;
        const t = l.target.id || l.target;
        return s !== d.id && t !== d.id;
      })
      .classed("is-active", (l) => {
        const s = l.source.id || l.source;
        const t = l.target.id || l.target;
        return s === d.id || t === d.id;
      });
  }

  function applyLabelVisibility() {
    if (!nodeSel) return;
    const showAll = document.getElementById("toggleLabels").checked;
    nodeSel.select("text").attr("display", (d) =>
      showAll ? null : (d.isRoot || d.isHub ? null : "none")
    );
  }

  // toolbar wiring
  const hubToggle = document.getElementById("toggleHub");
  const labelToggle = document.getElementById("toggleLabels");
  const resetBtn = document.getElementById("resetGraph");
  const search = document.getElementById("netSearch");

  hubToggle.addEventListener("change", () => render(hubToggle.checked));
  labelToggle.addEventListener("change", applyLabelVisibility);
  resetBtn.addEventListener("click", () => {
    selectedNode = null;
    setDetail(null);
    search.value = "";
    render(hubToggle.checked);
  });
  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    if (!q) { focusNode(selectedNode); return; }
    const matches = currentData.nodes.filter((n) =>
      (n.leaf || "").toLowerCase().includes(q) || (n.id || "").toLowerCase().includes(q)
    );
    if (!matches.length) {
      nodeSel.classed("is-faded", true);
      linkSel.classed("is-faded", true);
      return;
    }
    const ids = new Set(matches.map((m) => m.id));
    matches.forEach((m) => {
      currentData.links.forEach((l) => {
        const s = l.source.id || l.source;
        const t = l.target.id || l.target;
        if (s === m.id) ids.add(t);
        if (t === m.id) ids.add(s);
      });
    });
    nodeSel.classed("is-faded", (n) => !ids.has(n.id))
           .classed("is-active", (n) => matches.some((m) => m.id === n.id));
    linkSel.classed("is-faded", (l) => {
      const s = l.source.id || l.source;
      const t = l.target.id || l.target;
      return !(ids.has(s) && ids.has(t));
    });
  });

  // Build legend
  const legend = document.getElementById("netLegend");
  legend.innerHTML = aggregatedByRoot.map((r) => `
    <button type="button" class="legend-pill" data-key="${r.key}" aria-pressed="false">
      <span class="swatch" style="background:${ROOT_COLOR[r.key]}"></span>
      ${ROOT_BY_KEY[r.key].label}
      <span class="muted" style="font-weight:500;color:#8a93a4">· ${r.codes}</span>
    </button>
  `).join("");
  legend.addEventListener("click", (e) => {
    const btn = e.target.closest(".legend-pill");
    if (!btn) return;
    const key = btn.dataset.key;
    const others = legend.querySelectorAll(".legend-pill");
    const wasActive = btn.getAttribute("aria-pressed") === "true";
    others.forEach((b) => { b.setAttribute("aria-pressed", "false"); b.classList.remove("dim"); });
    if (wasActive) {
      nodeSel.classed("is-faded", false);
      linkSel.classed("is-faded", false);
      return;
    }
    btn.setAttribute("aria-pressed", "true");
    others.forEach((b) => { if (b !== btn) b.classList.add("dim"); });
    nodeSel.classed("is-faded", (n) => n.root !== key);
    linkSel.classed("is-faded", (l) => {
      const s = l.source.id || l.source, t = l.target.id || l.target;
      const sn = currentData.nodes.find((n) => n.id === s);
      const tn = currentData.nodes.find((n) => n.id === t);
      return !(sn?.root === key || tn?.root === key);
    });
  });

  // Initial render + responsive
  render(false);
  window.addEventListener("resize", debounce(() => render(hubToggle.checked), 220));

  function debounce(fn, ms) {
    let id; return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); };
  }

  // ---------- 4. Charts (Chart.js) -----------------------------------------

  const fontFamily = '"Inter", "Segoe UI", "Calibri", system-ui, sans-serif';
  Chart.defaults.font.family = fontFamily;
  Chart.defaults.color = cssColor("--c-dark-2");
  Chart.defaults.borderColor = cssColor("--border");
  Chart.defaults.plugins.legend.labels.boxWidth = 10;
  Chart.defaults.plugins.legend.labels.boxHeight = 10;
  Chart.defaults.plugins.legend.labels.padding = 14;

  // 4a. Coverage curve (line) ------------------------------------------------
  {
    const sorted = [...LEAF_NODES].sort((a, b) => b.refs - a.refs);
    let cum = 0;
    const refsSeries = sorted.map((d) => d.refs);
    const cumPctSeries = sorted.map((d) => {
      cum += d.refs;
      return (cum / totalRefs) * 100;
    });
    const labels = sorted.map((_, i) => i + 1);

    new Chart(document.getElementById("lineChart"), {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "References per code",
            data: refsSeries,
            borderColor: cssColor("--accent-1"),
            backgroundColor: hexA(cssColor("--accent-1"), 0.10),
            tension: 0.25,
            fill: true,
            yAxisID: "y",
            pointRadius: 0,
            borderWidth: 2,
          },
          {
            label: "Cumulative share (%)",
            data: cumPctSeries,
            borderColor: cssColor("--accent-2"),
            backgroundColor: "transparent",
            borderDash: [4, 4],
            tension: 0.2,
            yAxisID: "y1",
            pointRadius: 0,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 700, easing: "easeOutCubic" },
        interaction: { intersect: false, mode: "index" },
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            callbacks: {
              title: (items) => `Rank #${items[0].label} — ${truncate(sorted[items[0].dataIndex].leaf, 40)}`,
              afterTitle: (items) => `(${ROOT_BY_KEY[sorted[items[0].dataIndex].root]?.label || sorted[items[0].dataIndex].root})`,
            },
          },
        },
        scales: {
          x: {
            title: { display: true, text: "Codes ranked by references" },
            ticks: { maxTicksLimit: 12 },
            grid: { display: false },
          },
          y: {
            title: { display: true, text: "References" },
            beginAtZero: true,
            grid: { color: "rgba(0,0,0,0.05)" },
          },
          y1: {
            position: "right",
            title: { display: true, text: "Cumulative %" },
            beginAtZero: true,
            max: 100,
            grid: { display: false },
            ticks: { callback: (v) => v + "%" },
          },
        },
      },
    });
  }

  // 4b. Top 15 codes (horizontal bar) ---------------------------------------
  {
    const top = [...LEAF_NODES].sort((a, b) => b.refs - a.refs).slice(0, 15);
    new Chart(document.getElementById("barChart"), {
      type: "bar",
      data: {
        labels: top.map((d) => truncate(d.leaf, 38)),
        datasets: [{
          label: "References",
          data: top.map((d) => d.refs),
          backgroundColor: top.map((d) => ROOT_COLOR[d.root] || "#888"),
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 700, easing: "easeOutCubic" },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => top[items[0].dataIndex].leaf,
              afterTitle: (items) => ROOT_BY_KEY[top[items[0].dataIndex].root]?.label || "",
              label: (ctx) => `References: ${ctx.parsed.x} · Sources: ${top[ctx.dataIndex].sources}`,
            },
          },
        },
        scales: {
          x: { beginAtZero: true, grid: { color: "rgba(0,0,0,0.05)" }, title: { display: true, text: "References" } },
          y: { grid: { display: false }, ticks: { autoSkip: false, font: { size: 11 } } },
        },
      },
    });
  }

  // 4c. Composition by root (doughnut) --------------------------------------
  {
    new Chart(document.getElementById("doughnutChart"), {
      type: "doughnut",
      data: {
        labels: aggregatedByRoot.map((r) => ROOT_BY_KEY[r.key].label),
        datasets: [{
          data: aggregatedByRoot.map((r) => r.refs),
          backgroundColor: aggregatedByRoot.map((r) => ROOT_COLOR[r.key]),
          borderColor: "#fff",
          borderWidth: 2,
          hoverOffset: 10,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "58%",
        animation: { animateRotate: true, duration: 900, easing: "easeOutCubic" },
        plugins: {
          legend: { position: "right", labels: { boxWidth: 10, padding: 12, font: { size: 12 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const r = aggregatedByRoot[ctx.dataIndex];
                const pct = ((r.refs / totalRefs) * 100).toFixed(1);
                return ` ${r.refs} refs · ${r.codes} codes · ${pct}%`;
              },
            },
          },
        },
      },
    });
  }

  // 4d. System shape (radar) ------------------------------------------------
  {
    const max = Math.max(...aggregatedByRoot.map((r) => r.refs));
    new Chart(document.getElementById("radarChart"), {
      type: "radar",
      data: {
        labels: aggregatedByRoot.map((r) => ROOT_BY_KEY[r.key].label),
        datasets: [
          {
            label: "References (normalized)",
            data: aggregatedByRoot.map((r) => +(r.refs / max * 100).toFixed(1)),
            backgroundColor: hexA(cssColor("--accent-1"), 0.18),
            borderColor: cssColor("--accent-1"),
            borderWidth: 2,
            pointBackgroundColor: aggregatedByRoot.map((r) => ROOT_COLOR[r.key]),
            pointBorderColor: "#fff",
            pointRadius: 4,
            pointHoverRadius: 6,
          },
          {
            label: "Codes (normalized)",
            data: aggregatedByRoot.map((r) =>
              +(r.codes / Math.max(...aggregatedByRoot.map((x) => x.codes)) * 100).toFixed(1)
            ),
            backgroundColor: hexA(cssColor("--accent-2"), 0.10),
            borderColor: cssColor("--accent-2"),
            borderWidth: 2,
            borderDash: [4, 4],
            pointBackgroundColor: "#fff",
            pointBorderColor: cssColor("--accent-2"),
            pointRadius: 3,
            pointHoverRadius: 5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 800, easing: "easeOutCubic" },
        plugins: {
          legend: { position: "bottom", labels: { font: { size: 12 } } },
        },
        scales: {
          r: {
            min: 0, max: 100,
            angleLines: { color: "rgba(0,0,0,0.06)" },
            grid: { color: "rgba(0,0,0,0.06)" },
            pointLabels: { font: { size: 11, weight: "600" }, color: cssColor("--c-dark-2") },
            ticks: { stepSize: 25, callback: (v) => v + "%", color: "#9aa3b3", backdropColor: "transparent" },
          },
        },
      },
    });
  }

  // ---------- 5. Helpers ---------------------------------------------------

  function hexA(hex, a) {
    if (!hex) return `rgba(0,0,0,${a})`;
    let h = hex.trim();
    if (h.startsWith("rgb")) {
      const m = h.match(/\d+(\.\d+)?/g);
      if (m && m.length >= 3) return `rgba(${m[0]},${m[1]},${m[2]},${a})`;
    }
    if (h.startsWith("#")) h = h.slice(1);
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const num = parseInt(h, 16);
    const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
    return `rgba(${r},${g},${b},${a})`;
  }

  // ---------- 6. Reveal motion + scroll progress ---------------------------

  const revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.08 });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("in"));
  }

  const progress = document.getElementById("topProgress");
  function updateProgress() {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    const pct = max > 0 ? (h.scrollTop / max) * 100 : 0;
    progress.style.width = pct + "%";
  }
  updateProgress();
  window.addEventListener("scroll", updateProgress, { passive: true });
})();
