function app() {
    return {
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

        async initApp() {
            const resp = await fetch('/api/data');
            this.data = await resp.json();
            if (this.data.targetVersions) this.targetVersions = this.data.targetVersions;
            this.data.categories.forEach(cat => {
                if (cat.showExport === undefined) cat.showExport = false;
            });
            await this.updateMissingMetadata();
        },

        scrollToCategory(index) {
            const el = document.getElementById('cat-' + index);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },

        async updateMissingMetadata() {
            let needsUpdate = false;
            for (let cat of this.data.categories) {
                for (let mod of cat.mods) {
                    if (!mod.client_side || !mod.server_side) {
                        try {
                            await new Promise(r => setTimeout(r, 150));
                            const resp = await fetch(`/api/project/${mod.slug}`);
                            const metadata = await resp.json();
                            if (!metadata.error) {
                                mod.client_side = metadata.client_side;
                                mod.server_side = metadata.server_side;
                                if (metadata.icon_url) mod.icon_url = metadata.icon_url;
                                if (metadata.title) mod.title = metadata.title;
                                needsUpdate = true;
                            }
                        } catch(e) {}
                    }
                }
            }
            if (needsUpdate) await this.saveData();
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
            } catch(e) { console.error(e); }
            this.isSearching = false;
        },

        addCategory() {
            this.data.categories.push({ name: 'New Category', mods: [], showExport: false });
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
            if (exists) return;

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
            const newMod = this.data.categories[targetCatIndex].mods.slice(-1)[0];
            this.checkMod(newMod);
            this.saveData();
        },

        handleDragStart(event, catIndex, modIndex) {
            this.draggedMod = this.data.categories[catIndex].mods[modIndex];
            this.draggedFromCategory = catIndex;
            event.dataTransfer.effectAllowed = 'move';
            event.target.style.opacity = '0.5';
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
                if (this.draggedFromCategory === targetCatIndex) return;
                const exists = this.data.categories[targetCatIndex].mods.some(m => m.slug === this.draggedMod.slug);
                if (!exists) {
                    const oldCat = this.data.categories[this.draggedFromCategory];
                    const modIndex = oldCat.mods.findIndex(m => m.slug === this.draggedMod.slug);
                    if (modIndex > -1) {
                        oldCat.mods.splice(modIndex, 1);
                        this.data.categories[targetCatIndex].mods.push(this.draggedMod);
                        this.saveData();
                    }
                }
            }

            this.draggedMod = null;
            this.draggedFromCategory = null;
            document.querySelectorAll('[draggable]').forEach(el => el.style.opacity = '1');
        },

        async checkMod(mod) {
            if (this.targetVersions.length === 0) { alert('Добавьте версии!'); return; }
            mod.checking = true;
            try {
                const cacheKey = `${mod.slug}_${this.targetVersions.join('_')}`;
                if (this.apiCache[cacheKey]) {
                    mod.versions = this.apiCache[cacheKey];
                } else {
                    await new Promise(r => setTimeout(r, this.apiDelay));
                    const resp = await fetch('/api/check_version', {
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ slug: mod.slug, versions: this.targetVersions })
                    });
                    const res = await resp.json();
                    if (!res.error) { this.apiCache[cacheKey] = res; mod.versions = res; }
                }
                mod.checked = true;
            } catch(e) {}
            mod.checking = false;
            this.saveData();
        },

        async checkAll() {
            if (this.targetVersions.length === 0) { alert('Добавьте версии!'); return; }
            this.isCheckingAll = true;
            let total = 0;
            this.data.categories.forEach(c => total += c.mods.length);
            let current = 0;
            for (let cat of this.data.categories) {
                for (let mod of cat.mods) {
                    current++;
                    this.checkProgress = `${current}/${total}`;
                    await this.checkMod(mod);
                }
            }
            this.isCheckingAll = false;
        },

        resetChecks() {
            this.data.categories.forEach(c => c.mods.forEach(m => { m.checked = false; m.versions = {}; }));
            this.apiCache = {};
            this.saveData();
        },

        async saveData() {
            this.isSaving = true;
            try {
                await fetch('/api/save', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ ...this.data, targetVersions: this.targetVersions })
                });
            } catch(e) { console.error(e); }
            setTimeout(() => this.isSaving = false, 500);
        },

        exportCategory(cat) {
            let text = "";
            cat.mods.forEach(mod => {
                if (mod.checked && mod.versions) {
                    const hasSupport = Object.values(mod.versions).some(v => v === true);
                    if (hasSupport) text += `https://modrinth.com/mod/${mod.slug}\n`;
                }
            });
            return text || "No compatible mods.";
        }
    }
}
