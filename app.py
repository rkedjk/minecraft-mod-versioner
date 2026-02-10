from flask import Flask, render_template, request, jsonify
import json
import requests
import os
import time

app = Flask(__name__)
DATA_FILE = 'mods.json'
USER_AGENT = "ModStacker/1.0 (local dev)"

# --- Работа с данными ---
def load_data():
    if not os.path.exists(DATA_FILE):
        return {"categories": []}
    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_data(data):
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

# --- Маршруты ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/data', methods=['GET'])
def get_data():
    return jsonify(load_data())

@app.route('/api/save', methods=['POST'])
def save_mods():
    data = request.json
    save_data(data)
    return jsonify({"status": "ok"})

@app.route('/api/search', methods=['GET'])
def search_modrinth():
    query = request.args.get('q')
    if not query: return jsonify([])
    
    url = "https://api.modrinth.com/v2/search"
    params = {
        "query": query,
        "facets": '[["categories:fabric"]]',
        "limit": 5
    }
    headers = {"User-Agent": USER_AGENT}
    
    try:
        resp = requests.get(url, params=params, headers=headers)
        return jsonify(resp.json().get('hits', []))
    except:
        return jsonify([])

@app.route('/api/check_version', methods=['POST'])
def check_version():
    """Проверяет версии для ОДНОГО мода (чтобы не вешать интерфейс)"""
    slug = request.json.get('slug')
    versions_to_check = request.json.get('versions', []) # ['1.21.1', '1.21.2'...]
    
    url = f"https://api.modrinth.com/v2/project/{slug}/version"
    params = {"loaders": json.dumps(["fabric"])}
    headers = {"User-Agent": USER_AGENT}
    
    try:
        resp = requests.get(url, params=params, headers=headers, timeout=5)
        if resp.status_code != 200:
            return jsonify({"error": "api_error", "supported": []})
            
        data = resp.json()
        all_supported = set()
        for file_obj in data:
            all_supported.update(file_obj['game_versions'])
            
        # Возвращаем карту: {"1.21.1": true, "1.21.2": false}
        result = {v: (v in all_supported) for v in versions_to_check}
        return jsonify(result)
        
    except Exception as e:
        return jsonify({"error": str(e), "supported": []})

if __name__ == '__main__':
    # При первом запуске создадим пустой файл, если нет
    if not os.path.exists(DATA_FILE):
        save_data({"categories": [
            {"name": "Performance", "mods": []},
            {"name": "Visuals", "mods": []}
        ]})
    
    print("Сервер запущен! Открой http://127.0.0.1:5000")
    app.run(debug=True)
