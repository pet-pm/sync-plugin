/**
 * @name SyncPlugin
 * @version 0.6.0
 * @description Sync your BetterDiscord plugins across devices using a backend with authentication and background monitoring.
 */

const config = {
    info: {
        name: "SyncPlugin",
        authors: [
            {
                name: "mwikka",
                discord_id: "390527881891151872",
                github_username: "cvyl",
            }
        ],
        version: "0.6.0",
        description: "Sync your BetterDiscord plugins across devices with authentication and background monitoring.",
    },
    defaultConfig: [
        {
            type: "textbox",
            id: "serverURL",
            name: "Backend URL (debug = http://localhost:8787)",
            note: "Enter the URL of your self-hosted sync backend.",
            value: "https://pet.pm"
        },
        {
            type: "textbox",
            id: "syncDelay",
            name: "Sync Delay (Milliseconds)",
            note: "Set the delay (in milliseconds) to check for file changes. Default: 60000 (1 minute).",
            value: 60000
        },
        {
            type: "switch",
            id: "autoSyncEnabled",
            name: "<span style='color: white;'>Enable Auto Sync</span>",
            note: "Enable or disable automatic background syncing of plugins.",
            value: true
        },
        {
            type: "switch",
            id: "isMaster",
            name: "<span style='color: white;'>Sync To Server (Master)</span>",
            note: "Toggle whether this instance should sync to the server (Master) or sync from the server (Slave).",
            value: true // Default is Master mode
        }
    ]
};

