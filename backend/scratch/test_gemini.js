import { GoogleGenerativeAI } from "@google/generative-ai";

async function testGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("❌ GEMINI_API_KEY is missing in .env");
    return;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await model.generateContent("Say 'Gemini is working!'");
    const response = await result.response;
    console.log("✅ Response:", response.text());
  } catch (error) {
    console.error("❌ Gemini API Error:", error.message);
  }
}

testGemini();
