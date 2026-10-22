import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Slider from 'resource:///org/gnome/shell/ui/slider.js';

const CLIENTS_FILE = GLib.build_filenamev(
    [GLib.get_home_dir(), '.config', 'yo', 'clients.json']);
const CONTROL_FILE = GLib.build_filenamev(
    [GLib.get_user_runtime_dir(), 'yo', 'control']);

const GAIN_MIN = 0.0;
const GAIN_MAX = 4.0;

function plainLabel(text, style = '') {
    const lbl = new St.Label({ text: String(text), style });
    if (lbl.clutter_text) lbl.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
    return lbl;
}

function loadClients() {
    const file = Gio.File.new_for_path(CLIENTS_FILE);
    let contents;
    try {
        const [, bytes] = file.load_contents(null);
        contents = new TextDecoder().decode(bytes);
    } catch (e) {
        logError(e, `yo: cannot read ${CLIENTS_FILE}`);
        return null;
    }
    try {
        const parsed = JSON.parse(contents);
        if (!Array.isArray(parsed)) {
            log(`yo: ${CLIENTS_FILE} is not a JSON array`);
            return null;
        }
        return parsed.filter(c => c && typeof c.room === 'string');
    } catch (e) {
        logError(e, `yo: invalid JSON in ${CLIENTS_FILE}`);
        return null;
    }
}

function sendCommand(cmd) {
    try {
        const file = Gio.File.new_for_path(CONTROL_FILE);
        const ostream = file.append_to(Gio.FileCreateFlags.NONE, null);
        ostream.write_all(new TextEncoder().encode(cmd + '\n'), null);
        ostream.close(null);
    } catch (e) {
        logError(e, `yo: failed to send "${cmd}" to ${CONTROL_FILE}`);
    }
}

