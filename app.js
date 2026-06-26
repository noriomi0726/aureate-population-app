const DATA_FILES = [
  "tblT001101H4930.txt",
  "tblT001101H5030.txt",
  "tblT001101H5031.txt",
  "tblT001101H5130.txt"
];

const SOURCE_TEXT = "e-Stat 国勢調査 2020年 500m地域メッシュ";
const METHOD_TEXT = "500mメッシュ人口を半径圏との重なり面積に応じて按分集計した推計値";

const PRESETS = [
  { id: "akama", name: "赤間駅前", lat: 33.8082939, lng: 130.5695947 },
  { id: "higashi-fukuma", name: "東福間", lat: 33.7740686, lng: 130.5109685 },
  { id: "nishi-fukuma", name: "西福間", lat: 33.7636092, lng: 130.4782372 },
  { id: "fukuma-beach", name: "福間海岸", lat: 33.7699054, lng: 130.4710556 },
  { id: "munakata-taisha", name: "宗像大社周辺", lat: 33.8305823, lng: 130.5145484 },
  { id: "michinoeki-munakata", name: "道の駅むなかた", lat: 33.8483962, lng: 130.5039634 }
];

const STANDARD_RADII = [
  { value: 1000, label: "1km" },
  { value: 3000, label: "3km" },
  { value: 5000, label: "5km" }
];

const EXTRA_RADII = [
  { value: 125, label: "125m" },
  { value: 250, label: "250m" },
  { value: 500, label: "500m" },
  { value: 750, label: "750m" },
  { value: 8000, label: "8km" },
  { value: 10000, label: "10km" }
];

const state = {
  placeName: PRESETS[0].name,
  center: { lat: PRESETS[0].lat, lng: PRESETS[0].lng },
  rows: [],
  map: null,
  marker: null,
  layers: [],
  leafletReady: false
};

const $ = (id) => document.getElementById(id);
const nf = new Intl.NumberFormat("ja-JP");

document.addEventListener("DOMContentLoaded", boot);
window.addEventListener("leaflet-ready", () => {
  state.leafletReady = Boolean(window.L);
  initMap();
  render();
});
window.addEventListener("leaflet-failed", () => {
  $("mapFallback").classList.add("show");
});

async function boot() {
  buildPresetSelect();
  buildRadiusControls();
  bindEvents();
  setPlace(PRESETS[0], false);
  renderStaticLabels();
  if (window.L) {
    state.leafletReady = true;
    initMap();
  }
  await loadDefaultData();
  render();
}

function renderStaticLabels() {
  $("sourceText").textContent = SOURCE_TEXT;
  $("methodText").textContent = METHOD_TEXT;
}

function buildPresetSelect() {
  $("preset").innerHTML = PRESETS.map((place) => (
    `<option value="${place.id}">${place.name}</option>`
  )).join("");
}

function buildRadiusControls() {
  $("standardRadii").innerHTML = STANDARD_RADII.map((radius) => radiusChip(radius, true)).join("");
  $("extraRadii").innerHTML = EXTRA_RADII.map((radius) => radiusChip(radius, false)).join("");
}

function radiusChip(radius, checked) {
  return `
    <label class="chip">
      <input type="checkbox" value="${radius.value}" ${checked ? "checked" : ""} />
      <span>${radius.label}</span>
    </label>
  `;
}

function bindEvents() {
  $("preset").addEventListener("change", () => {
    const place = PRESETS.find((item) => item.id === $("preset").value);
    if (place) setPlace(place, true);
  });
  $("geocodeBtn").addEventListener("click", geocodeAddress);
  $("address").addEventListener("keydown", (event) => {
    if (event.key === "Enter") geocodeAddress();
  });
  $("lat").addEventListener("change", () => {
    setCenterFromInputs("緯度経度入力");
  });
  $("lng").addEventListener("change", () => {
    setCenterFromInputs("緯度経度入力");
  });
  $("standardRadii").addEventListener("change", render);
  $("extraRadii").addEventListener("change", render);
  $("fileInput").addEventListener("change", loadManualFiles);
}

