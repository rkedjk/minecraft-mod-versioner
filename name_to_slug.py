import requests
import json
import time

# --- КОНФИГУРАЦИЯ ---
INPUT_FILE = "mod_names.txt"
OUTPUT_FILE = "mod_slugs.json"
USER_AGENT = "ModrinthVersionChecker/1.0 (contact@example.com)"

def search_mod_slug(query):
    """Ищет мод на Modrinth и возвращает slug и полное имя"""
    url = "https://api.modrinth.com/v2/search"
    
    facets = '[["categories:fabric"]]'  # Только Fabric
    
    params = {
        "query": query,
        "facets": facets,
        "limit": 1
    }
    
    headers = {"User-Agent": USER_AGENT}

    try:
        response = requests.get(url, params=params, headers=headers)
        if response.status_code == 200:
            data = response.json()
            if data['hits']:
                hit = data['hits'][0]
                return {
                    "search_name": query.strip(),
                    "slug": hit['slug'],
                    "title": hit['title'],
                    "found": True
                }
        return {
            "search_name": query.strip(),
            "slug": None,
            "title": None,
            "found": False
        }
    except Exception as e:
        print(f"⚠️  Ошибка при поиске '{query}': {e}")
        return {
            "search_name": query.strip(),
            "slug": None,
            "title": None,
            "found": False,
            "error": str(e)
        }

def main():
    print("=" * 70)
    print("СКРИПТ 1: Поиск Slug по именам модов")
    print("=" * 70)
    print()
    
    # Чтение файла с именами
    try:
        with open(INPUT_FILE, 'r', encoding='utf-8') as f:
            mod_names = [line.strip() for line in f if line.strip()]
    except FileNotFoundError:
        print(f"❌ Файл '{INPUT_FILE}' не найден!")
        print(f"   Создайте файл и добавьте названия модов (по одному на строку)")
        return
    
    if not mod_names:
        print(f"❌ Файл '{INPUT_FILE}' пуст!")
        return
    
    print(f"📄 Загружено {len(mod_names)} модов из '{INPUT_FILE}'")
    print()
    
    results = []
    
    print(f"{'Поиск...':<30} | {'Результат':<40}")
    print("-" * 73)
    
    for name in mod_names:
        result = search_mod_slug(name)
        results.append(result)
        
        if result['found']:
            print(f"{name:<30} | ✅ {result['title']} ({result['slug']})")
        else:
            print(f"{name:<30} | ❌ Не найдено")
        
        time.sleep(0.3)  # Защита от rate limit
    
    # Сохранение в JSON
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    print()
    print("=" * 70)
    found_count = sum(1 for r in results if r['found'])
    print(f"✅ Найдено: {found_count}/{len(results)}")
    print(f"💾 Результаты сохранены в '{OUTPUT_FILE}'")
    print()
    print(f"➡️  Запустите следующий скрипт: python 2_version_table.py")
    print("=" * 70)

if __name__ == "__main__":
    main()