const YoIndicator = GObject.registerClass(
class YoIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, _('yo'));

        this._muted        = false;
        this._muteBtn      = null;
        this._panelIconBox = null;

        this._rowsByRoom   = new Map();
        this._placeholder  = null;
        this._clientsMon   = null;
        this._reloadTimer  = 0;

        this._panelIconBox = new St.Widget({ layout_manager: new Clutter.BinLayout() });
        this._panelIconBox.add_child(this._buildPanelIcon());
        this.add_child(this._panelIconBox);

        const popupWidth = Math.round(400 * 0.55);

        const root = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
        const content = new St.BoxLayout({
            vertical: true, x_expand: true,
            style: `min-width: ${popupWidth}px; max-width: ${popupWidth}px; `
                 + 'spacing: 8px; padding: 6px;',
        });
        root.add_child(content);
        this.menu.addMenuItem(root);

        const topRow = new St.BoxLayout({ x_expand: true, style: 'spacing: 6px;' });

        topRow.add_child(new St.Widget({ x_expand: true }));
        topRow.add_child(plainLabel('yo clients',
            'font-weight: bold; font-size: 1.1em; opacity: 0.9;'));
        topRow.add_child(new St.Widget({ x_expand: true }));

        this._muteBtn = new St.Button({ can_focus: true });
        this._muteBtn.connect('clicked', () => this._toggleMute());
        topRow.add_child(this._muteBtn);

        content.add_child(topRow);
        this._updateMuteIcon();

        this._rowsBox = new St.BoxLayout({
            vertical: true, x_expand: true, style: 'spacing: 8px;',
        });
        content.add_child(this._rowsBox);

        this._reloadClients();
        this._startMonitor();
    }

    _startMonitor() {
        try {
            const file = Gio.File.new_for_path(CLIENTS_FILE);
            this._clientsMon = file.monitor_file(Gio.FileMonitorFlags.NONE, null);
            this._clientsMon.connect('changed', () => this._scheduleReload());
        } catch (e) {
            logError(e, 'yo: failed to watch clients.json');
        }
    }

    _scheduleReload() {
        if (this._reloadTimer) GLib.source_remove(this._reloadTimer);
        this._reloadTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 120, () => {
            this._reloadTimer = 0;
            this._reloadClients();
            return GLib.SOURCE_REMOVE;
        });
    }

    _reloadClients() {
        const clients = loadClients();

        if (clients === null) {
            this._setPlaceholder(`could not read ${CLIENTS_FILE}`);
            return;
        }
        if (clients.length === 0) {
            this._setPlaceholder('no clients connected');
            return;
        }
        this._clearPlaceholder();

        const wanted = new Set(clients.map(c => c.room));

        for (const [room, row] of [...this._rowsByRoom]) {
            if (!wanted.has(room)) {
                if (row.gainTimer) GLib.source_remove(row.gainTimer);
                row.container.destroy();
                this._rowsByRoom.delete(room);
            }
        }

        for (const client of clients) {
            const existing = this._rowsByRoom.get(client.room);
            if (existing) {
                this._syncRowGain(existing, client);
            } else {
                const row = this._buildClientRow(client);
                this._rowsByRoom.set(client.room, row);
                this._rowsBox.add_child(row.container);
            }
        }
    }

    _syncRowGain(row, client) {
        row.client = client;

        let gain = parseFloat(client.gain);
        if (Number.isNaN(gain)) gain = 1.0;
        gain = Math.max(GAIN_MIN, Math.min(GAIN_MAX, gain));

        const current = GAIN_MIN + row.slider.value * (GAIN_MAX - GAIN_MIN);
        if (Math.abs(current - gain) < 0.05) return;
        if (Date.now() - row.lastUserSet < 800) return;

        row.syncing = true;
        row.slider.value = (gain - GAIN_MIN) / (GAIN_MAX - GAIN_MIN);
        row.syncing = false;
        row.val.set_text(`x${gain.toFixed(1)}`);
    }

    _setPlaceholder(text) {
        if (!this._placeholder) {
            this._placeholder = plainLabel(text,
                'font-size: 0.85em; opacity: 0.6; padding: 6px;');
            this._rowsBox.add_child(this._placeholder);
        } else {
            this._placeholder.set_text(text);
        }
        for (const row of this._rowsByRoom.values()) {
            if (row.gainTimer) GLib.source_remove(row.gainTimer);
            row.container.destroy();
        }
        this._rowsByRoom.clear();
    }

    _clearPlaceholder() {
        if (this._placeholder) {
            this._placeholder.destroy();
            this._placeholder = null;
        }
    }

    _toggleMute() {
        this._muted = !this._muted;
        sendCommand(this._muted ? 'mute all' : 'unmute all');
        this._updateMuteIcon();
        this._updatePanelIcon();
    }

    _updateMuteIcon() {
        if (!this._muteBtn) return;
        const base = 'font-size: 0.9em; font-weight: bold; '
                   + 'padding: 3px 10px; border-radius: 6px; ';
        if (this._muted) {
            this._muteBtn.set_style(
                base
              + 'border: 1px solid rgba(139, 92, 246, 0.9); '
              + 'background-color: rgba(139, 92, 246, 0.20); '
              + 'box-shadow: 0 0 10px rgba(139, 92, 246, 0.75);'
            );
            this._muteBtn.set_child(plainLabel('unmute', 'font-weight: bold;'));
        } else {
            this._muteBtn.set_style(
                base
              + 'border: 1px solid rgba(255,255,255,0.30); '
              + 'background-color: rgba(255,255,255,0.06);'
            );
            this._muteBtn.set_child(plainLabel('mute', 'font-weight: bold;'));
        }
    }

    _updatePanelIcon() {
        if (!this._panelIconBox) return;
        this._panelIconBox.destroy_all_children();
        this._panelIconBox.add_child(this._buildPanelIcon());
    }

    _buildPanelIcon() {
        return plainLabel(this._muted ? '🎙️❌' : '🎙️', 'font-size: 14px;');
    }

    _buildClientRow(client) {
        const container = new St.BoxLayout({
            vertical: true, x_expand: true,
            style: 'spacing: 4px; padding: 2px 0px;',
        });

        const headerRow = new St.BoxLayout({ x_expand: true, style: 'spacing: 6px;' });
        headerRow.add_child(plainLabel(client.room,
            'font-weight: bold; font-size: 0.95em; opacity: 0.9;'));
        container.add_child(headerRow);

        const row = new St.BoxLayout({ x_expand: true, style: 'spacing: 8px;' });

        const monBtn = new St.Button({ can_focus: true });
        monBtn._monOn = false;
        monBtn.set_child(plainLabel('👂', 'font-size: 14px;'));
        this._setMonStyle(monBtn, false);
        row.add_child(monBtn);

        let gain = parseFloat(client.gain);
        if (Number.isNaN(gain)) gain = 1.0;
        gain = Math.max(GAIN_MIN, Math.min(GAIN_MAX, gain));
        const initial = (gain - GAIN_MIN) / (GAIN_MAX - GAIN_MIN);

        const slider = new Slider.Slider(initial);
        slider.x_expand = true;
        slider.y_align  = Clutter.ActorAlign.CENTER;
        row.add_child(slider);

        const val = plainLabel(`x${gain.toFixed(1)}`,
            'width: 44px; text-align: right; font-size: 0.85em; opacity: 0.85;');
        row.add_child(val);

        const rec = {
            container, slider, val, monBtn,
            client,
            syncing: false,
            lastUserSet: 0,
            gainTimer: 0,
        };

        monBtn.connect('clicked', () => {
            monBtn._monOn = !monBtn._monOn;
            this._setMonStyle(monBtn, monBtn._monOn);
            sendCommand(`mon ${rec.client.room} ${monBtn._monOn ? 'on' : 'off'}`);
        });

        slider.connect('notify::value', () => {
            if (rec.syncing) return;
            const g = GAIN_MIN + slider.value * (GAIN_MAX - GAIN_MIN);
            val.set_text(`x${g.toFixed(1)}`);
            rec.lastUserSet = Date.now();
            this._scheduleGainSend(rec);
        });

        container.add_child(row);
        return rec;
    }

    _scheduleGainSend(rec) {
        if (rec.gainTimer) GLib.source_remove(rec.gainTimer);
        rec.gainTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 80, () => {
            rec.gainTimer = 0;
            const g = GAIN_MIN + rec.slider.value * (GAIN_MAX - GAIN_MIN);
            sendCommand(`vol ${rec.client.room} ${g.toFixed(2)}`);
            return GLib.SOURCE_REMOVE;
        });
    }

    _setMonStyle(btn, on) {
        const base = 'padding: 2px 8px; border-radius: 6px; ';
        if (on) {
            btn.set_style(base
              + 'border: 1px solid rgba(139, 92, 246, 0.9); '
              + 'background-color: rgba(139, 92, 246, 0.20); '
              + 'box-shadow: 0 0 10px rgba(139, 92, 246, 0.75);');
        } else {
            btn.set_style(base
              + 'border: 1px solid rgba(255,255,255,0.30); '
              + 'background-color: rgba(255,255,255,0.06);');
        }
    }

    cleanup() {
        if (this._clientsMon) {
            this._clientsMon.cancel();
            this._clientsMon = null;
        }
        if (this._reloadTimer) {
            GLib.source_remove(this._reloadTimer);
            this._reloadTimer = 0;
        }
        for (const row of this._rowsByRoom.values()) {
            if (row.gainTimer) {
                GLib.source_remove(row.gainTimer);
                row.gainTimer = 0;
            }
        }
    }
});

export default class YoExtension extends Extension {
    enable() {
        try {
            this._indicator = new YoIndicator();
        } catch (e) {
            logError(e, 'yo: indicator construction failed');
            this._indicator = this._makeErrorIndicator(e);
        }
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }
    disable() {
        this._indicator?.cleanup();
        this._indicator?.destroy();
        this._indicator = null;
    }
    _makeErrorIndicator(err) {
        const btn = new PanelMenu.Button(0.0, 'yo');
        btn.add_child(new St.Icon({
            icon_name: 'dialog-error-symbolic',
            style_class: 'system-status-icon',
        }));
        const item = new PopupMenu.PopupMenuItem(
            `yo failed to load:\n${err.message}`
        );
        item.reactive = false;
        btn.menu.addMenuItem(item);
        return btn;
    }
}
