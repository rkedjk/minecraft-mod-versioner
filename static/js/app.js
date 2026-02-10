function app() {
    return {
        data: { categories: [] },
        searchQuery: '',
        searchResults: [],
        isSearching: false,
        isSaving: false,
        isCheckingAll: false,
        checkProgress: '',
        targetVersions: ['1.21.1', '1.21.4', '1.21.11'],
        newVersion: '',
        draggedMod: null,
        draggedFromCategory: null,
        apiDelay: 200,
        apiCache: {},

        async initApp() {
            const resp = await fetch('/api/data');
            this.data = await resp.json();

            if (this.data.targetVersions) {
                this.targetVersions = this.data.targetVersions;
            }

            // Инициализация полей
            this.data.categories.forEach(cat => {
                if (cat.showExport === undefined) cat.showExport = false;
            });

            // НОВОЕ: Автоматическая подгрузка метаданных для старых модов
            await this.updateMissingMetadata();
        },

        // НОВАЯ ФУНКЦИЯ - обновляет метаданные для модов без client_side/server_side
        async updateMissingMetadata() {
            let needsUpdate = false;

            for (let cat of this.data.categories) {
                for (let mod of cat.mods) {
                    // Если у мода нет полей окружения - загружаем их
                    if (!mod.client_side || !mod.server_side) {
                        try {
                            await new Promise(r => setTimeout(r, 150)); // Задержка между запросами

                            const resp = await fetch(`/api/project/${mod.slug}`);
                            const metadata = await resp.json();

                            if (!metadata.error) {
                                mod.client_side = metadata.client_side;
                                mod.server_side = metadata.server_side;

                                // Обновляем иконку и название, если они изменились
                                if (metadata.icon_url) mod.icon_url = metadata.icon_url;
                                if (metadata.title) mod.title = metadata.title;

                                needsUpdate = true;
                            }
                        } catch(e) {
                            console.error(`Failed to load metadata for ${mod.slug}`);
                        }
                    }
                }
            }

            // Если были обновления - сохраняем
            if (needsUpdate) {
                await this.saveData();
            }
        },

        addVersion() {
            const ver = this.newVersion.trim();
            if (!ver) return;

            if (!/^\d+\.\d+(\.\d+)?$/.test(ver)) {
                alert('Неверный формат версии! Используйте формат: 1.21.5');
                return;
            }
            if (this.targetVersions.includes(ver)) {
                alert('Эта версия уже добавлена');
                return;
            }

            this.targetVersions.push(ver);
            this.targetVersions.sort();
            this.newVersion = '';
            this.resetChecks();
            this.saveData();
        },

        getEnvType(mod) {
            const client = mod.client_side;
            const server = mod.server_side;

            if (!client && !server) return 'both';

            if (client === 'required' && server === 'unsupported') return 'client';
            if (client === 'unsupported' && server === 'required') return 'server';
            if (client === 'required' && server === 'required') return 'both';

            if (client === 'optional' && server === 'optional') return 'optional';

            if ((client === 'required' && server === 'optional') ||
                (client === 'optional' && server === 'required')) return 'both';

            if (client === 'unsupported' || server === 'unsupported') {
                if (client === 'required') return 'client';
                if (server === 'required') return 'server';
            }

            return 'both';
        },

        removeVersion(idx) {
            this.targetVersions.splice(idx, 1);
            this.resetChecks();
            this.saveData();
        },

        async performSearch() {
            if (this.searchQuery.length < 2) {
                this.searchResults = [];
                return;
            }
            this.isSearching = true;
            try {
                const resp = await fetch(`/api/search?q=${encodeURIComponent(this.searchQuery)}`);
                this.searchResults = await resp.json();
            } catch(e) {
                console.error('Search error:', e);
            }
            this.isSearching = false;
        },

        addCategory() {
            this.data.categories.push({
                name: 'New Category',
                mods: [],
                showExport: false
            });
            this.saveData();
        },

        deleteCategory(idx) {
            if(confirm('Удалить категорию?')) {
                this.data.categories.splice(idx, 1);
                this.saveData();
            }
        },

        addToCategory(mod, targetCatIndex = 0) {
            if (this.data.categories.length === 0) this.addCategory();

            const exists = this.data.categories.some(c => c.mods.some(m => m.slug === mod.slug));
            if (exists) {
                alert('Этот мод уже добавлен!');
                return;
            }

            const client_side = mod.client_side || 'required';
            const server_side = mod.server_side || 'required';

            this.data.categories[targetCatIndex].mods.push({
                title: mod.title,
                slug: mod.slug,
                icon_url: mod.icon_url,
                client_side: client_side,
                server_side: server_side,
                checked: false,
                versions: {},
                checking: false
            });

            this.searchQuery = '';
            this.searchResults = [];

            const addedMod = this.data.categories[targetCatIndex].mods[
                this.data.categories[targetCatIndex].mods.length - 1
            ];
            this.checkMod(addedMod);
            this.saveData();
        },

        handleDragStart(event, catIndex, modIndex) {
            this.draggedMod = this.data.categories[catIndex].mods[modIndex];
            this.draggedFromCategory = catIndex;
            event.target.classList.add('dragging');
            event.dataTransfer.effectAllowed = 'move';
        },

        handleSearchDragStart(event, mod) {
            this.draggedMod = mod;
            this.draggedFromCategory = null;
            event.dataTransfer.effectAllowed = 'copy';
        },

        handleDrop(event, targetCatIndex) {
            event.preventDefault();
            if (!this.draggedMod) return;

            if (this.draggedFromCategory === null) {
                this.addToCategory(this.draggedMod, targetCatIndex);
            } else {
                const exists = this.data.categories[targetCatIndex].mods.some(m => m.slug === this.draggedMod.slug);

                if (!exists && targetCatIndex !== this.draggedFromCategory) {
                    const modIndex = this.data.categories[this.draggedFromCategory].mods.findIndex(m => m.slug === this.draggedMod.slug);
                    this.data.categories[this.draggedFromCategory].mods.splice(modIndex, 1);
                    this.data.categories[targetCatIndex].mods.push(this.draggedMod);
                    this.saveData();
                }
            }

            this.draggedMod = null;
            this.draggedFromCategory = null;
        },

        async checkMod(mod) {
            if (this.targetVersions.length === 0) {
                alert('Добавьте хотя бы одну версию для проверки');
                return;
            }

            mod.checking = true;
            try {
                const cacheKey = `${mod.slug}_${this.targetVersions.join('_')}`;

                if (this.apiCache[cacheKey]) {
                    mod.versions = this.apiCache[cacheKey];
                    mod.checked = true;
                    mod.checking = false;
                    return;
                }

                await new Promise(r => setTimeout(r, this.apiDelay));

                const resp = await fetch('/api/check_version', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ slug: mod.slug, versions: this.targetVersions })
                });

                const result = await resp.json();

                if (result.error) {
                    mod.versions = {};
                } else {
                    this.apiCache[cacheKey] = result;
                    mod.versions = result;
                }

                mod.checked = true;
            } catch (e) {
                console.error('Error checking mod:', e);
                mod.versions = {};
            } finally {
                mod.checking = false;
                this.saveData();
            }
        },

        async checkAll() {
            if (this.targetVersions.length === 0) {
                alert('Добавьте версии для проверки');
                return;
            }

            this.isCheckingAll = true;
            let total = 0;
            let current = 0;

            this.data.categories.forEach(c => total += c.mods.length);

            for (let cat of this.data.categories) {
                for (let mod of cat.mods) {
                    current++;
                    this.checkProgress = `${current}/${total}`;
                    await this.checkMod(mod);
                }
            }

            this.isCheckingAll = false;
            this.checkProgress = '';
        },

        resetChecks() {
            this.data.categories.forEach(c => c.mods.forEach(m => {
                m.checked = false;
                m.versions = {};
            }));
            this.apiCache = {};
            this.saveData();
        },

        async saveData() {
            this.isSaving = true;
            const payload = { ...this.data, targetVersions: this.targetVersions };

            try {
                await fetch('/api/save', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(payload)
                });
            } catch(e) {
                console.error('Save error:', e);
            }

            setTimeout(() => this.isSaving = false, 500);
        },

        exportCategory(category) {
            if (this.targetVersions.length === 0) return "Добавьте версии...";

            let text = "";
            category.mods.forEach(mod => {
                if (mod.checked && mod.versions) {
                    const hasSupport = Object.values(mod.versions).some(v => v === true);
                    if (hasSupport) text += `https://modrinth.com/mod/${mod.slug}\n`;
                }
            });
            return text || "Проверьте моды в этой категории...";
        }
    }
}
