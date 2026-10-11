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

/** id ของ <style> ที่เก็บเฉพาะ @font-face (แยกจากกฎ override เพื่อไม่ต้องขยับ/สร้างใหม่บ่อยๆ) */
export const FACES_STYLE_ID = "font-manager-faces";

/**
 * หา <style> ตาม id ถ้ายังไม่มีให้สร้างใหม่ต่อท้าย <head>
 * @param {string} id
 * @returns {HTMLStyleElement}
 */
function ensureStyle(id) {
    let style = /** @type {HTMLStyleElement|null} */ (document.getElementById(id));
    if (!style) {
        style = document.createElement("style");
        style.id = id;
        document.head.appendChild(style);
    }
    return style;
}

/**
 * เขียนเนื้อหาลง <style> เฉพาะตอนที่เนื้อหาเปลี่ยนจริงเท่านั้น
 * (การเขียน textContent ซ้ำแม้เป็นค่าเดิม ทำให้เบราว์เซอร์ parse สไตล์ชีตใหม่และลงทะเบียน @font-face ใหม่
 * ระหว่างนั้นข้อความจะถูกวาดด้วยฟอนต์ fallback ชั่วครู่ = อาการ "ฟอนต์กระตุก")
 * @param {string} id
 * @param {string} css
 */
function syncStyle(id, css) {
    if (!css) {
        document.getElementById(id)?.remove();
        return;
    }
    const style = ensureStyle(id);
    if (style.textContent !== css) style.textContent = css;
}

/**
 * sync <link rel="stylesheet"> ของ Google Fonts แบบเทียบส่วนต่าง — ลิงก์ที่ยังใช้อยู่จะไม่ถูกแตะเลย
 * (ไม่ใช้ @import เพราะ @import ต้องอยู่บนสุดของ stylesheet เท่านั้น พอมี @font-face ปนอยู่ในสไตล์เดียวกัน
 * @import จะถูกเบราว์เซอร์ทิ้งเงียบๆ)
 * @param {Set<string>} hrefs
 */
function syncGoogleFontLinks(hrefs) {
    const existing = new Map();
    document.querySelectorAll(`link.${GFONT_LINK_CLASS}`).forEach((el) => {
        const href = el.getAttribute("href");
        if (!hrefs.has(href) || existing.has(href)) {
            el.remove(); // ไม่ใช้แล้ว หรือซ้ำ
        } else {
            existing.set(href, el);
        }
    });

    for (const href of hrefs) {
        if (existing.has(href)) continue;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.className = GFONT_LINK_CLASS;
        link.href = href;
        document.head.appendChild(link);
    }
}

/**
 * ให้ <style> กฎ override ของเราอยู่หลังสุดใน <head> เสมอ (เผื่อธีม/extension อื่นฉีดสไตล์ทีหลังแล้วทับเรา)
 * ขยับเฉพาะตอนที่มีสไตล์ชีตอื่นมาต่อท้ายจริงๆ และสไตล์นี้ไม่มี @font-face จึงขยับได้โดยไม่ทำให้ฟอนต์โหลดใหม่
 */
function keepOverridesLast() {
    const style = document.getElementById(STYLE_ID);
    if (!style) return;
    let next = style.nextElementSibling;
    while (next) {
        const isSheet = next.tagName === "STYLE" || (next.tagName === "LINK" && /stylesheet/i.test(next.getAttribute("rel") || ""));
        const isOurs = next.id === FACES_STYLE_ID || next.classList.contains(GFONT_LINK_CLASS);
        if (isSheet && !isOurs) {
            document.head.appendChild(style);
            return;
        }
        next = next.nextElementSibling;
    }
}

/**
 * ฟังก์ชันหลัก — อ่านการตั้งค่าปัจจุบันแล้ว sync สิ่งที่ฉีดอยู่ใน <head> ให้ตรงกัน
 * เรียกซ้ำได้ตลอดเวลา (idempotent) และ "ไม่แตะ DOM เลย" ถ้าไม่มีอะไรเปลี่ยน
 * — สำคัญมาก เพราะ index.js เรียกฟังก์ชันนี้ทุกครั้งที่ ST เซฟการตั้งค่า (SETTINGS_UPDATED)
 * ซึ่งเกิดถี่มาก (ทุกข้อความใหม่, สลับแชท, ขยับสไลเดอร์ ฯลฯ) เวอร์ชันก่อนหน้าลบแล้วสร้างใหม่ทุกครั้ง
 * ทำให้ฟอนต์หายไปชั่วขณะแล้วกลับมา = ตัวอักษรกระพริบสลับกับฟอนต์เครื่อง
 */
export function applyAll() {
    const settings = getSettings();
    if (!settings.enabled) {
        syncStyle(STYLE_ID, "");
        syncStyle(FACES_STYLE_ID, "");
        syncGoogleFontLinks(new Set());
        return;
    }

    const faceParts = [];
    const cssParts = [];
    const gfontHrefs = new Set();

    // โหลด @font-face / ลิงก์ Google Fonts ของ "ทุกฟอนต์ในคลัง" เสมอ ไม่ใช่แค่ฟอนต์ที่ถูกตั้งให้ช่อง
    // UI/แชท/โมโนเท่านั้น — เพราะผู้ใช้จำนวนมากอ้างอิงชื่อฟอนต์ตรงๆ ใน CSS/HTML ที่แทรกเข้าข้อความแชทเอง
    // (เช่น การ์ดตัวละครที่ใช้ Tavern Regex สร้าง HUD/การ์ดในแชท แล้วเขียน font-family: 'Itim' เอง)
    // ส่วนตัวไฟล์ฟอนต์จริงยังโหลดแบบ lazy ตามปกติของ @font-face จึงไม่ทำให้เปลืองแบนด์วิดท์เพิ่ม
    for (const font of settings.fonts) {
        if (font.kind === "file") {
            faceParts.push(fontFaceBlock(font));
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
        // จึงเซ็ต font-size ตรงๆ ที่ body แทน ให้มีผลเฉพาะข้อความที่สืบทอดขนาดจาก body
        cssParts.push(`body{font-size:${Number(settings.fontSize)}px;}`);
    }

    if (chatStack) {
        // .mes_text ไม่ได้ตั้ง font-family ของตัวเอง (สืบทอดจาก body) จึงพอ override ที่ตัวมันเอง
        // ยกเว้น code/kbd/samp/pre ที่มีกฎ font-family ของตัวเอง (var(--monoFontFamily)) อยู่แล้ว
        cssParts.push(`#chat .mes_text{font-family:${chatStack};}`);
        cssParts.push(`#send_textarea{font-family:${chatStack};}`);
    }

    // ลำดับใน <head>: @font-face และลิงก์ Google Fonts ไม่ต้องอยู่ท้ายสุด (แค่ประกาศฟอนต์)
    // จึงสร้างครั้งเดียวแล้วปล่อยไว้ที่เดิม ส่วนกฎ override ค่อยดันไปท้ายสุดเมื่อจำเป็น
    syncStyle(FACES_STYLE_ID, faceParts.join("\n"));
    syncGoogleFontLinks(gfontHrefs);
    syncStyle(STYLE_ID, cssParts.join("\n"));
    keepOverridesLast();
}
