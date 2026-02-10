/**
 * ModStacker Application
 * Manages mod collections for Minecraft with version compatibility checking
 */

function app() {
    return {
        // ==================== STATE ====================
        data: { categories: [] },
        searchQuery: '',
        searchResults: [],
        isSearching: false,
        isSaving: false,
        isCheckingAll: false,
        checkProgress: '',
        targetVersions: ['1.21.1', '1.21.4'],
        newVersion: '',
        draggedMod: null,
        draggedFromCategory: null,
        apiDelay: 200,
        apiCache: {},

        // ==================== INITIALIZATION ====================

        /**
         * Инициализация приложения при загрузке
         */
        async initApp() {
            try {
                const resp = await fetch('/api/data');
                if (!resp.ok) throw new Error('Failed to load data');

                this.data = await resp.json();

                // Загружаем сохраненные версии
                if (this.data.targetVersions?.length > 0) {
                    this.targetVersions = this.data.targetVersions;
                }

                // Инициализируем флаги экспорта
                this.data.categories.forEach(cat => {
                    if (cat.showExport === undefined) cat.showExport = false;
                });

                // Обновляем метаданные для старых модов
                await this.updateMissingMetadata();

            } catch (error) {
                console.error('Init error:', error);
                alert('Ошибка загрузки данных. Проверьте консоль.');
            }
        },

        /**
         * Автоматическое обновление метаданных для модов без client_side/server_side
         */
        async updateMissingMetadata() {
            let needsUpdate = false;

            for (const cat of this.data.categories) {
                for (const mod of cat.mods) {
                    if (!mod.client_side || !mod.server_side) {
                        try {
                            await this.delay(150);

                            const resp = await fetch(`/api/project/${mod.slug}`);
                            const metadata = await resp.json();

                            if (!metadata.error) {
                                mod.client_side = metadata.client_side;
                                mod.server_side = metadata.server_side;
                                if (metadata.icon_url) mod.icon_url = metadata.icon_url;
                                if (metadata.title) mod.title = metadata.title;
                                needsUpdate = true;
                            }
                        } catch (error) {
                            console.warn(`Failed to update metadata for ${mod.slug}`);
                        }
                    }
                }
            }

            if (needsUpdate) await this.saveData();
        },

        // ==================== VERSION MANAGEMENT ====================

        /**
         * Добавляет новую версию Minecraft для проверки
         */
        addVersion() {
            const ver = this.newVersion.trim();

            if (!ver) return;

            // Проверка формата версии (например: 1.21 или 1.21.5)
            if (!/^\d+\.\d+(\.\d+)?$/.test(ver)) {
                alert('Неверный формат версии! Используйте формат: 1.21 или 1.21.5');
                return;
            }

            if (this.targetVersions.includes(ver)) {
                alert('Эта версия уже добавлена');
                return;
            }

            this.targetVersions.push(ver);
            this.targetVersions.sort((a, b) => {
                // Сортировка версий корректно (1.21.1 < 1.21.2 < 1.21.11)
                const aParts = a.split('.').map(Number);
                const bParts = b.split('.').map(Number);
                for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
                    const diff = (aParts[i] || 0) - (bParts[i] || 0);
                    if (diff !== 0) return diff;
                }
                return 0;
            });

            this.newVersion = '';
            this.resetChecks();
            this.saveData();
        },

        /**
         * Удаляет версию из списка
         */
        removeVersion(idx) {
            if (confirm('Удалить версию из проверки?')) {
                this.targetVersions.splice(idx, 1);
                this.resetChecks();
                this.saveData();
            }
        },

        /**
         * Сбрасывает все проверки версий
         */
        resetChecks() {
            this.data.categories.forEach(cat => {
                cat.mods.forEach(mod => {
                    mod.checked = false;
                    mod.versions = {};
                });
            });
            this.apiCache = {};
            this.saveData();
        },

        // ==================== CATEGORY MANAGEMENT ====================

        /**
         * Добавляет новую категорию
         */
        addCategory() {
            const newCategory = {
                name: 'New Category',
                mods: [],
                showExport: false
            };
            this.data.categories.push(newCategory);
            this.saveData();

            // Прокручиваем к новой категории
            this.$nextTick(() => {
                this.scrollToCategory(this.data.categories.length - 1);
            });
        },

        /**
         * Удаляет категорию
         */
        deleteCategory(idx) {
            const category = this.data.categories[idx];
            const modCount = category.mods.length;
            const message = modCount > 0
                ? `Удалить категорию "${category.name}" и ${modCount} мод(ов)?`
                : `Удалить категорию "${category.name}"?`;

            if (confirm(message)) {
                this.data.categories.splice(idx, 1);
                this.saveData();
            }
        },

        /**
         * Прокручивает страницу к категории
         */
        scrollToCategory(index) {
            const el = document.getElementById('cat-' + index);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        },

        // ==================== MOD MANAGEMENT ====================

        /**
         * Выполняет поиск модов на Modrinth
         */
        async performSearch() {
            if (this.searchQuery.length < 2) {
                this.searchResults = [];
                return;
            }

            this.isSearching = true;

            try {
                const resp = await fetch(`/api/search?q=${encodeURIComponent(this.searchQuery)}`);
                if (resp.ok) {
                    this.searchResults = await resp.json();
                } else {
                    console.error('Search failed:', resp.status);
                    this.searchResults = [];
                }
            } catch (error) {
                console.error('Search error:', error);
                this.searchResults = [];
            } finally {
                this.isSearching = false;
            }
        },

        /**
         * Добавляет мод в категорию
         */
        addToCategory(mod, targetCatIndex = 0) {
            // Создаём категорию если её нет
            if (this.data.categories.length === 0) {
                this.addCategory();
            }

            // Проверяем на дубликат
            const exists = this.data.categories.some(c =>
                c.mods.some(m => m.slug === mod.slug)
            );

            if (exists) {
                console.warn(`Mod ${mod.slug} already added`);
                return;
            }

            // Добавляем мод
            const newMod = {
                title: mod.title,
                slug: mod.slug,
                icon_url: mod.icon_url,
                client_side: mod.client_side || 'required',
                server_side: mod.server_side || 'required',
                checked: false,
                versions: {},
                checking: false
            };

            this.data.categories[targetCatIndex].mods.push(newMod);

            // Очищаем поиск
            this.searchQuery = '';
            this.searchResults = [];

            // Автоматически проверяем версии
            this.checkMod(newMod);
            this.saveData();
        },

        // ==================== DRAG & DROP ====================

        /**
         * Начало перетаскивания мода из списка
         */
        handleDragStart(event, catIndex, modIndex) {
            this.draggedMod = this.data.categories[catIndex].mods[modIndex];
            this.draggedFromCategory = catIndex;
            event.dataTransfer.effectAllowed = 'move';
            event.target.style.opacity = '0.5';
        },

        /**
         * Начало перетаскивания мода из поиска
         */
        handleSearchDragStart(event, mod) {
            this.draggedMod = mod;
            this.draggedFromCategory = null; // null = из поиска
            event.dataTransfer.effectAllowed = 'copy';
        },

        /**
         * Обработка сброса мода в категорию
         */
        handleDrop(event, targetCatIndex) {
            event.preventDefault();

            if (!this.draggedMod) return;

            // Если перетаскиваем из поиска
            if (this.draggedFromCategory === null) {
                this.addToCategory(this.draggedMod, targetCatIndex);
            }
            // Если перетаскиваем между категориями
            else {
                // Не перемещаем в ту же категорию
                if (this.draggedFromCategory === targetCatIndex) {
                    this.resetDragState();
                    return;
                }

                // Проверяем на дубликат
                const exists = this.data.categories[targetCatIndex].mods.some(
                    m => m.slug === this.draggedMod.slug
                );

                if (!exists) {
                    const sourceCat = this.data.categories[this.draggedFromCategory];
                    const modIndex = sourceCat.mods.findIndex(m => m.slug === this.draggedMod.slug);

                    if (modIndex > -1) {
                        // Удаляем из старой категории
                        sourceCat.mods.splice(modIndex, 1);
                        // Добавляем в новую
                        this.data.categories[targetCatIndex].mods.push(this.draggedMod);
                        this.saveData();
                    }
                }
            }

            this.resetDragState();
        },

        /**
         * Сбрасывает состояние перетаскивания
         */
        resetDragState() {
            this.draggedMod = null;
            this.draggedFromCategory = null;
            // Возвращаем прозрачность всем элементам
            document.querySelectorAll('[draggable]').forEach(el => {
                el.style.opacity = '1';
            });
        },

        // ==================== VERSION CHECKING ====================

        /**
         * Проверяет совместимость мода с выбранными версиями
         */
        async checkMod(mod) {
            if (this.targetVersions.length === 0) {
                alert('Добавьте хотя бы одну версию для проверки!');
                return;
            }

            mod.checking = true;

            try {
                const cacheKey = `${mod.slug}_${this.targetVersions.join('_')}`;

                // Используем кэш если есть
                if (this.apiCache[cacheKey]) {
                    mod.versions = this.apiCache[cacheKey];
                    mod.checked = true;
                    mod.checking = false;
                    return;
                }

                // Задержка для защиты от rate limit
                await this.delay(this.apiDelay);

                // Запрос к API
                const resp = await fetch('/api/check_version', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        slug: mod.slug,
                        versions: this.targetVersions
                    })
                });

                const result = await resp.json();

                if (!result.error) {
                    this.apiCache[cacheKey] = result;
                    mod.versions = result;
                } else {
                    console.warn(`Version check failed for ${mod.slug}:`, result.error);
                    mod.versions = {};
                }

                mod.checked = true;

            } catch (error) {
                console.error(`Error checking ${mod.slug}:`, error);
                mod.versions = {};
            } finally {
                mod.checking = false;
                this.saveData();
            }
        },

        /**
         * Проверяет все моды во всех категориях
         */
        async checkAll() {
            if (this.targetVersions.length === 0) {
                alert('Добавьте версии для проверки!');
                return;
            }

            this.isCheckingAll = true;

            // Подсчитываем общее количество модов
            let total = 0;
            this.data.categories.forEach(c => total += c.mods.length);

            if (total === 0) {
                alert('Нет модов для проверки!');
                this.isCheckingAll = false;
                return;
            }

            let current = 0;

            // Проверяем все моды
            for (const cat of this.data.categories) {
                for (const mod of cat.mods) {
                    current++;
                    this.checkProgress = `${current}/${total}`;
                    await this.checkMod(mod);
                }
            }

            this.isCheckingAll = false;
            this.checkProgress = '';
        },

        // ==================== EXPORT ====================

        /**
         * Экспортирует список ссылок на совместимые моды
         */
        exportCategory(category) {
            if (!category.mods || category.mods.length === 0) {
                return "Нет модов в категории";
            }

            const links = [];

            category.mods.forEach(mod => {
                if (mod.checked && mod.versions) {
                    const hasSupport = Object.values(mod.versions).some(v => v === true);
                    if (hasSupport) {
                        links.push(`https://modrinth.com/mod/${mod.slug}`);
                    }
                }
            });

            return links.length > 0
                ? links.join('\n')
                : "Проверьте совместимость модов";
        },

        /**
         * Экспортирует категорию в .mrpack файл для Prism Launcher
         */
        async exportMrpack(category) {
            if (!category.mods || category.mods.length === 0) {
                alert('В категории нет модов!');
                return;
            }

            const mcVersion = this.targetVersions[0] || '1.21.11';

            if (!confirm(`Экспортировать для версии ${mcVersion}?`)) {
                return;
            }

            try {
                const resp = await fetch('/api/export_mrpack', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        category_name: category.name,
                        mods: category.mods,
                        mc_version: mcVersion
                    })
                });

                if (resp.ok) {
                    const blob = await resp.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${category.name.replace(/\s+/g, '_')}.mrpack`;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                } else {
                    const error = await resp.json();
                    throw new Error(error.error || 'Export failed');
                }

            } catch (error) {
                console.error('Export failed:', error);
                alert(`Ошибка экспорта: ${error.message}`);
            }
        },

        // ==================== DATA PERSISTENCE ====================

        /**
         * Сохраняет данные на сервер
         */
        async saveData() {
            this.isSaving = true;

            try {
                const payload = {
                    ...this.data,
                    targetVersions: this.targetVersions
                };

                const resp = await fetch('/api/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!resp.ok) {
                    throw new Error('Save failed');
                }

            } catch (error) {
                console.error('Save error:', error);
                alert('Ошибка сохранения данных!');
            } finally {
                setTimeout(() => this.isSaving = false, 500);
            }
        },

        // ==================== UTILITIES ====================

        /**
         * Задержка выполнения
         */
        delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
    };
}
