from flask import Flask, render_template, request, jsonify
import json
import requests
import os

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
    if not query:
        return jsonify([])

    url = "https://api.modrinth.com/v2/search"
    params = {
        "query": query,
        "facets": '[["categories:fabric"]]',
        "limit": 10
    }
    headers = {"User-Agent": USER_AGENT}

    try:
        resp = requests.get(url, params=params, headers=headers, timeout=10)

        if resp.status_code != 200:
            return jsonify([])

        hits = resp.json().get('hits', [])

        clean_hits = []
        for hit in hits:
            clean_hits.append({
                "title": hit.get('title'),
                "slug": hit.get('slug'),
                "description": hit.get('description'),
                "icon_url": hit.get('icon_url'),
                "client_side": hit.get('client_side') or 'required',
                "server_side": hit.get('server_side') or 'required'
            })

        return jsonify(clean_hits)

    except:
        return jsonify([])


# НОВЫЙ ЭНДПОИНТ - получение метаданных мода
@app.route('/api/project/<slug>', methods=['GET'])
def get_project_metadata(slug):
    """Получает полную информацию о проекте, включая client_side и server_side"""
    url = f"https://api.modrinth.com/v2/project/{slug}"
    headers = {"User-Agent": USER_AGENT}

    try:
        resp = requests.get(url, headers=headers, timeout=10)

        if resp.status_code != 200:
            return jsonify({"error": "not_found"})

        data = resp.json()

        return jsonify({
            "client_side": data.get('client_side') or 'required',
            "server_side": data.get('server_side') or 'required',
            "icon_url": data.get('icon_url'),
            "title": data.get('title')
        })

    except:
        return jsonify({"error": "api_error"})


@app.route('/api/check_version', methods=['POST'])
def check_version():
    """Проверяет версии для ОДНОГО мода"""
    slug = request.json.get('slug')
    versions_to_check = request.json.get('versions', [])

    if not slug or not versions_to_check:
        return jsonify({"error": "missing_params"})

    url = f"https://api.modrinth.com/v2/project/{slug}/version"
    params = {"loaders": json.dumps(["fabric"])}
    headers = {"User-Agent": USER_AGENT}

    try:
        resp = requests.get(url, params=params, headers=headers, timeout=10)

        if resp.status_code != 200:
            return jsonify({"error": f"api_error_{resp.status_code}"})

        data = resp.json()
        all_supported = set()

        for file_obj in data:
            game_versions = file_obj.get('game_versions', [])
            all_supported.update(game_versions)

        result = {v: (v in all_supported) for v in versions_to_check}
        return jsonify(result)

    except:
        return jsonify({"error": "timeout"})


if __name__ == '__main__':
    if not os.path.exists(DATA_FILE):
        save_data({
            "categories": [
                {"name": "Performance", "mods": [], "showExport": False},
                {"name": "Visuals", "mods": [], "showExport": False}
            ],
            "targetVersions": ["1.21.1", "1.21.2", "1.21.3", "1.21.4"]
        })

    print("🚀 ModStacker запущен: http://127.0.0.1:5000")
    app.run(debug=True, host='127.0.0.1', port=5000)
