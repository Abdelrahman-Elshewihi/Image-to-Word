/* app.js - LeaOne body-composition report image -> Gemini -> clean 80mm thermal Word file */
const KEYS = ["date","name","age","gender","height",
  "weight","weight_change","bmi","bmi_status","bfr","bfr_status","muscle_rate","muscle_rate_status",
  "fat_mass","fat_mass_status","body_water","body_water_status","protein_mass","protein_mass_status","bone_mass","bone_mass_status",
  "standard_weight","muscle_mass","lean_body_mass","weight_control","obesity_index","body_type",
  "bmr","bmr_ref","visceral_fat","visceral_fat_ref","subcutaneous_fat","subcutaneous_fat_ref",
  "physical_age","physical_age_ref","obesity_level","obesity_level_ref","protein_rate","protein_rate_ref"];

const PROMPT = `هذه صورة تقرير "تحليل تكوين الجسم" من تطبيق LeaOne. استخرج البيانات وأرجع النتيجة بصيغة JSON فقط، بدون أي نصوص أو تنسيقات Markdown إضافية، وبهذه المفاتيح بالضبط:
date: التاريخ والوقت أعلى التقرير.
name: الاسم، age: العمر (رقم)، gender: الجنس، height: الارتفاع مع الوحدة.
weight: الوزن الكبير في قسم البيانات الأساسية مع kg. weight_change: التغير مقارنة بالقياس الأخير مع الإشارة (+ للزيادة و - للنقصان) مع kg.
bmi: مؤشر كتلة الجسم و bmi_status: تقييمه (مثل رفيع/معيار). bfr: نسبة الدهون و bfr_status: تقييمها. muscle_rate: معدل العضلات % و muscle_rate_status: تقييمه.
fat_mass: كتلة الدهون و fat_mass_status تقييمها. body_water: ماء الجسم و body_water_status. protein_mass: كتلة البروتين و protein_mass_status. bone_mass: كتلة العظام و bone_mass_status.
من قسم "التحكم في الوزن": standard_weight: الوزن القياسي، muscle_mass: كتلة العضلات، lean_body_mass: كتلة الجسم النحيل، weight_control: التحكم في الوزن (مع الإشارة)، obesity_index: مؤشر السمنة.
body_type: نوع الجسم (النص الكبير في قسم نوع الجسم).
من قسم "مؤشرات أخرى" القيمة ثم المرجعي: bmr و bmr_ref (معدل الأيض الأساسي مع kcal)، visceral_fat و visceral_fat_ref (مؤشر الدهون الحشوية)، subcutaneous_fat و subcutaneous_fat_ref (الدهون تحت الجلد)، physical_age و physical_age_ref (العمر الجسدي)، obesity_level و obesity_level_ref (مستوى السمنة)، protein_rate و protein_rate_ref (معدل البروتين).
انقل كل قيمة كما هي مكتوبة في الصورة مع وحدتها، وإذا لم تجد قيمة اجعلها "-".`;

/* ---------- image -> base64 (downscaled for fast upload) ---------- */
async function imageToBase64(file, maxSide = 1400) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.88).split(",")[1];
}

/* ---------- Gemini ---------- */
function parseJson(text) {
  text = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let d = JSON.parse(text);
  if (Array.isArray(d)) d = d[0] || {};
  const out = {};
  KEYS.forEach(k => { const v = d[k]; out[k] = (v === null || v === undefined || v === "") ? "-" : String(v); });
  out.name = out.name.replace(/[.\u2026]+$/, "").trim() || "-";
  return out;
}

const API = "https://generativelanguage.googleapis.com/v1beta";
const ENDPOINT = (m, k) => `${API}/models/${m}:generateContent?key=${encodeURIComponent(k)}`;
const ver = n => { const x = n.match(/gemini-(\d+(?:\.\d+)?)/); return x ? parseFloat(x[1]) : 0; };

async function timedFetch(url, opts, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctl.signal }); }
  finally { clearTimeout(timer); }
}

