import { eventSource, event_types } from "../../../events.js";

import { extensionName, extensionFolderPath, getSettings } from "./src/store.js";
import { applyAll } from "./src/fontcss.js";
import { togglePanel } from "./src/ui/panel.js";
import { loadSettingsUi, bindSettingsHandlers, syncWandButtonVisibility, WAND_BUTTON_ID } from "./src/ui/settings.js";

/** เพิ่มปุ่มลัดในเมนูไม้กายสิทธิ์ (#extensionsMenu) — extension third-party ไม่มี container จองไว้ให้ */
function mountWandButton() {
    if ($(`#${WAND_BUTTON_ID}`).length) return;

    const button = $(`
        <div id="${WAND_BUTTON_ID}" class="list-group-item flex-container flexGap5 interactable" tabindex="0">
            <div class="fa-solid fa-font extensionsMenuExtensionButton"></div>
            <span>Font Manager</span>
        </div>`);

    button.on("click", () => togglePanel());
    $("#extensionsMenu").append(button);
    syncWandButtonVisibility();
}

jQuery(async () => {
    console.log(`[${extensionName}] Loading...`);

    try {
        getSettings(); // ทริกเกอร์การย้าย schema เก่า (ถ้ามี) ให้เสร็จก่อนวาด UI ใดๆ

        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        $("#extensions_settings2").append(settingsHtml);

        bindSettingsHandlers();
        loadSettingsUi();
        mountWandButton();
        applyAll();

        // Custom CSS ของธีม / การสลับธีมจะฉีด <style> ใหม่เข้า <head> ทีหลังได้ — ยืนยันฟอนต์ของเราซ้ำทุกครั้ง
        eventSource.on(event_types.SETTINGS_UPDATED, () => applyAll());

        console.log(`[${extensionName}] ✅ Loaded successfully`);
    } catch (error) {
        console.error(`[${extensionName}] ❌ Failed to load:`, error);
        toastr.error("โหลด Font Manager ไม่สำเร็จ (ดู console)", "Font Manager");
    }
});
