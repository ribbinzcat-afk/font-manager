import { extension_settings } from "../../../../extensions.js";
import { saveSettingsDebounced } from "../../../../../script.js";
import { DEFAULT_GOOGLE_FONTS } from "./default-fonts.js";

export const extensionName = "font-manager";
export const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

export const defaultSettings = {
    version: 2,
    enabled: true,
    useFontSize: false,
    fontSize: 15,
    fonts: DEFAULT_GOOGLE_FONTS,
    slots: { ui: "", chat: "", mono: "" },
    fallback: { ui: "sans-serif", chat: "sans-serif", mono: "monospace" },
};

function makeId(prefix) {
    return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}
/** สร้าง id ใหม่ให้ font family — ต้องเรียก "ก่อน" อัปโหลดไฟล์ เพราะชื่อไฟล์บนเซิร์ฟเวอร์อ้างอิง id นี้ */
export const makeFontId = () => makeId("f");
/** สร้าง id ใหม่ให้ variant — ต้องเรียก "ก่อน" อัปโหลดไฟล์ ด้วยเหตุผลเดียวกัน */
export const makeVariantId = () => makeId("v");

/**
 * ตรวจว่าลิงก์ตัวนี้น่าจะเป็นไฟล์ฟอนต์ตรงๆ (ไม่ใช่ CSS ของ Google Fonts)
 * @param {string} url
 * @returns {boolean}
 */
