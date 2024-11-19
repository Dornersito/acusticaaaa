from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from keras.models import load_model
import numpy as np
import librosa
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
from io import BytesIO
import requests
import soundfile as sf

app = Flask(__name__)

CORS(app, resources={
    r"/*": {
        "origins": ["http://localhost:3000", "http://127.0.0.1:3000"],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type"]
    }
})

client_id = "5e014985ad3b448a9a1941678627bcb4"
client_secret = "45bfe7fe93c14e578a40ac0dad5f63df"
spotify = spotipy.Spotify(auth_manager=SpotifyClientCredentials(client_id=client_id, 
                                                              client_secret=client_secret), 
                         requests_timeout=10, 
                         retries=3)

try:
    model = load_model('modelo_canciones_all_dropout2.keras')
    model_ft = load_model('modelo_canciones_features_nuevo2.keras')

    print()
except Exception as e:
    print(f"Error loading models: {str(e)}")
    raise

def load_song(track_id):
    """
    Carga una canción desde Spotify y retorna sus características de audio
    """
    try:
        track = spotify.track(track_id)
        preview_url = track['preview_url']

        if not preview_url:
            print(f"No preview available for track {track_id}")
            return None, None
            
        audio_content = requests.get(preview_url).content
        y, sr = librosa.load(BytesIO(audio_content), sr=None, duration=5.0)  
        return y, sr
    except Exception as e:
        print(f"Error loading song {track_id}: {str(e)}")
        return None, None

def mel_spectrogram(y, sr):  
    """
    Genera el espectrograma mel de una señal de audio
    """
    if y is None or sr is None:
        raise ValueError("Invalid audio data or sample rate")
        
    mel_spect = librosa.feature.melspectrogram(y=y, sr=sr)
    mel_spect_db = librosa.power_to_db(mel_spect, ref=np.max)
    mel_vector = mel_spect_db.ravel().tolist()      
    return mel_vector

def undo_mel(mel_vector, original_sr=22050*2, n_mels=128):
    mel_spect = np.array(mel_vector).reshape(n_mels, 431)
    
    mel_amplitude = librosa.db_to_power(mel_spect)
    
    n_fft = 2048
    hop_length = 512
    
    y_reconstructed = librosa.feature.inverse.mel_to_audio(
        mel_amplitude,
        sr=original_sr,
        n_fft=n_fft,
        hop_length=hop_length,
        window='hann',
        power=2.0,
        n_iter=64  # Más iteraciones para mejor reconstrucción
    )
    
    
    y_reconstructed = librosa.effects.deemphasis(y_reconstructed)
    
    
    y_filtered = librosa.effects.preemphasis(y_reconstructed, coef=0.97)
    
    return y_filtered*10, original_sr


def process_features(features_dict, sr):
    """
    Convierte el diccionario de características en un array ordenado
    """
    feature_order = [
        'danceability',
        'energy',
        'loudness',
        'speechiness',
        'acousticness',
        'instrumentalness',
        'liveness',
        'valence',
        'tempo'
    ]
    
    try:
        missing_features = [f for f in feature_order if f not in features_dict]
        if missing_features:
            raise ValueError(f"Missing features: {missing_features}")
            
        features_array = [float(features_dict[feature]) for feature in feature_order]

        print(features_array)
        
        if sr is not None:
            features_array.append(float(sr))
        else:
            features_array.append(22050.0)
            
        return features_array
    except Exception as e:
        raise ValueError(f"Error processing features: {str(e)}")

@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        features = data.get('features')
        track_id = data.get('track_id')

        if not features or not track_id:
            return jsonify({'error': 'Missing features or track_id'}), 400

        y, sr = load_song(track_id)

        try:
            features_array = process_features(features, sr)
        except ValueError as e:
            return jsonify({'error': str(e)}), 400

        if y is None or sr is None:
            prediction = model_ft({"input_general": np.array(features_array).astype(np.float32).reshape(1, -1)}, training=True).numpy()
        else:
            try:
                mel_spect = mel_spectrogram(y, sr)
                prediction = model({"input_general": np.array(features_array).astype(np.float32).reshape(1, -1),
                                    "input_mel": np.array(mel_spect).astype(np.float32).reshape(1, -1)}, training=True).numpy()
            except Exception as e:
                prediction = model_ft({"input_general": np.array(features_array).astype(np.float32).reshape(1, -1)}, training=True).numpy()

        probabilities = prediction[0].tolist()
        predicted_label = int(np.argmax(prediction, axis=1)[0])

        response_data = {
            'label': predicted_label,
            'probabilities': probabilities,
            'preview_available': y is not None,
            'track_id': track_id
        }

        # Devolver JSON con datos de predicción
        return jsonify(response_data)

    except Exception as e:
        print(f"Error in predict: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/audio/<track_id>', methods=['GET'])
def get_audio(track_id):
    try:
        y, sr = load_song(track_id)
        mel_spect = mel_spectrogram(y, sr)
        mel_array = np.array(mel_spect).reshape(128, -1)
        reconstructed_audio, rec_sr = undo_mel(mel_array)

        # Guardar audio reconstruido en un BytesIO
        audio_buffer = BytesIO()
        sf.write(audio_buffer, reconstructed_audio, rec_sr, format='WAV')
        audio_buffer.seek(0)

        # Enviar el archivo de audio
        return send_file(audio_buffer, mimetype='audio/wav', as_attachment=True, download_name='reconstructed_audio.wav')

    except Exception as e:
        print(f"Error in get_audio: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
