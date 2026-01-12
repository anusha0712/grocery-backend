// Vercel Serverless Function - Proxies Anthropic API calls
// This keeps your API key secure on the backend

export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight OPTIONS request
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Get API key from environment variable
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  try {
    const { items, database } = req.body;

    if (!items || !Array.isArray(items)) {
      return res
        .status(400)
        .json({ error: "Invalid request: items array required" });
    }

    // Build prompt
    const prompt = `Correct these misspelled grocery items. They may contain spelling errors, phonetic errors, and Hinglish (Hindi-English mix).

Items to correct:
${items.map((item, i) => `${i + 1}. "${item}"`).join("\n")}

Common grocery items for reference: ${database || ""}

Return ONLY a JSON array with this exact format:
[
  {
    "original": "bred",
    "corrected": "Bread",
    "confidence": 0.95,
    "suggestions": ["Bread", "Bread Slices", "Brown Bread"]
  }
]

Rules:
- corrected: the most likely correct item name
- confidence: 0.0 to 1.0 (how confident you are in the correction)
- suggestions: array of 3 alternative corrections (best first, including the corrected one)
- For brand names, preserve exact spelling (e.g., "Cinthol" not "Dettol")
- Return ONLY valid JSON, no markdown, no explanation`;

    // Call Anthropic API
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Anthropic API Error:", error);
      return res
        .status(response.status)
        .json({ error: "API call failed", details: error });
    }

    const data = await response.json();
    const text = data.content[0].text;

    // Extract JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const results = JSON.parse(jsonMatch[0]);
      return res.status(200).json({ results });
    }

    return res
      .status(500)
      .json({ error: "No valid JSON in response", response: text });
  } catch (error) {
    console.error("Error:", error);
    return res
      .status(500)
      .json({ error: "Internal server error", message: error.message });
  }
}