async function loadDefaultData() {
  setStatus("人口データを自動読み込み中...");
  try {
    const loaded = [];
    for (const fileName of DATA_FILES) {
      const response = await fetch(`./data/${fileName}`);
      if (!response.ok) throw new Error(`${fileName} を読み込めませんでした。`);
      loaded.push(...parsePopulationText(await response.text()));
    }
    state.rows = loaded;
    setStatus(`自動読込完了: ${nf.format(state.rows.length)}メッシュ / ${coverageText()}`);
  } catch (error) {
    state.rows = [];
    setStatus(`自動読込に失敗しました。PCでは人口CSV/TXTを手動選択できます。${error.message}`, true);
  }
}

async function loadManualFiles(event) {
  const files = [...event.target.files];
  if (!files.length) return;
  try {
    setStatus("手動ファイルを読み込み中...");
    const loaded = [];
    for (const file of files) {
      loaded.push(...parsePopulationText(await file.text()));
    }
    state.rows = loaded;
    setStatus(`手動読込完了: ${files.length}ファイル / ${nf.format(state.rows.length)}件 / ${coverageText()}`);
    render();
  } catch (error) {
    setStatus(error.message, true);
  }
}

function setStatus(message, warn = false) {
  $("dataStatus").textContent = message;
  $("dataStatus").className = warn ? "status warn" : "status";
}

function setPlace(place, shouldRender) {
  state.placeName = place.name;
  state.center = { lat: place.lat, lng: place.lng };
  $("preset").value = place.id;
  $("lat").value = place.lat.toFixed(6);
  $("lng").value = place.lng.toFixed(6);
  $("address").value = "";
  moveMap();
  if (shouldRender) render();
}

function setCenterFromInputs(name) {
  const lat = Number($("lat").value);
  const lng = Number($("lng").value);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    setStatus("緯度経度を確認してください。", true);
    return;
  }
  state.placeName = name;
  state.center = { lat, lng };
  $("preset").value = "";
  moveMap();
  render();
}

async function geocodeAddress() {
  const address = $("address").value.trim();
  if (!address) {
    $("geoStatus").textContent = "住所を入力してください。";
    return;
  }
  $("geocodeBtn").disabled = true;
  $("geoStatus").textContent = "検索中...";
  try {
    const result = await geocodeByGsi(address).catch(() => geocodeByNominatim(address));
    state.placeName = result.label;
    state.center = { lat: result.lat, lng: result.lng };
    $("lat").value = result.lat.toFixed(6);
    $("lng").value = result.lng.toFixed(6);
    $("preset").value = "";
    $("geoStatus").textContent = result.label;
    moveMap();
    render();
  } catch (error) {
    $("geoStatus").textContent = `住所検索に失敗しました。プリセットまたは緯度経度入力を使ってください。${error.message}`;
  } finally {
    $("geocodeBtn").disabled = false;
  }
}

async function geocodeByGsi(address) {
  const url = new URL("https://msearch.gsi.go.jp/address-search/AddressSearch");
  url.searchParams.set("q", address);
  const response = await fetch(url);
  if (!response.ok) throw new Error("国土地理院検索エラー");
  const items = await response.json();
  const item = pickGsiCandidate(items, address);
  const [lng, lat] = item.geometry.coordinates;
  return { lat: Number(lat), lng: Number(lng), label: item.properties?.title || address };
}

function pickGsiCandidate(items, address) {
  if (!Array.isArray(items) || !items.length) throw new Error("候補なし");
  const query = normalizeSearchText(address);
  const scored = items
    .filter((item) => item.geometry?.coordinates)
    .map((item, index) => {
      const title = normalizeSearchText(item.properties?.title || "");
      let score = 0;
      if (title === query) score += 1000;
      if (title.includes(query)) score += 600;
      if (query.includes(title) && title.length >= 3) score += 240;
      if (item.properties?.addressCode) score += 40;
      score -= index;
      return { item, score };
    })
    .sort((a, b) => b.score - a.score);
  if (!scored.length) throw new Error("候補なし");
  return scored[0].item;
}

async function geocodeByNominatim(address) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "jp");
  url.searchParams.set("q", address);
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("OpenStreetMap検索エラー");
  const items = await response.json();
  if (!items.length) throw new Error("候補なし");
  return { lat: Number(items[0].lat), lng: Number(items[0].lon), label: items[0].name || address };
}