function looksLikeDirectFontFile(url) {
    return /\.(ttf|otf|woff2?|ttc)(\?|#|$)/i.test(url) || url.includes("imagekit.io");
}

/**
 * ย้ายข้อมูลจาก schema เดิม (v1: savedFonts + activeFontIndex) มาเป็น schema v2
 * @param {object} old ค่าที่อยู่ใน extension_settings[extensionName] ก่อนย้าย
 * @returns {object} ค่าที่ผ่านการย้ายแล้ว (schema v2)
 */
function migrateV1ToV2(old) {
    const migrated = structuredClone(defaultSettings);
    migrated.fonts = []; // ย้ายเฉพาะของเดิมของผู้ใช้ — ไม่แถมชุดฟอนต์แนะนำเข้าไปตอนอัปเกรดจาก v1
    const savedFonts = Array.isArray(old.savedFonts) ? old.savedFonts : [];
    const idByIndex = [];

    for (const font of savedFonts) {
        const url = String(font?.url || "").trim();
        const family = String(font?.family || "").trim();
        if (!url || !family) {
            idByIndex.push(null);
            continue;
        }

        const id = makeFontId();
        idByIndex.push(id);

        if (looksLikeDirectFontFile(url)) {
            migrated.fonts.push({
                id,
                label: family,
                kind: "file",
                variants: [{
                    id: makeVariantId(),
                    weight: "400",
                    style: "normal",
                    src: url,
                    origin: "link",
                    fileName: "",
                    format: "",
                    size: 0,
                }],
            });
        } else {
            migrated.fonts.push({
                id,
                label: family,
                kind: "gfont",
                href: url,
                cssFamily: family,
            });
        }
    }

    if (typeof old.activeFontIndex === "number" && old.activeFontIndex >= 0) {
        const activeId = idByIndex[old.activeFontIndex];
        if (activeId) migrated.slots.ui = activeId;
    }

    if (typeof old.enabled === "boolean") migrated.enabled = old.enabled;
    if (typeof old.fontSize === "number" && old.fontSize > 0) {
        migrated.fontSize = old.fontSize;
        // ค่าเริ่มต้นเดิมคือ 16 — ถ้าผู้ใช้เคยปรับเปลี่ยนจริง ให้เปิดสวิตช์ใช้ขนาดกำหนดเองต่อให้อัตโนมัติ
        migrated.useFontSize = old.fontSize !== 16;
    }

    // เก็บของเดิมสำรองไว้เผื่อย้อนกลับ (เขียนทับได้ครั้งเดียวตอน migrate)
    migrated._v1backup = { savedFonts, activeFontIndex: old.activeFontIndex, fontSize: old.fontSize, enabled: old.enabled };

    return migrated;
}

/**
 * อ่าน (และย้าย schema ถ้าจำเป็น) การตั้งค่าของ extension แล้วคืนกลับมาให้ใช้งาน
 * @returns {object} การตั้งค่าปัจจุบัน (อ้างอิงตรงไปยัง extension_settings — แก้แล้วต้องเรียก saveSettings())
 */
export function getSettings() {
    let current = extension_settings[extensionName];

    if (!current || Object.keys(current).length === 0) {
        extension_settings[extensionName] = structuredClone(defaultSettings);
        return extension_settings[extensionName];
    }

    if (current.version !== 2) {
        extension_settings[extensionName] = migrateV1ToV2(current);
        saveSettingsDebounced();
        current = extension_settings[extensionName];
    }

    // เติมคีย์ที่ขาดหาย (รองรับผู้ใช้ที่อัปเดตจากเวอร์ชันกลางทาง)
    for (const key of Object.keys(defaultSettings)) {
        if (current[key] === undefined) {
            current[key] = structuredClone(defaultSettings[key]);
        }
    }
    if (!current.slots) current.slots = structuredClone(defaultSettings.slots);
    if (!current.fallback) current.fallback = structuredClone(defaultSettings.fallback);
    if (!Array.isArray(current.fonts)) current.fonts = [];

    return current;
}

export const getSetting = (key) => getSettings()[key];

export function setSetting(key, value) {
    getSettings()[key] = value;
    saveSettingsDebounced();
}

export const saveSettings = () => saveSettingsDebounced();

export function findFont(fontId) {
    return getSettings().fonts.find((f) => f.id === fontId) || null;
}

export function findVariant(fontId, variantId) {
    const font = findFont(fontId);
    if (!font || font.kind !== "file") return null;
    return font.variants.find((v) => v.id === variantId) || null;
}

/**
 * หา family (kind: "file") ที่มี label ตรงกัน (ไม่สนตัวพิมพ์เล็ก-ใหญ่) เพื่อรวม variant ใหม่เข้าใบเดิม
 * @param {string} label
 * @returns {object|null}
 */
export function findFontByLabel(label) {
    const norm = String(label).trim().toLowerCase();
    if (!norm) return null;
    return getSettings().fonts.find((f) => f.kind === "file" && f.label.trim().toLowerCase() === norm) || null;
}

/**
 * สร้าง font family ใหม่ชนิด "file" พร้อม variant แรก
 * หมายเหตุ: fontId และ variant.id ต้องถูกสร้างไว้ล่วงหน้า (makeFontId/makeVariantId) "ก่อน" อัปโหลดไฟล์เสมอ
 * เพราะชื่อไฟล์บนเซิร์ฟเวอร์อ้างอิง id เหล่านี้ — ฟังก์ชันนี้แค่บันทึกสิ่งที่อัปโหลดไปแล้วลงในการตั้งค่า
 * @param {string} fontId
 * @param {string} label
 * @param {object} variant ต้องมี id อยู่แล้ว
 */
export function createFileFont(fontId, label, variant) {
    const settings = getSettings();
    const font = { id: fontId, label, kind: "file", variants: [variant] };
    settings.fonts.push(font);
    saveSettingsDebounced();
    return font;
}

/**
 * เพิ่ม variant ใหม่เข้า family ที่มีอยู่แล้ว (ใช้ตอนพบไฟล์ที่ชื่อคล้ายกัน หรือผู้ใช้กด "เพิ่มน้ำหนัก" เอง)
 * @param {string} fontId
 * @param {object} variant ต้องมี id อยู่แล้ว
 */
export function addVariant(fontId, variant) {
    const font = findFont(fontId);
    if (!font || font.kind !== "file") return null;
    font.variants.push(variant);
    saveSettingsDebounced();
    return variant;
}

export function updateVariant(fontId, variantId, patch) {
    const variant = findVariant(fontId, variantId);
    if (!variant) return null;
    Object.assign(variant, patch);
    saveSettingsDebounced();
    return variant;
}

export function addGoogleFont(label, href, cssFamily) {
    const settings = getSettings();
    const font = { id: makeFontId(), label, kind: "gfont", href, cssFamily };
    settings.fonts.push(font);
    saveSettingsDebounced();
    return font;
}

/**
 * เติมฟอนต์แนะนำ (DEFAULT_GOOGLE_FONTS) ที่ยังไม่มีในคลังของผู้ใช้ปัจจุบัน — ใช้กับผู้ใช้เดิมที่ติดตั้ง
 * extension มาก่อนจะมีชุดฟอนต์แนะนำ (ผู้ใช้ใหม่ได้ชุดนี้ติดมาอยู่แล้วจาก defaultSettings)
 * เช็คซ้ำด้วย id คงที่ของแต่ละฟอนต์ กดซ้ำได้ไม่เพิ่มซ้ำ
 * @returns {number} จำนวนฟอนต์ที่เพิ่งเพิ่มเข้าไปใหม่
 */
export function addMissingDefaultFonts() {
    const settings = getSettings();
    const existingIds = new Set(settings.fonts.map((f) => f.id));
    let addedCount = 0;

    for (const font of DEFAULT_GOOGLE_FONTS) {
        if (existingIds.has(font.id)) continue;
        settings.fonts.push(structuredClone(font));
        addedCount++;
    }

    if (addedCount > 0) saveSettingsDebounced();
    return addedCount;
}

export function updateFontLabel(fontId, label) {
    const font = findFont(fontId);
    if (!font) return;
    font.label = label;
    saveSettingsDebounced();
}

export function removeVariant(fontId, variantId) {
    const font = findFont(fontId);
    if (!font || font.kind !== "file") return;
    font.variants = font.variants.filter((v) => v.id !== variantId);
    if (font.variants.length === 0) {
        removeFont(fontId);
    } else {
        saveSettingsDebounced();
    }
}

export function removeFont(fontId) {
    const settings = getSettings();
    settings.fonts = settings.fonts.filter((f) => f.id !== fontId);
    for (const slotKey of Object.keys(settings.slots)) {
        if (settings.slots[slotKey] === fontId) settings.slots[slotKey] = "";
    }
    saveSettingsDebounced();
}

export function setSlot(slotKey, fontId) {
    const settings = getSettings();
    if (!(slotKey in settings.slots)) return;
    settings.slots[slotKey] = fontId;
    saveSettingsDebounced();
}
