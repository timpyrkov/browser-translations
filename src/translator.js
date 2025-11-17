export async function translateText(text, sourceLang = "auto", targetLang = "en") {
  const apiUrl = "https://libretranslate.com/translate";

  const payload = {
    q: text,
    source: sourceLang,
    target: targetLang,
    format: "text"
  };

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    return result.translatedText || "";
  } catch (error) {
    console.error("Translation error:", error);
    return "[Translation failed]";
  }
}