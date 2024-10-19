/**
 * @name SyncPlugin
 * @version 0.6.3
 * @description Sync your BetterDiscord plugins across devices using a backend with authentication and background monitoring.
 * @author Mikka
 * @authorId 390527881891151872
 * @authorLink https://cvyl.me/
 * @website https://pet.pm/
 * @source https://github.com/pet-pm/sync-plugin
 * @donate https://github.com/sponsors/cvyl
 */

const config = {
    info: {
        name: "SyncPlugin",
        version: "0.6.3",
    },
    defaultConfig: [
        { type: "textbox", id: "serverURL", name: "Backend URL", note: "Enter the URL of your self-hosted sync backend.", value: "https://pet.pm" },
        { type: "textbox", id: "syncDelay", name: "Sync Delay (Milliseconds)", note: "Set the delay to check for file changes.", value: 60000 },
        { type: "switch", id: "autoSyncEnabled", name: "<span style='color: white;'>Enable Auto Sync</span>", value: true },
        { type: "switch", id: "isMaster", name: "<span style='color: white;'>Sync To Server (Master)</span>", value: true }
    ]
};

module.exports = class SyncPlugin {
    constructor() {
        this.settings = BdApi.loadData(config.info.name, "settings") || {};
        this.token = BdApi.loadData(config.info.name, "token") || null;
        this.lastSyncTime = BdApi.loadData(config.info.name, "lastSyncTime") || 0;
        this.syncDelay = this.settings.syncDelay || 60000;
        this.autoSyncEnabled = this.settings.autoSyncEnabled !== undefined ? this.settings.autoSyncEnabled : true;
        this.isMaster = this.settings.isMaster !== undefined ? this.settings.isMaster : true;
        this.pluginIndex = {};
    }

    load() {
        BdApi.showToast(`${config.info.name} loaded!`);
        const VERSION = config.info.version;
        console.info("%c >.< %c Initialized running %c" + VERSION + "%c https://github.com/pet-pm/sync-plugin", 
            "color: #fff; background: #CF9FFF; padding: 5px 0; margin: 1em 0;", 
            "color: #000; padding: 5px 0;", 
            "color: #CF9FFF; text-decoration: underline;", 
            "margin: 1em 0; padding: 5px 0; background: #efefef;"
        );
    }

    start() {
        BdApi.showToast("SyncPlugin started");
        if (this.token && this.autoSyncEnabled) {
            this.isMaster ? this.startPluginMonitoring() : this.syncFromServer();
        }
    }

    stop() {
        BdApi.showToast("SyncPlugin stopped");
        clearInterval(this.monitorInterval);
    }

    // Start monitoring the plugins folder and sync if there are changes
    startPluginMonitoring() {
        const fs = require("fs");
        const path = require("path");
        const pluginsFolder = BdApi.Plugins.folder;

        this.monitorInterval = setInterval(async () => {
            await this.syncPlugins();
        }, this.syncDelay);
    }

    canSyncNow() {
        return Date.now() - this.lastSyncTime >= 10 * 60 * 1000;
    }

    saveSettings(serverURL, syncDelay, autoSyncEnabled, isMaster) {
        this.settings.serverURL = serverURL;
        this.settings.syncDelay = parseInt(syncDelay);
        this.syncDelay = this.settings.syncDelay;
        this.settings.autoSyncEnabled = autoSyncEnabled;
        this.autoSyncEnabled = autoSyncEnabled;
        this.settings.isMaster = isMaster;
        this.isMaster = isMaster;
        BdApi.saveData(config.info.name, "settings", this.settings);
    }

    createElement(type, props = {}, innerHTML = "") {
        const el = document.createElement(type);
        Object.assign(el, props);
        if (innerHTML) el.innerHTML = innerHTML;
        return el;
    }

    getSettingsPanel() {
        const panel = this.createElement("div", { style: "padding: 10px" });
        const serverUrlDiv = this.createElement("div", {}, `<label style="font-weight: bold;">Backend URL:</label><input type="text" id="serverURL" value="${this.settings.serverURL || ''}" style="width: 100%; padding: 5px; margin-bottom: 10px;" />`);
        const syncDelayDiv = this.createElement("div", {}, `<label style="font-weight: bold;">Sync Delay (ms):</label><input type="number" id="syncDelay" value="${this.settings.syncDelay || 60000}" style="width: 100%; padding: 5px; margin-bottom: 10px;" />`);
        const autoSyncDiv = this.createElement("div", {}, `<label style="font-weight: bold;"><span style='color: white;'>Enable Auto Sync</span></label><input type="checkbox" id="autoSyncEnabled" ${this.settings.autoSyncEnabled ? "checked" : ""} />`);
        const masterSlaveDiv = this.createElement("div", {}, `<label style="font-weight: bold;"><span style='color: white;'>Sync To Server (Master)</span></label><input type="checkbox" id="isMaster" ${this.settings.isMaster ? "checked" : ""} />`);

        const saveButton = this.createElement("button", { style: "width: 100%; padding: 10px; background-color: #4CAF50; color: white; border: none; margin-bottom: 10px; cursor: pointer;", textContent: "Save Settings" });
        saveButton.onclick = () => {
            const serverURL = panel.querySelector("#serverURL").value;
            const syncDelay = panel.querySelector("#syncDelay").value;
            const autoSyncEnabled = panel.querySelector("#autoSyncEnabled").checked;
            const isMaster = panel.querySelector("#isMaster").checked;
            this.saveSettings(serverURL, syncDelay, autoSyncEnabled, isMaster);
            if (this.monitorInterval) clearInterval(this.monitorInterval);
            this.autoSyncEnabled && (this.isMaster ? this.startPluginMonitoring() : this.syncFromServer());
            BdApi.showToast("Settings saved!", { type: "success" });
        };

        const syncNowButton = this.createElement("button", { style: "width: 100%; padding: 10px; background-color: #008CBA; color: white; border: none; cursor: pointer;", textContent: this.isMaster ? "Sync Now (Master)" : "Sync Now (Slave)" });
        syncNowButton.onclick = async () => {
            if (this.canSyncNow()) {
                this.isMaster ? await this.syncPlugins() : await this.syncFromServer();
                this.lastSyncTime = Date.now();
                BdApi.saveData(config.info.name, "lastSyncTime", this.lastSyncTime);
            } else {
                BdApi.showToast(`Please wait ${Math.ceil((10 * 60 * 1000 - (Date.now() - this.lastSyncTime)) / 60000)} minute(s) before syncing again.`, { type: "error" });
            }
        };

        panel.append(serverUrlDiv, syncDelayDiv, autoSyncDiv, masterSlaveDiv, saveButton, syncNowButton);
        if (!this.token) panel.append(this.getLoginForm());
        else this.displayUserInfo(panel);
        return panel;
    }

    getLoginForm() {
        const form = this.createElement("div", { style: "margin-top: 20px" }, `
            <h3>Login</h3>
            <label for="userId">User ID:</label><input type="text" id="userId" placeholder="Enter your Discord User ID" style="width: 100%;" />
            <label for="password">Password:</label><input type="password" id="password" placeholder="Enter your password" style="width: 100%;" />
            <button id="submitLogin" style="width: 100%; padding: 10px; background-color: #4CAF50; color: white; border: none; margin-top: 10px; cursor: pointer;">Login</button>
        `);
        form.querySelector("#submitLogin").onclick = async () => {
            const userId = form.querySelector("#userId").value;
            const password = form.querySelector("#password").value;
            if (userId && password) {
                await this.submitLogin(userId, password);
            } else {
                BdApi.showToast("User ID and Password cannot be empty", { type: "error" });
            }
        };
        return form;
    }

    async submitLogin(userId, password) {
        const backendURL = this.settings.serverURL;
        try {
            const res = await fetch(`${backendURL}/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, password }),
            });
            const data = await res.json();
            if (res.ok) {
                this.token = data.token;
                BdApi.saveData(config.info.name, "token", this.token);
                this.reloadSettingsPanel();
                this.autoSyncEnabled && (this.isMaster ? this.startPluginMonitoring() : this.syncFromServer());
                BdApi.showToast(data.message || "Login successful!", { type: "success" });
            } else {
                BdApi.showToast(data.error || "Login failed!", { type: "error" });
            }
        } catch (error) {
            BdApi.showToast("Failed to connect to the server", { type: "error" });
        }
    }

    async fetchData(route) {
        const backendURL = this.settings.serverURL;
        try {
            const res = await fetch(`${backendURL}/protected/${route}`, {
                headers: { Authorization: `Bearer ${this.token}` },
            });
            if (res.ok) return await res.json();
            BdApi.showToast(`Failed to fetch ${route}`, { type: "error" });
            return null;
        } catch (error) {
            BdApi.showToast(`Error fetching ${route}: ${error.message}`, { type: "error" });
            return null;
        }
    }

    async displayUserInfo(panel) {
        const userInfo = await this.fetchData("user");
        const plugins = await this.fetchData("plugins");

        if (userInfo) {
            panel.append(this.createElement("div", { style: "margin-top: 20px" }, `<h3>User Info</h3><pre style="background-color: teal; color: white; padding: 10px;">${JSON.stringify(userInfo, null, 2)}</pre>`));
        }

        if (plugins) {
            panel.append(this.createElement("div", { style: "margin-top: 20px" }, `<h3>Your Plugins</h3><pre style="background-color: teal; color: white; padding: 10px;">${JSON.stringify(plugins, null, 2)}</pre>`));
        }

        const logoutButton = this.createElement("button", { style: "width: 100%; padding: 10px; background-color: #f44336; color: white; border: none; margin-top: 10px; cursor: pointer;", textContent: "Logout" });
        logoutButton.onclick = () => {
            this.token = null;
            BdApi.saveData(config.info.name, "token", null);
            this.reloadSettingsPanel();
            BdApi.showToast("Logged out!", { type: "success" });
        };
        panel.append(logoutButton);
    }

    async syncPlugins() {
        const fs = require("fs");
        const path = require("path");
        const pluginsFolder = BdApi.Plugins.folder;
        const pluginFiles = fs.readdirSync(pluginsFolder).filter(f => f.endsWith(".plugin.js"));
        let syncedPlugins = 0;

        // Upload new or modified plugins
        for (const file of pluginFiles) {
            const filePath = path.join(pluginsFolder, file);
            const lastModified = fs.statSync(filePath).mtime.getTime();
            if (!this.pluginIndex[file] || this.pluginIndex[file] !== lastModified) {
                const uploadSuccess = await this.uploadPlugin(file, fs.readFileSync(filePath));
                if (uploadSuccess) {
                    this.pluginIndex[file] = lastModified;
                    syncedPlugins++;
                }
            }
        }

        // Delete removed plugins
        for (const file in this.pluginIndex) {
            if (!pluginFiles.includes(file)) {
                const deleteSuccess = await this.deletePlugin(file);
                if (deleteSuccess) {
                    delete this.pluginIndex[file];
                    syncedPlugins++;
                }
            }
        }

        if (syncedPlugins > 0) {
            BdApi.showToast(`Synced ${syncedPlugins} plugin(s)`, { type: "success" });
        }
    }

    async syncFromServer() {
        const fs = require("fs");
        const path = require("path");
        const pluginsFolder = BdApi.Plugins.folder;
        const plugins = await this.fetchData("plugins");

        if (!plugins) return;

        for (const plugin of plugins) {
            const fileName = plugin.key.split("/").pop();
            const filePath = path.join(pluginsFolder, fileName);
            const response = await fetch(`${this.settings.serverURL}/protected/download-plugin?fileName=${encodeURIComponent(fileName)}`, {
                headers: { Authorization: `Bearer ${this.token}` },
            });
            if (response.ok) {
                const fileData = await response.arrayBuffer();
                fs.writeFileSync(filePath, Buffer.from(fileData));
                BdApi.showToast(`Downloaded ${fileName}`, { type: "success" });
            }
        }
    }

    async uploadPlugin(fileName, fileData) {
        try {
            const formData = new FormData();
            formData.append("file", new Blob([fileData]), fileName);
            const res = await fetch(`${this.settings.serverURL}/protected/upload-plugin`, {
                method: "POST",
                headers: { Authorization: `Bearer ${this.token}` },
                body: formData,
            });
            if (res.ok) {
                return true;
            } else {
                const errorData = await res.json();
                BdApi.showToast(`Failed to upload ${fileName}: ${errorData.error}`, { type: "error" });
                return false;
            }
        } catch (error) {
            BdApi.showToast(`Error uploading ${fileName}: ${error.message}`, { type: "error" });
            return false;
        }
    }

    async deletePlugin(fileName) {
        try {
            const res = await fetch(`${this.settings.serverURL}/protected/delete-plugin`, {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ fileName }),
            });
            if (res.ok) {
                return true;
            } else {
                const errorData = await res.json();
                BdApi.showToast(`Failed to delete ${fileName}: ${errorData.error}`, { type: "error" });
                return false;
            }
        } catch (error) {
            BdApi.showToast(`Error deleting ${fileName}: ${error.message}`, { type: "error" });
            return false;
        }
    }

    reloadSettingsPanel() {
        const panel = document.querySelector(".bd-settings .settings-right .plugin-settings");
        if (panel) {
            panel.innerHTML = "";
            panel.appendChild(this.getSettingsPanel());
        }
    }
};
