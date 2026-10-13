import { GoogleGenAI, Type } from "@google/genai";

export const generateQuizQuestions = async (topic: string) => {
  const apiKey = (typeof process !== 'undefined' && process.env?.API_KEY) || 
                 (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY);

  if (!apiKey) {
    alert("Gemini API key is not configured. Please set GEMINI_API_KEY to use AI question generation, or use the Bulk JSON Import feature.");
    return [];
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Generate 5 multiple choice questions about "${topic}".`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING },
              options: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING },
                minItems: 4,
                maxItems: 4
              },
              correctAnswer: { type: Type.INTEGER, description: "Index (0-3) of the correct option" },
              timeLimit: { type: Type.INTEGER, description: "Seconds to answer (e.g., 20)" }
            },
            required: ["text", "options", "correctAnswer", "timeLimit"]
          }
        }
      }
    });

    const responseText = response.text;
    if (!responseText) {
      return [];
    }

    return JSON.parse(responseText.trim());
  } catch (e: any) {
    console.error("Failed to generate AI questions:", e);
    alert(`Could not generate questions: ${e?.message || 'Check your Gemini API key'}`);
    return [];
  }
};
