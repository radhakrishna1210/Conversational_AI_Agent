import { GoogleGenerativeAI } from "@google/generative-ai";


async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  const genAI = new GoogleGenerativeAI(apiKey);
  try {
    // There isn't a direct listModels in the main SDK usually, 
    // but we can try to hit the discovery endpoint or just try gemini-pro
    console.log("Testing gemini-pro...");
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const result = await model.generateContent("Hello");
    console.log("✅ gemini-pro works!");
  } catch (e) {
    console.log("❌ gemini-pro failed:", e.message);
  }
  
  try {
    console.log("Testing gemini-1.5-flash-latest...");
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
    const result = await model.generateContent("Hello");
    console.log("✅ gemini-1.5-flash-latest works!");
  } catch (e) {
    console.log("❌ gemini-1.5-flash-latest failed:", e.message);
  }
}
listModels();