function normalizeSearchText(value) {
  return String(value).normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

function selectedRadii() {
  return [...document.querySelectorAll(".radius-grid input:checked")]
    .map((input) => Number(input.value))
    .filter((value) => value > 0)
    .sort((a, b) => a - b);
}

function analyze() {
  const radii = selectedRadii();
  return radii.map((radius) => {
    let population = 0;
    let meshCount = 0;
    if (state.rows.length) {
      const candidates = state.rows.filter((row) => {
        const maxDistance = radius + row.coverRadius;
        return distanceMeters(state.center, row) <= maxDistance;
      });
      for (const row of candidates) {
        const ratio = meshCircleOverlapRatio(row.bounds, radius);
        if (ratio > 0) {
          population += row.population * ratio;
          meshCount++;
        }
      }
    }
    const areaKm2 = Math.PI * (radius / 1000) ** 2;
    return {
      radius,
      population: Math.round(population),
      density: Math.round(population / areaKm2),
      meshCount
    };
  });
}

function render() {
  const results = analyze();
  $("placeName").textContent = state.placeName;
  $("coords").textContent = `${state.center.lat.toFixed(6)}, ${state.center.lng.toFixed(6)}`;
  renderCards(results);
  renderTable(results);
  drawMap(results);
}

function renderCards(results) {
  $("resultCards").innerHTML = results.map((row) => `
    <article class="result-card">
      <div>
        <span>半径</span>
        <strong>${formatRadius(row.radius)}</strong>
      </div>
      <div>
        <span>推計人口</span>
        <strong>${nf.format(row.population)}</strong>
      </div>
      <div>
        <span>人口密度 / メッシュ</span>
        <strong>${nf.format(row.density)} / ${nf.format(row.meshCount)}</strong>
      </div>
    </article>
  `).join("");
}

function renderTable(results) {
  $("resultTable").innerHTML = results.map((row) => `
    <tr>
      <td>${state.placeName}</td>
      <td>${state.center.lat.toFixed(6)}, ${state.center.lng.toFixed(6)}</td>
      <td>${formatRadius(row.radius)}</td>
      <td>${nf.format(row.population)}</td>
      <td>${nf.format(row.density)} 人/km2</td>
      <td>${nf.format(row.meshCount)}</td>
      <td>${SOURCE_TEXT}</td>
      <td>${METHOD_TEXT}</td>
    </tr>
  `).join("");
}

function formatRadius(radius) {
  return radius >= 1000 ? `${radius / 1000}km` : `${radius}m`;
}

function parsePopulationText(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const delimiter = detectDelimiter(lines[0]);
  const header = splitDelimitedLine(lines[0], delimiter).map(normalizeHeader);
  const meshIndex = findColumn(header, ["key_code", "mesh_code", "mesh", "メッシュコード", "地域メッシュコード"]);
  const popIndex = findColumn(header, ["t001101001", "population", "人口総数", "総人口", "総数", "value"]);
  if (meshIndex === -1 || popIndex === -1) {
    throw new Error("KEY_CODE と T001101001（人口総数）を含むファイルを指定してください。");
  }

  const rows = [];
  for (const line of lines.slice(1)) {
    const values = splitDelimitedLine(line, delimiter);
    const meshCode = String(values[meshIndex] || "").trim();
    if (!/^\d{6}(\d{2})?(\d)?$/.test(meshCode)) continue;
    const population = parseNumber(values[popIndex]);
    if (!Number.isFinite(population) || population <= 0) continue;
    const bounds = meshBounds(meshCode);
    const lat = (bounds.south + bounds.north) / 2;
    const lng = (bounds.west + bounds.east) / 2;
    rows.push({
      meshCode,
      lat,
      lng,
      bounds,
      population,
      coverRadius: meshCoverRadius(bounds, lat, lng)
    });
  }
  return rows;
}

function normalizeHeader(value) {
  return String(value).trim().replace(/^"|"$/g, "").normalize("NFKC").toLowerCase();
}

function findColumn(header, names) {
  const normalizedNames = names.map(normalizeHeader);
  return header.findIndex((item) => normalizedNames.includes(item));
}

function parseNumber(value) {
  const text = String(value ?? "").replace(/,/g, "").trim();
  if (!text || text === "*" || text === "-") return NaN;
  return Number(text);
}

function detectDelimiter(line) {
  const commaCount = (line.match(/,/g) || []).length;
  const tabCount = (line.match(/\t/g) || []).length;
  return tabCount > commaCount ? "\t" : ",";
}

function splitDelimitedLine(line, delimiter = ",") {
  const values = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function meshBounds(code) {
  const digits = String(code).replace(/\D/g, "");
  let lat = Number(digits.slice(0, 2)) / 1.5;
  let lng = Number(digits.slice(2, 4)) + 100;
  let latSize = 2 / 3;
  let lngSize = 1;

  latSize /= 8;
  lngSize /= 8;
  lat += Number(digits[4]) * latSize;
  lng += Number(digits[5]) * lngSize;

  if (digits.length >= 8) {
    latSize /= 10;
    lngSize /= 10;
    lat += Number(digits[6]) * latSize;
    lng += Number(digits[7]) * lngSize;
  }

  if (digits.length >= 9) {
    latSize /= 2;
    lngSize /= 2;
    const quadrant = Number(digits[8]);
    if (quadrant === 2 || quadrant === 4) lng += lngSize;
    if (quadrant === 3 || quadrant === 4) lat += latSize;
  }

  return { south: lat, west: lng, north: lat + latSize, east: lng + lngSize };
}

function meshCoverRadius(bounds, lat, lng) {
  const corners = [
    { lat: bounds.south, lng: bounds.west },
    { lat: bounds.south, lng: bounds.east },
    { lat: bounds.north, lng: bounds.west },
    { lat: bounds.north, lng: bounds.east }
  ];
  return Math.max(...corners.map((corner) => distanceMeters({ lat, lng }, corner)));
}

function meshCircleOverlapRatio(bounds, radius) {
  const samples = 7;
  let inside = 0;
  for (let y = 0; y < samples; y++) {
    const lat = bounds.south + (bounds.north - bounds.south) * ((y + 0.5) / samples);
    for (let x = 0; x < samples; x++) {
      const lng = bounds.west + (bounds.east - bounds.west) * ((x + 0.5) / samples);
      if (distanceMeters(state.center, { lat, lng }) <= radius) inside++;
    }
  }
  return inside / (samples * samples);
}

function distanceMeters(a, b) {
  const r = 6371008.8;
  const p1 = a.lat * Math.PI / 180;
  const p2 = b.lat * Math.PI / 180;
  const dp = (b.lat - a.lat) * Math.PI / 180;
  const dl = (b.lng - a.lng) * Math.PI / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

function coverageText() {
  if (!state.rows.length) return "読込範囲なし";
  const box = state.rows.reduce((acc, row) => ({
    south: Math.min(acc.south, row.bounds.south),
    north: Math.max(acc.north, row.bounds.north),
    west: Math.min(acc.west, row.bounds.west),
    east: Math.max(acc.east, row.bounds.east)
  }), { south: 90, north: -90, west: 180, east: -180 });
  return `範囲: 緯度${box.south.toFixed(3)}-${box.north.toFixed(3)} / 経度${box.west.toFixed(3)}-${box.east.toFixed(3)}`;
}

function initMap() {
  if (!state.leafletReady || !window.L || state.map) return;
  $("mapFallback").classList.remove("show");
  state.map = L.map("map", { zoomControl: true }).setView([state.center.lat, state.center.lng], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(state.map);
}

function moveMap() {
  if (!state.map || !window.L) return;
  state.map.invalidateSize();
  state.map.setView([state.center.lat, state.center.lng], 13);
}

function drawMap(results) {
  if (!state.map || !window.L) {
    $("mapFallback").classList.add("show");
    return;
  }
  state.layers.forEach((layer) => layer.remove());
  state.layers = [];
  if (state.marker) state.marker.remove();

  state.marker = L.circleMarker([state.center.lat, state.center.lng], {
    radius: 7,
    color: "#0f6f61",
    fillColor: "#0f6f61",
    fillOpacity: 1,
    weight: 2
  }).addTo(state.map).bindPopup(state.placeName);

  results.slice().reverse().forEach((row) => {
    const circle = L.circle([state.center.lat, state.center.lng], {
      radius: row.radius,
      color: "#315f96",
      weight: row.radius === 5000 ? 2 : 1,
      fillColor: "#315f96",
      fillOpacity: 0.035
    }).addTo(state.map);
    state.layers.push(circle);
  });

  const maxRadius = results.length ? results[results.length - 1].radius : 5000;
  const bounds = L.circle([state.center.lat, state.center.lng], { radius: maxRadius }).getBounds();
  state.map.fitBounds(bounds, { padding: [24, 24] });
}
