(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const X_TICKS = [0, 25, 50, 75, 100];

  // Holds at most maxPoints samples of an arbitrarily long run by doubling the
  // sampling stride whenever it fills up. Best fitness only ever rises, so the
  // thinned curve keeps its shape. The latest sample is always reported so the
  // live line reaches the current generation.
  function createHistory(maxPoints) {
    let stride = 1;
    let points = [];
    let latest = null;
    return {
      add(generation, value) {
        latest = { generation, value };
        if (generation % stride !== 0) {
          return;
        }
        points.push(latest);
        while (points.length > maxPoints) {
          stride *= 2;
          points = points.filter((p) => p.generation % stride === 0);
        }
      },
      points() {
        if (latest && points[points.length - 1] !== latest) {
          return points.concat([latest]);
        }
        return points;
      },
    };
  }

  function niceStep(rough) {
    const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
    for (const factor of [1, 2, 5, 10]) {
      if (factor * magnitude >= rough) {
        return factor * magnitude;
      }
    }
    return 10 * magnitude;
  }

  // Values are fitness percentages. The top is pinned at 100% (a perfect
  // match); the bottom is the lowest value rounded down to a tick, because a
  // random image already scores ~85% and a 0-based axis would flatten the curve.
  function yDomain(values, maxTicks = 5) {
    const lowest = Math.min(...values);
    const span = Math.max(100 - lowest, 0.001);
    const step = niceStep(span / maxTicks);
    const decimals = Math.max(0, -Math.floor(Math.log10(step)));
    // At least one step below 100 so a perfect match still has a non-empty range.
    const min = Math.min(Math.floor(lowest / step + 1e-9) * step, 100 - step);
    const ticks = [];
    for (let i = 0; min + i * step <= 100 + step / 1000; i++) {
      ticks.push(Number((min + i * step).toFixed(decimals)));
    }
    return { min: ticks[0], max: 100, ticks, decimals };
  }

  function scaleX(generation, maxGenerations, width) {
    return Math.min(generation / maxGenerations, 1) * width;
  }

  function scaleY(value, domain, height) {
    return height - ((value - domain.min) / (domain.max - domain.min)) * height;
  }

  function linePath(points, maxGenerations, domain, width, height) {
    return points
      .map((p, i) => {
        const x = scaleX(p.generation, maxGenerations, width).toFixed(1);
        const y = scaleY(p.value, domain, height).toFixed(1);
        return `${i === 0 ? 'M' : 'L'}${x},${y}`;
      })
      .join('');
  }

  // points must be sorted by generation, as createHistory produces them.
  function nearestPoint(points, generation) {
    let lo = 0;
    let hi = points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (points[mid].generation < generation) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    if (lo > 0 && generation - points[lo - 1].generation < points[lo].generation - generation) {
      return points[lo - 1];
    }
    return points[lo];
  }

  function svg(name, attributes) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) {
      node.setAttribute(key, value);
    }
    return node;
  }

  // Draws into `container`; call update() with fresh data as often as needed.
  // formatValue / formatGeneration turn numbers into tooltip text.
  function createFitnessChart(container, { formatValue, formatGeneration }) {
    const margin = { top: 10, right: 16, bottom: 26, left: 64 };
    const height = 220;
    const root = svg('svg', { class: 'chart-svg', height, role: 'img' });
    const grid = svg('g', { class: 'chart-grid' });
    const labels = svg('g', { class: 'chart-labels' });
    const line = svg('path', { class: 'chart-line' });
    const crosshair = svg('line', { class: 'chart-crosshair' });
    const dot = svg('circle', { class: 'chart-dot', r: 4 });
    const plot = svg('g', { transform: `translate(${margin.left},${margin.top})` });
    plot.append(grid, line, crosshair, dot);
    root.append(plot, labels);
    const tooltip = document.createElement('div');
    tooltip.className = 'chart-tooltip';
    const tooltipValue = document.createElement('strong');
    const tooltipLabel = document.createElement('span');
    tooltip.append(tooltipValue, tooltipLabel);
    container.append(root, tooltip);

    let state = null;
    let pointerX = null;

    function drawAxes(domain, innerWidth, innerHeight) {
      grid.replaceChildren();
      labels.replaceChildren();
      for (const tick of domain.ticks) {
        const y = scaleY(tick, domain, innerHeight);
        grid.append(svg('line', { x1: 0, x2: innerWidth, y1: y, y2: y }));
        const text = svg('text', { x: margin.left - 8, y: margin.top + y, 'text-anchor': 'end', 'dominant-baseline': 'middle' });
        text.textContent = `${tick.toFixed(domain.decimals)}%`;
        labels.append(text);
      }
      for (const tick of X_TICKS) {
        const x = (tick / 100) * innerWidth;
        const text = svg('text', {
          x: margin.left + x,
          y: margin.top + innerHeight + 18,
          'text-anchor': tick === 0 ? 'start' : tick === 100 ? 'end' : 'middle',
        });
        text.textContent = `${tick}%`;
        labels.append(text);
      }
    }

    function drawHover() {
      const show = state && pointerX !== null && state.points.length > 0;
      crosshair.style.display = dot.style.display = tooltip.style.display = show ? '' : 'none';
      if (!show) {
        return;
      }
      const { points, maxGenerations, domain, innerWidth, innerHeight } = state;
      const x = Math.min(Math.max(pointerX - margin.left, 0), innerWidth);
      const point = nearestPoint(points, (x / innerWidth) * maxGenerations);
      const px = scaleX(point.generation, maxGenerations, innerWidth);
      const py = scaleY(point.value, domain, innerHeight);
      crosshair.setAttribute('x1', px);
      crosshair.setAttribute('x2', px);
      crosshair.setAttribute('y1', 0);
      crosshair.setAttribute('y2', innerHeight);
      dot.setAttribute('cx', px);
      dot.setAttribute('cy', py);
      tooltipValue.textContent = formatValue(point.value);
      tooltipLabel.textContent = formatGeneration(point.generation, maxGenerations);
      const left = margin.left + px;
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${margin.top + py}px`;
      tooltip.classList.toggle('flip', left > container.clientWidth / 2);
    }

    drawHover();

    root.addEventListener('pointermove', (event) => {
      pointerX = event.clientX - root.getBoundingClientRect().left;
      drawHover();
    });
    root.addEventListener('pointerleave', () => {
      pointerX = null;
      drawHover();
    });

    return {
      update(points, maxGenerations) {
        const width = container.clientWidth;
        const innerWidth = Math.max(width - margin.left - margin.right, 10);
        const innerHeight = height - margin.top - margin.bottom;
        root.setAttribute('width', width);
        if (points.length === 0 || maxGenerations <= 0) {
          state = null;
          line.setAttribute('d', '');
          grid.replaceChildren();
          labels.replaceChildren();
          drawHover();
          return;
        }
        const domain = yDomain(points.map((p) => p.value));
        state = { points, maxGenerations, domain, innerWidth, innerHeight };
        drawAxes(domain, innerWidth, innerHeight);
        line.setAttribute('d', linePath(points, maxGenerations, domain, innerWidth, innerHeight));
        drawHover();
      },
    };
  }

  const FitnessChart = {
    createHistory,
    niceStep,
    yDomain,
    scaleX,
    scaleY,
    linePath,
    nearestPoint,
    createFitnessChart,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FitnessChart;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.FitnessChart = FitnessChart;
  }
})();
