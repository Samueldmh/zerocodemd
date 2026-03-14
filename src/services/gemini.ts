import { GoogleGenAI, Type } from "@google/genai";
import { Quiz } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

// Helper function to handle retries for 429 errors
async function withRetry<T>(operation: () => Promise<T>, maxRetries: number = 3): Promise<T> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await operation();
    } catch (error: any) {
      const isRateLimit = error.message?.includes('429') || error.message?.includes('quota');
      if (isRateLimit && attempt < maxRetries - 1) {
        attempt++;
        // Exponential backoff: 2s, 4s, 8s
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`Rate limit hit. Retrying in ${delay}ms... (Attempt ${attempt} of ${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
  throw new Error("Max retries exceeded");
}

export async function generateQuizFromContent(
  data: { mimeType: string; data: string }[],
  fileName: string,
  questionCount: number = 25,
  quizType: 'OBJECTIVE' | 'THEORY' = 'OBJECTIVE'
): Promise<{ quiz: Quiz; usage: any }> {
  const model = "gemini-3-flash-preview";
    const prompt = `
    Expert Medical Examiner Persona: Strictly analyze "${fileName}" to generate ${questionCount} ${quizType} questions.
    
    CONCISE EXAM STANDARDS (USMLE/PLAB/MRCP):
    1. ${quizType === 'OBJECTIVE' ? 'MCQ: 4 options, 1 correct. Format: Clinical vignette -> Question -> Options.' : 'THEORY: High-yield essay question.'}
    2. QUALITY: Focus on diagnostic reasoning and patient management.
    3. TOKEN EFFICIENCY: Be exhaustive in medical detail but extremely concise in phrasing. Avoid conversational filler.
    4. STUDY RESOURCE:
       - Objective: Explanation must clarify why the correct answer is right and distractors are wrong (Pathophysiology/Clinical Pearls).
       - Theory: Model Answer must be a "Gold Standard" structured response (Pathophysiology, Investigations, Management).
    5. DATA INTEGRITY: Citations required.
    
    Requirements:
    ${quizType === 'OBJECTIVE' ? 
      'MCQ format only. "type": "OBJECTIVE".' : 
      'Essay format only. "type": "THEORY". Include 3-10 "keyPoints" for marking. Set "options": [] and "correctAnswerIndex": -1.'}
  `;

  const parts = data.map(item => ({
    inlineData: {
      mimeType: item.mimeType,
      data: item.data,
    },
  }));

  const response = await withRetry(() => ai.models.generateContent({
    model: model,
    contents: [
      {
        parts: [
          ...parts,
          { text: prompt },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          type: { type: Type.STRING, enum: ["OBJECTIVE", "THEORY"] },
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                type: { type: Type.STRING, enum: ["OBJECTIVE", "THEORY"] },
                question: { type: Type.STRING },
                options: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                correctAnswerIndex: { type: Type.INTEGER },
                modelAnswer: { type: Type.STRING },
                keyPoints: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                explanation: { type: Type.STRING },
                citation: { type: Type.STRING },
              },
              required: ["id", "type", "question", "explanation", "citation", "options", "correctAnswerIndex"],
            },
          },
        },
        required: ["title", "type", "questions"],
      },
    },
  }));

  if (!response.text) {
    throw new Error("Failed to generate quiz content");
  }

  return {
    quiz: JSON.parse(response.text) as Quiz,
    usage: response.usageMetadata
  };
}

export async function generateQuizFromText(
  text: string, 
  fileName: string, 
  questionCount: number = 25,
  quizType: 'OBJECTIVE' | 'THEORY' = 'OBJECTIVE'
): Promise<{ quiz: Quiz; usage: any }> {
  const model = "gemini-3-flash-preview";
  
    const prompt = `
    Expert Medical Examiner Persona: Strictly analyze the provided text from "${fileName}" to generate ${questionCount} ${quizType} questions.
    
    CONTENT:
    ${text}
    
    CONCISE EXAM STANDARDS (USMLE/PLAB/MRCP):
    1. ${quizType === 'OBJECTIVE' ? 'MCQ: 4 options, 1 correct. Format: Clinical vignette -> Question -> Options.' : 'THEORY: High-yield essay question.'}
    2. QUALITY: Focus on diagnostic reasoning and patient management.
    3. TOKEN EFFICIENCY: Be exhaustive in medical detail but extremely concise in phrasing. Avoid conversational filler.
    4. STUDY RESOURCE:
       - Objective: Explanation must clarify why the correct answer is right and distractors are wrong (Pathophysiology/Clinical Pearls).
       - Theory: Model Answer must be a "Gold Standard" structured response (Pathophysiology, Investigations, Management).
    5. DATA INTEGRITY: Citations required.
    
    Requirements:
    ${quizType === 'OBJECTIVE' ? 
      'MCQ format only. "type": "OBJECTIVE".' : 
      'Essay format only. "type": "THEORY". Include 3-10 "keyPoints" for marking. Set "options": [] and "correctAnswerIndex": -1.'}
  `;

  const response = await withRetry(() => ai.models.generateContent({
    model: model,
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          type: { type: Type.STRING, enum: ["OBJECTIVE", "THEORY"] },
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                type: { type: Type.STRING, enum: ["OBJECTIVE", "THEORY"] },
                question: { type: Type.STRING },
                options: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                correctAnswerIndex: { type: Type.INTEGER },
                modelAnswer: { type: Type.STRING },
                keyPoints: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                explanation: { type: Type.STRING },
                citation: { type: Type.STRING },
              },
              required: ["id", "type", "question", "explanation", "citation", "options", "correctAnswerIndex"],
            },
          },
        },
        required: ["title", "type", "questions"],
      },
    },
  }));

  if (!response.text) {
    throw new Error("Failed to generate quiz content");
  }

  return {
    quiz: JSON.parse(response.text) as Quiz,
    usage: response.usageMetadata
  };
}
