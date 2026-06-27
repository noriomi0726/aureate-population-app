const DATA_FILES = [
  "tblT001101H4930.txt",
  "tblT001101H5030.txt",
  "tblT001101H5031.txt",
  "tblT001101H5130.txt"
];

const INCOME_REFERENCE_FILE = "./data/income-reference.json";
const SOURCE_TEXT = "e-Stat 国勢調査 2020年 500m地域メッシュ";
const METHOD_TEXT = "500mメッシュの人口・世帯数を半径圏との重なり面積に応じて按分集計した推計値";
const HOUSEHOLD_UNAVAILABLE_TEXT = "世帯数データ未取得";
const UNDETERMINED_AREA_TEXT = "対象地域未判定";
const INCOME_UNREGISTERED_TEXT = "所得水準参考：未登録";
const WARD_PARENT_AREAS = [
  { pattern: /^4010[1356789]$/, parentAreaName: "北九州市" },
  { pattern: /^4013[1-7]$/, parentAreaName: "福岡市" }
];

const DATA_COLUMNS = {
  mesh: ["key_code", "mesh_code", "mesh", "メッシュコード", "地域メッシュコード"],
  population: ["t001101001", "population", "人口総数", "総人口", "総数", "value"],
  household: ["t001101034", "households", "household", "世帯総数", "一般世帯数", "世帯数"]
};

const PRESETS = [
  { id: "akama", name: "赤間駅前", areaName: "宗像市", lat: 33.8082939, lng: 130.5695947 },
  { id: "higashi-fukuma", name: "東福間", areaName: "福津市", lat: 33.7740686, lng: 130.5109685 },
  { id: "nishi-fukuma", name: "西福間", areaName: "福津市", lat: 33.7636092, lng: 130.4782372 },
  { id: "fukuma-beach", name: "福間海岸", areaName: "福津市", lat: 33.7699054, lng: 130.4710556 },
  { id: "munakata-taisha", name: "宗像大社周辺", areaName: "宗像市", lat: 33.8305823, lng: 130.5145484 },
  { id: "michinoeki-munakata", name: "道の駅むなかた", areaName: "宗像市", lat: 33.8483962, lng: 130.5039634 }
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
  areaName: PRESETS[0].areaName,
  center: { lat: PRESETS[0].lat, lng: PRESETS[0].lng },
  rows: [],
  incomeReferences: [],
  householdColumnFound: false,
  map: null,
  marker: null,
  layers: [],
  leafletReady: false,
  areaResolveId: 0,
  presentationMode: false
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
  await Promise.all([loadDefaultData(), loadIncomeReferences()]);
  buildAreaSelect();
  syncAreaSelect();
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

function buildAreaSelect() {
  const areaNames = state.incomeReferences.length
    ? state.incomeReferences.map((item) => item.areaName)
    : [...new Set(PRESETS.map((place) => place.areaName))];
  $("areaSelect").innerHTML = [
    `<option value="">${UNDETERMINED_AREA_TEXT}</option>`,
    ...areaNames.map((areaName) => `<option value="${areaName}">${areaName}</option>`)
  ].join("");
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
  $("presentationBtn").addEventListener("click", togglePresentationMode);
  $("areaSelect").addEventListener("change", () => {
    state.areaResolveId++;
    state.areaName = $("areaSelect").value || UNDETERMINED_AREA_TEXT;
    render();
  });
}

async function loadIncomeReferences() {
  try {
    const response = await fetch(INCOME_REFERENCE_FILE);
    if (!response.ok) throw new Error(`${INCOME_REFERENCE_FILE} を読み込めませんでした。`);
    const data = await response.json();
    state.incomeReferences = Array.isArray(data) ? data : [];
    console.log(`income-reference.json loaded: ${state.incomeReferences.length} areas`, state.incomeReferences.map((item) => item.areaName).join(", "));
  } catch (error) {
    console.error("income-reference.json load failed", error);
    state.incomeReferences = [];
  }
}

async function loadDefaultData() {
  setStatus("人口データを自動読み込み中...");
  try {
    const loaded = [];
    state.householdColumnFound = false;
    for (const fileName of DATA_FILES) {
      const response = await fetch(`./data/${fileName}`);
      if (!response.ok) throw new Error(`${fileName} を読み込めませんでした。`);
      loaded.push(...parsePopulationText(await response.text()));
    }
    state.rows = loaded;
    setStatus(`自動読込完了: ${nf.format(state.rows.length)}メッシュ / ${householdStatusText()} / ${coverageText()}`);
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
    state.householdColumnFound = false;
    for (const file of files) {
      loaded.push(...parsePopulationText(await file.text()));
    }
    state.rows = loaded;
    setStatus(`手動読込完了: ${files.length}ファイル / ${nf.format(state.rows.length)}件 / ${householdStatusText()} / ${coverageText()}`);
    render();
  } catch (error) {
    setStatus(error.message, true);
  }
}

function setStatus(message, warn = false) {
  $("dataStatus").textContent = message;
  $("dataStatus").className = warn ? "status warn" : "status";
}

function householdStatusText() {
  return state.householdColumnFound ? "世帯数読込済み" : HOUSEHOLD_UNAVAILABLE_TEXT;
}

function setPlace(place, shouldRender) {
  state.areaResolveId++;
  state.placeName = place.name;
  state.areaName = place.areaName;
  state.center = { lat: place.lat, lng: place.lng };
  $("preset").value = place.id;
  $("lat").value = place.lat.toFixed(6);
  $("lng").value = place.lng.toFixed(6);
  $("address").value = "";
  syncAreaSelect();
  moveMap();
  if (shouldRender) render();
}

async function setCenterFromInputs(name) {
  const lat = Number($("lat").value);
  const lng = Number($("lng").value);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    setStatus("緯度経度を確認してください。", true);
    return;
  }
  const resolveId = ++state.areaResolveId;
  state.placeName = name;
  state.center = { lat, lng };
  $("preset").value = "";
  $("geoStatus").textContent = "緯度経度から所得水準参考の対象地域を判定中...";
  state.areaName = findNearestPresetArea(lat, lng) || UNDETERMINED_AREA_TEXT;
  syncAreaSelect();
  moveMap();
  render();
  const areaName = await resolveAreaNameForLocation(lat, lng, name);
  if (resolveId !== state.areaResolveId) return;
  state.areaName = areaName;
  syncAreaSelect();
  $("geoStatus").textContent = `所得水準参考の対象地域: ${areaName}`;
  render();
}

