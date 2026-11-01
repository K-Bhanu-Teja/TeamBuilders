import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { runSafetyCheck } from '@/lib/agent/safety';
import { LANGUAGE_PROMPT, getLocalizedStateName, getLocalizedDistrictName } from '@/lib/national-data';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ── Fetch live data from internal API routes ───────────────────────────────
async function fetchWeather(lat: number, lon: number, baseUrl: string) {
  try { return await (await fetch(`${baseUrl}/api/weather?lat=${lat}&lon=${lon}`)).json(); }
  catch { return { unavailable: true }; }
}
async function fetchSoil(lat: number, lon: number, baseUrl: string) {
  try { return await (await fetch(`${baseUrl}/api/soil?lat=${lat}&lon=${lon}`)).json(); }
  catch { return { unavailable: true }; }
}
async function fetchPrice(crop: string, state: string, district: string, baseUrl: string) {
  try {
    const params = new URLSearchParams({ commodity: crop, state, district });
    return await (await fetch(`${baseUrl}/api/prices?${params}`)).json();
  } catch { return { unavailable: true }; }
}

// ── Build Gemini prompt with live data injected ────────────────────────────
function buildPrompt(
  crop: string,
  stage: string,
  state: string,
  district: string,
  language: string,
  weather: Record<string, unknown>,
  soil:    Record<string, unknown>,
  price:   Record<string, unknown>
): string {
  const wc = weather.current as Record<string, unknown> | undefined;
  const langInstruction = LANGUAGE_PROMPT[language] || `Respond ONLY in ${language}. Do not use English or Hindi.`;

  const weatherSummary = weather.unavailable
    ? 'Live weather data unavailable.'
    : `Temp: ${wc?.temperature}°C, Humidity: ${wc?.humidity}%, Rain 24h: ${weather.rainfall_next_24h}mm, Wind: ${wc?.wind_speed}km/h, Condition: ${wc?.condition}. Spray safe: ${weather.spray_safe}. 3-day outlook: ${JSON.stringify(weather.forecast_3day)}`;

  const soilSummary = soil.unavailable
    ? 'Live soil data unavailable.'
    : `Root zone moisture: ${soil.soil_moisture_percent}%, ET: ${soil.evapotranspiration_mm_per_day}mm/day, Rainfall: ${soil.recent_rainfall_mm}mm. Irrigation need: ${soil.irrigation_need_index}/10. Recommendation: ${soil.irrigation_recommendation}. Date: ${soil.data_date}`;

  const priceSummary = price.unavailable
    ? `Live mandi price for ${crop} in ${state} unavailable today.`
    : `Commodity: ${price.commodity}, Market: ${price.market} (${price.district}, ${price.state}), Modal: ₹${price.modal_price}/quintal, Min: ₹${price.min_price}, Max: ₹${price.max_price}. Date: ${price.price_date}. ${price.records_found} records found.`;

  const locState = getLocalizedStateName(state, language);
  const locDist = getLocalizedDistrictName(district, language);
  const locPlace = language === 'English' ? `${district}, ${state}` : `${locDist} (${district}), ${locState} (${state})`;

  return `You are KisanSaathi, an expert AI farming advisor for smallholder farmers across India.

ABSOLUTE LANGUAGE MANDATE:
The farmer's language is: ${language}.
You MUST generate the advice between ---MAIN_ACTION--- strictly in ${language} (native script).
Under NO CIRCUMSTANCES should you output Hindi or Telugu when the requested language is ${language}.
${langInstruction}

FARMER CONTEXT:
- Crop: ${crop} | Growth Stage: ${stage}
- Location: ${locPlace}, India
- Language to respond in: ${language}

LIVE DATA (fetched right now at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST):

WEATHER (Open-Meteo):
${weatherSummary}

SOIL MOISTURE (NASA POWER):
${soilSummary}

MANDI PRICES (Data.gov.in Agmarknet, ${state}):
${priceSummary}

YOUR TASK:
Reason step-by-step about what this data means for ${crop} at the ${stage} stage in ${locPlace}. Then give ONE single most important action the farmer should take TODAY.

RULES:
- NEVER recommend banned pesticides (Monocrotophos, Endosulfan, Methyl Parathion, Chlorpyrifos 50% EC, Phorate, Triazophos)
- Rain > 15mm/24h → do NOT recommend spraying
- Temperature > 40°C → warn about heat stress first
- If mandi price is available, factor it into harvest/storage advice
- Always cite the actual data values in your advice (e.g., actual temperature, soil%, price)
- If any data is unavailable, acknowledge it honestly in ${language}

OUTPUT FORMAT (MUST follow exactly):
---MAIN_ACTION---
[2–4 sentences strictly in ${language} script giving the single most important action with reason, citing actual numbers]
---ENGLISH_SUMMARY---
[1 sentence English summary for the UI]`;
}