module.exports = class SyncPlugin {
    constructor() {
        this.settings = BdApi.loadData(config.info.name, "settings") || {};
        this.token = BdApi.loadData(config.info.name, "token") || null;
        this.syncDelay = this.settings.syncDelay || 60000; // Default 1-minute delay
        this.autoSyncEnabled = this.settings.autoSyncEnabled || true;
        this.isMaster = this.settings.isMaster !== undefined ? this.settings.isMaster : true; // Default to Master
        this.pluginIndex = {}; // Local index to track last modified times
        this.deletedPlugins = {}; // Local index to track deleted plugins
    }

    load() {
        BdApi.showToast(`${config.info.name} loaded!`);
    }

    start() {
        BdApi.showToast("SyncPlugin started");
        if (this.token && this.autoSyncEnabled) {
            if (this.isMaster) {
                this.startPluginMonitoring(); // Sync to server if master
            } else {
                this.syncFromServer(); // Sync from server if slave
            }
        }
    }

    stop() {
        BdApi.showToast("SyncPlugin stopped");
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval); // Stop monitoring when the plugin is stopped
        }
    }

    getSettingsPanel() {
        const panel = document.createElement("div");
        panel.style.padding = "10px";

        // Backend URL input
        const serverUrlDiv = document.createElement("div");
        serverUrlDiv.innerHTML = `
            <label for="serverURL" style="font-weight: bold;">Backend URL:</label>
            <input type="text" id="serverURL" value="${this.settings.serverURL || ''}" style="width: 100%; padding: 5px; margin-bottom: 10px;" />
        `;
        panel.appendChild(serverUrlDiv);

        // Sync Delay input
        const syncDelayDiv = document.createElement("div");
        syncDelayDiv.innerHTML = `
            <label for="syncDelay" style="font-weight: bold;">Sync Delay (ms):</label>
            <input type="number" id="syncDelay" value="${this.syncDelay || 60000}" style="width: 100%; padding: 5px; margin-bottom: 10px;" />
        `;
        panel.appendChild(syncDelayDiv);

        // Auto Sync toggle
        const autoSyncDiv = document.createElement("div");
        autoSyncDiv.innerHTML = `
            <label for="autoSyncEnabled" style="font-weight: bold;"><span style='color: white;'>Enable Auto Sync</span></label>
            <input type="checkbox" id="autoSyncEnabled" ${this.autoSyncEnabled ? "checked" : ""} />
        `;
        panel.appendChild(autoSyncDiv);

        // Master-Slave toggle
        const masterSlaveDiv = document.createElement("div");
        masterSlaveDiv.innerHTML = `
            <label for="isMaster" style="font-weight: bold;"><span style='color: white;'>Sync To Server (Master)</span></label>
            <input type="checkbox" id="isMaster" ${this.isMaster ? "checked" : ""} />
        `;
        panel.appendChild(masterSlaveDiv);

        // Save button for Backend URL and Sync Delay
        const saveButton = document.createElement("button");
        saveButton.textContent = "Save Settings";
        saveButton.style = "width: 100%; padding: 10px; background-color: #4CAF50; color: white; border: none; margin-bottom: 10px; cursor: pointer;";
        saveButton.onclick = () => {
            const serverURL = panel.querySelector("#serverURL").value;
            const syncDelay = panel.querySelector("#syncDelay").value;
            const autoSyncEnabled = panel.querySelector("#autoSyncEnabled").checked;
            const isMaster = panel.querySelector("#isMaster").checked;
            this.settings.serverURL = serverURL;
            this.syncDelay = parseInt(syncDelay);
            this.autoSyncEnabled = autoSyncEnabled;
            this.isMaster = isMaster;
            BdApi.saveData(config.info.name, "settings", this.settings);
            BdApi.showToast("Settings saved!", { type: "success" });
            // Restart monitoring based on new settings
            if (this.monitorInterval) {
                clearInterval(this.monitorInterval);
            }
            if (this.autoSyncEnabled) {
                if (this.isMaster) {
                    this.startPluginMonitoring(); // Sync to server if master
                } else {
                    this.syncFromServer(); // Sync from server if slave
                }
            }
        };
        panel.appendChild(saveButton);

        // Sync Now button
        const syncNowButton = document.createElement("button");
        syncNowButton.textContent = this.isMaster ? "Sync Now (Master)" : "Sync Now (Slave)";
        syncNowButton.style = "width: 100%; padding: 10px; background-color: #008CBA; color: white; border: none; cursor: pointer;";
        syncNowButton.onclick = () => {
            if (this.isMaster) {
                this.syncPlugins(); // Sync to server if master
            } else {
                this.syncFromServer(); // Sync from server if slave
            }
        };
        panel.appendChild(syncNowButton);

        // If not logged in, show login form
        if (!this.token) {
            panel.appendChild(this.getLoginForm());
        } else {
            // If logged in, show user info and plugins
            this.displayUserInfo(panel);
        }

        return panel;
    }

    // Create a login form where the user can manually enter userId and password
    getLoginForm() {
        const form = document.createElement("div");
        form.style.marginTop = "20px";
        form.innerHTML = `
            <h3>Login</h3>
            <div>
                <label for="userId">User ID:</label>
                <input type="text" id="userId" placeholder="Enter your Discord User ID" required style="width: 100%;" />
            </div>
            <div>
                <label for="password">Password:</label>
                <input type="password" id="password" placeholder="Enter your password" required style="width: 100%;" />
            </div>
            <button id="submitLogin" style="width: 100%; padding: 10px; background-color: #4CAF50; color: white; border: none; margin-top: 10px; cursor: pointer;">Login</button>
        `;

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

    // Submit login form data to backend
    async submitLogin(userId, password) {
        const backendURL = this.settings.serverURL;

        try {
            const response = await fetch(`${backendURL}/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ userId, password }),
            });

            const data = await response.json();

            if (response.ok) {
                BdApi.showToast(data.message || "Login successful!", { type: "success" });
                this.token = data.token;
                BdApi.saveData(config.info.name, "token", this.token);
                // Refresh the settings panel to display user info
                this.reloadSettingsPanel();
                // Start syncing plugins after login
                if (this.autoSyncEnabled) {
                    if (this.isMaster) {
                        this.startPluginMonitoring(); // Sync to server if master
                    } else {
                        this.syncFromServer(); // Sync from server if slave
                    }
                }
            } else {
                BdApi.showToast(data.error || "Login failed!", { type: "error" });
            }
        } catch (error) {
            BdApi.showToast("Failed to connect to the server", { type: "error" });
        }
    }

    // Display user info and plugins in settings panel
    async displayUserInfo(panel) {
        const userInfo = await this.fetchUserInfo();
        const plugins = await this.fetchPlugins();

        if (userInfo) {
            const userDiv = document.createElement("div");
            userDiv.style.marginTop = "20px";
            userDiv.innerHTML = `
                <h3>User Info</h3>
                <pre style="background-color: teal; color: white; padding: 10px;">${JSON.stringify(userInfo, null, 2)}</pre>
            `;
            panel.appendChild(userDiv);
        }

        if (plugins) {
            const pluginsDiv = document.createElement("div");
            pluginsDiv.style.marginTop = "20px";
            pluginsDiv.innerHTML = `
                <h3>Your Plugins</h3>
                <pre style="background-color: teal; color: white; padding: 10px;">${JSON.stringify(plugins, null, 2)}</pre>
            `;
            panel.appendChild(pluginsDiv);
        }

        // Add logout button
        const logoutButton = document.createElement("button");
        logoutButton.textContent = "Logout";
        logoutButton.style = "width: 100%; padding: 10px; background-color: #f44336; color: white; border: none; margin-top: 10px; cursor: pointer;";
        logoutButton.onclick = () => {
            this.token = null;
            BdApi.saveData(config.info.name, "token", null);
            BdApi.showToast("Logged out!", { type: "success" });
            this.reloadSettingsPanel();
        };
        panel.appendChild(logoutButton);
    }

    // Fetch user info from backend
    async fetchUserInfo() {
        const backendURL = this.settings.serverURL;

        try {
            const response = await fetch(`${backendURL}/protected/user`, {
                headers: {
                    "Authorization": `Bearer ${this.token}`,
                },
            });

            if (response.ok) {
                const data = await response.json();
                return data;
            } else {
                BdApi.showToast("Failed to fetch user info", { type: "error" });
                return null;
            }
        } catch (error) {
            BdApi.showToast("Failed to connect to the server", { type: "error" });
            return null;
        }
    }

    // Fetch user's plugins from backend
    async fetchPlugins() {
        const backendURL = this.settings.serverURL;

        try {
            const response = await fetch(`${backendURL}/protected/plugins`, {
                headers: {
                    "Authorization": `Bearer ${this.token}`,
                },
            });

            if (response.ok) {
                const data = await response.json();
                return data.plugins;
            } else {
                BdApi.showToast("Failed to fetch plugins", { type: "error" });
                return null;
            }
        } catch (error) {
            BdApi.showToast("Failed to connect to the server", { type: "error" });
            return null;
        }
    }

    // Start monitoring the plugins folder and sync plugins
    async startPluginMonitoring() {
        const fs = require("fs");
        const path = require("path");
        const pluginsFolder = BdApi.Plugins.folder;

        this.monitorInterval = setInterval(async () => {
            const pluginFiles = fs.readdirSync(pluginsFolder).filter(file => file.endsWith(".plugin.js"));
            let syncedPlugins = 0;

            for (const file of pluginFiles) {
                const filePath = path.join(pluginsFolder, file);
                const lastModified = fs.statSync(filePath).mtime.getTime();

                // Upload plugin if it's new or modified
                if (!this.pluginIndex[file] || this.pluginIndex[file] !== lastModified) {
                    const uploadSuccess = await this.uploadPlugin(file, fs.readFileSync(filePath));
                    if (uploadSuccess) {
                        this.pluginIndex[file] = lastModified; // Only update index if upload is successful
                        syncedPlugins++;
                    }
                }
            }

            // Check for deleted plugins on the local machine
            for (const file in this.pluginIndex) {
                if (!pluginFiles.includes(file)) {
                    const deleteSuccess = await this.deletePlugin(file);
                    if (deleteSuccess) {
                        delete this.pluginIndex[file]; // Only update index if delete is successful
                        syncedPlugins++;
                    }
                }
            }

            // Fetch plugins from the server to ensure consistency
            const serverPlugins = await this.fetchPlugins();

            // Delete any plugins on the server that no longer exist on the local machine (Master mode)
            if (this.isMaster && serverPlugins) {
                const serverPluginNames = serverPlugins.map(plugin => plugin.key.split('/').pop());
                for (const localPlugin of pluginFiles) {
                    if (!serverPluginNames.includes(localPlugin)) {
                        await this.deletePlugin(localPlugin); // Send delete request to server
                    }
                }
            }

            // In Slave mode, delete any plugins on the local machine that don't exist on the server
            if (!this.isMaster && serverPlugins) {
                const serverPluginNames = serverPlugins.map(plugin => plugin.key.split('/').pop());
                for (const localPlugin of pluginFiles) {
                    if (!serverPluginNames.includes(localPlugin)) {
                        fs.unlinkSync(path.join(pluginsFolder, localPlugin)); // Delete the local file
                        delete this.pluginIndex[localPlugin];
                        syncedPlugins++;
                    }
                }
            }

            if (syncedPlugins > 0) {
                BdApi.showToast(`Synced ${syncedPlugins} plugin(s)`, { type: "success" });
            }
        }, this.syncDelay);
    }

    // Sync all plugins from the server in slave mode
    async syncFromServer() {
        const backendURL = this.settings.serverURL;
        const fs = require("fs");
        const path = require("path");
        const pluginsFolder = BdApi.Plugins.folder;

        try {
            const plugins = await this.fetchPlugins();
            if (!plugins) return;

            plugins.forEach(async (plugin) => {
                const filePath = path.join(pluginsFolder, plugin.key.split('/').pop());
                const response = await fetch(`${backendURL}/protected/download-plugin?fileName=${plugin.key}`, {
                    headers: {
                        "Authorization": `Bearer ${this.token}`,
                    },
                });
                if (response.ok) {
                    const fileData = await response.arrayBuffer();
                    fs.writeFileSync(filePath, Buffer.from(fileData)); // Write the plugin file locally
                    BdApi.showToast(`Downloaded ${plugin.key}`, { type: "success" });
                }
            });
        } catch (error) {
            BdApi.showToast("Error syncing from server: " + error.message, { type: "error" });
        }
    }

    // Upload individual plugin to the backend
    async uploadPlugin(fileName, fileData) {
        const backendURL = this.settings.serverURL;

        try {
            const formData = new FormData();
            formData.append("file", new File([fileData], fileName));

            const response = await fetch(`${backendURL}/protected/upload-plugin`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${this.token}`,
                },
                body: formData,
            });

            if (response.ok) {
                return true;
            } else {
                const errorData = await response.json();
                BdApi.showToast(`Failed to upload ${fileName}: ${errorData.error}`, { type: "error" });
                return false;
            }
        } catch (error) {
            BdApi.showToast(`Error uploading ${fileName}: ${error.message}`, { type: "error" });
            return false;
        }
    }

    // Delete a plugin from the backend
    async deletePlugin(fileName) {
        const backendURL = this.settings.serverURL;

        try {
            const response = await fetch(`${backendURL}/protected/delete-plugin`, {
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${this.token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ fileName }),
            });

            if (response.ok) {
                return true;
            } else {
                const errorData = await response.json();
                BdApi.showToast(`Failed to delete ${fileName}: ${errorData.error}`, { type: "error" });
                return false;
            }
        } catch (error) {
            BdApi.showToast(`Error deleting ${fileName}: ${error.message}`, { type: "error" });
            return false;
        }
    }

    // Reload the settings panel
    reloadSettingsPanel() {
        const panel = document.querySelector(".bd-settings .settings-right .plugin-settings");
        if (panel) {
            panel.innerHTML = "";
            panel.appendChild(this.getSettingsPanel());
        }
    }
};
