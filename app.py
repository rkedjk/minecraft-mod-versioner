from flask import Flask, render_template, request, jsonify, send_file
import json
import requests
import zipfile
import tempfile
import os

app = Flask(__name__)

# Конфигурация
DATA_FILE = 'mods.json'
USER_AGENT = "ModStacker/1.0 (contact@example.com)"
REQUEST_TIMEOUT = 10


# ==================== УТИЛИТЫ ====================

def load_data():
    """Загружает данные из JSON файла"""
    if not os.path.exists(DATA_FILE):
        return {"categories": [], "targetVersions": []}
    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except json.JSONDecodeError:
        print("⚠️  Ошибка чтения JSON, создаём новый файл")
        return {"categories": [], "targetVersions": []}


def save_data(data):
    """Сохраняет данные в JSON файл"""
    try:
        with open(DATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"❌ Ошибка сохранения: {e}")
        return False


def make_modrinth_request(url, params=None, timeout=REQUEST_TIMEOUT):
    """Универсальная функция для запросов к Modrinth API"""
    headers = {"User-Agent": USER_AGENT}
    try:
        resp = requests.get(url, params=params, headers=headers, timeout=timeout)
        if resp.status_code == 200:
            return resp.json(), None
        else:
            return None, f"HTTP {resp.status_code}"
    except requests.exceptions.Timeout:
        return None, "timeout"
    except Exception as e:
        return None, str(e)


# ==================== МАРШРУТЫ ====================

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/data', methods=['GET'])
def get_data():
    """Возвращает все сохраненные данные"""
    return jsonify(load_data())


@app.route('/api/save', methods=['POST'])
def save_mods():
    """Сохраняет данные пользователя"""
    data = request.json
    if not data:
        return jsonify({"status": "error", "message": "No data provided"}), 400

    success = save_data(data)
    if success:
        return jsonify({"status": "ok"})
    else:
        return jsonify({"status": "error"}), 500


@app.route('/api/search', methods=['GET'])
def search_modrinth():
    """Поиск модов на Modrinth"""
    query = request.args.get('q', '').strip()
    if not query or len(query) < 2:
        return jsonify([])

    url = "https://api.modrinth.com/v2/search"
    params = {
        "query": query,
        "facets": '[["categories:fabric"]]',
        "limit": 10
    }

    data, error = make_modrinth_request(url, params)
    if error:
        print(f"⚠️  Search error: {error}")
        return jsonify([])

    hits = data.get('hits', [])
    clean_hits = []

    for hit in hits:
        clean_hits.append({
            "title": hit.get('title', 'Unknown'),
            "slug": hit.get('slug', ''),
            "description": hit.get('description', ''),
            "icon_url": hit.get('icon_url', ''),
            "client_side": hit.get('client_side') or 'required',
            "server_side": hit.get('server_side') or 'required'
        })

    return jsonify(clean_hits)


@app.route('/api/project/<slug>', methods=['GET'])
def get_project_metadata(slug):
    """Получает метаданные проекта (мода)"""
    url = f"https://api.modrinth.com/v2/project/{slug}"

    data, error = make_modrinth_request(url)
    if error:
        return jsonify({"error": error}), 404 if error == "HTTP 404" else 500

    return jsonify({
        "client_side": data.get('client_side') or 'required',
        "server_side": data.get('server_side') or 'required',
        "icon_url": data.get('icon_url'),
        "title": data.get('title')
    })


@app.route('/api/check_version', methods=['POST'])
def check_version():
    """Проверяет совместимость мода с указанными версиями Minecraft"""
    payload = request.json
    if not payload:
        return jsonify({"error": "missing_body"}), 400

    slug = payload.get('slug')
    versions_to_check = payload.get('versions', [])

    if not slug or not versions_to_check:
        return jsonify({"error": "missing_params"}), 400

    url = f"https://api.modrinth.com/v2/project/{slug}/version"
    params = {"loaders": json.dumps(["fabric"])}

    data, error = make_modrinth_request(url, params)
    if error:
        return jsonify({"error": error}), 500

    # Собираем все поддерживаемые версии
    all_supported = set()
    for version_obj in data:
        game_versions = version_obj.get('game_versions', [])
        all_supported.update(game_versions)

    # Возвращаем карту версий
    result = {v: (v in all_supported) for v in versions_to_check}
    return jsonify(result)


