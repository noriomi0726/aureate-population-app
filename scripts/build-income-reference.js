const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const RAW_FILE = path.join(ROOT, "data", "raw", "FEH_00200522_260627113037.csv");
const OUTPUT_FILE = path.join(ROOT, "data", "income-reference.json");

const SOURCE = "令和5年住宅・土地統計調査 住宅及び世帯に関する基本集計 表43-4";
const SOURCE_NOTE = "市区町村単位の統計であり、半径商圏内の実測値ではありません。";

const TARGET_AREAS = [
  "福岡県",
  "北九州市",
  "福岡市",
  "久留米市",
  "飯塚市",
  "春日市",
  "宗像市",
  "古賀市",
  "福津市",
  "新宮町",
  "遠賀町"
];

const INCOME_CLASSES = [
  { source: "100万円未満", key: "under100" },
  { source: "100～150万円未満", key: "100to150" },
  { source: "150～200万円未満", key: "150to200" },
  { source: "200～300万円未満", key: "200to300" },
  { source: "300～400万円未満", key: "300to400" },
  { source: "400～500万円未満", key: "400to500" },
  { source: "500～700万円未満", key: "500to700" },
  { source: "700～1000万円未満", key: "700to1000" },
  { source: "1000～1500万円未満", key: "1000to1500" },
  { source: "1500万円以上", key: "over1500" }
];

const INCOME_KEY_BY_LABEL = new Map(INCOME_CLASSES.map((item) => [item.source, item.key]));
const LABEL_BY_KEY = new Map(INCOME_CLASSES.map((item) => [item.key, item.source]));

function main() {
  const buffer = fs.readFileSync(RAW_FILE);
  const text = new TextDecoder("shift_jis").decode(buffer);
  const rows = parseCsv(text);
  const headerIndex = rows.findIndex((row) => row.includes("全国、都道府県、市区町村 コード"));
  if (headerIndex === -1) {
    throw new Error("CSVヘッダー行を検出できませんでした。");
  }

  const header = rows[headerIndex];
  const columns = {
    areaCode: findColumn(header, "全国、都道府県、市区町村 コード"),
    areaName: findColumn(header, "全国、都道府県、市区町村"),
    ownership: findColumn(header, "住宅の所有の関係"),
    incomeClass: findColumn(header, "世帯の年間収入階級"),
    households: findColumn(header, "主世帯数【世帯】")
  };

  const records = new Map(TARGET_AREAS.map((areaName) => [areaName, createEmptyRecord(areaName)]));

  for (const row of rows.slice(headerIndex + 1)) {
    const areaName = normalizeText(row[columns.areaName]);
    if (!records.has(areaName)) continue;
    if (normalizeText(row[columns.ownership]) !== "総数") continue;

    const incomeLabel = normalizeIncomeLabel(row[columns.incomeClass]);
    if (incomeLabel !== "総数" && !INCOME_KEY_BY_LABEL.has(incomeLabel)) continue;

    const record = records.get(areaName);
    record.areaCode = normalizeText(row[columns.areaCode]);
    const households = parseHouseholdCount(row[columns.households]);

    if (incomeLabel === "総数") {
      record.totalHouseholds = households ?? 0;
    } else {
      // Non-numeric cells such as "-", "***", "X", and "..." are treated as 0
      // because income class totals and ratios must remain safe to calculate.
      record.incomeClasses[INCOME_KEY_BY_LABEL.get(incomeLabel)] = households ?? 0;
    }
  }

  const results = TARGET_AREAS.map((areaName) => finalizeRecord(records.get(areaName)));
  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  console.log(`income-reference.json generated: ${results.length} areas`);
  console.log(results.map((item) => item.areaName).join(", "));
}

function createEmptyRecord(areaName) {
  return {
    areaCode: "",
    areaName,
    source: SOURCE,
    sourceNote: SOURCE_NOTE,
    totalHouseholds: 0,
    incomeClasses: Object.fromEntries(INCOME_CLASSES.map((item) => [item.key, 0])),
    ratios: {
      over500: 0,
      over700: 0,
      over1000: 0
    },
    dominantIncomeClass: "",
    medianIncomeClass: ""
  };
}

function finalizeRecord(record) {
  const classes = record.incomeClasses;
  const total = record.totalHouseholds || 0;
  record.ratios = {
    over500: ratio(classes["500to700"] + classes["700to1000"] + classes["1000to1500"] + classes.over1500, total),
    over700: ratio(classes["700to1000"] + classes["1000to1500"] + classes.over1500, total),
    over1000: ratio(classes["1000to1500"] + classes.over1500, total)
  };
  record.dominantIncomeClass = dominantClass(classes);
  record.medianIncomeClass = medianClass(classes, total);
  return record;
}

function ratio(value, total) {
  return total > 0 ? Number((value / total).toFixed(4)) : 0;
}

function dominantClass(classes) {
  return INCOME_CLASSES
    .map((item) => ({ label: LABEL_BY_KEY.get(item.key), value: classes[item.key] || 0 }))
    .sort((a, b) => b.value - a.value)[0]?.label || "";
}

function medianClass(classes, totalHouseholds) {
  if (!totalHouseholds) return "";
  const threshold = totalHouseholds * 0.5;
  let cumulative = 0;
  for (const item of INCOME_CLASSES) {
    cumulative += classes[item.key] || 0;
    if (cumulative > threshold) return LABEL_BY_KEY.get(item.key);
  }
  return LABEL_BY_KEY.get(INCOME_CLASSES[INCOME_CLASSES.length - 1].key);
}

function parseHouseholdCount(value) {
  const text = normalizeText(value).replace(/,/g, "");
  if (!text || text === "-" || text === "***" || text === "X" || text === "...") return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function normalizeIncomeLabel(value) {
  return normalizeText(value).replace(/[〜~]/g, "～");
}

function normalizeText(value) {
  return String(value ?? "").trim().replace(/^"|"$/g, "").normalize("NFKC");
}

function findColumn(header, name) {
  const index = header.findIndex((item) => normalizeText(item) === name);
  if (index === -1) throw new Error(`列が見つかりません: ${name}`);
  return index;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (char === "\"" && quoted && next === "\"") {
      field += "\"";
      i++;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i++;
      row.push(field);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    if (row.some((value) => value !== "")) rows.push(row);
  }
  return rows;
}

main();
