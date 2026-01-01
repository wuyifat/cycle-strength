
import { GoogleGenAI, Type } from "@google/genai";
import { DayWorkout, Program, UserPlan } from "../types";

// Lazy initialization to avoid crash when API key is not set
let ai: GoogleGenAI | null = null;

const getAI = () => {
  if (!ai) {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error("Gemini API Key not configured. AI features are unavailable.");
    }
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
};

/**
 * Analyzes progress for a specific day and the overall program trajectory.
 */
export const analyzeProgress = async (program: Program, currentWorkout: DayWorkout) => {
  const model = "gemini-3-flash-preview";
  
  // Extract some history context for the model
  const historyEntries = Object.entries(program.history);
  const totalSessions = historyEntries.length;
  
  const prompt = `
    As an elite strength and conditioning coach, provide a "Strategic Performance Review".
    
    Current Session: Week ${currentWorkout.week}, Day ${currentWorkout.day}
    Exercises performed today:
    ${currentWorkout.exercises.map(e => `- ${e.name}: ${e.sets.map(s => `${s.weight}${program.plan.weightUnit} x ${s.reps}`).join(", ")} (Target Range: ${e.targetReps})`).join("\n")}
    
    Program Overview:
    - Program Name: ${program.name}
    - User's Goal: ${program.goal || "Not specified"}
    - Rep Cycle Plan: ${program.plan.cyclicalReps.join(", ")}
    - Total sessions logged in this program: ${totalSessions}
    
    Review Task:
    1. Evaluate today: Did they hit the targets?
    2. Evaluate program composition: Does the exercise selection and rep cycling logic (${program.plan.cyclicalReps.join(" -> ")}) align with the goal?
    3. Suggestions: How should they modify the plan (reps, sets, moves) to better achieve the goal?
    
    If User's Goal is "Not specified":
    - Summarize what this current plan is best for (e.g., strength, size, or endurance).
    - End by asking the user to choose a goal.
    
    Keep the response insightful, concise (under 100 words), and professional.
  `;

  try {
    const response = await getAI().models.generateContent({
      model,
      contents: prompt,
      config: {
        temperature: 0.7,
        thinkingConfig: { thinkingBudget: 0 }
      }
    });
    return response.text || "Analysis complete. Keep up the high intensity.";
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "AI analysis unavailable. Please configure API key or stay focused on your rep ranges.";
  }
};

/**
 * Uses Google Search to find popular workout plans and generates a structured program.
 */
export const generateAiProgram = async (goal: string, experience: string, daysPerWeek: number) => {
  const model = "gemini-3-pro-preview";
  
  const prompt = `
    Find a popular and effective ${goal} workout plan for a ${experience} level lifter, scheduled for ${daysPerWeek} days per week.
    
    Return a structured JSON object that exactly matches this format:
    {
      "name": "Name of the Program",
      "goal": "${goal}",
      "plan": {
        "daysPerWeek": ${daysPerWeek},
        "maxWeeks": 4,
        "cyclicalReps": ["8-12", "5-8", "8-12", "5-8"], 
        "weightUnit": "lb"
      },
      "history": {
        "W1_D1": {
          "week": 1,
          "day": 1,
          "exercises": [
            { "id": "unique1", "name": "Exercise Name", "targetReps": "8-12", "sets": [] }
          ]
        }
      }
    }
  `;

  try {
    const response = await getAI().models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            goal: { type: Type.STRING },
            plan: {
              type: Type.OBJECT,
              properties: {
                daysPerWeek: { type: Type.NUMBER },
                maxWeeks: { type: Type.NUMBER },
                cyclicalReps: { type: Type.ARRAY, items: { type: Type.STRING } },
                weightUnit: { type: Type.STRING }
              },
              required: ["daysPerWeek", "maxWeeks", "cyclicalReps", "weightUnit"]
            },
            history: { type: Type.OBJECT } 
          },
          required: ["name", "plan", "history"]
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Gemini Program Generation Error:", error);
    throw error;
  }
};
