
import { GoogleGenAI } from "@google/genai";

// Vite uses import.meta.env, not process.env
const API_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY;

let ai: GoogleGenAI | null = null;

// Only initialize if API key is available
if (API_KEY) {
  try {
    ai = new GoogleGenAI({ apiKey: API_KEY });
  } catch (error) {
    console.error("Failed to initialize Gemini client:", error);
  }
} else {
  console.warn("VITE_GEMINI_API_KEY is not set. Gemini API calls will be disabled. Chat functionality will use fallback responses.");
}

const model = 'gemini-2.5-flash';
const systemInstruction = `You are a world-class virtual librarian for an intelligent library management system called 'MyLibraryPal'.
Your purpose is to help users find books, papers, and information. You are helpful, concise, and knowledgeable.

Your responses are STRICTLY governed by the following rules:

1.  **Source of Truth:** You will be provided with search results from the library's database under the heading '--- SEARCH RESULTS ---'. This information is your ONLY source of truth. You MUST prioritize it above your own internal knowledge.
2.  **Direct Answering:** You MUST use the provided search results to answer the user's question. When you mention a paper, cite its full title and authors exactly as they appear in the results.
3.  **Handling Conflicts:** If any information in the search results (like author names or publication dates) conflicts with your general knowledge, you MUST ignore your general knowledge and treat the search results as correct. For example, if a paper is listed with a publication date of 2021 for an author who died earlier, you must state the publication date is 2021 as per the library record. DO NOT question or correct the library's data.
4.  **No Results:** If the search results section is empty or says "No relevant documents found", you MUST inform the user that you couldn't find any specific documents IN THE LIBRARY on that topic. Only then may you provide general knowledge from your own training.
5.  **No Hallucinations:** Do not make up papers, authors, or links. Your knowledge is confined to the provided context.`;

export const generateChatResponse = async (prompt: string): Promise<string> => {
  // If API key is not set, return a helpful fallback message
  if (!ai) {
    return "I'm currently running without AI capabilities. To enable the full chat experience, please set the VITE_GEMINI_API_KEY environment variable. However, I can still help you search the library database!";
  }

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.5,
        topP: 0.95,
      }
    });
    return response.text;
  } catch (error) {
    console.error("Gemini API call failed:", error);
    return "I'm sorry, I'm having trouble connecting to my knowledge base right now. Please try again later.";
  }
};