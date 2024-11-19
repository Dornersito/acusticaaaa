const searchInput = document.getElementById('search');
const suggestionsList = document.getElementById('suggestions');
const getFeaturesButton = document.getElementById('get-features');
const trackFeaturesDiv = document.getElementById('track-features');
let selectedTrackId = null;

// Buscar canciones mientras el usuario escribe
searchInput.addEventListener('input', async () => {
  const query = searchInput.value;
  if (query.length > 2) {
    const response = await fetch(`/search?q=${query}`);
    const tracks = await response.json();
    displaySuggestions(tracks);
  } else {
    suggestionsList.innerHTML = '';
  }
});

// Mostrar sugerencias debajo del cuadro de búsqueda
function displaySuggestions(tracks) {
  suggestionsList.innerHTML = '';
  tracks.forEach(track => {
    const li = document.createElement('li');
    li.classList.add('suggestion-item');

    const albumImage = document.createElement('img');
    albumImage.src = track.album.images[0]?.url || '';
    albumImage.alt = `${track.name} Album Cover`;
    albumImage.classList.add('album-image');

    const textContent = document.createTextNode(`${track.name} by ${track.artists.map(artist => artist.name).join(', ')}`);

    li.appendChild(albumImage);
    li.appendChild(textContent);
    li.addEventListener('click', () => selectTrack(track));
    suggestionsList.appendChild(li);
  });
}

// Seleccionar una canción de las sugerencias
function selectTrack(track) {
  selectedTrackId = track.id;
  searchInput.value = `${track.name} by ${track.artists.map(artist => artist.name).join(', ')}`;
  suggestionsList.innerHTML = '';
  getFeaturesButton.disabled = false;
}

// Obtener las características de la canción seleccionada
getFeaturesButton.addEventListener('click', async () => {
  if (selectedTrackId) {
    try {
      // Mostrar estado de carga
      const loadingDiv = document.createElement('div');
      loadingDiv.id = 'loading-status';
      loadingDiv.className = 'loading-status';
      loadingDiv.innerHTML = `
        <p>Procesando predicción...</p>
        <div class="spinner"></div>
      `;
      trackFeaturesDiv.innerHTML = '';
      trackFeaturesDiv.appendChild(loadingDiv);

      // Obtener características y hacer predicción en paralelo
      const [featuresResponse, predictionResponse] = await Promise.all([
        fetch(`/features/${selectedTrackId}`),
        fetch('http://127.0.0.1:5000/predict', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            features: await (await fetch(`/features/${selectedTrackId}`)).json(), 
            track_id: selectedTrackId 
          })
        })
      ]);

      const features = await featuresResponse.json();
      
      // Remover estado de carga una vez que tenemos la respuesta
      loadingDiv.remove();

      // Mostrar características de forma minimalista
      displayTrackFeatures(features);

      if (predictionResponse.ok) {
        const predictionData = await predictionResponse.json();
        const predictedLabel = predictionData.label;
        const probabilities = predictionData.probabilities;
        const emotion = getEmotion(predictedLabel);

        // Mostrar la predicción
        trackFeaturesDiv.innerHTML += `
          <div class="prediction-result">
            <h3>Resultado de la Predicción:</h3>
            <p><strong>Emoción predominante:</strong> <span class="emotion ${emotion.class}">${emotion.label}</span></p>
            <div class="probability-bars">
              <h4>Probabilidades por emoción:</h4>
              ${getProbabilityBarsHTML(probabilities)}
            </div>
          </div>
        `;

if (predictionData.preview_available) {
          // Indicador de carga mientras llega el preview
          trackFeaturesDiv.innerHTML += `
            <div id="audio-loading" class="loading-status">
              <p>Cargando preview de audio...</p>
              <div class="spinner"></div>
            </div>
          `;
          
          const audioResponse = await fetch(`http://127.0.0.1:5000/audio/${selectedTrackId}`);
          if (audioResponse.ok) {
            const audioBlob = await audioResponse.blob();
            const audioURL = URL.createObjectURL(audioBlob);
      
            // Mostrar el widget de audio y eliminar el indicador de carga
            document.getElementById('audio-loading').remove();
            trackFeaturesDiv.innerHTML += `
            <div class="audio-player">
              <audio controls>
                <source src="${audioURL}" type="audio/wav">
                Tu navegador no soporta el elemento de audio.
              </audio>
            </div>
          `;
          
          }
        }
      
      } else {
        const errorData = await predictionResponse.json();
        console.error('Error:', errorData.error);
        trackFeaturesDiv.innerHTML += `
          <div class="error-message">
            Error: ${errorData.error}
          </div>
        `;
      }
    } catch (error) {
      console.error('Error:', error);
      trackFeaturesDiv.innerHTML = `
        <div class="error-message">
          Error: ${error.message}
        </div>
      `;
    }
  }
});

function getProbabilityBarsHTML(probabilities) {
  const emotions = ['Sad', 'Happy', 'Energetic', 'Calm'];
  const classes = ['sad-bar', 'happy-bar', 'energetic-bar', 'calm-bar'];

  return emotions.map((emotion, index) => {
    const probability = (probabilities[index] * 100).toFixed(2);
    return `
      <div class="probability-bar-container">
        <div class="probability-label">${emotion}:</div>
        <div class="probability-bar-wrapper">
          <div class="probability-bar ${classes[index]}" 
               style="width: ${probability}%">
            <span class="probability-text">${probability}%</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}



// Mostrar las características de la canción de forma minimalista
function displayTrackFeatures(features) {
  const mainFeatures = {
    'Energía': features.energy,
    'Bailabilidad': features.danceability,
    'Valencia': features.valence,
    'Tempo': `${Math.round(features.tempo)} BPM`
  };

  const secondaryFeatures = {
    'Acústica': features.acousticness,
    'Instrumental': features.instrumentalness,
    'En vivo': features.liveness,
    'Voz hablada': features.speechiness,
    'Volumen': `${features.loudness} dB`,
    'Tonalidad': features.key,
    'Modo': features.mode
  };

  trackFeaturesDiv.innerHTML += `
    <div class="features-container">
      <button class="toggle-button" onclick="toggleFeatures()">
        Ver características detalladas
      </button>
      <div class="main-features">
        ${Object.entries(mainFeatures)
          .map(([key, value]) => `
            <div class="feature-item">
              <span class="feature-label">${key}</span>
              <span class="feature-value">${typeof value === 'number' ? value.toFixed(3) : value}</span>
            </div>
          `).join('')}
      </div>
      <div id="features-content" class="secondary-features hidden">
        ${Object.entries(secondaryFeatures)
          .map(([key, value]) => `
            <div class="feature-item">
              <span class="feature-label">${key}</span>
              <span class="feature-value">${typeof value === 'number' ? value.toFixed(2) : value}</span>
            </div>
          `).join('')}
      </div>
    </div>
  `;
}

function toggleFeatures() {
  const content = document.getElementById('features-content');
  const button = document.querySelector('.toggle-button');
  const isHidden = content.classList.toggle('hidden');
  button.textContent = isHidden ? 'Ver características detalladas' : 'Ocultar características';
}

function getEmotion(label) {
  const emotions = [
    { label: 'Sad', class: 'sad' },
    { label: 'Happy', class: 'happy' },
    { label: 'Energetic', class: 'energetic' },
    { label: 'Calm', class: 'calm' }
  ];
  return emotions[label] || { label: 'Unknown', class: 'unknown' };
}