// ── Call Gemini REST API with retries ──────────────────────────────────────
async function callGemini(prompt: string, apiKey: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',  threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT',  threshold: 'BLOCK_NONE' },
    ],
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (res.ok) {
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Gemini returned empty response');
      return text;
    }
    if (res.status === 503 && attempt < 3) {
      await new Promise(r => setTimeout(r, attempt * 2500));
      continue;
    }
    const errText = await res.text();
    throw new Error(`Gemini ${res.status}: ${errText}`);
  }
  throw new Error('Gemini API failed after 3 attempts');
}

// ── Rule-based fallback (works without AI key) ────────────────────────────
function ruleBasedAdvice(
  crop: string, stage: string, language: string,
  weather: Record<string, unknown>,
  soil:    Record<string, unknown>,
  price:   Record<string, unknown>
): { main: string; english: string } {
  const wc       = weather.current as Record<string, unknown> | undefined;
  const temp     = Number(wc?.temperature)   || 30;
  const rain24h  = Number(weather.rainfall_next_24h) || 0;
  const sprayOk  = Boolean(weather.spray_safe);
  const soilPct  = Number(soil.soil_moisture_percent) || 50;
  const irrigIdx = Number(soil.irrigation_need_index) || 5;
  const modalP   = Number(price.modal_price) || 0;

  // Language-aware snippets
  const snippets: Record<string, Record<string, string>> = {
    English: {
      heat:    `Today's temperature (${temp}°C) is high — heat stress risk for ${crop}. Apply mulch and irrigate during the evening hours.`,
      rain:    `Recent 24h rainfall of ${rain24h}mm recorded — do not spray today. Soil moisture is ${soilPct}%; check for pests and fungus once rain clears.`,
      irrig:   `Soil moisture is low at ${soilPct}% — irrigate ${crop} field today, preferably at dawn or dusk.`,
      price:   `Today's mandi price is ₹${modalP.toLocaleString('en-IN')}/quintal — check maturity and consider harvesting within 2–3 days if crop is ready.`,
      spray:   `Current weather (${temp}°C, ${rain24h}mm rain) is favorable for spraying. Apply recommended protection early morning (6–9 AM).`,
      monitor: `Weather conditions (${temp}°C, soil moisture ${soilPct}%) are normal for ${crop}. Continue routine monitoring for pest activity.`,
    },
    Telugu: {
      heat:    `నేటి ఉష్ణోగ్రత ${temp}°C అధికంగా ఉంది — ${crop} పంటకు వేడి ఒత్తిడి ప్రమాదం ఉంది. మల్చ్ వాడండి మరియు సాయంత్రం నీరు పెట్టండి.`,
      rain:    `గత 24 గంటల్లో ${rain24h}mm వర్షం పడింది — ఈరోజు మందులు చల్లకండి. నేల తేమ ${soilPct}% ఉంది; వర్షం తగ్గిన తర్వాత పంటను తనిఖీ చేయండి.`,
      irrig:   `నేల తేమ ${soilPct}% మాత్రమే ఉంది — ఈరోజు ${crop} పంటకు నీరు పెట్టండి. తెల్లవారు జామున లేదా సాయంత్రం నీరు పెట్టడం మంచిది.`,
      price:   `ఈరోజు మండీ ధర ₹${modalP.toLocaleString('en-IN')}/క్వింటాల్ — పంట పరిపక్వతను తనిఖీ చేసి 2-3 రోజుల్లో కోత పరిగణించండి.`,
      spray:   `నేటి వాతావరణం (${temp}°C, ${rain24h}mm వర్షం) మందులు చల్లడానికి అనుకూలంగా ఉంది. ఉదయం 6-9 మధ్య సిఫార్సు చేయబడిన మందు వాడండి.`,
      monitor: `నేటి వాతావరణం (${temp}°C, నేల తేమ ${soilPct}%) సాధారణంగా ఉంది. పంటను తనిఖీ చేసి తెగుళ్ళు ఉన్నాయేమో గమనించండి.`,
    },
    Tamil: {
      heat:    `இன்றைய வெப்பநிலை ${temp}°C அதிகமாக உள்ளது — ${crop} பயிரில் வெப்ப அழுத்த பாதிப்பு ஏற்படலாம். மாலை வேளையில் நீர்ப்பாசனம் செய்யவும்.`,
      rain:    `கடந்த 24 மணி நேரத்தில் ${rain24h}mm மழை பெய்துள்ளது — இன்று மருந்து தெளிக்க வேண்டாம். மண் ஈரப்பதம் ${soilPct}% உள்ளது.`,
      irrig:   `மண் ஈரப்பதம் ${soilPct}% மட்டுமே உள்ளது — இன்று ${crop} பயிருக்கு நீர்ப்பாசனம் செய்யவும். அதிகாலை அல்லது மாலையில் தண்ணீர் பாய்ச்சவும்.`,
      price:   `இன்றைய சந்தை விலை ₹${modalP.toLocaleString('en-IN')}/குவிண்டால் — பயிர் முதிர்ச்சியை சரிபார்த்து 2-3 நாட்களில் அறுவடை செய்ய பரிசீலிக்கவும்.`,
      spray:   `இன்றைய வானிலை (${temp}°C, ${rain24h}mm மழை) மருந்து தெளிக்க ஏற்றதாக உள்ளது. காலை 6-9 மணிக்குள் பரிந்துரைக்கப்பட்ட பூச்சிக்கொல்லியைத் தெளிக்கவும்.`,
      monitor: `இன்றைய வானிலை (${temp}°C, ஈரப்பதம் ${soilPct}%) சாதாரணமாக உள்ளது. பூச்சி மற்றும் நோய் தாக்குதலைக் கண்காணிக்கவும்.`,
    },
    Hindi: {
      heat:    `आज का तापमान ${temp}°C अधिक है — ${crop} फसल को गर्मी का तनाव हो सकता है। मल्च का उपयोग करें और शाम को सिंचाई करें।`,
      rain:    `पिछले 24 घंटों में ${rain24h}mm बारिश हुई — आज कीटनाशक न डालें। मिट्टी की नमी ${soilPct}% है; बारिश रुकने के बाद फसल की जांच करें।`,
      irrig:   `मिट्टी की नमी केवल ${soilPct}% है — आज ${crop} की फसल को सिंचाई करें। सुबह या शाम को सिंचाई करना बेहतर है।`,
      price:   `आज मंडी भाव ₹${modalP.toLocaleString('en-IN')}/क्विंटल है — फसल की परिपक्वता जांचें और 2-3 दिनों में कटाई पर विचार करें।`,
      spray:   `आज का मौसम (${temp}°C, ${rain24h}mm बारिश) छिड़काव के लिए उचित है। सुबह 6-9 बजे के बीच अनुशंसित कीटनाशक का उपयोग करें।`,
      monitor: `आज का मौसम (${temp}°C, नमी ${soilPct}%) सामान्य है। फसल की जांच करें और कीट-व्याधि पर नज़र रखें।`,
    },
    Marathi: {
      heat:    `आज तापमान ${temp}°C जास्त आहे — ${crop} पिकावर उष्णतेचा ताण येऊ शकतो. मल्च वापरा आणि संध्याकाळी पाणी द्या.`,
      rain:    `गेल्या 24 तासांत ${rain24h}mm पाऊस झाला — आज फवारणी करू नका. जमिनीत ओलावा ${soilPct}% आहे; पाऊस थांबल्यावर पिकाची तपासणी करा.`,
      irrig:   `जमिनीतील ओलावा फक्त ${soilPct}% आहे — आज ${crop} पिकाला पाणी द्या. सकाळी किंवा संध्याकाळी पाणी देणे चांगले.`,
      price:   `आज मंडी भाव ₹${modalP.toLocaleString('en-IN')}/क्विंटल आहे — पिकाची परिपक्वता तपासा आणि 2-3 दिवसांत काढणी करण्याचा विचार करा.`,
      spray:   `आजचे हवामान (${temp}°C, ${rain24h}mm पाऊस) फवारणीसाठी अनुकूल आहे. सकाळी 6-9 दरम्यान शिफारस केलेले कीटकनाशक वापरा.`,
      monitor: `आजचे हवामान (${temp}°C, ओलावा ${soilPct}%) सामान्य आहे. पिकाची तपासणी करा आणि किड-रोगावर लक्ष ठेवा.`,
    },
    Punjabi: {
      heat:    `ਅੱਜ ਤਾਪਮਾਨ ${temp}°C ਜ਼ਿਆਦਾ ਹੈ — ${crop} ਫਸਲ ਨੂੰ ਗਰਮੀ ਦਾ ਖਤਰਾ ਹੈ। ਮਲਚ ਵਰਤੋ ਅਤੇ ਸ਼ਾਮ ਨੂੰ ਸਿੰਚਾਈ ਕਰੋ।`,
      rain:    `ਪਿਛਲੇ 24 ਘੰਟਿਆਂ ਵਿੱਚ ${rain24h}mm ਮੀਂਹ ਪਿਆ — ਅੱਜ ਕੀਟਨਾਸ਼ਕ ਨਾ ਛਿੜਕੋ। ਮਿੱਟੀ ਦੀ ਨਮੀ ${soilPct}% ਹੈ।`,
      irrig:   `ਮਿੱਟੀ ਦੀ ਨਮੀ ਸਿਰਫ ${soilPct}% ਹੈ — ਅੱਜ ${crop} ਨੂੰ ਪਾਣੀ ਦਿਓ। ਸਵੇਰੇ ਜਾਂ ਸ਼ਾਮ ਨੂੰ ਸਿੰਚਾਈ ਕਰੋ।`,
      price:   `ਅੱਜ ਮੰਡੀ ਭਾਅ ₹${modalP.toLocaleString('en-IN')}/ਕੁਇੰਟਲ ਹੈ — ਫਸਲ ਦੀ ਪੱਕਣ ਦੀ ਜਾਂਚ ਕਰੋ।`,
      spray:   `ਅੱਜ ਦਾ ਮੌਸਮ (${temp}°C, ${rain24h}mm ਮੀਂਹ) ਛਿੜਕਾਅ ਲਈ ਠੀਕ ਹੈ। ਸਵੇਰੇ 6-9 ਵਜੇ ਕੀਟਨਾਸ਼ਕ ਛਿੜਕੋ।`,
      monitor: `ਅੱਜ ਦਾ ਮੌਸਮ (${temp}°C, ਨਮੀ ${soilPct}%) ਆਮ ਹੈ। ਫਸਲ ਦੀ ਜਾਂਚ ਕਰੋ ਅਤੇ ਕੀੜਿਆਂ 'ਤੇ ਨਜ਼ਰ ਰੱਖੋ।`,
    },
    Kannada: {
      heat:    `ಇಂದಿನ ತಾಪಮಾನ ${temp}°C ಹೆಚ್ಚಾಗಿದೆ — ${crop} ಬೆಳೆಗೆ ಶಾಖದ ಒತ್ತಡ ಉಂಟಾಗಬಹುದು. ಸಂಜೆ ನೀರಾವರಿ ಮಾಡಿ.`,
      rain:    `ಕಳೆದ 24 ಗಂಟೆಗಳಲ್ಲಿ ${rain24h}mm ಮಳೆಯಾಗಿದೆ — ಇಂದು ಕೀಟನಾಶಕ ಸಿಂಪಡಿಸಬೇಡಿ. ಮಣ್ಣಿನ ತೇವಾಂಶ ${soilPct}% ಇದೆ.`,
      irrig:   `ಮಣ್ಣಿನ ತೇವಾಂಶ ${soilPct}% ಮಾತ್ರ ಇದೆ — ಇಂದು ${crop} ಬೆಳೆಗೆ ನೀರಾವರಿ ಮಾಡಿ. ಮುಂಜಾನೆ ಅಥವಾ ಸಂಜೆ ನೀರು ಕೊಡುವುದು ಸೂಕ್ತ.`,
      price:   `ಇಂದಿನ ಮಾರುಕಟ್ಟೆ ಬೆಲೆ ₹${modalP.toLocaleString('en-IN')}/ಕ್ವಿಂಟಾಲ್ — ಬೆಳೆಯ ಪಕ್ವತೆಯನ್ನು ಪರಿಶೀಲಿಸಿ 2-3 ದಿನಗಳಲ್ಲಿ ಕೊಯ್ಲು ಮಾಡಿ.`,
      spray:   `ಇಂದಿನ ಹವಾಮಾನ (${temp}°C, ${rain24h}mm ಮಳೆ) ಸಿಂಪರಣೆಗೆ ಸೂಕ್ತವಾಗಿದೆ. ಬೆಳಗ್ಗೆ 6-9 ರ ನಡುವೆ ಶಿಫಾರಸು ಮಾಡಿದ ಕೀಟನಾಶಕ ಬಳಸಿ.`,
      monitor: `ಇಂದಿನ ಹವಾಮಾನ (${temp}°C, ತೇವಾಂಶ ${soilPct}%) ಸಾಮಾನ್ಯವಾಗಿರುತ್ತದೆ. ಕೀಟ ಮತ್ತು ರೋಗಗಳ ಮೇಲೆ ನಿಗಾ ಇರಿಸಿ.`,
    },
    Bengali: {
      heat:    `আজকের তাপমাত্রা ${temp}°C বেশি — ${crop} ফসলে তাপের চাপ হতে পারে। সন্ধ্যায় সেচ দিন।`,
      rain:    `গত ২৪ ঘণ্টায় ${rain24h}mm বৃষ্টি হয়েছে — আজ কীটনাশক স্প্রে করবেন না। মাটির আর্দ্রতা ${soilPct}%।`,
      irrig:   `মাটির আর্দ্রতা মাত্র ${soilPct}% — আজ ${crop} ফসলে সেচ দিন। সকালে বা সন্ধ্যায় জল দেওয়া ভালো।`,
      price:   `আজকের বাজার দর ₹${modalP.toLocaleString('en-IN')}/কুইন্টাল — ২-৩ দিনের মধ্যে ফসল কাটার পরিকল্পনা বিবেচনা করুন।`,
      spray:   `আজকের আবহাওয়া (${temp}°C, ${rain24h}mm বৃষ্টি) স্প্রে করার উপযুক্ত। সকাল ৬-৯টার মধ্যে কীটনাশক স্প্রে করুন।`,
      monitor: `আজকের আবহাওয়া (${temp}°C, আর্দ্রতা ${soilPct}%) স্বাভাবিক। কীটপতঙ্গ ও রোগ নিরীক্ষণ করুন।`,
    },
    Gujarati: {
      heat:    `આજનું તાપમાન ${temp}°C વધુ છે — ${crop} પાક પર ગરમીનો તણાવ આવી શકે છે. સાંજે પિયત આપો.`,
      rain:    `છેલ્લા 24 કલાકમાં ${rain24h}mm વરસાદ થયો છે — આજે દવાનો છંટકાવ ન કરો. જમીનનો ભેજ ${soilPct}% છે.`,
      irrig:   `જમીનમાં ભેજ માત્ર ${soilPct}% છે — આજે ${crop} પાકને પિયત આપો. સવારે અથવા સાંજે પાણી આપવું સારું.`,
      price:   `આજનો બજાર ભાવ ₹${modalP.toLocaleString('en-IN')}/ક્વિન્ટલ છે — 2-3 દિવસમાં લણણીનો વિચાર કરો.`,
      spray:   `આજનું હવામાન (${temp}°C, ${rain24h}mm વરસાદ) છંટકાવ માટે અનુકૂળ છે. સવારે 6-9 દરમિયાન દવાનો છંટકાવ કરો.`,
      monitor: `આજનું હવામાન (${temp}°C, ભેજ ${soilPct}%) સામાન્ય છે. પાકમાં જીવાત અને રોગનું નિરીક્ષણ કરો.`,
    },
    Malayalam: {
      heat:    `ഇന്നത്തെ താപനില ${temp}°C കൂടുതലാണ് — ${crop} വിളയ്ക്ക് ചൂട് ഏൽക്കാം. വൈകുന്നേരം നനയ്ക്കുക.`,
      rain:    `കഴിഞ്ഞ 24 മണിക്കൂറിൽ ${rain24h}mm മഴ പെയ്തു — ഇന്ന് മരുന്ന് തളിക്കരുത്. മണ്ണിലെ ഈർപ്പം ${soilPct}% ആണ്.`,
      irrig:   `മണ്ണിലെ ഈർപ്പം ${soilPct}% മാത്രമാണ് — ഇന്ന് ${crop} വിളയ്ക്ക് നനയ്ക്കുക. രാവിലെ അല്ലെങ്കിൽ വൈകുന്നേരം നനയ്ക്കുന്നത് ഉത്തമം.`,
      price:   `ഇന്നത്തെ വിപണി വില ₹${modalP.toLocaleString('en-IN')}/ക്വിന്റൽ ആണ് — വിളവെടുപ്പ് ആലോചിക്കുക.`,
      spray:   `ഇന്നത്തെ കാലാവസ്ഥ (${temp}°C, ${rain24h}mm മഴ) മരുന്ന് തളിക്കാൻ അനുകൂലമാണ്. രാവിലെ 6-9 നകം തളിക്കുക.`,
      monitor: `ഇന്നത്തെ കാലാവസ്ഥ (${temp}°C, ഈർപ്പം ${soilPct}%) സാധാരണ നിലയിലാണ്. കീടബാധ ശ്രദ്ധിക്കുക.`,
    },
  };

  const lang = snippets[language] || snippets['English'] || snippets['Hindi'];

  let main = '';
  let english = '';

  if (temp > 40) {
    main = lang.heat; english = `Heat stress alert (${temp}°C): protect ${crop}, apply mulch, irrigate evening.`;
  } else if (rain24h > 15) {
    main = lang.rain; english = `Rain (${rain24h}mm): skip spraying today. Check for disease after rain clears.`;
  } else if (irrigIdx > 6 && soilPct < 40) {
    main = lang.irrig; english = `Soil dry (${soilPct}%): irrigate ${crop} today, preferably dawn or dusk.`;
  } else if (!price.unavailable && modalP > 0 && stage.toLowerCase().includes('harvest')) {
    main = lang.price; english = `Market price ₹${modalP}/quintal — check crop maturity for harvest in 2-3 days.`;
  } else if (sprayOk && (stage.toLowerCase().includes('flower') || stage.toLowerCase().includes('vegetat'))) {
    main = lang.spray; english = `Good spray window (${temp}°C, ${rain24h}mm rain). Apply recommended ${crop} protection 6-9 AM.`;
  } else {
    main = lang.monitor; english = `Conditions normal. Monitor ${crop} for pests and disease.`;
  }

  return { main, english };
}

