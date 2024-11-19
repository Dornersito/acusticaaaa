import express from 'express';
import fetch from 'node-fetch';
import path from 'path';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
dotenv.config();
const app = express();
const PORT = 3000;

// Configura tus credenciales de la aplicación de Spotify
const clientId = process.env.TOKEN_ID; // Reemplaza con tu Client ID
const clientSecret = process.env.TOKEN_SECRET; // Reemplaza con tu Client Secret

// Middleware para analizar el cuerpo de las solicitudes
app.use(bodyParser.json());
app.use(express.static('public'));

// Función para obtener un token de acceso
async function getAccessToken() {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`,
  });

  if (!response.ok) {
    throw new Error('Error obtaining access token');
  }

  const data = await response.json();
  return data.access_token;
}

// Función para hacer solicitudes a la API de Spotify
async function fetchWebApi(endpoint, method, token, body) {
  const res = await fetch(`https://api.spotify.com/${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    method,
    body: body ? JSON.stringify(body) : null,
  });
  
  // Manejar la respuesta
  if (!res.ok) {
    throw new Error(`Error fetching data: ${res.statusText}`);
  }
  
  return await res.json();
}

// Endpoint para buscar canciones
app.get('/search', async (req, res) => {
  try {
    const token = await getAccessToken(); // Obtener el token de acceso
    const query = req.query.q;
    const result = await fetchWebApi(
      `v1/search?q=${encodeURIComponent(query)}&type=track&limit=5`,
      'GET',
      token // Pasar el token a la función
    );
    res.json(result.tracks.items);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error fetching tracks' });
  }
});

// Endpoint para obtener las características de la canción
app.get('/features/:id', async (req, res) => {
  try {
    const token = await getAccessToken(); // Obtener el token de acceso
    const trackId = req.params.id;
    const features = await fetchWebApi(`v1/audio-features/${trackId}`, 'GET', token);
    res.json(features);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error fetching track features' });
  }
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
