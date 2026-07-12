import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const extensionName = "font-manager";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    enabled: false,
    fontSize: 16,
    savedFonts: [],
    // ✨ [NEW] ตัวแปรสำหรับจำว่าตอนนี้กำลังกดใช้งานฟอนต์ใบไหนอยู่ (-1 คือยังไม่เลือก)
    activeFontIndex: -1
};

// ✨ [FIX] อัปเดตฟังก์ชันนี้เพื่อรองรับไฟล์ .ttf แบบลิงก์ตรง
function applyStylesToPage() {
    const settings = extension_settings[extensionName];

    // ลบสไตล์ของเก่าทิ้งก่อนเสมอ
    $("#font-manager-custom-style").remove();

    if (!settings.enabled) return;

    let css = "";

    if (settings.activeFontIndex >= 0 && settings.activeFontIndex < settings.savedFonts.length) {
        const activeFont = settings.savedFonts[settings.activeFontIndex];

        // ตรวจสอบว่าเป็นลิงก์ไฟล์ฟอนต์โดยตรงหรือไม่ (.ttf, .woff, .otf)
        // หรือมีลิงก์จาก imagekit ที่คุณ user ใช้
        const isDirectFontFile = activeFont.url.match(/\.(ttf|otf|woff|woff2)/i) || activeFont.url.includes("imagekit.io");

        if (isDirectFontFile) {
            // ถัาเป็นไฟล์ฟอนต์โดยตรง ต้องใช้ @font-face ในการสร้าง
            css += `
                @font-face {
                    font-family: '${activeFont.family}';
                    src: url('${activeFont.url}');
                }
            \n`;
        } else {
            // ถ้าเป็นลิงก์ CSS (เช่น Google Fonts) ค่อยใช้ @import
            css += `@import url('${activeFont.url}');\n`;
        }

        // บังคับใช้ชื่อฟอนต์ (ใส่ ' ' ครอบชื่อฟอนต์เพื่อความปลอดภัย)
        css += `html, body, textarea, input, .text_pole { font-family: '${activeFont.family}', sans-serif !important; }\n`;
    }

    // บังคับใช้ขนาดฟอนต์
    css += `html, body, textarea, input, .text_pole { font-size: ${settings.fontSize}px !important; }\n`;

    // เสกสไตล์ลงไปใน <head>
    $("<style>")
        .prop("id", "font-manager-custom-style")
        .html(css)
        .appendTo("head");
}

function renderFontCards() {
    const container = $("#font_manager_saved_cards");
    container.empty();

    const settings = extension_settings[extensionName];
    const fonts = settings.savedFonts;

    if (fonts.length === 0) {
        container.append(`<p style="opacity: 0.5; text-align: center;">ยังไม่มีฟอนต์ที่บันทึกไว้ค่ะ</p>`);
        return;
    }

    fonts.forEach((font, index) => {
        // เช็คว่าการ์ดใบนี้กำลังถูกใช้งานอยู่หรือเปล่า
        const isActive = index === settings.activeFontIndex;
        const bgColor = isActive ? "var(--SmartThemeQuoteColor)" : "var(--SmartThemeBlurTintColor)";
        const buttonText = isActive ? "✅ Active" : "✨ Apply";

        // ✨ [NEW] เพิ่มปุ่ม Apply และ Delete เข้าไปในการ์ด
        const cardHtml = `
            <div class="font-manager-card" data-index="${index}" style="border: 1px solid var(--SmartThemeBorderColor); padding: 10px; border-radius: 5px; margin-top: 10px; background: ${bgColor}; transition: 0.2s;">
                <div style="font-weight: bold;">📝 ${font.family}</div>
                <div style="font-size: 0.8em; opacity: 0.7; word-break: break-all; margin-bottom: 10px;">🔗 ${font.url}</div>
                <div class="flex-container gap-10">
                    <input class="menu_button font-manager-apply-card-btn" type="button" value="${buttonText}" />
                    <input class="menu_button font-manager-delete-card-btn" type="button" value="🗑️ Delete" />
                </div>
            </div>
        `;
        container.append(cardHtml);
    });
}

