import { getRequestHeaders } from "../../../../../script.js";
import { getBase64Async } from "../../../../utils.js";

const ALLOWED_EXTENSIONS = ["ttf", "otf", "woff", "woff2", "ttc"];
const FORMAT_BY_EXTENSION = {
    ttf: "truetype",
    ttc: "truetype",
    otf: "opentype",
    woff: "woff",
    woff2: "woff2",
};

/** คำในชื่อไฟล์ที่ใช้เดาน้ำหนักฟอนต์ เรียงจากเฉพาะเจาะจงไปทั่วไป (เช็คตัวยาวก่อนกันคำย่อยชนกัน) */
const WEIGHT_KEYWORDS = [
    ["extrablack", "950"],
    ["ultrablack", "950"],
    ["black", "900"], ["heavy", "900"],
    ["extrabold", "800"], ["ultrabold", "800"],
    ["semibold", "600"], ["demibold", "600"],
    ["bold", "700"],
    ["medium", "500"],
    ["light", "300"],
    ["extralight", "200"], ["ultralight", "200"], ["thin", "100"], ["hairline", "100"],
    ["regular", "400"], ["normal", "400"], ["book", "400"],
];
const ITALIC_KEYWORDS = ["italic", "oblique"];
const VARIABLE_KEYWORDS = ["variablefont", "-vf", "vf-", "[wght]"];

/**
 * ตัดนามสกุลไฟล์ออก แล้วคืนชื่อไฟล์ล้วนๆ ตัวพิมพ์เล็กไว้ตรวจคำ (แต่คืน original แยกไว้ด้วย)
 * @param {string} fileName
 */
function baseName(fileName) {
    return String(fileName).replace(/\.[^/.]+$/, "");
}

/**
 * เดาน้ำหนัก/สไตล์/ชื่อ family จากชื่อไฟล์ฟอนต์
 * เช่น "Sarabun-SemiBoldItalic.ttf" -> { weight:"600", style:"italic", guessedLabel:"Sarabun" }
 * @param {string} fileName
 * @returns {{ weight: string, style: "normal"|"italic", guessedLabel: string, isVariable: boolean }}
 */
export function guessVariantFromFileName(fileName) {
    const stem = baseName(fileName);
    const lower = stem.toLowerCase();

    let weight = "400";
    for (const [keyword, value] of WEIGHT_KEYWORDS) {
        if (lower.includes(keyword)) { weight = value; break; }
    }

    const style = ITALIC_KEYWORDS.some((k) => lower.includes(k)) ? "italic" : "normal";
    const isVariable = VARIABLE_KEYWORDS.some((k) => lower.includes(k));

    // ตัดคำน้ำหนัก/สไตล์/ตัวคั่นออกจากชื่อ เพื่อเดาว่า "ตระกูล" ของฟอนต์คืออะไร
    const stripWords = [
        ...WEIGHT_KEYWORDS.map(([k]) => k),
        ...ITALIC_KEYWORDS,
        "variablefont", "vf",
    ];
    let guessedLabel = stem;
    for (const word of stripWords) {
        guessedLabel = guessedLabel.replace(new RegExp(word, "ig"), " ");
    }
    guessedLabel = guessedLabel
        .replace(/\[wght\]/ig, " ")
        .replace(/[_\-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim() || stem;

    return { weight: isVariable ? "100 900" : weight, style, guessedLabel, isVariable };
}

/**
 * ตรวจสกุลไฟล์ว่าเป็นไฟล์ฟอนต์ที่รองรับหรือไม่
 * @param {File} file
 * @returns {string} นามสกุล (ตัวพิมพ์เล็ก ไม่มีจุด) หรือ "" ถ้าไม่รองรับ
 */
export function getSupportedExtension(file) {
    const ext = String(file.name).split(".").pop().toLowerCase();
    return ALLOWED_EXTENSIONS.includes(ext) ? ext : "";
}

export function formatForExtension(ext) {
    return FORMAT_BY_EXTENSION[ext] || "";
}

/**
 * อัปโหลดไฟล์ฟอนต์ขึ้นเซิร์ฟเวอร์ ST ผ่าน /api/files/upload แล้วคืน path ที่ใช้เป็น src ของ @font-face
 * @param {File} file
 * @param {string} fontId id ของ family (ใช้ตั้งชื่อไฟล์ให้ไม่ชนกัน)
 * @param {string} variantId id ของ variant นี้
 * @param {string} ext นามสกุลไฟล์ (จาก getSupportedExtension)
 * @returns {Promise<{ path: string, size: number }>}
 */
export async function uploadFontFile(file, fontId, variantId, ext) {
    const base64Full = await getBase64Async(file);
    const base64Data = base64Full.split(",")[1] ?? base64Full;
    // ชื่อไฟล์ต้องผ่าน validateAssetFileName ของ ST: [a-zA-Z0-9_\-.]+ เท่านั้น
    const safeName = `fm_${fontId}_${variantId}.${ext}`;

    const response = await fetch("/api/files/upload", {
        method: "POST",
        headers: getRequestHeaders(),
        body: JSON.stringify({ name: safeName, data: base64Data }),
    });

    if (!response.ok) {
        const message = await response.text().catch(() => "");
        throw new Error(message || `อัปโหลดล้มเหลว (HTTP ${response.status})`);
    }

    const result = await response.json();
    return { path: result.path, size: file.size };
}

/**
 * ลบไฟล์ฟอนต์ที่เคยอัปโหลดออกจากเซิร์ฟเวอร์ (เงียบ ๆ ถ้าลบไม่สำเร็จ — ไฟล์อาจถูกลบไปแล้วโดย Data Maid)
 * @param {string} path path ที่ได้จาก uploadFontFile (เช่น "/user/files/fm_xxx.woff2")
 */
export async function deleteFontFile(path) {
    try {
        await fetch("/api/files/delete", {
            method: "POST",
            headers: getRequestHeaders(),
            body: JSON.stringify({ path }),
        });
    } catch (error) {
        console.warn(`[font-manager] ลบไฟล์ไม่สำเร็จ (${path}):`, error);
    }
}

/**
 * ตรวจว่าไฟล์ที่อัปโหลดไว้ยังอยู่บนเซิร์ฟเวอร์จริงหรือไม่ (ป้องกันกรณี Data Maid กวาดไฟล์กำพร้าทิ้ง)
 * @param {string[]} paths
 * @returns {Promise<Record<string, boolean>>}
 */
export async function verifyFontFiles(paths) {
    if (!paths.length) return {};
    try {
        const response = await fetch("/api/files/verify", {
            method: "POST",
            headers: getRequestHeaders(),
            body: JSON.stringify({ urls: paths }),
        });
        if (!response.ok) return {};
        return await response.json();
    } catch (error) {
        console.warn("[font-manager] ตรวจสอบไฟล์ล้มเหลว:", error);
        return {};
    }
}
