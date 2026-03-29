// Debug Feed - On-screen live debug log

const MAX_ENTRIES = 200;

const CATEGORY_COLORS = {
    INIT:    '#00aaff',
    VOICE:   '#ff8800',
    NET:     '#00ff88',
    AUDIO:   '#ffff44',
    CMD:     '#ff44ff',
    INPUT:   '#44ddff',
    RENDER:  '#88ff44',
    ERROR:   '#ff3333',
    WARN:    '#ffaa00',
    INFO:    '#888888',
};

class DebugFeed {
    constructor() {
        this.entries = [];
        this.scrollEl = null;
        this.listEl = null;
        this.countEl = null;
        this.visible = true;
        this.startTime = performance.now();
        this.errorCount = 0;
        this.warnCount = 0;
    }

    attach(feedId) {
        const container = document.getElementById(feedId);
        if (!container) {
            console.warn('[DebugFeed] container not found:', feedId);
            return;
        }
        this.scrollEl = container.querySelector('.debug-feed-scroll');
        this.listEl   = container.querySelector('.debug-feed-list');
        this.countEl  = container.querySelector('.debug-feed-count');

        // Replay all buffered entries into DOM
        for (const entry of this.entries) {
            this._appendEntry(entry);
        }

        this.log('INIT', `DebugFeed UI attached — replayed ${this.entries.length} pre-attach entries`);
    }

    log(category, message, level = 'info') {
        const ts    = ((performance.now() - this.startTime) / 1000).toFixed(2);
        const cat   = String(category).toUpperCase();
        const msg   = String(message);
        const entry = { ts, category: cat, message: msg, level };

        this.entries.push(entry);
        if (this.entries.length > MAX_ENTRIES) {
            this.entries.shift();
        }

        if (level === 'error') this.errorCount++;
        if (level === 'warn')  this.warnCount++;

        // Mirror to browser console
        const prefix = `[DBG ${ts}s] [${cat}]`;
        if (level === 'error')      console.error(prefix, msg);
        else if (level === 'warn')  console.warn(prefix, msg);
        else                        console.log(prefix, msg);

        if (this.listEl) {
            this._appendEntry(entry);
        }

        this._updateCount();
    }

    error(category, message) {
        this.log(category, message, 'error');
    }

    warn(category, message) {
        this.log(category, message, 'warn');
    }

    _appendEntry(entry) {
        const item = document.createElement('div');
        item.className = 'debug-entry';
        if (entry.level === 'error') item.classList.add('debug-error');
        else if (entry.level === 'warn') item.classList.add('debug-warn');

        const color = entry.level === 'error' ? CATEGORY_COLORS.ERROR
                    : entry.level === 'warn'  ? CATEGORY_COLORS.WARN
                    : (CATEGORY_COLORS[entry.category] || CATEGORY_COLORS.INFO);

        item.innerHTML =
            `<span class="debug-ts">${entry.ts}s</span>` +
            ` <span class="debug-cat" style="color:${color}">[${entry.category}]</span>` +
            ` <span class="debug-msg">${this._esc(entry.message)}</span>`;

        this.listEl.appendChild(item);

        // Keep DOM trim
        while (this.listEl.children.length > MAX_ENTRIES) {
            this.listEl.removeChild(this.listEl.firstChild);
        }

        // Auto-scroll to newest
        if (this.scrollEl) {
            this.scrollEl.scrollTop = this.scrollEl.scrollHeight;
        }
    }

    _updateCount() {
        if (!this.countEl) return;
        const parts = [`${this.entries.length} entries`];
        if (this.errorCount > 0) parts.push(`${this.errorCount} ERR`);
        if (this.warnCount  > 0) parts.push(`${this.warnCount} WARN`);
        this.countEl.textContent = parts.join(' | ');
        this.countEl.style.color = this.errorCount > 0 ? '#ff3333'
                                 : this.warnCount  > 0 ? '#ffaa00' : '#555';
    }

    _esc(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    toggle() {
        this.visible = !this.visible;
        const el = document.getElementById('debug-feed');
        if (el) el.style.display = this.visible ? 'flex' : 'none';
        return this.visible;
    }

    clear() {
        this.entries = [];
        this.errorCount = 0;
        this.warnCount  = 0;
        if (this.listEl) this.listEl.innerHTML = '';
        this._updateCount();
    }
}

// Singleton exported for use across all modules
export const debugFeed = new DebugFeed();
