#!/bin/bash

echo "========================================"
echo "Установка окружения для Modrinth Checker"
echo "========================================"
echo

# Проверка наличия Python
if ! command -v python3 &> /dev/null; then
    echo "[ОШИБКА] Python3 не найден!"
    echo "Установите Python3 через пакетный менеджер"
    exit 1
fi

echo "[1/3] Python найден"
echo

# Создание виртуального окружения
echo "[2/3] Создание виртуального окружения..."
python3 -m venv venv

# Активация окружения и установка зависимостей
echo "[3/3] Установка зависимостей..."
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo
echo "========================================"
echo "Установка завершена!"
echo "========================================"
echo
echo "Для запуска:"
echo "  1. source venv/bin/activate"
echo "  2. python 1_name_to_slug.py"
echo "  3. python 2_vers
