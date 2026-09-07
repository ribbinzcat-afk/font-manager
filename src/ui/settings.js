import { getSettings, setSetting } from "../store.js";
import { applyAll } from "../fontcss.js";
import { openPanel, closePanel } from "./panel.js";

export const WAND_BUTTON_ID = "font-manager-menu-button";

export function syncWandButtonVisibility() {
    $(`#${WAND_BUTTON_ID}`).toggle(Boolean(getSettings().enabled));
}

/** เติมค่าปัจจุบันลงในดรอเวอร์ตั้งค่า (เรียกตอนบูตและทุกครั้งที่ค่าถูกแก้จากที่อื่น) */
export function loadSettingsUi() {
    const settings = getSettings();
    $("#fm-enabled").prop("checked", settings.enabled);
    $("#fm-use-size").prop("checked", settings.useFontSize);
    $("#fm-size-slider").val(settings.fontSize);
    $("#fm-size-display").text(`${settings.fontSize}px`);
    $("#fm-size-row").toggle(settings.useFontSize);
    syncWandButtonVisibility();
}

export function bindSettingsHandlers() {
    $(document).on("input", "#fm-enabled", function () {
        const checked = Boolean($(this).prop("checked"));
        setSetting("enabled", checked);
        applyAll();
        syncWandButtonVisibility();
        if (!checked) closePanel();
    });

    $(document).on("click", "#fm-open-panel-btn", () => openPanel());

    $(document).on("input", "#fm-use-size", function () {
        const checked = Boolean($(this).prop("checked"));
        setSetting("useFontSize", checked);
        $("#fm-size-row").toggle(checked);
        applyAll();
    });

    $(document).on("input", "#fm-size-slider", function () {
        const value = Number($(this).val());
        setSetting("fontSize", value);
        $("#fm-size-display").text(`${value}px`);
        applyAll();
    });
}