/* ask Google which flash models this key can actually use (newest first) */
async function candidateModels(apiKey) {
  let names = [];
  try {
    const r = await timedFetch(`${API}/models?pageSize=1000&key=${encodeURIComponent(apiKey)}`, {}, 15000);
    const j = await r.json();
    names = (j.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map(m => m.name.replace("models/", ""))
      .filter(n => /^gemini-/.test(n) && /flash/.test(n) &&
        !/(tts|image|live|audio|embedding|robotics|computer|native|thinking|exp|vision)/.test(n));
  } catch (e) {}
  names.sort((a, b) => ver(b) - ver(a) || (/lite/.test(a) - /lite/.test(b)) || (/preview/.test(a) - /preview/.test(b)));
  let saved = null; try { saved = localStorage.getItem("gm"); } catch (e) {}
  if (saved && names.includes(saved)) names = [saved, ...names.filter(n => n !== saved)];
  if (!names.length) names = ["gemini-flash-latest", "gemini-2.5-flash"];
  return names.slice(0, 5);
}

function thinkingFor(m) {
  if (/gemini-2\.5/.test(m)) return { thinkingBudget: 0 };
  if (ver(m) >= 3 || /latest/.test(m)) return { thinkingLevel: "minimal" };
  return null;
}
function reqBody(model, parts, json, noThink) {
  const b = { contents: [{ parts }], generationConfig: { temperature: 0 } };
  if (json) b.generationConfig.responseMimeType = "application/json";
  const t = noThink ? null : thinkingFor(model);
  if (t) b.generationConfig.thinkingConfig = t;
  return JSON.stringify(b);
}
async function post(m, apiKey, parts, json, ms) {
  const send = noThink => timedFetch(ENDPOINT(m, apiKey),
    { method: "POST", headers: { "Content-Type": "application/json" }, body: reqBody(m, parts, json, noThink) }, ms);
  let r = await send(false);
  if (r.status === 400) r = await send(true); // model may not accept thinking settings
  return r;
}

async function extractData(file, apiKey, onStatus) {
  const say = onStatus || (() => {});
  say("بجهز الصورة…");
  const b64 = await imageToBase64(file);
  const kb = Math.round(b64.length * 0.75 / 1024);
  const parts = [{ text: PROMPT }, { inline_data: { mime_type: "image/jpeg", data: b64 } }];
  say("بدوّر على الموديل المتاح…");
  const models = await candidateModels(apiKey);
  const tried = [];
  for (const m of models) {
    say(`بحلل بموديل ${m} (${kb} KB)…`);
    let r;
    try { r = await post(m, apiKey, parts, true, 45000); }
    catch (e) { tried.push(`${m}: ${e.name === "AbortError" ? "اتأخر" : "فشل اتصال"}`); continue; }
    let j = {}; try { j = await r.json(); } catch (e) {}
    if (r.status === 429) throw new Error("خلصت الحد المجاني مؤقتاً. استنى دقيقة وجرّب تاني");
    if (!r.ok) { tried.push(`${m}: ${r.status} ${(j.error && j.error.message || "").slice(0, 60)}`); continue; }
    const t = j.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!t) { tried.push(`${m}: رد فاضي`); continue; }
    try { localStorage.setItem("gm", m); } catch (e) {}
    return parseJson(t);
  }
  throw new Error("كل الموديلات فشلت → " + tried.join(" | "));
}

/* ---------- diagnostics ---------- */
async function diagnose(apiKey, file, log) {
  const ms = t0 => Math.round(performance.now() - t0) + " ms";
  let t = performance.now();
  const models = await candidateModels(apiKey);
  log(`1) الموديلات المتاحة (${ms(t)}): ${models.join(", ")}`);
  for (const m of models.slice(0, 3)) {
    t = performance.now();
    try {
      const r = await post(m, apiKey, [{ text: "say hi" }], false, 30000);
      log(`2) نص بسيط ${m}: ${r.status} (${ms(t)})`);
    } catch (e) { log(`2) نص بسيط ${m}: ${e.name === "AbortError" ? "اتأخر +30 ثانية" : e.message}`); }
  }
  if (!file) { log("3) اختار صورة عشان أفحص رفعها"); return; }
  t = performance.now();
  let b64;
  try { b64 = await imageToBase64(file); } catch (e) { log("3) تجهيز الصورة فشل: " + e.message); return; }
  log(`3) تجهيز الصورة: ${Math.round(b64.length * 0.75 / 1024)} KB (${ms(t)})`);
  for (const m of models.slice(0, 2)) {
    t = performance.now();
    try {
      const r = await post(m, apiKey, [{ text: "say hi" }, { inline_data: { mime_type: "image/jpeg", data: b64 } }], false, 30000);
      log(`4) صورة ${m}: ${r.status} (${ms(t)})`);
    } catch (e) { log(`4) صورة ${m}: ${e.name === "AbortError" ? "اتأخر +30 ثانية" : e.message}`); }
  }
}

/* ---------- Word (80mm thermal): clean tables, monochrome-friendly ---------- */
const FONT = "Arial";
const LRE = "\u202a", PDF = "\u202c";
const COLS = [1650, 1200, 1230]; // = 4080 DXA = 7.2cm (8cm - 2 x 0.4cm margins)