async function geocodeAddress() {
  const address = $("address").value.trim();
  if (!address) {
    $("geoStatus").textContent = "住所を入力してください。";
    return;
  }
  const resolveId = ++state.areaResolveId;
  $("geocodeBtn").disabled = true;
  $("geoStatus").textContent = "検索中...";
  try {
    const result = await geocodeByGsi(address).catch(() => geocodeByNominatim(address));
    const areaName = await resolveAreaNameForLocation(result.lat, result.lng, `${address} ${result.label}`);
    if (resolveId !== state.areaResolveId) return;
    state.placeName = result.label;
    state.areaName = areaName;
    state.center = { lat: result.lat, lng: result.lng };
    $("lat").value = result.lat.toFixed(6);
    $("lng").value = result.lng.toFixed(6);
    $("preset").value = "";
    syncAreaSelect();
    $("geoStatus").textContent = `${result.label} / 所得水準参考: ${areaName}`;
    moveMap();
    render();
  } catch (error) {
    $("geoStatus").textContent = `住所検索に失敗しました。プリセットまたは緯度経度入力を使ってください。${error.message}`;
  } finally {
    $("geocodeBtn").disabled = false;
  }
}

function findNearestPresetArea(lat, lng) {
  const nearest = PRESETS
    .map((place) => ({ place, distance: distanceMeters({ lat, lng }, place) }))
    .sort((a, b) => a.distance - b.distance)[0];
  return nearest && nearest.distance <= 8000 ? nearest.place.areaName : "";
}

async function resolveAreaNameForLocation(lat, lng, text = "") {
  try {
    const reverse = await reverseGeocodeByGsi(lat, lng);
    const codeArea = findIncomeAreaByCode(reverse.muniCd);
    if (codeArea) return codeArea.areaName;
    const reverseTextArea = inferAreaNameFromText(`${reverse.muniCd || ""} ${reverse.lv01Nm || ""}`);
    if (reverseTextArea) return reverseTextArea;
  } catch (error) {
    console.error("area reverse geocode failed", error);
  }
  const textArea = inferAreaNameFromText(text);
  if (textArea) return textArea;
  return findNearestPresetArea(lat, lng) || UNDETERMINED_AREA_TEXT;
}

