# Thermal Report - Android (PWA)

Installable web app: photo of body-composition report -> Gemini -> 80mm thermal Word file.

## Install on Android
1. Upload all files in this folder to a GitHub repo and enable GitHub Pages (Settings > Pages), or any HTTPS host.
2. Open the page link in Chrome on the phone > menu > "Install app" / "Add to Home screen".
3. Paste your Gemini API key once (get it from aistudio.google.com/apikey). It is saved on the phone only.

Works offline after first load (except the Gemini call, which needs internet).
Model is set at the top of app.js (MODELS).


## حفظ التقارير في SB In Body
- عند الضغط على "تحميل" لأول مرة، اختر المجلد الأب الذي تريد حفظ التقارير بداخله (مثلاً Downloads).
- سينشئ التطبيق مجلد `SB In Body` داخله تلقائياً ويحفظ ملفات Word بأسماء التاريخ والوقت فقط، مثل `13-11-2026_20-46.docx`.
- يحفظ التطبيق اختيار المجلد على الجهاز، وقد يطلب إذن الوصول إليه مرة أخرى حسب إعدادات المتصفح.
- إذا كان المتصفح لا يدعم اختيار المجلدات، سيستخدم التنزيل العادي؛ عندها قد تحتاج لنقل الملف يدوياً إلى المجلد.
