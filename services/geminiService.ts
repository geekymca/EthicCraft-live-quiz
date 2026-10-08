import { GoogleGenAI, Type } from "@google/genai";

// Initialize Gemini with the required apiKey format from environment variables.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateQuizQuestions = async (topic: string) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
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

  // Correctly access the .text property of the response object.
  const responseText = response.text;
  if (!responseText) {
    return [];
  }

  try {
    return JSON.parse(responseText.trim());
  } catch (e) {
    console.error("Failed to parse AI response", e);
    return [];
  }
};