function inferAreaNameFromText(text) {
  const normalized = normalizeSearchText(text);
  const match = state.incomeReferences
    .map((item, index) => ({ item, index, score: areaNameMatchScore(normalized, item.areaName) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)[0];
  return match?.item.areaName || "";
}

function areaNameMatchScore(normalizedText, areaName) {
  const normalizedArea = normalizeSearchText(areaName);
  if (!normalizedArea || !normalizedText.includes(normalizedArea)) return 0;
  let score = normalizedArea.length * 10;
  if (areaName.endsWith("県")) score -= 20;
  return score;
}

function findIncomeAreaByCode(areaCode) {
  const normalized = String(areaCode || "").trim();
  const parentAreaName = parentAreaNameForWardCode(normalized);
  if (parentAreaName) {
    const parent = state.incomeReferences.find((item) => item.areaName === parentAreaName);
    if (parent) return parent;
  }
  return state.incomeReferences.find((item) => String(item.areaCode) === normalized);
}

function parentAreaNameForWardCode(areaCode) {
  return WARD_PARENT_AREAS.find((item) => item.pattern.test(areaCode))?.parentAreaName || "";
}

function syncAreaSelect() {
  const select = $("areaSelect");
  if (!select || !select.options.length) return;
  select.value = [...select.options].some((option) => option.value === state.areaName) ? state.areaName : "";
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

async function reverseGeocodeByGsi(lat, lng) {
  const url = new URL("https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress");
  url.searchParams.set("lat", lat);
  url.searchParams.set("lon", lng);
  const response = await fetch(url);
  if (!response.ok) throw new Error("国土地理院逆ジオコーディングエラー");
  const data = await response.json();
  return data?.results || {};
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
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "jp");
  url.searchParams.set("q", address);
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("OpenStreetMap検索エラー");
  const items = await response.json();
  if (!items.length) throw new Error("候補なし");
  return { lat: Number(items[0].lat), lng: Number(items[0].lon), label: items[0].display_name || items[0].name || address };
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

function analyze(radii = selectedRadii()) {
  return radii.map((radius) => {
    let population = 0;
    let households = 0;
    let hasHouseholds = false;
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
          if (Number.isFinite(row.households)) {
            households += row.households * ratio;
            hasHouseholds = true;
          }
          meshCount++;
        }
      }
    }
    const areaKm2 = Math.PI * (radius / 1000) ** 2;
    return {
      radius,
      population: Math.round(population),
      households: hasHouseholds ? Math.round(households) : null,
      peoplePerHousehold: hasHouseholds && households > 0 ? population / households : null,
      density: Math.round(population / areaKm2),
      meshCount
    };
  });
}