// ── Main route handler ─────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    farmer_id,
    crop,
    growth_stage,
    state    = 'Andhra Pradesh',
    district = 'Guntur',
    language = 'Telugu',
    lat,
    lon,
  } = body;

  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  const baseUrl = host
    ? `${proto}://${host}`
    : (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000');
  const apiKey  = GEMINI_API_KEY || '';

  let weatherSnapshot: Record<string, unknown> = {};
  let soilSnapshot:    Record<string, unknown> = {};
  let priceSnapshot:   Record<string, unknown> = {};
  let finalAdvice      = '';
  let finalEnglish     = '';
  let usedFallback     = false;

  try {
    // 1. Fetch all live data in parallel
    [weatherSnapshot, soilSnapshot, priceSnapshot] = await Promise.all([
      fetchWeather(lat ?? 16.3008, lon ?? 80.4428, baseUrl),
      fetchSoil(lat ?? 16.3008, lon ?? 80.4428, baseUrl),
      fetchPrice(crop, state, district, baseUrl),
    ]);

    // 2. Try Gemini AI
    if (apiKey && apiKey.length > 10) {
      try {
        const prompt = buildPrompt(crop, growth_stage, state, district, language, weatherSnapshot, soilSnapshot, priceSnapshot);
        const fullText = await callGemini(prompt, apiKey);

        // Parse output
        const mainMatch = fullText.split('---MAIN_ACTION---');
        if (mainMatch.length > 1) {
          const afterMain = mainMatch[1].split('---ENGLISH_SUMMARY---');
          finalAdvice  = afterMain[0].trim();
          finalEnglish = afterMain[1]?.trim() || '';
        } else {
          finalAdvice  = fullText.trim();
          finalEnglish = '';
        }
      } catch (aiErr) {
        console.error('Gemini failed, using rule-based fallback:', aiErr);
        usedFallback = true;
      }
    } else {
      usedFallback = true;
    }

    // 3. Rule-based fallback
    if (!finalAdvice || usedFallback) {
      const fb = ruleBasedAdvice(crop, growth_stage, language, weatherSnapshot, soilSnapshot, priceSnapshot);
      finalAdvice  = fb.main;
      finalEnglish = fb.english;
      usedFallback = true;
    }

    // 4. Safety check
    const safetyResult = runSafetyCheck(
      finalAdvice,
      weatherSnapshot as { rainfall_24h?: number; max_temp?: number },
      soilSnapshot    as { soil_moisture_percent?: number }
    );
    finalAdvice = safetyResult.filteredAdvice;

    // 5. Save to Supabase
    let adviceId: string | null = null;
    try {
      const { data } = await supabaseAdmin.from('advice_history').insert({
        farmer_id:        farmer_id || null,
        weather_snapshot: weatherSnapshot,
        soil_snapshot:    soilSnapshot,
        price_snapshot:   priceSnapshot,
        advice_telugu:    finalAdvice,   // stores advice in farmer's language
        advice_english:   finalEnglish,
      }).select('id').single();
      adviceId = data?.id || null;
    } catch { /* non-fatal */ }

    return NextResponse.json({
      success:         true,
      advice_id:       adviceId,
      advice_local:    finalAdvice,
      advice_telugu:   finalAdvice,   // kept for backward compat
      advice_english:  finalEnglish,
      language,
      safety_warnings: safetyResult.warnings,
      used_ai:         !usedFallback,
      model:           usedFallback ? 'rule-based' : 'gemini-3.8-flash',
      data_used:       { weather: weatherSnapshot, soil: soilSnapshot, price: priceSnapshot },
      generated_at:    new Date().toISOString(),
    });
  } catch (err) {
    console.error('Advice route error:', err);
    return NextResponse.json({ error: `Error: ${String(err)}`, success: false }, { status: 500 });
  }
}
