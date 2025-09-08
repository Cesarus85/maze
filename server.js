// server.js
import express from 'express';
// import OpenAI from 'openai'; // bei Bedarf einkommentieren

const app = express();
const PORT = process.env.PORT || 8787;
// const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

app.get('/api/maze', async (req, res) => {
  const size = Math.max(5, Math.min(parseInt(req.query.size || '15', 10), 41));
  const seed = (req.query.seed || Date.now().toString(36)).toString();
  const difficulty = (req.query.difficulty || 'medium');

  try {
    // if (openai) {
    //   const json = await fetchMazeFromOpenAI({ size, seed, difficulty });
    //   return res.json(json);
    // }

    // Fallback: triviales, aber gültiges Maze (Diagonale offen, nur als Platzhalter)
    const cells = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const cell = { x, y, N: true, E: true, S: true, W: true };
        // „Öffne“ grob einen Pfad diagonal (nur Demo)
        if (x < size - 1 && y === x) { cell.E = false; }
        if (y < size - 1 && y === x) { cell.S = false; }
        cells.push(cell);
      }
    }

    return res.json({
      version: 1,
      seed, gridSize: size,
      start: [0, 0],
      goal: [size - 1, size - 1],
      cells,
      guaranteedPath: Array.from({length: size}, (_, i) => [i, i])
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'maze_generation_failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Maze API listening on http://127.0.0.1:${PORT}`);
});

// async function fetchMazeFromOpenAI({ size, seed, difficulty }) {
//   const sys = `Du erzeugst ein zufälliges, lösbares Labyrinth als JSON ... (Schema wie oben).`;
//   const user = `gridSize=${size}, seed=${seed}, difficulty=${difficulty}`;
//   const resp = await openai.chat.completions.create({
//     model: 'gpt-4o-mini', // oder passendes Modell
//     messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
//     response_format: { type: 'json_object' }
//   });
//   const json = JSON.parse(resp.choices[0].message.content);
//   // TODO: Validierung (gridSize, cells-Länge, guaranteedPath-Konnektivität)
//   return json;
// }
