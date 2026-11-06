/* app.js - Gemini extraction + 80mm thermal Word generation (runs fully in the browser) */
const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"];
const KEYS = ["date","name","age","gender","height","weight","bmi","bfr","muscle_rate","fat_mass",
  "body_water","protein_mass","bone_mass","body_type","bmr","visceral_fat","subcutaneous_fat",
  "physical_age","obesity_level","protein_rate"];
const PROMPT = "قم بتحليل هذه الصورة واستخراج البيانات الطبية. أرجع النتيجة بصيغة JSON فقط، بدون أي نصوص أو تنسيقات Markdown إضافية. استخدم هذه المفاتيح بالضبط: "
  + KEYS.join(", ") + ". انقل كل قيمة كما هي مكتوبة في الصورة مع وحدتها، وإذا لم تجد قيمة اجعلها \"-\".";

/* ---------- image -> base64 (downscaled for fast upload) ---------- */
async function imageToBase64(file, maxSide = 1800) {
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
  return out;
}

async function extractData(file, apiKey) {
  const b64 = await imageToBase64(file);
  const body = {
    contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: "image/jpeg", data: b64 } }] }],
    generationConfig: { temperature: 0, responseMimeType: "application/json" }
  };
  let lastErr = "";
  for (const m of MODELS) {
    let r;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(apiKey)}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch (e) { throw new Error("مفيش اتصال بالإنترنت أو الطلب اتحجب"); }
    if (r.status === 404) { lastErr = m + " غير متاح"; continue; }
    const j = await r.json();
    if (!r.ok) throw new Error((j.error && j.error.message) || ("HTTP " + r.status));
    const t = j.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!t) throw new Error("الرد جه فاضي، جرّب صورة أوضح");
    return parseJson(t);
  }
  throw new Error("مفيش موديل متاح. " + lastErr);
}

/* ---------- Word (80mm thermal) ---------- */
const SEP = "-".repeat(60);
const FONT = "Arial";
const LRE = "\u202a", PDF = "\u202c";

function buildDoc(d, D) {
  const { Document, Paragraph, TextRun, AlignmentType } = D;
  const par = (text, size, bold, align) => new Paragraph({
    bidirectional: true,
    // in a bidi paragraph, jc "left" = start edge = visual RIGHT
    alignment: align === "center" ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { before: 0, after: 40 },
    children: [new TextRun({ text, font: { ascii: FONT, hAnsi: FONT, cs: FONT, eastAsia: FONT },
      size: size * 2, sizeComplexScript: size * 2, bold, boldComplexScript: bold, rightToLeft: true })]
  });
  const sep = () => par(SEP, 9, false, "center");
  const line = (label, key) => par(`${label}: ${LRE}${d[key]}${PDF}`, 9, false, "right");
  const head = t => par(t, 10, true, "right");
  const rows = (arr) => arr.map(([l, k]) => line(l, k));

  const dateText = d.date !== "-" ? d.date : new Date().toLocaleString("en-GB");
  const children = [
    par("تقرير تحليل تكوين الجسم", 12, true, "center"),
    par(dateText, 8, false, "center"),
    sep(), head("البيانات الأساسية"),
    ...rows([["الاسم","name"],["العمر","age"],["النوع","gender"],["الطول","height"],["الوزن","weight"]]),
    sep(), head("تحليل تكوين الجسم"),
    ...rows([["مؤشر كتلة الجسم","bmi"],["نسبة الدهون","bfr"],["نسبة العضلات","muscle_rate"],
      ["كتلة الدهون","fat_mass"],["ماء الجسم","body_water"],["كتلة البروتين","protein_mass"],
      ["كتلة العظام","bone_mass"],["نسبة البروتين","protein_rate"]]),
    sep(), head("مؤشرات إضافية"),
    ...rows([["نوع الجسم","body_type"],["معدل الحرق","bmr"],["الدهون الحشوية","visceral_fat"],
      ["الدهون تحت الجلد","subcutaneous_fat"],["العمر البدني","physical_age"],["مستوى السمنة","obesity_level"]]),
    sep()
  ];
  return new Document({
    styles: { default: { document: { run: { font: FONT, size: 18 } } } },
    sections: [{
      properties: { page: {
        size: { width: 4535, height: 16838 },               // 8.0 x 29.7 cm
        margin: { top: 227, right: 227, bottom: 227, left: 227 } // 0.4 cm
      } },
      children
    }]
  });
}

async function makeDocxBlob(d) {
  return await docx.Packer.toBlob(buildDoc(d, docx));
}
if (typeof module !== "undefined") module.exports = { buildDoc, parseJson };
