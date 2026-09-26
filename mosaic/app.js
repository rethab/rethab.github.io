(function () {
  'use strict';

  const RUN_BUDGET_MS = 12;
  const EXPORT_MIN_LONGEST_SIDE = 1000;
  const MIN_GRID = 1;
  const MAX_GRID = 1000;
  const MIN_POPULATION = 2;
  const MIN_GENERATIONS = 1;
  const HISTORY_POINTS = 1000;
  const STATS_OPEN_KEY = 'mosaic.statsOpen';

  const el = {
    imageInput: document.getElementById('imageInput'),
    populationSize: document.getElementById('populationSize'),
    maxGenerations: document.getElementById('maxGenerations'),
    gridSize: document.getElementById('gridSize'),
    gridDims: document.getElementById('gridDims'),
    stepBtn: document.getElementById('stepBtn'),
    runBtn: document.getElementById('runBtn'),
    stopBtn: document.getElementById('stopBtn'),
    saveBtn: document.getElementById('saveBtn'),
    statsToggle: document.getElementById('statsToggle'),
    statsPanel: document.getElementById('statsPanel'),
    fitnessChart: document.getElementById('fitnessChart'),
    errorMsg: document.getElementById('errorMsg'),
    imageName: document.getElementById('imageName'),
    panels: document.getElementById('panels'),
    previewBox: document.getElementById('previewBox'),
    previewImg: document.getElementById('previewImg'),
    resultBox: document.getElementById('resultBox'),
    resultCanvas: document.getElementById('resultCanvas'),
    statusGeneration: document.getElementById('statusGeneration'),
    progress: document.getElementById('progress'),
    progressFill: document.getElementById('progressFill'),
    statSpeed: document.getElementById('statSpeed'),
    statSpeedDetail: document.getElementById('statSpeedDetail'),
    statMutation: document.getElementById('statMutation'),
    statMutationShare: document.getElementById('statMutationShare'),
    statMutationCount: document.getElementById('statMutationCount'),
  };

  const resultCtx = el.resultCanvas.getContext('2d');

  let sourceImage = null;
  let evolution = null;
  let maxGenerations = 0;
  let runPopulation = 0;
  let running = false;
  let renderPending = false;
  // Generations run in back-to-back slices posted through a MessageChannel rather
  // than inside requestAnimationFrame, so the CPU is not idle between frames;
  // drawing still happens at most once per frame.
  const sliceChannel = new MessageChannel();
  let rateLastTime = 0;
  let rateLastGeneration = 0;
  let history = FitnessChart.createHistory(HISTORY_POINTS);
  let statsOpen = false;
  const chart = FitnessChart.createFitnessChart(el.fitnessChart, {
    formatValue: (percent) => GA.formatFitness(percent / 100),
    formatGeneration: (generation, max) => `Generation ${GA.formatProgress(generation, max)}`,
  });

  function showError(message) {
    el.errorMsg.textContent = message;
  }

  function clearError() {
    el.errorMsg.textContent = '';
  }

  function parsePositiveInt(input, min, max) {
    const value = Number(input.value);
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < min) {
      return null;
    }
    if (max !== undefined && value > max) {
      return null;
    }
    return value;
  }

  function readParams() {
    const populationSize = parsePositiveInt(el.populationSize, MIN_POPULATION);
    const maxGens = parsePositiveInt(el.maxGenerations, MIN_GENERATIONS);
    const gridSize = parsePositiveInt(el.gridSize, MIN_GRID, MAX_GRID);

    if (populationSize === null) {
      return { error: `Population must be an integer >= ${MIN_POPULATION}.` };
    }
    if (maxGens === null) {
      return { error: `Max generations must be an integer >= ${MIN_GENERATIONS}.` };
    }
    if (gridSize === null) {
      return { error: `Grid size must be an integer between ${MIN_GRID} and ${MAX_GRID}.` };
    }
    return { populationSize, maxGens, gridSize };
  }

  function gridFor(image, gridSize) {
    return GA.gridDimensions(image.naturalWidth, image.naturalHeight, gridSize);
  }

  function updateGridDims() {
    const gridSize = parsePositiveInt(el.gridSize, MIN_GRID, MAX_GRID);
    if (!sourceImage || gridSize === null) {
      el.gridDims.textContent = 'Pixels on the longest side';
      return;
    }
    const { width, height } = gridFor(sourceImage, gridSize);
    el.gridDims.textContent = `${width} × ${height} pixels`;
  }

  function buildTarget(image, gridWidth, gridHeight) {
    const offscreen = document.createElement('canvas');
    offscreen.width = gridWidth;
    offscreen.height = gridHeight;
    const ctx = offscreen.getContext('2d');
    ctx.drawImage(image, 0, 0, gridWidth, gridHeight);
    const imageData = ctx.getImageData(0, 0, gridWidth, gridHeight);
    return GA.rgbaToRgb(imageData.data);
  }

  function draw(genome, width, height) {
    const rgba = GA.rgbToRgba(genome);
    const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height);
    resultCtx.putImageData(imageData, 0, 0);
    el.resultBox.classList.remove('empty');
  }

  // Renders from evolution.best rather than the visible canvas, which can lag a
  // frame behind while running, so the file name matches the pixels.
  // Applies to the current run too, so a finished run can be extended and resumed.
  function handleMaxGenerationsChange() {
    const maxGens = parsePositiveInt(el.maxGenerations, MIN_GENERATIONS);
    if (maxGens === null || !evolution) {
      return;
    }
    maxGenerations = maxGens;
    updateStatus();
    updateChart();
    updateButtonStates();
  }

  function saveSnapshot() {
    if (!evolution) {
      return;
    }
    const { width, height } = el.resultCanvas;
    const source = document.createElement('canvas');
    source.width = width;
    source.height = height;
    source
      .getContext('2d')
      .putImageData(new ImageData(GA.rgbToRgba(evolution.best), width, height), 0, 0);

    const scale = GA.exportScale(width, height, EXPORT_MIN_LONGEST_SIDE);
    const output = document.createElement('canvas');
    output.width = width * scale;
    output.height = height * scale;
    const ctx = output.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, 0, 0, output.width, output.height);

    const fileName = GA.snapshotFileName(evolution.generation, evolution.bestFitness);
    output.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      // Revoking synchronously can cancel the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }

  function updateStatus(genPerSec) {
    const gen = evolution ? evolution.generation : 0;
    const done = maxGenerations > 0 ? Math.min(gen / maxGenerations, 1) : 0;
    el.statusGeneration.textContent = GA.formatProgress(gen, maxGenerations);
    el.progressFill.style.width = `${done * 100}%`;
    el.progress.setAttribute('aria-valuenow', (done * 100).toFixed(1));
    el.statSpeed.textContent = GA.formatSpeed(genPerSec);
    el.statSpeedDetail.textContent =
      genPerSec === undefined
        ? '\u00a0'
        : `${GA.formatSpeed(genPerSec * runPopulation)} candidates scored per second`;
    if (evolution) {
      const mutation = GA.formatMutation(
        evolution.mutationRate,
        evolution.mutationStrength,
        el.resultCanvas.width * el.resultCanvas.height * 3
      );
      el.statMutation.textContent = mutation.strength;
      el.statMutationShare.textContent = `on ${mutation.share}`;
      el.statMutationCount.textContent = mutation.count;
    } else {
      el.statMutation.textContent = '—';
      el.statMutationShare.textContent = '';
      el.statMutationCount.textContent = '\u00a0';
    }
  }

  function isFinished() {
    return (
      !evolution ||
      evolution.generation >= maxGenerations ||
      evolution.bestFitness === 1
    );
  }

  function updateButtonStates() {
    const canAdvance = !!sourceImage && !running && (!evolution || !isFinished());
    el.stepBtn.disabled = !canAdvance;
    el.runBtn.disabled = !canAdvance;
    el.stopBtn.disabled = !running;
    el.saveBtn.disabled = !evolution;
    // Changing these discards the run, so they are locked while it is going.
    el.imageInput.disabled = running;
    el.previewBox.classList.toggle('locked', running);
    el.populationSize.disabled = running;
    el.gridSize.disabled = running;
  }

  function handleFileChange() {
    const file = el.imageInput.files && el.imageInput.files[0];
    if (file) {
      loadImage(file);
    }
  }

  function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = running ? 'none' : 'copy';
    el.previewBox.classList.toggle('dragging', !running);
  }

  function handleDrop(event) {
    event.preventDefault();
    el.previewBox.classList.remove('dragging');
    const file = event.dataTransfer.files[0];
    if (running || !file) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      showError(`${file.name} is not an image.`);
      return;
    }
    loadImage(file);
  }

  function loadImage(file) {
    clearError();
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      sourceImage = img;
      el.previewImg.src = objectUrl;
      el.previewBox.classList.remove('empty');
      el.panels.style.setProperty('--aspect', `${img.naturalWidth} / ${img.naturalHeight}`);
      el.imageName.textContent = `${file.name} · ${img.naturalWidth} × ${img.naturalHeight}`;
      el.imageName.title = file.name;
      updateGridDims();
      discardRun();
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      sourceImage = null;
      el.previewBox.classList.add('empty');
      el.panels.style.removeProperty('--aspect');
      el.imageName.textContent = 'JPEG, PNG, whatever you have';
      updateGridDims();
      discardRun();
      showError(`Could not read ${file.name} as an image.`);
    };
    img.src = objectUrl;
  }

  // Image, population and grid size define a run; changing any of them discards
  // it so the next Step or Run starts fresh, while max generations only extends it.
  function discardRun() {
    evolution = null;
    history = FitnessChart.createHistory(HISTORY_POINTS);
    resultCtx.clearRect(0, 0, el.resultCanvas.width, el.resultCanvas.height);
    el.resultBox.classList.add('empty');
    updateStatus();
    updateChart();
    updateButtonStates();
  }

  function recordProgress() {
    history.add(evolution.generation, evolution.bestFitness * 100);
  }

  function updateChart() {
    if (statsOpen) {
      chart.update(evolution ? history.points() : [], maxGenerations);
    }
  }

  function readStatsOpen() {
    try {
      return localStorage.getItem(STATS_OPEN_KEY) === '1';
    } catch {
      return false;
    }
  }

  function setStatsOpen(open) {
    statsOpen = open;
    el.statsPanel.hidden = !open;
    el.statsToggle.setAttribute('aria-expanded', String(open));
    try {
      localStorage.setItem(STATS_OPEN_KEY, open ? '1' : '0');
    } catch {
      // Storage can be unavailable (private windows, blocked site data); the panel still works.
    }
    updateChart();
  }

  function handleGridSizeChange() {
    updateGridDims();
    discardRun();
  }

  function startEvolution() {
    clearError();

    if (!sourceImage) {
      showError('Choose an image first.');
      return false;
    }

    const params = readParams();
    if (params.error) {
      showError(params.error);
      return false;
    }

    const { populationSize, maxGens, gridSize } = params;
    runPopulation = populationSize;
    const { width: gridWidth, height: gridHeight } = gridFor(sourceImage, gridSize);
    maxGenerations = maxGens;

    el.resultCanvas.width = gridWidth;
    el.resultCanvas.height = gridHeight;

    const target = buildTarget(sourceImage, gridWidth, gridHeight);
    const rng = GA.createRng(Date.now() >>> 0);
    try {
      evolution = GA.createEvolution({
        target,
        populationSize,
        rng,
        ...GA.DEFAULTS,
      });
    } catch (error) {
      showError(error.message);
      return false;
    }

    rateLastTime = performance.now();
    rateLastGeneration = 0;
    history = FitnessChart.createHistory(HISTORY_POINTS);
    recordProgress();
    return true;
  }

  function handleStep() {
    if (running || (!evolution && !startEvolution()) || isFinished()) {
      return;
    }
    evolution.step();
    recordProgress();
    draw(evolution.best, el.resultCanvas.width, el.resultCanvas.height);
    updateStatus();
    updateChart();
    updateButtonStates();
  }

  function handleRun() {
    if (running || (!evolution && !startEvolution()) || isFinished()) {
      return;
    }
    running = true;
    rateLastTime = performance.now();
    rateLastGeneration = evolution.generation;
    updateButtonStates();
    sliceChannel.port2.postMessage(null);
  }

  function runSlice() {
    if (!running) {
      return;
    }

    const sliceStart = performance.now();
    while (
      !isFinished() &&
      performance.now() - sliceStart < RUN_BUDGET_MS
    ) {
      evolution.step();
      recordProgress();
    }
    requestRender();

    if (isFinished()) {
      stopRun();
      return;
    }
    sliceChannel.port2.postMessage(null);
  }

  function requestRender() {
    if (renderPending) {
      return;
    }
    renderPending = true;
    requestAnimationFrame(render);
  }

  function render() {
    renderPending = false;
    const now = performance.now();
    const elapsedSeconds = (now - rateLastTime) / 1000;
    const gensDone = evolution.generation - rateLastGeneration;
    const genPerSec = elapsedSeconds > 0 ? gensDone / elapsedSeconds : 0;
    rateLastTime = now;
    rateLastGeneration = evolution.generation;

    draw(evolution.best, el.resultCanvas.width, el.resultCanvas.height);
    updateStatus(genPerSec);
    updateChart();
  }

  function stopRun() {
    running = false;
    updateButtonStates();
  }

  sliceChannel.port1.onmessage = runSlice;
  el.imageInput.addEventListener('change', handleFileChange);
  el.previewBox.addEventListener('dragover', handleDragOver);
  el.previewBox.addEventListener('dragleave', () => el.previewBox.classList.remove('dragging'));
  el.previewBox.addEventListener('drop', handleDrop);
  el.gridSize.addEventListener('input', handleGridSizeChange);
  el.populationSize.addEventListener('input', discardRun);
  el.maxGenerations.addEventListener('input', handleMaxGenerationsChange);
  el.stepBtn.addEventListener('click', handleStep);
  el.runBtn.addEventListener('click', handleRun);
  el.stopBtn.addEventListener('click', stopRun);
  el.saveBtn.addEventListener('click', saveSnapshot);
  el.statsToggle.addEventListener('click', () => setStatsOpen(!statsOpen));
  window.addEventListener('resize', updateChart);

  updateButtonStates();
  updateStatus();
  setStatsOpen(readStatsOpen());
})();