function render() {
  const results = analyze(state.presentationMode ? STANDARD_RADII.map((radius) => radius.value) : selectedRadii());
  $("placeName").textContent = state.placeName;
  $("presentationSubtitle").textContent = `${state.placeName} 商圏人口・世帯数・所得水準参考`;
  $("coords").textContent = `${state.center.lat.toFixed(6)}, ${state.center.lng.toFixed(6)}`;
  renderIncomeReference();
  renderCards(results);
  renderTable(results);
  try {
    drawMap(results);
  } catch (error) {
    console.error("map draw failed", error);
    $("mapFallback").classList.add("show");
  }
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
        <strong>${formatPopulation(row.population)}</strong>
      </div>
      <div>
        <span>推計世帯数</span>
        <strong>${formatHouseholds(row.households)}</strong>
      </div>
      <div>
        <span>世帯人員</span>
        <strong>${formatPeoplePerHousehold(row.peoplePerHousehold)}</strong>
      </div>
      <div>
        <span>人口密度</span>
        <strong>${formatDensity(row.density)}</strong>
      </div>
      <div>
        <span>使用メッシュ数</span>
        <strong>${nf.format(row.meshCount)}</strong>
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
      <td>${formatPopulation(row.population)}</td>
      <td>${formatHouseholds(row.households)}</td>
      <td>${formatPeoplePerHousehold(row.peoplePerHousehold)}</td>
      <td>${formatDensity(row.density)}</td>
      <td>${nf.format(row.meshCount)}</td>
      <td>${SOURCE_TEXT}</td>
      <td>${METHOD_TEXT}</td>
    </tr>
  `).join("");
}

function renderIncomeReference() {
  const income = state.incomeReferences.find((item) => item.areaName === state.areaName);
  if (!state.areaName || state.areaName === UNDETERMINED_AREA_TEXT) {
    $("incomeArea").textContent = UNDETERMINED_AREA_TEXT;
    setIncomeUnavailable("対象地域を手動選択してください。");
    return;
  }
  if (!income) {
    $("incomeArea").textContent = `${state.areaName}（未登録）`;
    setIncomeUnavailable(INCOME_UNREGISTERED_TEXT);
    return;
  }
  $("incomeArea").textContent = income.areaName;
  $("incomeTotal").textContent = `${formatNullableNumber(income.totalHouseholds, "未登録")}世帯`;
  $("incomeOver500").textContent = formatPercent(income.ratios?.over500);
  $("incomeOver700").textContent = formatPercent(income.ratios?.over700);
  $("incomeOver1000").textContent = formatPercent(income.ratios?.over1000);
  $("incomeDominant").textContent = income.dominantIncomeClass || "未登録";
  $("incomeMedianClass").textContent = income.medianIncomeClass || "未登録";
  $("incomeSource").textContent = income.source || "出典未登録";
  $("incomeNote").textContent = income.sourceNote || "市区町村単位の参考値であり、半径商圏内の実測値ではありません。";
}

function formatNullableNumber(value, fallback) {
  return Number.isFinite(value) ? nf.format(value) : fallback;
}

function formatPopulation(value) {
  return Number.isFinite(value) ? `${nf.format(value)}人` : "未登録";
}

function formatHouseholds(value) {
  return Number.isFinite(value) ? `${nf.format(value)}世帯` : HOUSEHOLD_UNAVAILABLE_TEXT;
}

function formatDensity(value) {
  return Number.isFinite(value) ? `${nf.format(value)}人/km²` : "未登録";
}

function setIncomeUnavailable(note) {
  $("incomeTotal").textContent = "未登録";
  $("incomeOver500").textContent = "未登録";
  $("incomeOver700").textContent = "未登録";
  $("incomeOver1000").textContent = "未登録";
  $("incomeDominant").textContent = "未登録";
  $("incomeMedianClass").textContent = "未登録";
  $("incomeSource").textContent = "出典未登録";
  $("incomeNote").textContent = note;
}

function formatPeoplePerHousehold(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}人` : HOUSEHOLD_UNAVAILABLE_TEXT;
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "未登録";
}

function togglePresentationMode() {
  state.presentationMode = !state.presentationMode;
  document.body.classList.toggle("presentation-mode", state.presentationMode);
  $("presentationBtn").textContent = state.presentationMode ? "通常表示" : "資料用表示";
  render();
  if (state.presentationMode) {
    document.querySelector(".results-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function formatRadius(radius) {
  return radius >= 1000 ? `${radius / 1000}km` : `${radius}m`;
}

function parsePopulationText(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const delimiter = detectDelimiter(lines[0]);
  const header = splitDelimitedLine(lines[0], delimiter).map(normalizeHeader);
  const meshIndex = findColumn(header, DATA_COLUMNS.mesh);
  const popIndex = findColumn(header, DATA_COLUMNS.population);
  // T001101034 is 世帯総数 in the e-Stat 2020 census mesh files used by this app.
  const householdIndex = findColumn(header, DATA_COLUMNS.household);
  state.householdColumnFound = state.householdColumnFound || householdIndex !== -1;
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
    const households = householdIndex === -1 ? null : parseNumber(values[householdIndex]);
    const bounds = meshBounds(meshCode);
    const lat = (bounds.south + bounds.north) / 2;
    const lng = (bounds.west + bounds.east) / 2;
    rows.push({
      meshCode,
      lat,
      lng,
      bounds,
      population,
      households: Number.isFinite(households) ? households : null,
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
  const isSmallTouch = window.matchMedia("(max-width: 820px)").matches;
  state.map = L.map("map", {
    zoomControl: !isSmallTouch,
    dragging: !isSmallTouch,
    tap: !isSmallTouch,
    touchZoom: !isSmallTouch,
    scrollWheelZoom: false,
    doubleClickZoom: !isSmallTouch,
    boxZoom: false,
    keyboard: false
  }).setView([state.center.lat, state.center.lng], 13);
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
  state.map.invalidateSize();
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
  const bounds = circleBounds(state.center, maxRadius);
  state.map.fitBounds([[bounds.south, bounds.west], [bounds.north, bounds.east]], { padding: [24, 24] });
}

function circleBounds(center, radius) {
  const latDelta = radius / 111320;
  const lngDelta = radius / (111320 * Math.max(Math.cos(center.lat * Math.PI / 180), 0.1));
  return {
    south: center.lat - latDelta,
    north: center.lat + latDelta,
    west: center.lng - lngDelta,
    east: center.lng + lngDelta
  };
}