@app.route('/api/export_mrpack', methods=['POST'])
def export_mrpack():
    """Экспортирует категорию в .mrpack файл для Prism Launcher"""
    payload = request.json
    if not payload:
        return jsonify({"error": "missing_body"}), 400

    category_name = payload.get('category_name', 'ModPack')
    mods = payload.get('mods', [])
    mc_version = payload.get('mc_version', '1.21.11')

    if not mods:
        return jsonify({"error": "no_mods"}), 400

    # Собираем файлы для манифеста
    files = []
    for mod in mods:
        slug = mod.get('slug')
        if not slug:
            continue

        try:
            url = f"https://api.modrinth.com/v2/project/{slug}/version"
            params = {
                "loaders": json.dumps(["fabric"]),
                "game_versions": json.dumps([mc_version])
            }

            data, error = make_modrinth_request(url, params)
            if error or not data:
                print(f"⚠️  Skipping {slug}: {error}")
                continue

            if not data:  # Нет версий для этой версии MC
                print(f"⚠️  No version found for {slug} on {mc_version}")
                continue

            # Берём самую свежую версию
            latest = data[0]
            primary_file = next(
                (f for f in latest.get('files', []) if f.get('primary')),
                latest.get('files', [{}])[0] if latest.get('files') else None
            )

            if not primary_file:
                continue

            files.append({
                "path": f"mods/{primary_file['filename']}",
                "hashes": {
                    "sha1": primary_file['hashes']['sha1'],
                    "sha512": primary_file['hashes']['sha512']
                },
                "env": {
                    "client": mod.get('client_side', 'required'),
                    "server": mod.get('server_side', 'required')
                },
                "downloads": [primary_file['url']],
                "fileSize": primary_file['size']
            })

        except Exception as e:
            print(f"❌ Error processing {slug}: {e}")
            continue

    if not files:
        return jsonify({"error": "no_compatible_mods"}), 400

    # Создаём манифест
    manifest = {
        "formatVersion": 1,
        "game": "minecraft",
        "versionId": "1.0.0",
        "name": category_name,
        "summary": f"Generated by ModStacker - {len(files)} mods",
        "files": files,
        "dependencies": {
            "minecraft": mc_version,
            "fabric-loader": "0.16.10"
        }
    }

    # Создаём .mrpack (это ZIP с манифестом)
    try:
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.mrpack')
        with zipfile.ZipFile(temp_file.name, 'w', zipfile.ZIP_DEFLATED) as zipf:
            zipf.writestr('modrinth.index.json', json.dumps(manifest, indent=2))
        temp_file.close()

        filename = f"{category_name.replace(' ', '_')}.mrpack"

        return send_file(
            temp_file.name,
            mimetype='application/zip',
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        print(f"❌ Export error: {e}")
        return jsonify({"error": "export_failed"}), 500


# ==================== ЗАПУСК ====================

if __name__ == '__main__':
    # Инициализация при первом запуске
    if not os.path.exists(DATA_FILE):
        initial_data = {
            "categories": [
                {"name": "Performance", "mods": [], "showExport": False},
                {"name": "Visuals", "mods": [], "showExport": False}
            ],
            "targetVersions": ["1.21.1", "1.21.2", "1.21.3", "1.21.4"]
        }
        save_data(initial_data)
        print("✅ Создан новый файл данных")

    print("=" * 60)
    print("🚀 ModStacker запущен!")
    print("📍 Откройте: http://127.0.0.1:5000")
    print("=" * 60)

    app.run(debug=True, host='127.0.0.1', port=5000)