async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};

    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }

    if (!extension_settings[extensionName].savedFonts) extension_settings[extensionName].savedFonts = [];
    if (typeof extension_settings[extensionName].activeFontIndex === "undefined") extension_settings[extensionName].activeFontIndex = -1;

    $("#font_manager_enabled").prop("checked", extension_settings[extensionName].enabled);
    $("#font_manager_size_slider").val(extension_settings[extensionName].fontSize);
    $("#font_manager_size_display").text(extension_settings[extensionName].fontSize + "px");

    renderFontCards();
    applyStylesToPage(); // ✨ [NEW] เรียกใช้งานฟอนต์ตอนโหลด
}

function onCheckboxChange(event) {
    const value = Boolean($(event.target).prop("checked"));
    extension_settings[extensionName].enabled = value;
    saveSettingsDebounced();
    applyStylesToPage(); // ✨ [NEW] อัปเดตฟอนต์ทันทีที่ติ๊ก
}

function onFontSizeChange(event) {
    const value = $(event.target).val();
    extension_settings[extensionName].fontSize = Number(value);
    $("#font_manager_size_display").text(value + "px");
    saveSettingsDebounced();
    applyStylesToPage(); // ✨ [NEW] อัปเดตขนาดทันทีที่เลื่อน
}

function onSaveClick() {
    const urlValue = String($("#font_manager_url").val()).trim();
    const familyValue = String($("#font_manager_family").val()).trim();

    if (!urlValue || !familyValue) {
        toastr.warning("กรุณากรอกข้อมูลให้ครบทั้ง 2 ช่องนะคะ!", "Font Manager");
        return;
    }

    extension_settings[extensionName].savedFonts.push({
        url: urlValue,
        family: familyValue
    });

    saveSettingsDebounced();
    $("#font_manager_url").val("");
    $("#font_manager_family").val("");
    renderFontCards();
    toastr.success("บันทึกฟอนต์ใหม่เรียบร้อยแล้วค่ะ!", "Font Manager");
}

jQuery(async () => {
    console.log(`[${extensionName}] Loading...`);

    try {
        const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
        $("#extensions_settings2").append(settingsHtml);

        $("#font_manager_enabled").on("input", onCheckboxChange);
        $("#font_manager_size_slider").on("input", onFontSizeChange);
        $("#font_manager_save_btn").on("click", onSaveClick);

        // ✨ [NEW] ผูกเหตุการณ์คลิกให้ปุ่ม Apply ในการ์ด
        $("#font_manager_saved_cards").on("click", ".font-manager-apply-card-btn", function() {
            const index = $(this).closest('.font-manager-card').data("index");
            extension_settings[extensionName].activeFontIndex = index;
            saveSettingsDebounced();
            renderFontCards();
            applyStylesToPage();
            toastr.success("เปลี่ยนฟอนต์เรียบร้อยแล้วค่ะ!", "Font Manager");
        });

        // ✨ [NEW] ผูกเหตุการณ์คลิกให้ปุ่ม Delete ในการ์ด
        $("#font_manager_saved_cards").on("click", ".font-manager-delete-card-btn", function() {
            const index = $(this).closest('.font-manager-card').data("index");

            // ปรับตำแหน่ง activeFontIndex ถ้าย้ายหรือลบตัวที่ใช้อยู่
            if (extension_settings[extensionName].activeFontIndex === index) {
                extension_settings[extensionName].activeFontIndex = -1; // รีเซ็ตถ้าลบตัวที่ใช้อยู่
            } else if (extension_settings[extensionName].activeFontIndex > index) {
                extension_settings[extensionName].activeFontIndex--;
            }

            extension_settings[extensionName].savedFonts.splice(index, 1);
            saveSettingsDebounced();
            renderFontCards();
            applyStylesToPage();
        });

        loadSettings();

        console.log(`[${extensionName}] ✅ Loaded successfully`);
    } catch (error) {
        console.error(`[${extensionName}] ❌ Failed to load:`, error);
    }
});