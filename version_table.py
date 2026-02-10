import requests
import json
from datetime import datetime

# --- КОНФИГУРАЦИЯ ---
INPUT_FILE = "mod_slugs.json"
OUTPUT_FILE = "version_table.html"
USER_AGENT = "ModrinthVersionChecker/1.0 (contact@example.com)"

# Версии Minecraft для проверки
TARGET_VERSIONS = [f"1.21.{i}" for i in range(1, 12)]

def get_supported_versions(slug):
    """Получает все поддерживаемые версии Minecraft для мода"""
    url = f"https://api.modrinth.com/v2/project/{slug}/version"
    params = {"loaders": json.dumps(["fabric"])}
    headers = {"User-Agent": USER_AGENT}
    
    try:
        response = requests.get(url, headers=headers, params=params)
        if response.status_code != 200:
            return set()
        
        data = response.json()
        supported = set()
        
        for version_data in data:
            supported.update(version_data['game_versions'])
        
        return supported
    except Exception as e:
        print(f"⚠️  Ошибка при получении версий для {slug}: {e}")
        return set()

def generate_html_table(mods_data, version_matrix):
    """Генерирует красивую HTML таблицу"""
    
    html = f"""<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Таблица совместимости модов Fabric</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        
        body {{
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
            min-height: 100vh;
        }}
        
        .container {{
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
        }}
        
        .header {{
            background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }}
        
        .header h1 {{
            font-size: 2em;
            margin-bottom: 10px;
        }}
        
        .header p {{
            opacity: 0.9;
            font-size: 0.95em;
        }}
        
        .table-wrapper {{
            overflow-x: auto;
            padding: 20px;
        }}
        
        table {{
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
        }}
        
        thead {{
            background: #f1f5f9;
            position: sticky;
            top: 0;
        }}
        
        th {{
            padding: 15px 10px;
            text-align: left;
            font-weight: 600;
            color: #1e293b;
            border-bottom: 2px solid #cbd5e1;
        }}
        
        th:first-child {{
            width: 250px;
            position: sticky;
            left: 0;
            background: #f1f5f9;
            z-index: 10;
        }}
        
        tbody tr {{
            transition: background 0.2s;
        }}
        
        tbody tr:hover {{
            background: #f8fafc;
        }}
        
        td {{
            padding: 12px 10px;
            border-bottom: 1px solid #e2e8f0;
            text-align: center;
        }}
        
        td:first-child {{
            text-align: left;
            font-weight: 500;
            color: #334155;
            position: sticky;
            left: 0;
            background: white;
        }}
        
        tbody tr:hover td:first-child {{
            background: #f8fafc;
        }}
        
        .supported {{
            color: #10b981;
            font-size: 1.3em;
        }}
        
        .not-supported {{
            color: #ef4444;
            font-size: 1.3em;
        }}
        
        .footer {{
            text-align: center;
            padding: 20px;
            color: #64748b;
            font-size: 0.9em;
            border-top: 1px solid #e2e8f0;
        }}
        
        .stats {{
            display: flex;
            justify-content: space-around;
            padding: 20px;
            background: #f8fafc;
            border-bottom: 1px solid #e2e8f0;
        }}
        
        .stat-item {{
            text-align: center;
        }}
        
        .stat-number {{
            font-size: 2em;
            font-weight: bold;
            color: #3b82f6;
        }}
        
        .stat-label {{
            color: #64748b;
            font-size: 0.9em;
            margin-top: 5px;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎮 Таблица совместимости Fabric-модов</h1>
            <p>Minecraft 1.21.1 — 1.21.11 | Сгенерировано: {datetime.now().strftime('%d.%m.%Y %H:%M')}</p>
        </div>
        
        <div class="stats">
            <div class="stat-item">
                <div class="stat-number">{len(mods_data)}</div>
                <div class="stat-label">Модов проверено</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">{len(TARGET_VERSIONS)}</div>
                <div class="stat-label">Версий Minecraft</div>
            </div>
        </div>
        
        <div class="table-wrapper">
            <table>
                <thead>
                    <tr>
                        <th>Название мода</th>
"""
    
    # Заголовки версий
    for version in TARGET_VERSIONS:
        html += f"                        <th>{version}</th>\n"
    
    html += """                    </tr>
                </thead>
                <tbody>
"""
    
    # Строки с модами
    for mod in mods_data:
        if not mod['found']:
            continue
        
        slug = mod['slug']
        title = mod['title']
        supported_versions = version_matrix.get(slug, set())
        
        html += f"                    <tr>\n"
        html += f"                        <td>{title}</td>\n"
        
        for version in TARGET_VERSIONS:
            if version in supported_versions:
                html += f"                        <td class='supported'>✅</td>\n"
            else:
                html += f"                        <td class='not-supported'>❌</td>\n"
        
        html += f"                    </tr>\n"
    
    html += """                </tbody>
            </table>
        </div>
        
        <div class="footer">
            Данные получены через <a href="https://modrinth.com" target="_blank" style="color: #3b82f6;">Modrinth API</a>
        </div>
    </div>
</body>
</html>
"""
    
    return html

def main():
    print("=" * 70)
    print("СКРИПТ 2: Генерация HTML таблицы совместимости")
    print("=" * 70)
    print()
    
    # Загрузка JSON с модами
    try:
        with open(INPUT_FILE, 'r', encoding='utf-8') as f:
            mods_data = json.load(f)
    except FileNotFoundError:
        print(f"❌ Файл '{INPUT_FILE}' не найден!")
        print(f"   Сначала запустите: python 1_name_to_slug.py")
        return
    
   
