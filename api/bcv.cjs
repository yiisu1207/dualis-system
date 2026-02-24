// Vercel Serverless Function: /api/bcv
// Fetches the latest exchange rate from BCV (proxy to avoid CORS)

module.exports = async (req, res) => {
  try {
    // Usamos una API confiable de terceros que ya scrapea el BCV o intentamos directamente
    const response = await fetch('https://pydolarve.org/api/v1/dollar?page=bcv');
    const data = await response.json();
    
    // Estructura esperada de pydolarve o similar
    const rate = data?.monitors?.usd?.price || 0;

    if (!rate) {
      return res.status(502).json({ error: 'Could not fetch rate from BCV' });
    }

    return res.json({ 
      rate, 
      date: new Date().toISOString(),
      provider: 'BCV Official'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