function buildDoc(d, D) {
  const { Document, Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle } = D;
  const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const fontObj = { ascii: FONT, hAnsi: FONT, cs: FONT, eastAsia: FONT };

  const run = (text, size, bold) => new TextRun({ text, font: fontObj, size: size * 2,
    sizeComplexScript: size * 2, bold, boldComplexScript: bold, rightToLeft: true });
  // bidi paragraph: jc "left" = start edge = visual RIGHT
  const par = (text, size, bold, align, extra = {}) => new Paragraph({
    bidirectional: true,
    alignment: align === "center" ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { before: 0, after: 20 }, ...extra,
    children: [run(text, size, bold)]
  });
  const val = v => `${LRE}${v}${PDF}`;

  const cell = (text, w, size, bold, align, span) => new TableCell({
    width: { size: w, type: WidthType.DXA }, columnSpan: span,
    margins: { top: 25, bottom: 25, left: 40, right: 40 },
    borders: { top: NONE, left: NONE, right: NONE, bottom: NONE },
    children: [par(text, size, bold, align, { spacing: { before: 0, after: 0 } })]
  });
  const row = (a, b, c, o = {}) => new TableRow({ cantSplit: true, children: c === undefined
    ? [cell(a, COLS[0], 9, false, "right"), cell(b, COLS[1] + COLS[2], 9, true, "center", 2)]
    : [cell(a, COLS[0], o.h ? 8 : 9, !!o.h, "right"), cell(b, COLS[1], o.h ? 8 : 9, !o.h, "center"), cell(c, COLS[2], o.h ? 8 : 9, !!o.h, "center")] });

  const table = rows => new Table({
    width: { size: 4080, type: WidthType.DXA }, columnWidths: COLS, visuallyRightToLeft: true,
    borders: { top: NONE, bottom: NONE, left: NONE, right: NONE, insideVertical: NONE,
      insideHorizontal: { style: BorderStyle.DOTTED, size: 6, color: "000000" } },
    rows
  });
  const section = t => par(t, 10, true, "right", {
    spacing: { before: 140, after: 40 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: "000000", space: 1 } }
  });

  const status = (l, k, s) => row(l, val(d[k]), d[s]);
  const ref = (l, k, r) => row(l, val(d[k]), val(d[r]));
  const dateText = d.date !== "-" ? d.date : new Date().toLocaleString("en-GB");

  const children = [
    par("تقرير تحليل تكوين الجسم", 12, true, "center", { spacing: { before: 0, after: 40 } }),
    par(val(dateText), 8, false, "center", { spacing: { before: 0, after: 60 } }),
    table([
      row("الاسم", d.name), row("العمر", val(d.age)), row("الجنس", d.gender), row("الطول", val(d.height))
    ]),

    section("الوزن والمؤشرات الأساسية"),
    table([
      row("المؤشر", "القياس", "التقييم", { h: true }),
      row("الوزن", val(d.weight), ""),
      row("التغير عن آخر قياس", val(d.weight_change), ""),
      status("مؤشر كتلة الجسم", "bmi", "bmi_status"),
      status("نسبة الدهون", "bfr", "bfr_status"),
      status("معدل العضلات", "muscle_rate", "muscle_rate_status")
    ]),

    section("تحليل تكوين الجسم"),
    table([
      row("المؤشر", "القياس", "التقييم", { h: true }),
      status("كتلة الدهون", "fat_mass", "fat_mass_status"),
      status("ماء الجسم", "body_water", "body_water_status"),
      status("كتلة البروتين", "protein_mass", "protein_mass_status"),
      status("كتلة العظام", "bone_mass", "bone_mass_status")
    ]),

    section("التحكم في الوزن"),
    table([
      row("الوزن القياسي", val(d.standard_weight)),
      row("كتلة العضلات", val(d.muscle_mass)),
      row("كتلة الجسم النحيل", val(d.lean_body_mass)),
      row("التحكم في الوزن", val(d.weight_control)),
      row("مؤشر السمنة", val(d.obesity_index))
    ]),

    section("نوع الجسم"),
    par(d.body_type, 11, true, "center", { spacing: { before: 40, after: 20 } }),

    section("مؤشرات أخرى"),
    table([
      row("المؤشر", "القياس", "المرجعي", { h: true }),
      ref("معدل الأيض الأساسي", "bmr", "bmr_ref"),
      ref("مؤشر الدهون الحشوية", "visceral_fat", "visceral_fat_ref"),
      ref("الدهون تحت الجلد", "subcutaneous_fat", "subcutaneous_fat_ref"),
      ref("العمر الجسدي", "physical_age", "physical_age_ref"),
      ref("مستوى السمنة", "obesity_level", "obesity_level_ref"),
      ref("معدل البروتين", "protein_rate", "protein_rate_ref")
    ])
  ];
  return new Document({
    styles: { default: { document: { run: { font: FONT, size: 18 } } } },
    sections: [{
      properties: { page: {
        size: { width: 4535, height: 16838 },                      // 8.0 x 29.7 cm
        margin: { top: 227, right: 227, bottom: 227, left: 227 } } },  // 0.4 cm
      children
    }]
  });
}

async function makeDocxBlob(d) { return await docx.Packer.toBlob(buildDoc(d, docx)); }
if (typeof module !== "undefined") module.exports = { buildDoc, parseJson, KEYS };
