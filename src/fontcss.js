import { getSettings } from "./store.js";

export const STYLE_ID = "font-manager-style";
export const GFONT_LINK_CLASS = "fm-gfont-link";

/**
 * escape ค่าที่จะฝังในสตริง CSS ที่ครอบด้วยเครื่องหมายคำพูดคู่ (เช่น font-family: "...")
 * @param {string} value
 * @returns {string}
 */
function cssString(value) {
    return String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

/**
 * เดายังไม่ครอบ ตรวจ font-weight ว่าอยู่ในรูปแบบที่ปลอดภัยจริง (ป้องกัน CSS injection จากข้อมูลเก่า/แก้มือ)
 * รองรับทั้งค่าตายตัว ("400") และช่วงของ variable font ("100 900")
 * @param {string} weight
 * @returns {string}
 */
function sanitizeWeight(weight) {
    const value = String(weight ?? "400").trim();
    return /^[1-9][0-9]{0,2}(\s[1-9][0-9]{0,2})?$/.test(value) ? value : "400";
}

function sanitizeStyle(style) {
    const value = String(style ?? "normal").trim().toLowerCase();
    return ["normal", "italic", "oblique"].includes(value) ? value : "normal";
}

function sanitizeFormat(format) {
    const value = String(format ?? "").trim().toLowerCase();
    const known = ["woff2", "woff", "truetype", "opentype", "embedded-opentype", "svg"];
    return known.includes(value) ? value : "";
}

/** ชื่อ font-family ภายในที่ extension นี้ใช้อ้างถึงฟอนต์ไฟล์แต่ละใบ (ไม่ใช่ label ที่ผู้ใช้ตั้ง) */
export function internalFamilyName(font) {
    return `FM_${font.id}`;
}

function fontFaceBlock(font) {
    const familyName = cssString(internalFamilyName(font));
    return font.variants.map((variant) => {
        const fmt = sanitizeFormat(variant.format);
        const fmtPart = fmt ? ` format("${fmt}")` : "";
        const src = cssString(variant.src);
        return `@font-face{font-family:"${familyName}";src:url("${src}")${fmtPart};` +
            `font-weight:${sanitizeWeight(variant.weight)};font-style:${sanitizeStyle(variant.style)};font-display:swap;}`;
    }).join("\n");
}

/**
 * สร้าง font-family stack (พร้อม fallback) สำหรับช่องหนึ่งๆ ถ้าช่องนั้นยังไม่ได้ตั้งฟอนต์ (หรืออ้างถึงฟอนต์ที่ถูกลบไปแล้ว)
 * จะคืนค่า null เพื่อบอกว่า "ไม่ต้อง override ช่องนี้"
 * @param {object} settings
 * @param {"ui"|"chat"|"mono"} slotKey
 * @returns {string|null}
 */
export function stackForSlot(settings, slotKey) {
    const fontId = settings.slots[slotKey];
    if (!fontId) return null;

    const font = settings.fonts.find((f) => f.id === fontId);
    if (!font) return null;

    const fallback = settings.fallback[slotKey] || (slotKey === "mono" ? "monospace" : "sans-serif");
    const familyName = font.kind === "file" ? internalFamilyName(font) : font.cssFamily;
    return `"${cssString(familyName)}", ${fallback}`;
}

/**
 * ลบสไตล์/ลิงก์ที่ extension นี้เคยฉีดไว้ทั้งหมดออกจาก <head>
 */
function clearInjectedNodes() {
    document.getElementById(STYLE_ID)?.remove();
    document.querySelectorAll(`link.${GFONT_LINK_CLASS}`).forEach((el) => el.remove());
}

/**
 * ฉีด <link rel="stylesheet"> สำหรับฟอนต์ Google Fonts (ไม่ใช้ @import เพราะ @import ต้องอยู่บนสุดของ
 * stylesheet เท่านั้น พอมี @font-face ปนอยู่ในสไตล์เดียวกัน @import จะถูกเบราว์เซอร์ทิ้งเงียบๆ)
 * @param {Set<string>} hrefs
 */
function injectGoogleFontLinks(hrefs) {
    for (const href of hrefs) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.className = GFONT_LINK_CLASS;
        link.href = href;
        document.head.appendChild(link);
    }
}

/**
 * ฟังก์ชันหลัก — อ่านการตั้งค่าปัจจุบันแล้ว sync สิ่งที่ฉีดอยู่ใน <head> ให้ตรงกันเสมอ
 * เรียกซ้ำได้ตลอดเวลา (idempotent): ลบของเก่าทิ้งก่อนสร้างใหม่ทุกครั้ง
 */
export function applyAll() {
    clearInjectedNodes();

    const settings = getSettings();
    if (!settings.enabled) return;

    const usedFontIds = new Set(
        ["ui", "chat", "mono"].map((slot) => settings.slots[slot]).filter(Boolean),
    );
    const usedFonts = settings.fonts.filter((f) => usedFontIds.has(f.id));

    const cssParts = [];
    const gfontHrefs = new Set();

    for (const font of usedFonts) {
        if (font.kind === "file") {
            cssParts.push(fontFaceBlock(font));
        } else if (font.kind === "gfont" && font.href) {
            gfontHrefs.add(font.href);
        }
    }

    const uiStack = stackForSlot(settings, "ui");
    const chatStack = stackForSlot(settings, "chat");
    const monoStack = stackForSlot(settings, "mono");

    const rootVars = [];
    if (uiStack) rootVars.push(`--mainFontFamily:${uiStack};`);
    if (monoStack) rootVars.push(`--monoFontFamily:${monoStack};`);
    if (rootVars.length) {
        cssParts.push(`:root{${rootVars.join("")}}`);
    }

    if (settings.useFontSize && Number(settings.fontSize) > 0) {
        // ตั้งใจไม่แตะ --mainFontSize เพราะ ST ใช้ตัวแปรนี้คำนวณขนาดไอคอนทั่วแอปด้วย
        // (เช่น calc(var(--mainFontSize) * 1.3)) — ถ้าไปแก้ตรงนั้นไอคอนจะโตตามฟอนต์ไปด้วย
        // จึงเซ็ต font-size ตรงๆ ที่ body แทน ให้มีผลเฉพาะข้อความที่สืบทอดขนาดจาก body
        // (เช่น ข้อความแชท) ส่วนปุ่ม/ไอคอน/ช่องกรอกข้อมูลยังอ้างอิง --mainFontSize เดิมของ ST
        cssParts.push(`body{font-size:${Number(settings.fontSize)}px;}`);
    }

    if (chatStack) {
        // .mes_text ไม่ได้ตั้ง font-family ของตัวเอง (สืบทอดจาก body ตามปกติ) จึงพอ override
        // ที่ตัวมันเองแล้วปล่อยให้ลูกๆ สืบทอดต่อ — ยกเว้น code/kbd/samp/pre ที่มีกฎ font-family
        // ของตัวเอง (var(--monoFontFamily)) อยู่แล้ว จึงไม่ถูกอันนี้ทับ
        cssParts.push(`#chat .mes_text{font-family:${chatStack};}`);
        cssParts.push(`#send_textarea{font-family:${chatStack};}`);
    }

    if (gfontHrefs.size) injectGoogleFontLinks(gfontHrefs);

    if (cssParts.length) {
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = cssParts.join("\n");
        document.head.appendChild(style);
    }
}
